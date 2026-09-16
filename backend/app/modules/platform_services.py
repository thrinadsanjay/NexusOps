"""Platform service status and start/stop/restart for the dashboard."""

from __future__ import annotations

import logging
import os
import socket
from dataclasses import dataclass
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user, require_permission
from app.db import get_db
from app.models import AuditLog, User
from app.schemas import PlatformServiceActionResult, PlatformServiceRead

logger = logging.getLogger("nexusops.services")
router = APIRouter(prefix="/api/v1/platform", tags=["platform"])
DOCKER_API = "/v1.41"


@dataclass(frozen=True)
class ServiceSpec:
    id: str
    name: str
    role: str
    kind: str
    container: str | None
    host: str | None
    port: int | None
    critical: bool = False


CATALOG: list[ServiceSpec] = [
    ServiceSpec("postgres", "PostgreSQL", "database", "container", "nexusops-postgres", "postgres", 5432, True),
    ServiceSpec("redis", "Redis", "cache", "container", "nexusops-redis", "redis", 6379, True),
    ServiceSpec("backend", "API", "control-plane", "container", "nexusops-backend", "127.0.0.1", 8000, True),
    ServiceSpec("worker", "Worker", "jobs", "container", "nexusops-worker", None, None),
    ServiceSpec("frontend", "Web UI", "control-plane", "container", "nexusops-frontend", "frontend", 5173),
    ServiceSpec("openldap", "Directory", "identity", "container", "nexusops-ldap", "openldap", 389),
    ServiceSpec("dhcp", "DHCP", "network", "container", "nexusops-dhcp", None, None),
    ServiceSpec("smtp", "SMTP listener", "mail", "process", None, "127.0.0.1", None),
]


def docker_available() -> bool:
    path = settings.docker_socket
    return bool(path) and os.path.exists(path)


def _docker() -> httpx.Client:
    return httpx.Client(
        transport=httpx.HTTPTransport(uds=settings.docker_socket),
        base_url="http://localhost",
        timeout=8,
    )


def _probe_tcp(host: str, port: int, timeout: float = 0.4) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _worker_ping() -> bool | None:
    try:
        from app.worker import celery_app

        replies = celery_app.control.inspect(timeout=0.4).ping()
        return bool(replies)
    except Exception:
        return None


def _container_map() -> dict[str, dict]:
    if not docker_available():
        return {}
    try:
        with _docker() as client:
            response = client.get(f"{DOCKER_API}/containers/json", params={"all": "true"})
            response.raise_for_status()
            rows = response.json()
    except Exception as exc:
        logger.warning("Docker inspect failed: %s", exc)
        return {}
    found: dict[str, dict] = {}
    for row in rows:
        for name in row.get("Names") or []:
            found[name.lstrip("/")] = row
    return found


def _docker_status(row: dict) -> tuple[str, str, str, str | None]:
    from datetime import datetime, timezone

    state = str(row.get("State") or "").lower()
    status_text = str(row.get("Status") or "")
    health = "unknown"
    if state == "running":
        status = "running"
        health = "healthy" if "healthy" in status_text.lower() else ("unhealthy" if "unhealthy" in status_text.lower() else "up")
    elif state == "restarting":
        status, health = "restarting", "starting"
    elif state in {"exited", "dead", "created"}:
        status, health = "stopped", "down"
    elif state == "paused":
        status, health = "paused", "down"
    else:
        status = state or "unknown"
    started = None
    created = row.get("Created")
    if isinstance(created, (int, float)) and created > 0:
        started = datetime.fromtimestamp(created, tz=timezone.utc).isoformat()
    return status, health, status_text, started


