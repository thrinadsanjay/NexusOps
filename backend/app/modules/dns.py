"""Phase 4 – DNS Management API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_permission
from app.db import get_db
from app.models import DnsRecord, DnsZone
from app.schemas import (
    DnsRecordCreate,
    DnsRecordRead,
    DnsRecordUpdate,
    DnsZoneCreate,
    DnsZoneRead,
    DnsZoneUpdate,
)

router = APIRouter(prefix="/api/v1/dns", tags=["dns"])

VALID_TYPES = {"A", "AAAA", "CNAME", "MX", "TXT", "PTR", "NS", "SRV", "SOA", "CAA"}


# ── Zones ─────────────────────────────────────────────────────────────────────

@router.get("/zones", response_model=list[DnsZoneRead])
def list_zones(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[DnsZone]:
    return db.query(DnsZone).order_by(DnsZone.name).all()


@router.post("/zones", response_model=DnsZoneRead, status_code=status.HTTP_201_CREATED)
def create_zone(payload: DnsZoneCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("dns:write"))) -> DnsZone:
    if db.query(DnsZone).filter(DnsZone.name == payload.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Zone '{payload.name}' already exists")
    zone = DnsZone(**payload.model_dump())
    db.add(zone); db.commit(); db.refresh(zone)
    return zone


@router.get("/zones/{zone_id}", response_model=DnsZoneRead)
def get_zone(zone_id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> DnsZone:
    zone = db.query(DnsZone).filter(DnsZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    return zone


@router.patch("/zones/{zone_id}", response_model=DnsZoneRead)
def update_zone(zone_id: int, payload: DnsZoneUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("dns:write"))) -> DnsZone:
    zone = db.query(DnsZone).filter(DnsZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(zone, field, value)
    db.commit(); db.refresh(zone)
    return zone


@router.delete("/zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_zone(zone_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dns:write"))) -> None:
    zone = db.query(DnsZone).filter(DnsZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    db.delete(zone); db.commit()


# ── Records ───────────────────────────────────────────────────────────────────

@router.get("/zones/{zone_id}/records", response_model=list[DnsRecordRead])
def list_records(
    zone_id: int,
    record_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[DnsRecord]:
    zone = db.query(DnsZone).filter(DnsZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    q = db.query(DnsRecord).filter(DnsRecord.zone_id == zone_id)
    if record_type:
        q = q.filter(DnsRecord.record_type == record_type.upper())
    return q.order_by(DnsRecord.record_type, DnsRecord.name).all()


@router.post("/zones/{zone_id}/records", response_model=DnsRecordRead, status_code=status.HTTP_201_CREATED)
def create_record(zone_id: int, payload: DnsRecordCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("dns:write"))) -> DnsRecord:
    if not db.query(DnsZone).filter(DnsZone.id == zone_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    rtype = payload.record_type.upper()
    if rtype not in VALID_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown record type '{rtype}'")
    record = DnsRecord(zone_id=zone_id, **{**payload.model_dump(), "record_type": rtype})
    db.add(record); db.commit(); db.refresh(record)
    from app.modules.dns_cloudflare import push_record_live
    push_record_live(db, record)
    db.refresh(record)
    return record


@router.patch("/zones/{zone_id}/records/{record_id}", response_model=DnsRecordRead)
def update_record(zone_id: int, record_id: int, payload: DnsRecordUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("dns:write"))) -> DnsRecord:
    record = db.query(DnsRecord).filter(DnsRecord.id == record_id, DnsRecord.zone_id == zone_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    data = payload.model_dump(exclude_none=True)
    if "record_type" in data:
        data["record_type"] = data["record_type"].upper()
    for field, value in data.items():
        setattr(record, field, value)
    db.commit(); db.refresh(record)
    from app.modules.dns_cloudflare import push_record_live
    push_record_live(db, record)
    db.refresh(record)
    return record


@router.delete("/zones/{zone_id}/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_record(zone_id: int, record_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dns:write"))) -> None:
    record = db.query(DnsRecord).filter(DnsRecord.id == record_id, DnsRecord.zone_id == zone_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    from app.modules.dns_cloudflare import delete_record_live
    delete_record_live(db, record)
    db.delete(record); db.commit()


# ── Cross-zone record search ──────────────────────────────────────────────────

@router.get("/records/search", response_model=list[DnsRecordRead])
def search_records(
    q: str = Query(min_length=1),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[DnsRecord]:
    like = f"%{q}%"
    return db.query(DnsRecord).filter(
        (DnsRecord.name.ilike(like)) | (DnsRecord.value.ilike(like))
    ).order_by(DnsRecord.name).limit(100).all()


# ── Auto-generate PTR / A records from IPAM ───────────────────────────────────

@router.post("/zones/{zone_id}/import-from-ipam", response_model=dict)
def import_a_records(zone_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dns:write"))) -> dict:
    """Generate A records in a forward zone from assigned IPAM addresses that have a hostname."""
    from app.models import IPAddress
    zone = db.query(DnsZone).filter(DnsZone.id == zone_id, DnsZone.kind == "forward").first()
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Forward zone not found")

    ips = db.query(IPAddress).filter(IPAddress.hostname.isnot(None), IPAddress.status == "assigned").all()
    added = 0
    for ip in ips:
        hostname = ip.hostname.split(".")[0]  # use short name
        exists = db.query(DnsRecord).filter(
            DnsRecord.zone_id == zone_id,
            DnsRecord.record_type == "A",
            DnsRecord.name == hostname,
        ).first()
        if not exists:
            db.add(DnsRecord(zone_id=zone_id, name=hostname, record_type="A", value=ip.address, comment="auto-imported from IPAM"))
            added += 1
    db.commit()
    return {"imported": added}
