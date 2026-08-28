"""Phase 3 – Infrastructure Inventory API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_permission
from app.db import get_db
from app.models import Host, HostGroup, HostTag
from app.schemas import (
    HostCreate,
    HostGroupCreate,
    HostGroupRead,
    HostRead,
    HostTagCreate,
    HostTagRead,
    HostUpdate,
)

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])


# ── Tags ─────────────────────────────────────────────────────────────────────

@router.get("/tags", response_model=list[HostTagRead])
def list_tags(db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:read"))) -> list[HostTag]:
    return db.query(HostTag).order_by(HostTag.name).all()


@router.post("/tags", response_model=HostTagRead, status_code=status.HTTP_201_CREATED)
def create_tag(payload: HostTagCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:write"))) -> HostTag:
    if db.query(HostTag).filter(HostTag.name == payload.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Tag '{payload.name}' already exists")
    tag = HostTag(**payload.model_dump())
    db.add(tag); db.commit(); db.refresh(tag)
    return tag


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_tag(tag_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:write"))) -> None:
    tag = db.query(HostTag).filter(HostTag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    db.delete(tag); db.commit()


# ── Groups ────────────────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[HostGroupRead])
def list_groups(db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:read"))) -> list[HostGroup]:
    return db.query(HostGroup).order_by(HostGroup.name).all()


@router.post("/groups", response_model=HostGroupRead, status_code=status.HTTP_201_CREATED)
def create_group(payload: HostGroupCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:write"))) -> HostGroup:
    if db.query(HostGroup).filter(HostGroup.name == payload.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Group '{payload.name}' already exists")
    group = HostGroup(**payload.model_dump())
    db.add(group); db.commit(); db.refresh(group)
    return group


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_group(group_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:write"))) -> None:
    group = db.query(HostGroup).filter(HostGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    db.delete(group); db.commit()


# ── Hosts ─────────────────────────────────────────────────────────────────────

@router.get("/hosts", response_model=list[HostRead])
def list_hosts(
    q: str | None = Query(default=None, description="Filter by hostname, IP, FQDN, or role"),
    status: str | None = Query(default=None),
    group_id: int | None = Query(default=None),
    tag_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("inventory:read")),
) -> list[Host]:
    query = db.query(Host)
    if q:
        like = f"%{q}%"
        from sqlalchemy import or_
        query = query.filter(or_(Host.hostname.ilike(like), Host.ip_address.ilike(like), Host.fqdn.ilike(like), Host.role.ilike(like)))
    if status:
        query = query.filter(Host.status == status)
    if group_id:
        query = query.filter(Host.groups.any(HostGroup.id == group_id))
    if tag_id:
        query = query.filter(Host.tags.any(HostTag.id == tag_id))
    return query.order_by(Host.hostname).all()


@router.post("/hosts", response_model=HostRead, status_code=status.HTTP_201_CREATED)
def create_host(payload: HostCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:write"))) -> Host:
    tag_ids = payload.tag_ids
    group_ids = payload.group_ids
    data = payload.model_dump(exclude={"tag_ids", "group_ids"})
    host = Host(**data)
    if tag_ids:
        host.tags = db.query(HostTag).filter(HostTag.id.in_(tag_ids)).all()
    if group_ids:
        host.groups = db.query(HostGroup).filter(HostGroup.id.in_(group_ids)).all()
    db.add(host); db.commit(); db.refresh(host)
    return host


@router.get("/hosts/{host_id}", response_model=HostRead)
def get_host(host_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:read"))) -> Host:
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Host not found")
    return host


@router.patch("/hosts/{host_id}", response_model=HostRead)
def update_host(host_id: int, payload: HostUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:write"))) -> Host:
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Host not found")
    data = payload.model_dump(exclude_none=True, exclude={"tag_ids", "group_ids"})
    for field, value in data.items():
        setattr(host, field, value)
    if payload.tag_ids is not None:
        host.tags = db.query(HostTag).filter(HostTag.id.in_(payload.tag_ids)).all()
    if payload.group_ids is not None:
        host.groups = db.query(HostGroup).filter(HostGroup.id.in_(payload.group_ids)).all()
    db.commit(); db.refresh(host)
    return host


@router.delete("/hosts/{host_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_host(host_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:write"))) -> None:
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Host not found")
    db.delete(host); db.commit()


# ── Import from IPAM scan results ─────────────────────────────────────────────

@router.post("/hosts/import-from-ipam", response_model=dict)
def import_from_ipam(db: Session = Depends(get_db), _: object = Depends(require_permission("inventory:write"))) -> dict:
    """Create Host records for every IP address discovered via IPAM that isn't already tracked."""
    from app.models import IPAddress
    ips = db.query(IPAddress).filter(IPAddress.status == "assigned").all()
    added = 0
    for ip in ips:
        exists = db.query(Host).filter(Host.ip_address == ip.address).first()
        if not exists:
            db.add(Host(
                hostname=ip.hostname or ip.address,
                fqdn=ip.dns_name,
                ip_address=ip.address,
                mac_address=ip.mac_address,
                subnet_id=ip.subnet_id,
                last_seen_at=ip.last_seen_at,
                status="active",
            ))
            added += 1
    db.commit()
    return {"imported": added}