def _describe(spec: ServiceSpec, containers: dict[str, dict]) -> PlatformServiceRead:
    reachable = None
    if spec.id == "smtp":
        from app.modules.smtp_listen import listener_running

        running = listener_running()
        port = settings.smtp_listen_port
        return PlatformServiceRead(
            id=spec.id,
            name=spec.name,
            role=spec.role,
            kind=spec.kind,
            status="running" if running else "stopped",
            health="up" if running else "down",
            detail=f"LAN SMTP on :{port}" if running else "Listener is off",
            controllable=True,
            docker_available=docker_available(),
            container=None,
        )
    if spec.id == "backend":
        reachable = True
    elif spec.id == "worker":
        reachable = _worker_ping()
    elif spec.host and spec.port:
        reachable = _probe_tcp(spec.host, spec.port)

    row = containers.get(spec.container or "")
    started = None
    if row:
        status, health, detail, started = _docker_status(row)
        if reachable is True and status == "running":
            health = "healthy" if health in {"up", "healthy"} else health
        elif reachable is False and status == "running":
            health = "unhealthy"
            detail = detail or "Container is up but the port did not respond"
    elif reachable is True:
        status, health, detail = "running", "up", "Reachable (Docker socket not used)"
    elif reachable is False:
        status, health, detail = "stopped", "down", "Not reachable"
    else:
        status, health, detail = "unknown", "unknown", (
            "Mount /var/run/docker.sock on the backend to control this service"
            if not docker_available()
            else "Container not found"
        )

    return PlatformServiceRead(
        id=spec.id,
        name=spec.name,
        role=spec.role,
        kind=spec.kind,
        status=status,
        health=health,
        detail=detail,
        controllable=bool(spec.container and docker_available()) or spec.id == "smtp",
        docker_available=docker_available(),
        container=spec.container,
        started_at=started,
    )


def list_services() -> list[PlatformServiceRead]:
    containers = _container_map()
    return [_describe(spec, containers) for spec in CATALOG]


def _spec(service_id: str) -> ServiceSpec:
    match = next((item for item in CATALOG if item.id == service_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Unknown service")
    return match


def _docker_action(spec: ServiceSpec, action: str) -> str:
    if not spec.container:
        raise HTTPException(status_code=400, detail="This service is not a container")
    if not docker_available():
        raise HTTPException(
            status_code=503,
            detail="Docker socket is not mounted. Add /var/run/docker.sock to the backend container.",
        )
    name = quote(spec.container, safe="")
    path = {
        "start": f"{DOCKER_API}/containers/{name}/start",
        "stop": f"{DOCKER_API}/containers/{name}/stop",
        "restart": f"{DOCKER_API}/containers/{name}/restart",
    }[action]
    try:
        with _docker() as client:
            response = client.post(path)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Docker did not accept {action}: {exc}") from exc
    if response.status_code in {204, 304}:
        return "ok"
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Container {spec.container} was not found")
    raise HTTPException(status_code=502, detail=response.text or f"Docker {action} failed")


def control_service(service_id: str, action: str) -> PlatformServiceActionResult:
    if action not in {"start", "stop", "restart"}:
        raise HTTPException(status_code=400, detail="action must be start, stop, or restart")
    spec = _spec(service_id)
    if spec.id == "smtp":
        from app.modules.smtp_listen import listener_running, start_listener, stop_listener

        if action == "start":
            start_listener(force=True)
        elif action == "stop":
            stop_listener()
        else:
            stop_listener()
            start_listener(force=True)
        running = listener_running()
        return PlatformServiceActionResult(
            id=spec.id,
            action=action,
            status="running" if running else "stopped",
            message=f"SMTP listener is {'running' if running else 'stopped'}",
        )
    _docker_action(spec, action)
    return PlatformServiceActionResult(id=spec.id, action=action, status="accepted", message=f"{spec.name} {action} requested")


@router.get("/services", response_model=list[PlatformServiceRead])
def get_services(_: object = Depends(get_current_user)) -> list[PlatformServiceRead]:
    return list_services()


@router.post("/services/{service_id}/{action}", response_model=PlatformServiceActionResult)
def post_service_action(
    service_id: str,
    action: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services:write")),
) -> PlatformServiceActionResult:
    result = control_service(service_id, action)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action=f"SERVICE_{action.upper()}",
            resource="platform",
            resource_id=service_id,
            details=result.message,
            source="web",
            success=True,
        )
    )
    db.commit()
    return result
