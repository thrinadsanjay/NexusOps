"""Secure Cloudflare account storage and zone pull/push sync."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_permission
from app.db import get_db
from app.models import DnsCloudAccount, DnsRecord, DnsZone
from app.modules.cloudflare_dns import (
    CloudflareError,
    decrypt_token,
    encrypt_token,
    find_zone,
    list_records,
    list_zones,
    relative_name,
    upsert_record,
    verify_token,
)
from app.schemas import (
    DnsCloudAccountCreate,
    DnsCloudAccountRead,
    DnsCloudAccountUpdate,
    DnsCloudImportRequest,
    DnsCloudLinkRequest,
    DnsCloudZoneRead,
    DnsSyncResult,
    DnsZoneRead,
)

router = APIRouter(prefix="/api/v1/dns", tags=["dns"])


def _account_read(account: DnsCloudAccount) -> DnsCloudAccountRead:
    data = DnsCloudAccountRead.model_validate(account)
    return data.model_copy(update={"has_token": bool(account.token_encrypted)})


def _get_account(account_id: int, db: Session) -> DnsCloudAccount:
    account = db.query(DnsCloudAccount).filter(DnsCloudAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Cloudflare account not found")
    return account


def _token(account: DnsCloudAccount) -> str:
    try:
        return decrypt_token(account.token_encrypted)
    except CloudflareError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/cloudflare/accounts", response_model=list[DnsCloudAccountRead])
def list_accounts(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[DnsCloudAccountRead]:
    return [_account_read(row) for row in db.query(DnsCloudAccount).order_by(DnsCloudAccount.name).all()]


@router.post("/cloudflare/accounts", response_model=DnsCloudAccountRead, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: DnsCloudAccountCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("dns:write")),
) -> DnsCloudAccountRead:
    token = payload.api_token.strip()
    try:
        verify_token(token)
    except CloudflareError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    account = DnsCloudAccount(
        name=payload.name.strip(),
        provider="cloudflare",
        token_encrypted=encrypt_token(token),
        last_test_at=datetime.utcnow(),
        last_test_status="ok",
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return _account_read(account)


@router.patch("/cloudflare/accounts/{account_id}", response_model=DnsCloudAccountRead)
def update_account(
    account_id: int,
    payload: DnsCloudAccountUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("dns:write")),
) -> DnsCloudAccountRead:
    account = _get_account(account_id, db)
    if payload.name:
        account.name = payload.name.strip()
    if payload.api_token:
        token = payload.api_token.strip()
        try:
            verify_token(token)
        except CloudflareError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        account.token_encrypted = encrypt_token(token)
        account.last_test_at = datetime.utcnow()
        account.last_test_status = "ok"
        account.last_test_error = None
    db.commit()
    db.refresh(account)
    return _account_read(account)


@router.delete("/cloudflare/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("dns:write")),
) -> None:
    account = _get_account(account_id, db)
    db.query(DnsZone).filter(DnsZone.cloud_account_id == account.id).update(
        {"cloud_account_id": None, "cloudflare_zone_id": None}
    )
    db.delete(account)
    db.commit()


@router.post("/cloudflare/accounts/{account_id}/test")
def test_account(
    account_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("dns:write")),
) -> dict:
    account = _get_account(account_id, db)
    try:
        result = verify_token(_token(account))
        account.last_test_at = datetime.utcnow()
        account.last_test_status = "ok"
        account.last_test_error = None
        db.commit()
        return result
    except CloudflareError as exc:
        account.last_test_at = datetime.utcnow()
        account.last_test_status = "error"
        account.last_test_error = str(exc)
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/cloudflare/accounts/{account_id}/zones", response_model=list[DnsCloudZoneRead])
def list_cloud_zones(
    account_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[DnsCloudZoneRead]:
    account = _get_account(account_id, db)
    try:
        remote = list_zones(_token(account))
    except CloudflareError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    local = {z.cloudflare_zone_id for z in db.query(DnsZone).filter(DnsZone.cloudflare_zone_id.isnot(None)).all()}
    names = {z.name.lower() for z in db.query(DnsZone).all()}
    return [
        DnsCloudZoneRead(
            id=zone.id,
            name=zone.name,
            status=zone.status,
            imported=zone.id in local or zone.name.lower() in names,
        )
        for zone in remote
    ]


@router.post("/cloudflare/accounts/{account_id}/import", response_model=DnsZoneRead)
def import_cloud_zone(
    account_id: int,
    payload: DnsCloudImportRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("dns:write")),
) -> DnsZoneRead:
    account = _get_account(account_id, db)
    token = _token(account)
    try:
        remote_zones = list_zones(token)
    except CloudflareError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    match = None
    if payload.cloudflare_zone_id:
        match = next((z for z in remote_zones if z.id == payload.cloudflare_zone_id), None)
    elif payload.zone_name:
        wanted = payload.zone_name.lower().rstrip(".")
        match = next((z for z in remote_zones if z.name.lower() == wanted), None)
    if not match:
        raise HTTPException(status_code=404, detail="Cloudflare zone not found for this token")
    zone = db.query(DnsZone).filter(DnsZone.name == match.name).first()
    if zone is None:
        zone = DnsZone(name=match.name, kind="forward", status="active", description="Imported from Cloudflare")
        db.add(zone)
        db.flush()
    zone.cloud_account_id = account.id
    zone.cloudflare_zone_id = match.id
    db.commit()
    db.refresh(zone)
    _pull_zone(db, zone, token)
    db.refresh(zone)
    return DnsZoneRead.model_validate(zone)


@router.post("/zones/{zone_id}/cloudflare/link", response_model=DnsZoneRead)
def link_zone(
    zone_id: int,
    payload: DnsCloudLinkRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("dns:write")),
) -> DnsZoneRead:
    zone = db.query(DnsZone).filter(DnsZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    account = _get_account(payload.account_id, db)
    token = _token(account)
    try:
        remote = None
        if payload.cloudflare_zone_id:
            remote = next((z for z in list_zones(token) if z.id == payload.cloudflare_zone_id), None)
        if remote is None:
            remote = find_zone(token, zone.name)
    except CloudflareError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not remote:
        raise HTTPException(status_code=404, detail=f"No Cloudflare zone named {zone.name}")
    zone.cloud_account_id = account.id
    zone.cloudflare_zone_id = remote.id
    db.commit()
    db.refresh(zone)
    return DnsZoneRead.model_validate(zone)


@router.post("/zones/{zone_id}/cloudflare/pull", response_model=DnsSyncResult)
def pull_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("dns:write")),
) -> DnsSyncResult:
    zone = db.query(DnsZone).filter(DnsZone.id == zone_id).first()
    if not zone or not zone.cloud_account_id or not zone.cloudflare_zone_id:
        raise HTTPException(status_code=400, detail="Link this zone to Cloudflare first")
    account = _get_account(zone.cloud_account_id, db)
    return _pull_zone(db, zone, _token(account))


@router.post("/zones/{zone_id}/cloudflare/push", response_model=DnsSyncResult)
def push_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("dns:write")),
) -> DnsSyncResult:
    zone = db.query(DnsZone).filter(DnsZone.id == zone_id).first()
    if not zone or not zone.cloud_account_id or not zone.cloudflare_zone_id:
        raise HTTPException(status_code=400, detail="Link this zone to Cloudflare first")
    account = _get_account(zone.cloud_account_id, db)
    token = _token(account)
    created = updated = unchanged = 0
    errors: list[str] = []
    for row in zone.records:
        if row.record_type.upper() in {"NS", "SOA"}:
            continue
        try:
            record_id = upsert_record(
                token,
                zone.cloudflare_zone_id,
                zone.name,
                {
                    "id": row.cloudflare_record_id,
                    "type": row.record_type.upper(),
                    "name": row.name,
                    "content": row.value,
                    "ttl": row.ttl or 1,
                    "priority": row.priority,
                },
            )
            if row.cloudflare_record_id:
                if row.cloudflare_record_id == record_id:
                    unchanged += 1
                else:
                    updated += 1
            else:
                created += 1
            row.cloudflare_record_id = record_id
        except CloudflareError as exc:
            errors.append(f"{row.name} {row.record_type}: {exc}")
    zone.last_sync_at = datetime.utcnow()
    zone.last_sync_direction = "push"
    zone.last_sync_status = "error" if errors else "ok"
    zone.last_sync_error = "; ".join(errors) if errors else None
    db.commit()
    return DnsSyncResult(
        direction="push",
        created=created,
        updated=updated,
        unchanged=unchanged,
        errors=errors,
        message="Pushed local records to Cloudflare. Cloudflare-only records were left in place.",
    )


def _pull_zone(db: Session, zone: DnsZone, token: str) -> DnsSyncResult:
    try:
        remote = list_records(token, zone.cloudflare_zone_id or "")
    except CloudflareError as exc:
        zone.last_sync_at = datetime.utcnow()
        zone.last_sync_direction = "pull"
        zone.last_sync_status = "error"
        zone.last_sync_error = str(exc)
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    created = updated = unchanged = 0
    by_id = {row.cloudflare_record_id: row for row in zone.records if row.cloudflare_record_id}
    for item in remote:
        rel = relative_name(zone.name, item.name)
        ttl = None if item.ttl in {1, 0} else item.ttl
        comment = "cloudflare-proxied" if item.proxied else None
        existing = by_id.get(item.id)
        if existing is None:
            existing = next(
                (
                    row
                    for row in zone.records
                    if row.name.lower() == rel
                    and row.record_type.upper() == item.type
                    and row.value == item.content
                ),
                None,
            )
        if existing is None:
            db.add(
                DnsRecord(
                    zone_id=zone.id,
                    name=rel,
                    record_type=item.type,
                    value=item.content,
                    ttl=ttl,
                    priority=item.priority,
                    comment=comment,
                    cloudflare_record_id=item.id,
                )
            )
            created += 1
            continue
        changed = (
            existing.name != rel
            or existing.record_type.upper() != item.type
            or existing.value != item.content
            or existing.ttl != ttl
            or existing.priority != item.priority
            or existing.cloudflare_record_id != item.id
        )
        existing.name = rel
        existing.record_type = item.type
        existing.value = item.content
        existing.ttl = ttl
        existing.priority = item.priority
        existing.cloudflare_record_id = item.id
        if comment and not existing.comment:
            existing.comment = comment
        if changed:
            updated += 1
        else:
            unchanged += 1
    zone.last_sync_at = datetime.utcnow()
    zone.last_sync_direction = "pull"
    zone.last_sync_status = "ok"
    zone.last_sync_error = None
    db.commit()
    return DnsSyncResult(
        direction="pull",
        created=created,
        updated=updated,
        unchanged=unchanged,
        message="Pulled Cloudflare records into NexusOps. Local-only records were left in place.",
    )
