"""Phase 5 – DHCP Management API."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_permission
from app.db import get_db
from app.models import AuditLog, DhcpLease, DhcpPool, DhcpReservation, DhcpServer, User
from app.modules.dhcp_local import (
    apply_pools,
    ensure_local_server,
    ingest_local_leases,
    is_enabled,
    persist_setting,
    process_running,
    set_enabled,
    upsert_leases,
)
from app.schemas import (
    DhcpLeaseCreate,
    DhcpLeaseRead,
    DhcpLocalStatus,
    DhcpPoolCreate,
    DhcpPoolRead,
    DhcpPoolUpdate,
    DhcpReservationCreate,
    DhcpReservationRead,
    DhcpRouterFetchRequest,
    DhcpRouterFetchResult,
    DhcpServerCreate,
    DhcpServerRead,
    DhcpServerUpdate,
)

router = APIRouter(prefix="/api/v1/dhcp", tags=["dhcp"])


def _server_read(server: DhcpServer) -> DhcpServerRead:
    data = DhcpServerRead.model_validate(server)
    return data.model_copy(update={"has_router_password": bool(server.router_password_encrypted)})


def _reload_local(db) -> None:
    if not is_enabled():
        return
    try:
        apply_pools(db)
    except Exception:
        pass


def _nudge_container(action: str) -> str | None:
    try:
        from app.modules.platform_services import DOCKER_API, _docker, docker_available

        if not docker_available():
            return None
        with _docker() as client:
            response = client.post(f"{DOCKER_API}/containers/nexusops-dhcp/{action}")
        if response.status_code in {204, 304}:
            return "ok"
        return response.text or str(response.status_code)
    except Exception:
        return None


# ── Servers ───────────────────────────────────────────────────────────────────

@router.get("/servers", response_model=list[DhcpServerRead])
def list_servers(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[DhcpServerRead]:
    return [_server_read(row) for row in db.query(DhcpServer).order_by(DhcpServer.name).all()]


@router.post("/servers", response_model=DhcpServerRead, status_code=status.HTTP_201_CREATED)
def create_server(payload: DhcpServerCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpServerRead:
    server = DhcpServer(**payload.model_dump())
    db.add(server); db.commit(); db.refresh(server)
    return _server_read(server)


@router.get("/servers/{server_id}", response_model=DhcpServerRead)
def get_server(server_id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> DhcpServerRead:
    server = db.query(DhcpServer).filter(DhcpServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DHCP server not found")
    return _server_read(server)


@router.patch("/servers/{server_id}", response_model=DhcpServerRead)
def update_server(server_id: int, payload: DhcpServerUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpServerRead:
    server = db.query(DhcpServer).filter(DhcpServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DHCP server not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(server, field, value)
    db.commit(); db.refresh(server)
    return _server_read(server)


@router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_server(server_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> None:
    server = db.query(DhcpServer).filter(DhcpServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DHCP server not found")
    db.delete(server); db.commit()


# ── Pools ─────────────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/pools", response_model=list[DhcpPoolRead])
def list_pools(server_id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[DhcpPool]:
    if not db.query(DhcpServer).filter(DhcpServer.id == server_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DHCP server not found")
    return db.query(DhcpPool).filter(DhcpPool.server_id == server_id).all()


@router.post("/servers/{server_id}/pools", response_model=DhcpPoolRead, status_code=status.HTTP_201_CREATED)
def create_pool(server_id: int, payload: DhcpPoolCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpPool:
    if not db.query(DhcpServer).filter(DhcpServer.id == server_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DHCP server not found")
    pool = DhcpPool(server_id=server_id, **payload.model_dump())
    db.add(pool); db.commit(); db.refresh(pool)
    _reload_local(db)
    return pool


@router.patch("/servers/{server_id}/pools/{pool_id}", response_model=DhcpPoolRead)
def update_pool(server_id: int, pool_id: int, payload: DhcpPoolUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpPool:
    pool = db.query(DhcpPool).filter(DhcpPool.id == pool_id, DhcpPool.server_id == server_id).first()
    if not pool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(pool, field, value)
    db.commit(); db.refresh(pool)
    _reload_local(db)
    return pool


@router.delete("/servers/{server_id}/pools/{pool_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_pool(server_id: int, pool_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> None:
    pool = db.query(DhcpPool).filter(DhcpPool.id == pool_id, DhcpPool.server_id == server_id).first()
    if not pool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    db.delete(pool); db.commit()
    _reload_local(db)


# ── Leases ────────────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/pools/{pool_id}/leases", response_model=list[DhcpLeaseRead])
def list_leases(server_id: int, pool_id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[DhcpLease]:
    if not db.query(DhcpPool).filter(DhcpPool.id == pool_id, DhcpPool.server_id == server_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    return db.query(DhcpLease).filter(DhcpLease.pool_id == pool_id).order_by(DhcpLease.ip_address).all()


@router.post("/servers/{server_id}/pools/{pool_id}/leases", response_model=DhcpLeaseRead, status_code=status.HTTP_201_CREATED)
def create_lease(server_id: int, pool_id: int, payload: DhcpLeaseCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpLease:
    if not db.query(DhcpPool).filter(DhcpPool.id == pool_id, DhcpPool.server_id == server_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    lease = DhcpLease(pool_id=pool_id, last_seen_at=datetime.utcnow(), **payload.model_dump())
    db.add(lease); db.commit(); db.refresh(lease)
    return lease


@router.delete("/servers/{server_id}/pools/{pool_id}/leases/{lease_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_lease(server_id: int, pool_id: int, lease_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> None:
    lease = db.query(DhcpLease).filter(DhcpLease.id == lease_id, DhcpLease.pool_id == pool_id).first()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
    db.delete(lease); db.commit()


# ── Reservations ──────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/pools/{pool_id}/reservations", response_model=list[DhcpReservationRead])
def list_reservations(server_id: int, pool_id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[DhcpReservation]:
    if not db.query(DhcpPool).filter(DhcpPool.id == pool_id, DhcpPool.server_id == server_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    return db.query(DhcpReservation).filter(DhcpReservation.pool_id == pool_id).order_by(DhcpReservation.ip_address).all()


@router.post("/servers/{server_id}/pools/{pool_id}/reservations", response_model=DhcpReservationRead, status_code=status.HTTP_201_CREATED)
def create_reservation(server_id: int, pool_id: int, payload: DhcpReservationCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpReservation:
    pool = db.query(DhcpPool).filter(DhcpPool.id == pool_id, DhcpPool.server_id == server_id).first()
    if not pool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    if db.query(DhcpReservation).filter(DhcpReservation.pool_id == pool_id, DhcpReservation.mac_address == payload.mac_address).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reservation for this MAC already exists in the pool")
    res = DhcpReservation(pool_id=pool_id, **payload.model_dump())
    db.add(res); db.commit(); db.refresh(res)
    _reload_local(db)
    return res


@router.delete("/servers/{server_id}/pools/{pool_id}/reservations/{res_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_reservation(server_id: int, pool_id: int, res_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> None:
    res = db.query(DhcpReservation).filter(DhcpReservation.id == res_id, DhcpReservation.pool_id == pool_id).first()
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    db.delete(res); db.commit()
    _reload_local(db)


# ── All leases flat view + promote to reservation ────────────────────────────

@router.get("/leases", response_model=list[DhcpLeaseRead])
def all_leases(
    active_only: bool = True,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[DhcpLease]:
    q = db.query(DhcpLease)
    if active_only:
        q = q.filter(DhcpLease.status == "active")
    return q.order_by(DhcpLease.ip_address).all()


@router.post("/leases/{lease_id}/promote", response_model=DhcpReservationRead)
def promote_lease_to_reservation(lease_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpReservation:
    """Convert an active lease into a static reservation in the same pool."""
    lease = db.query(DhcpLease).filter(DhcpLease.id == lease_id).first()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
    if not lease.pool_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lease is not associated with a pool")
    if db.query(DhcpReservation).filter(DhcpReservation.pool_id == lease.pool_id, DhcpReservation.mac_address == lease.mac_address).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reservation already exists for this MAC")
    res = DhcpReservation(pool_id=lease.pool_id, ip_address=lease.ip_address, mac_address=lease.mac_address, hostname=lease.hostname, description="promoted from lease")
    db.add(res); db.commit(); db.refresh(res)
    _reload_local(db)
    return res


# ── Bulk lease import (CSV/list from router export) ───────────────────────────

@router.post("/servers/{server_id}/pools/{pool_id}/leases/bulk", response_model=dict)
def bulk_import_leases(
    server_id: int,
    pool_id: int,
    leases: list[DhcpLeaseCreate],
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("dhcp:write")),
) -> dict:
    """Upsert a list of leases – existing MAC addresses are updated, new ones are inserted."""
    if not db.query(DhcpPool).filter(DhcpPool.id == pool_id, DhcpPool.server_id == server_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    now = datetime.utcnow()
    added = updated = 0
    for item in leases:
        existing = db.query(DhcpLease).filter(DhcpLease.pool_id == pool_id, DhcpLease.mac_address == item.mac_address).first()
        if existing:
            for field, value in item.model_dump(exclude_none=True).items():
                setattr(existing, field, value)
            existing.last_seen_at = now
            updated += 1
        else:
            db.add(DhcpLease(pool_id=pool_id, last_seen_at=now, **item.model_dump()))
            added += 1
    db.commit()
    return {"added": added, "updated": updated}


def _local_status(db) -> DhcpLocalStatus:
    server = db.query(DhcpServer).filter(DhcpServer.kind == "local").first()
    pools = db.query(DhcpPool).filter(DhcpPool.server_id == server.id).all() if server else []
    reservations = sum(len(pool.reservations) for pool in pools)
    leases = db.query(DhcpLease).filter(DhcpLease.source == "local").count() if server else 0
    enabled = is_enabled()
    running = process_running()
    if enabled and running:
        detail = "Local DHCP is enabled and the sidecar is watching the config."
    elif enabled:
        detail = "Enabled. Recreate the dhcp container if clients get no addresses (host network + UDP 67)."
    else:
        detail = "Local DHCP is disabled. The router can keep serving leases."
    return DhcpLocalStatus(
        enabled=enabled,
        running=running,
        server_id=server.id if server else None,
        pools=len(pools),
        reservations=reservations,
        leases=leases,
        detail=detail,
        warning="Turn off DHCP on the Wi-Fi router before enabling NexusOps, or clients will get conflicting leases.",
    )


@router.get("/local/status", response_model=DhcpLocalStatus)
def local_dhcp_status(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> DhcpLocalStatus:
    if is_enabled():
        ingest_local_leases(db)
    return _local_status(db)


@router.post("/local/enable", response_model=DhcpLocalStatus)
def enable_local_dhcp(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dhcp:write")),
) -> DhcpLocalStatus:
    try:
        apply_pools(db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    set_enabled(True)
    persist_setting(db, True)
    server = ensure_local_server(db)
    server.status = "active"
    db.commit()
    _nudge_container("start")
    db.add(AuditLog(user_id=current_user.id, action="DHCP_LOCAL_ENABLE", resource="dhcp", resource_id="local", details="Local DHCP enabled", source="web", success=True))
    db.commit()
    return _local_status(db)


@router.post("/local/disable", response_model=DhcpLocalStatus)
def disable_local_dhcp(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dhcp:write")),
) -> DhcpLocalStatus:
    set_enabled(False)
    persist_setting(db, False)
    server = db.query(DhcpServer).filter(DhcpServer.kind == "local").first()
    if server:
        server.status = "stopped"
        db.commit()
    _nudge_container("stop")
    db.add(AuditLog(user_id=current_user.id, action="DHCP_LOCAL_DISABLE", resource="dhcp", resource_id="local", details="Local DHCP disabled", source="web", success=True))
    db.commit()
    return _local_status(db)


def _guess_pool(db, server: DhcpServer, ip: str, gateway: str | None) -> DhcpPool:
    existing = next((pool for pool in server.pools if _ip_in_cidr(ip, pool.subnet)), None)
    if existing:
        return existing
    parts = ip.split(".")
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="Could not infer a subnet from the lease table")
    subnet = f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
    start = f"{parts[0]}.{parts[1]}.{parts[2]}.100"
    end = f"{parts[0]}.{parts[1]}.{parts[2]}.249"
    pool = DhcpPool(server_id=server.id, subnet=subnet, range_start=start, range_end=end, gateway=gateway, dns_servers=None, description="Imported from router")
    db.add(pool)
    db.commit()
    db.refresh(pool)
    return pool


def _ip_in_cidr(ip: str, cidr: str) -> bool:
    import ipaddress

    try:
        return ipaddress.ip_address(ip) in ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        return False


@router.post("/router/fetch", response_model=DhcpRouterFetchResult)
def fetch_router_table(
    payload: DhcpRouterFetchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dhcp:write")),
) -> DhcpRouterFetchResult:
    from app.modules.dhcp_router import RouterFetchError, decrypt_password, encrypt_password, fetch_router_leases

    server = None
    if payload.server_id:
        server = db.query(DhcpServer).filter(DhcpServer.id == payload.server_id).first()
        if not server:
            raise HTTPException(status_code=404, detail="DHCP server not found")
    host = (payload.host or (server.host if server else "") or "").strip()
    username = (payload.username or (server.router_username if server else "") or "").strip()
    password = (payload.password or "").strip()
    if not password and server and server.router_password_encrypted:
        try:
            password = decrypt_password(server.router_password_encrypted)
        except Exception:
            password = ""
    try:
        detected, rows = fetch_router_leases(
            payload.router_type,
            host,
            username,
            password,
            payload.port if payload.port is not None else (server.router_port if server else None),
            payload.https if payload.host else (server.router_https if server else payload.https),
            payload.lease_text,
        )
    except RouterFetchError as exc:
        if server:
            server.last_fetch_error = str(exc)
            server.last_fetch_at = datetime.utcnow()
            db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if server is None:
        server = DhcpServer(
            name=payload.name or f"Router {host or 'import'}",
            host=host or "router",
            description="DHCP table imported from the LAN router",
            status="active",
            kind="router",
        )
        db.add(server)
        db.commit()
        db.refresh(server)
    server.kind = "router"
    server.host = host or server.host
    server.router_type = detected if detected != "paste" else (payload.router_type or "auto")
    if username:
        server.router_username = username
    if payload.password:
        server.router_password_encrypted = encrypt_password(payload.password)
    if payload.port:
        server.router_port = payload.port
    server.router_https = payload.https
    server.last_fetch_at = datetime.utcnow()
    server.last_fetch_error = None
    server.last_fetch_count = len(rows)
    db.commit()
    db.refresh(server)

    pool = None
    if payload.pool_id:
        pool = db.query(DhcpPool).filter(DhcpPool.id == payload.pool_id).first()
    if pool is None and rows:
        pool = _guess_pool(db, server, rows[0].ip_address, host if _ip_in_cidr(host, f"{rows[0].ip_address.rsplit('.', 1)[0]}.0/24") else None)

    before = {row.mac_address: row for row in db.query(DhcpLease).all()}
    total = upsert_leases(db, rows, [pool] if pool else list(server.pools), source="router")
    after = db.query(DhcpLease).all()
    added = max(len(after) - len(before), 0)
    updated = max(total - added, 0)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="DHCP_ROUTER_FETCH",
            resource="dhcp",
            resource_id=str(server.id),
            details=f"{detected}: {total} leases",
            source="web",
            success=True,
        )
    )
    db.commit()
    return DhcpRouterFetchResult(
        router_type=detected,
        added=added,
        updated=updated,
        total=total,
        server_id=server.id,
        pool_id=pool.id if pool else None,
        message=f"Imported {total} lease{'' if total == 1 else 's'} from {detected}.",
    )

