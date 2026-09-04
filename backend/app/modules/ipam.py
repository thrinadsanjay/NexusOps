"""Phase 2 – Network / IPAM API endpoints."""

from __future__ import annotations

import ipaddress

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_permission
from app.db import get_db
from app.models import IPAddress, Subnet, VLan
from app.modules.ipam_enrich import apply_missing, lookup_details
from app.schemas import (
    DiscoveredNetwork,
    IPAddressCreate,
    IPAddressRead,
    IPAddressUpdate,
    SubnetCreate,
    SubnetRead,
    SubnetUpdate,
    SubnetUtilization,
    VLanCreate,
    VLanRead,
    VLanUpdate,
)

router = APIRouter(prefix="/api/v1/ipam", tags=["ipam"])


# ── VLANs ──────────────────────────────────────────────────────────────────

@router.get("/vlans", response_model=list[VLanRead])
def list_vlans(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[VLan]:
    return db.query(VLan).order_by(VLan.vid).all()


@router.post("/vlans", response_model=VLanRead, status_code=status.HTTP_201_CREATED)
def create_vlan(
    payload: VLanCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> VLan:
    if db.query(VLan).filter(VLan.vid == payload.vid).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"VLAN {payload.vid} already exists")
    vlan = VLan(**payload.model_dump())
    db.add(vlan)
    db.commit()
    db.refresh(vlan)
    return vlan


@router.get("/vlans/{vlan_id}", response_model=VLanRead)
def get_vlan(
    vlan_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> VLan:
    vlan = db.query(VLan).filter(VLan.id == vlan_id).first()
    if not vlan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found")
    return vlan


@router.patch("/vlans/{vlan_id}", response_model=VLanRead)
def update_vlan(
    vlan_id: int,
    payload: VLanUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> VLan:
    vlan = db.query(VLan).filter(VLan.id == vlan_id).first()
    if not vlan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(vlan, field, value)
    db.commit()
    db.refresh(vlan)
    return vlan


@router.delete("/vlans/{vlan_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_vlan(
    vlan_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> None:
    vlan = db.query(VLan).filter(VLan.id == vlan_id).first()
    if not vlan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found")
    db.delete(vlan)
    db.commit()


# ── Subnets ─────────────────────────────────────────────────────────────────

@router.get("/subnets", response_model=list[SubnetRead])
def list_subnets(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[Subnet]:
    return db.query(Subnet).order_by(Subnet.cidr).all()


@router.post("/subnets", response_model=SubnetRead, status_code=status.HTTP_201_CREATED)
def create_subnet(
    payload: SubnetCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> Subnet:
    try:
        cidr = str(ipaddress.ip_network(payload.cidr, strict=False))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid CIDR: {payload.cidr}") from exc
    if db.query(Subnet).filter(Subnet.cidr == cidr).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Subnet {cidr} already exists")
    if payload.vlan_id and not db.query(VLan).filter(VLan.id == payload.vlan_id).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="VLAN not found")
    data = payload.model_dump()
    data["cidr"] = cidr
    subnet = Subnet(**data)
    db.add(subnet)
    db.commit()
    db.refresh(subnet)
    return subnet


@router.get("/subnets/{subnet_id}", response_model=SubnetRead)
def get_subnet(
    subnet_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> Subnet:
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subnet not found")
    return subnet


@router.patch("/subnets/{subnet_id}", response_model=SubnetRead)
def update_subnet(
    subnet_id: int,
    payload: SubnetUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> Subnet:
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subnet not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(subnet, field, value)
    db.commit()
    db.refresh(subnet)
    return subnet


@router.delete("/subnets/{subnet_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_subnet(
    subnet_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> None:
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subnet not found")
    db.delete(subnet)
    db.commit()


# ── IP Addresses ─────────────────────────────────────────────────────────────

@router.get("/addresses", response_model=list[IPAddressRead])
def list_addresses(
    subnet_id: int | None = None,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[IPAddress]:
    q = db.query(IPAddress)
    if subnet_id is not None:
        q = q.filter(IPAddress.subnet_id == subnet_id)
    return q.order_by(IPAddress.address).all()


@router.post("/addresses", response_model=IPAddressRead, status_code=status.HTTP_201_CREATED)
def create_address(
    payload: IPAddressCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> IPAddress:
    if db.query(IPAddress).filter(IPAddress.address == payload.address).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Address {payload.address} already exists")
    ip = IPAddress(**payload.model_dump())
    db.add(ip)
    db.commit()
    db.refresh(ip)
    return ip


@router.get("/addresses/{ip_id}", response_model=IPAddressRead)
def get_address(
    ip_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> IPAddress:
    ip = db.query(IPAddress).filter(IPAddress.id == ip_id).first()
    if not ip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP address not found")
    return ip


@router.patch("/addresses/{ip_id}", response_model=IPAddressRead)
def update_address(
    ip_id: int,
    payload: IPAddressUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> IPAddress:
    ip = db.query(IPAddress).filter(IPAddress.id == ip_id).first()
    if not ip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP address not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        if isinstance(value, str):
            value = value.strip() or None
        setattr(ip, field, value)
    db.commit()
    db.refresh(ip)
    return ip


@router.post("/addresses/lookup-missing", response_model=dict)
def lookup_missing_addresses(
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> dict:
    rows = db.query(IPAddress).all()
    updated = 0
    for ip in rows:
        if ip.hostname and ip.dns_name and ip.mac_address:
            continue
        details = lookup_details(db, ip.address, ping_first=False)
        if apply_missing(ip, details):
            updated += 1
    db.commit()
    return {"updated": updated, "total": len(rows)}


@router.post("/addresses/{ip_id}/lookup", response_model=dict)
def lookup_address(
    ip_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> dict:
    ip = db.query(IPAddress).filter(IPAddress.id == ip_id).first()
    if not ip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP address not found")
    details = lookup_details(db, ip.address, ping_first=True)
    filled = apply_missing(ip, details)
    db.commit()
    db.refresh(ip)
    return {
        "address": IPAddressRead.model_validate(ip).model_dump(mode="json"),
        "filled": filled,
        "sources": details.sources,
    }


@router.delete("/addresses/{ip_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_address(
    ip_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> None:
    ip = db.query(IPAddress).filter(IPAddress.id == ip_id).first()
    if not ip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP address not found")
    db.delete(ip)
    db.commit()


# ── Utilization ──────────────────────────────────────────────────────────────

@router.get("/subnets/{subnet_id}/utilization", response_model=SubnetUtilization)
def subnet_utilization(
    subnet_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> SubnetUtilization:
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subnet not found")

    try:
        network = ipaddress.ip_network(subnet.cidr, strict=False)
        total = max(network.num_addresses - 2, 0)  # exclude network + broadcast
    except ValueError:
        total = 0

    used = db.query(IPAddress).filter(IPAddress.subnet_id == subnet_id).count()
    available = max(total - used, 0)
    percent = round((used / total * 100), 1) if total > 0 else 0.0

    return SubnetUtilization(
        subnet_id=subnet_id,
        cidr=subnet.cidr,
        total=total,
        used=used,
        available=available,
        percent_used=percent,
    )


@router.get("/utilization", response_model=list[SubnetUtilization])
def all_subnet_utilization(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[SubnetUtilization]:
    subnets = db.query(Subnet).all()
    result = []
    for subnet in subnets:
        try:
            network = ipaddress.ip_network(subnet.cidr, strict=False)
            total = max(network.num_addresses - 2, 0)
        except ValueError:
            total = 0

        used = db.query(IPAddress).filter(IPAddress.subnet_id == subnet.id).count()
        available = max(total - used, 0)
        percent = round((used / total * 100), 1) if total > 0 else 0.0

        result.append(SubnetUtilization(
            subnet_id=subnet.id,
            cidr=subnet.cidr,
            total=total,
            used=used,
            available=available,
            percent_used=percent,
        ))
    return result


# ── Subnet scan ──────────────────────────────────────────────────────────────

@router.post("/subnets/{subnet_id}/scan", response_model=dict)
def trigger_subnet_scan(
    subnet_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ipam:write")),
) -> dict:
    subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subnet not found")

    from app.worker import scan_subnet_task
    task = scan_subnet_task.delay(subnet_id)
    return {"task_id": task.id, "status": "queued", "cidr": subnet.cidr}


@router.get("/scan/{task_id}", response_model=dict)
def scan_status(
    task_id: str,
    _: object = Depends(get_current_user),
) -> dict:
    from app.worker import celery_app
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }


# ── Discover local networks ───────────────────────────────────────────────────

@router.get("/discover", response_model=list[DiscoveredNetwork])
def discover_networks(
    _: object = Depends(get_current_user),
) -> list[DiscoveredNetwork]:
    """Auto-detect LAN subnets.
    Priority: 1) SCAN_NETWORKS env var, 2) gateway probe, 3) container interfaces.
    """
    from app.core.config import settings
    from app.modules.scanner import get_local_networks, probe_lan_gateways

    result: list[DiscoveredNetwork] = []
    seen: set[str] = set()

    def _add(cidr: str, iface: str) -> None:
        if cidr not in seen:
            seen.add(cidr)
            result.append(DiscoveredNetwork(cidr=cidr, interface=iface))

    # 1. Explicitly configured networks (highest priority, shown first)
    configured = [c.strip() for c in settings.scan_networks.split(",") if c.strip()]
    for cidr in configured:
        _add(cidr, "configured")

    # 2. Auto-probe common LAN gateways when nothing is configured
    if not configured:
        for n in probe_lan_gateways():
            _add(n["cidr"], n["interface"])

    # 3. Container's own interfaces (shown last, clearly separate)
    for n in get_local_networks():
        _add(n["cidr"], n["interface"])

    return result
