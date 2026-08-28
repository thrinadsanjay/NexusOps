"""Phase 7 – Dashboard stats aggregation API."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db import get_db
from app.models import (
    ApiToken,
    AuditLog,
    Certificate,
    CertificateAuthority,
    DhcpLease,
    DhcpPool,
    DhcpReservation,
    DhcpServer,
    DnsRecord,
    DnsZone,
    Host,
    IPAddress,
    Permission,
    Role,
    Subnet,
    User,
    VLan,
)

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> dict:
    # ── auth ──────────────────────────────────────────────────────────────
    total_users = db.query(func.count(User.id)).scalar() or 0
    active_users = db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0
    total_roles = db.query(func.count(Role.id)).scalar() or 0
    total_permissions = db.query(func.count(Permission.id)).scalar() or 0
    active_tokens = db.query(func.count(ApiToken.id)).filter(ApiToken.is_active.is_(True)).scalar() or 0

    # ── IPAM ──────────────────────────────────────────────────────────────
    total_vlans = db.query(func.count(VLan.id)).scalar() or 0
    total_subnets = db.query(func.count(Subnet.id)).scalar() or 0
    assigned_ips = db.query(func.count(IPAddress.id)).filter(IPAddress.status == "assigned").scalar() or 0
    total_ips = db.query(func.count(IPAddress.id)).scalar() or 0

    # ── Inventory ─────────────────────────────────────────────────────────
    total_hosts = db.query(func.count(Host.id)).scalar() or 0
    active_hosts = db.query(func.count(Host.id)).filter(Host.status == "active").scalar() or 0
    unknown_hosts = db.query(func.count(Host.id)).filter(Host.status == "unknown").scalar() or 0

    # ── DNS ───────────────────────────────────────────────────────────────
    total_zones = db.query(func.count(DnsZone.id)).scalar() or 0
    forward_zones = db.query(func.count(DnsZone.id)).filter(DnsZone.kind == "forward").scalar() or 0
    total_records = db.query(func.count(DnsRecord.id)).scalar() or 0

    # ── DHCP ──────────────────────────────────────────────────────────────
    total_servers = db.query(func.count(DhcpServer.id)).scalar() or 0
    total_pools = db.query(func.count(DhcpPool.id)).scalar() or 0
    active_leases = db.query(func.count(DhcpLease.id)).filter(DhcpLease.status == "active").scalar() or 0
    total_reservations = db.query(func.count(DhcpReservation.id)).scalar() or 0

    # ── PKI ───────────────────────────────────────────────────────────────
    from datetime import timedelta, timezone
    total_certs = db.query(func.count(Certificate.id)).scalar() or 0
    active_certs = db.query(func.count(Certificate.id)).filter(Certificate.status == "active").scalar() or 0
    now = __import__("datetime").datetime.utcnow()
    expiring_30 = db.query(func.count(Certificate.id)).filter(Certificate.status == "active", Certificate.expires_at.isnot(None), Certificate.expires_at <= now + timedelta(days=30)).scalar() or 0
    total_cas = db.query(func.count(CertificateAuthority.id)).scalar() or 0

    # ── Audit feed ────────────────────────────────────────────────────────
    recent_audit = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(8).all()

    return {
        "auth": {
            "total_users": total_users,
            "active_users": active_users,
            "total_roles": total_roles,
            "total_permissions": total_permissions,
            "active_tokens": active_tokens,
        },
        "ipam": {
            "total_vlans": total_vlans,
            "total_subnets": total_subnets,
            "assigned_ips": assigned_ips,
            "total_ips": total_ips,
        },
        "inventory": {
            "total_hosts": total_hosts,
            "active_hosts": active_hosts,
            "unknown_hosts": unknown_hosts,
        },
        "dns": {
            "total_zones": total_zones,
            "forward_zones": forward_zones,
            "total_records": total_records,
        },
        "dhcp": {
            "total_servers": total_servers,
            "total_pools": total_pools,
            "active_leases": active_leases,
            "total_reservations": total_reservations,
        },
        "pki": {
            "total_cas": total_cas,
            "total_certs": total_certs,
            "active_certs": active_certs,
            "expiring_30d": expiring_30,
        },
        "audit": [
            {
                "id": log.id,
                "action": log.action,
                "resource": log.resource,
                "success": log.success,
                "created_at": log.created_at.isoformat(),
            }
            for log in recent_audit
        ],
    }
