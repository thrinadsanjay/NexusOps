"""Phase 5 – DHCP Management API."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_permission
from app.db import get_db
from app.models import DhcpLease, DhcpPool, DhcpReservation, DhcpServer
from app.schemas import (
    DhcpLeaseCreate,
    DhcpLeaseRead,
    DhcpPoolCreate,
    DhcpPoolRead,
    DhcpPoolUpdate,
    DhcpReservationCreate,
    DhcpReservationRead,
    DhcpServerCreate,
    DhcpServerRead,
    DhcpServerUpdate,
)

router = APIRouter(prefix="/api/v1/dhcp", tags=["dhcp"])


# ── Servers ───────────────────────────────────────────────────────────────────

@router.get("/servers", response_model=list[DhcpServerRead])
def list_servers(db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:read"))) -> list[DhcpServer]:
    return db.query(DhcpServer).order_by(DhcpServer.name).all()


@router.post("/servers", response_model=DhcpServerRead, status_code=status.HTTP_201_CREATED)
def create_server(payload: DhcpServerCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpServer:
    server = DhcpServer(**payload.model_dump())
    db.add(server); db.commit(); db.refresh(server)
    return server


@router.get("/servers/{server_id}", response_model=DhcpServerRead)
def get_server(server_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:read"))) -> DhcpServer:
    server = db.query(DhcpServer).filter(DhcpServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DHCP server not found")
    return server


@router.patch("/servers/{server_id}", response_model=DhcpServerRead)
def update_server(server_id: int, payload: DhcpServerUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpServer:
    server = db.query(DhcpServer).filter(DhcpServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DHCP server not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(server, field, value)
    db.commit(); db.refresh(server)
    return server


@router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_server(server_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> None:
    server = db.query(DhcpServer).filter(DhcpServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DHCP server not found")
    db.delete(server); db.commit()


# ── Pools ─────────────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/pools", response_model=list[DhcpPoolRead])
def list_pools(server_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:read"))) -> list[DhcpPool]:
    if not db.query(DhcpServer).filter(DhcpServer.id == server_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DHCP server not found")
    return db.query(DhcpPool).filter(DhcpPool.server_id == server_id).all()


@router.post("/servers/{server_id}/pools", response_model=DhcpPoolRead, status_code=status.HTTP_201_CREATED)
def create_pool(server_id: int, payload: DhcpPoolCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpPool:
    if not db.query(DhcpServer).filter(DhcpServer.id == server_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DHCP server not found")
    pool = DhcpPool(server_id=server_id, **payload.model_dump())
    db.add(pool); db.commit(); db.refresh(pool)
    return pool


@router.patch("/servers/{server_id}/pools/{pool_id}", response_model=DhcpPoolRead)
def update_pool(server_id: int, pool_id: int, payload: DhcpPoolUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> DhcpPool:
    pool = db.query(DhcpPool).filter(DhcpPool.id == pool_id, DhcpPool.server_id == server_id).first()
    if not pool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(pool, field, value)
    db.commit(); db.refresh(pool)
    return pool


@router.delete("/servers/{server_id}/pools/{pool_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_pool(server_id: int, pool_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> None:
    pool = db.query(DhcpPool).filter(DhcpPool.id == pool_id, DhcpPool.server_id == server_id).first()
    if not pool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    db.delete(pool); db.commit()


# ── Leases ────────────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/pools/{pool_id}/leases", response_model=list[DhcpLeaseRead])
def list_leases(server_id: int, pool_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:read"))) -> list[DhcpLease]:
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
def list_reservations(server_id: int, pool_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:read"))) -> list[DhcpReservation]:
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
    return res


@router.delete("/servers/{server_id}/pools/{pool_id}/reservations/{res_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_reservation(server_id: int, pool_id: int, res_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("dhcp:write"))) -> None:
    res = db.query(DhcpReservation).filter(DhcpReservation.id == res_id, DhcpReservation.pool_id == pool_id).first()
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    db.delete(res); db.commit()


# ── All leases flat view + promote to reservation ────────────────────────────

@router.get("/leases", response_model=list[DhcpLeaseRead])
def all_leases(
    active_only: bool = True,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("dhcp:read")),
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
