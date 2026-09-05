"""Phase 7 – Dashboard stats aggregation API."""

from __future__ import annotations

from datetime import datetime, timedelta

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
    HostGroup,
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
    available_ips = db.query(func.count(IPAddress.id)).filter(IPAddress.status == "available").scalar() or 0
    reserved_ips = db.query(func.count(IPAddress.id)).filter(IPAddress.status == "reserved").scalar() or 0
    total_ips = db.query(func.count(IPAddress.id)).scalar() or 0
    other_ips = max(int(total_ips) - int(assigned_ips) - int(available_ips) - int(reserved_ips), 0)

    # ── Inventory ─────────────────────────────────────────────────────────
    total_hosts = db.query(func.count(Host.id)).scalar() or 0
    active_hosts = db.query(func.count(Host.id)).filter(Host.status == "active").scalar() or 0
    unknown_hosts = db.query(func.count(Host.id)).filter(Host.status == "unknown").scalar() or 0
    total_groups = db.query(func.count(HostGroup.id)).scalar() or 0
    month_ago = datetime.utcnow() - timedelta(days=30)
    hosts_30d = db.query(func.count(Host.id)).filter(Host.created_at >= month_ago).scalar() or 0

    # ── DNS ───────────────────────────────────────────────────────────────
    total_zones = db.query(func.count(DnsZone.id)).scalar() or 0
    forward_zones = db.query(func.count(DnsZone.id)).filter(DnsZone.kind == "forward").scalar() or 0
    total_records = db.query(func.count(DnsRecord.id)).scalar() or 0
    zone_rows = []
    for zone in db.query(DnsZone).order_by(DnsZone.name).limit(6).all():
        zone_rows.append(
            {
                "id": zone.id,
                "name": zone.name,
                "kind": zone.kind,
                "status": zone.status,
                "records": db.query(func.count(DnsRecord.id)).filter(DnsRecord.zone_id == zone.id).scalar() or 0,
            }
        )

    # ── DHCP ──────────────────────────────────────────────────────────────
    total_servers = db.query(func.count(DhcpServer.id)).scalar() or 0
    total_pools = db.query(func.count(DhcpPool.id)).scalar() or 0
    active_leases = db.query(func.count(DhcpLease.id)).filter(DhcpLease.status == "active").scalar() or 0
    total_reservations = db.query(func.count(DhcpReservation.id)).scalar() or 0

    # ── PKI ───────────────────────────────────────────────────────────────
    total_certs = db.query(func.count(Certificate.id)).scalar() or 0
    active_certs = db.query(func.count(Certificate.id)).filter(Certificate.status == "active").scalar() or 0
    now = datetime.utcnow()
    expiring_30 = db.query(func.count(Certificate.id)).filter(Certificate.status == "active", Certificate.expires_at.isnot(None), Certificate.expires_at <= now + timedelta(days=30)).scalar() or 0
    expired_certs = db.query(func.count(Certificate.id)).filter(Certificate.status == "expired").scalar() or 0
    total_cas = db.query(func.count(CertificateAuthority.id)).scalar() or 0

    # ── Audit feed ────────────────────────────────────────────────────────
    recent_audit = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(8).all()
    failed_audit = db.query(func.count(AuditLog.id)).filter(AuditLog.success.is_(False)).scalar() or 0

    from app.models import DnsCloudAccount, SmtpRelay
    from app.modules.smtp_listen import listener_running

    smtp_relays = db.query(func.count(SmtpRelay.id)).filter(SmtpRelay.enabled.is_(True)).scalar() or 0
    cf_accounts = db.query(func.count(DnsCloudAccount.id)).scalar() or 0

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
            "available_ips": available_ips,
            "reserved_ips": reserved_ips,
            "other_ips": other_ips,
            "total_ips": total_ips,
        },
        "inventory": {
            "total_hosts": total_hosts,
            "active_hosts": active_hosts,
            "unknown_hosts": unknown_hosts,
            "total_groups": total_groups,
            "hosts_30d": hosts_30d,
        },
        "dns": {
            "total_zones": total_zones,
            "forward_zones": forward_zones,
            "total_records": total_records,
            "zones": zone_rows,
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
            "expired": expired_certs,
        },
        "smtp": {
            "listening": listener_running(),
            "relays": smtp_relays,
        },
        "cloudflare": {
            "accounts": cf_accounts,
        },
        "attention": {
            "expiring_certs": expiring_30,
            "failed_audit": failed_audit,
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
