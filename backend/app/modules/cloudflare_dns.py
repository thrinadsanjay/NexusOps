"""Cloudflare DNS API helpers. Tokens are encrypted at rest and never logged."""

from __future__ import annotations

import base64
import hashlib
import logging
from dataclasses import dataclass

import httpx
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

CF_API = "https://api.cloudflare.com/client/v4"
SKIP_TYPES = {"NS", "SOA"}
logger = logging.getLogger("nexusops.dns")


class CloudflareError(Exception):
    pass


def _fernet() -> Fernet:
    digest = hashlib.sha256((settings.secret_key or "nexusops").encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(blob: str) -> str:
    try:
        return _fernet().decrypt(blob.encode()).decode()
    except InvalidToken as exc:
        raise CloudflareError("Cloudflare token cannot be decrypted. Save the token again.") from exc


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _problem(body: dict, response: httpx.Response) -> str:
    errors = body.get("errors") or []
    if errors:
        return str(errors[0].get("message") or response.text)
    return response.text or f"Cloudflare HTTP {response.status_code}"


@dataclass
class CfZone:
    id: str
    name: str
    status: str


@dataclass
class CfRecord:
    id: str
    name: str
    type: str
    content: str
    ttl: int
    priority: int | None
    proxied: bool


def verify_token(token: str) -> dict:
    with httpx.Client(timeout=20) as client:
        response = client.get(f"{CF_API}/user/tokens/verify", headers=_headers(token))
        body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        if response.status_code != 200 or not body.get("success"):
            raise CloudflareError(_problem(body if isinstance(body, dict) else {}, response))
        return {"status": "ok", "message": "Cloudflare token is valid"}


def list_zones(token: str) -> list[CfZone]:
    zones: list[CfZone] = []
    page = 1
    with httpx.Client(timeout=20) as client:
        while True:
            response = client.get(
                f"{CF_API}/zones",
                params={"page": page, "per_page": 50},
                headers=_headers(token),
            )
            body = response.json()
            if response.status_code != 200 or not body.get("success"):
                raise CloudflareError(_problem(body, response))
            for row in body.get("result") or []:
                zones.append(CfZone(id=row["id"], name=row["name"], status=row.get("status") or "unknown"))
            info = body.get("result_info") or {}
            if page >= int(info.get("total_pages") or 1):
                break
            page += 1
    return zones


def find_zone(token: str, name: str) -> CfZone | None:
    wanted = name.lower().rstrip(".")
    for zone in list_zones(token):
        if zone.name.lower() == wanted:
            return zone
    return None


def list_records(token: str, zone_id: str) -> list[CfRecord]:
    records: list[CfRecord] = []
    page = 1
    with httpx.Client(timeout=25) as client:
        while True:
            response = client.get(
                f"{CF_API}/zones/{zone_id}/dns_records",
                params={"page": page, "per_page": 100},
                headers=_headers(token),
            )
            body = response.json()
            if response.status_code != 200 or not body.get("success"):
                raise CloudflareError(_problem(body, response))
            for row in body.get("result") or []:
                rtype = str(row.get("type") or "").upper()
                if rtype in SKIP_TYPES:
                    continue
                records.append(
                    CfRecord(
                        id=row["id"],
                        name=row.get("name") or "",
                        type=rtype,
                        content=str(row.get("content") or ""),
                        ttl=int(row.get("ttl") or 1),
                        priority=row.get("priority"),
                        proxied=bool(row.get("proxied")),
                    )
                )
            info = body.get("result_info") or {}
            if page >= int(info.get("total_pages") or 1):
                break
            page += 1
    return records


def relative_name(zone_name: str, fqdn: str) -> str:
    host = fqdn.lower().rstrip(".")
    apex = zone_name.lower().rstrip(".")
    if host == apex:
        return "@"
    suffix = "." + apex
    if host.endswith(suffix):
        return host[: -len(suffix)]
    return host


def fqdn(zone_name: str, relative: str) -> str:
    name = (relative or "@").strip().rstrip(".")
    if name in {"@", ""}:
        return zone_name.rstrip(".")
    if name.endswith("." + zone_name.rstrip(".")) or name == zone_name.rstrip("."):
        return name
    return f"{name}.{zone_name.rstrip('.')}"


def upsert_record(token: str, zone_id: str, zone_name: str, record: dict) -> str:
    payload = {
        "type": record["type"],
        "name": fqdn(zone_name, record["name"]),
        "content": record["content"],
        "ttl": record.get("ttl") or 1,
    }
    if record.get("priority") is not None:
        payload["priority"] = record["priority"]
    record_id = record.get("id")
    with httpx.Client(timeout=20) as client:
        if record_id:
            response = client.put(
                f"{CF_API}/zones/{zone_id}/dns_records/{record_id}",
                headers=_headers(token),
                json=payload,
            )
        else:
            response = client.post(
                f"{CF_API}/zones/{zone_id}/dns_records",
                headers=_headers(token),
                json=payload,
            )
        body = response.json()
        if response.status_code not in {200, 201} or not body.get("success"):
            raise CloudflareError(_problem(body, response))
        return str(body["result"]["id"])


def delete_remote_record(token: str, zone_id: str, record_id: str) -> None:
    with httpx.Client(timeout=20) as client:
        response = client.delete(
            f"{CF_API}/zones/{zone_id}/dns_records/{record_id}",
            headers=_headers(token),
        )
        if response.status_code == 404:
            return
        body = response.json() if response.content else {}
        if response.status_code not in {200, 204} or (isinstance(body, dict) and body.get("success") is False):
            raise CloudflareError(_problem(body if isinstance(body, dict) else {}, response))
