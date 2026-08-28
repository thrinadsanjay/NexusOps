"""Phase 7 – Dashboard stats aggregation API."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, user_permissions
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
    LdapServer,
    Permission,
    Role,
    Subnet,
    User,
    VLan,
)

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


def _allowed(user: User, permission: str) -> bool:
    return user.is_superuser or permission in user_permissions(user)


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    empty_auth = {
        "total_users": 0,
        "active_users": 0,
        "total_roles": 0,
        "total_permissions": 0,
        "active_tokens": 0,
    }
    empty_ipam = {"total_vlans": 0, "total_subnets": 0, "assigned_ips": 0, "total_ips": 0}
    empty_inventory = {"total_hosts": 0, "active_hosts": 0, "unknown_hosts": 0}
    empty_dns = {"total_zones": 0, "forward_zones": 0, "total_records": 0}
    empty_dhcp = {"total_servers": 0, "total_pools": 0, "active_leases": 0, "total_reservations": 0}
    empty_pki = {"total_cas": 0, "total_certs": 0, "active_certs": 0, "expiring_30d": 0}

    auth = empty_auth
    if _allowed(current_user, "users:read"):
        auth = {
            "total_users": db.query(func.count(User.id)).scalar() or 0,
            "active_users": db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0,
            "total_roles": db.query(func.count(Role.id)).scalar() or 0,
            "total_permissions": db.query(func.count(Permission.id)).scalar() or 0,
            "active_tokens": db.query(func.count(ApiToken.id)).filter(ApiToken.is_active.is_(True)).scalar() or 0,
        }

    ipam = empty_ipam
    if _allowed(current_user, "ipam:read"):
        ipam = {
            "total_vlans": db.query(func.count(VLan.id)).scalar() or 0,
            "total_subnets": db.query(func.count(Subnet.id)).scalar() or 0,
            "assigned_ips": db.query(func.count(IPAddress.id)).filter(IPAddress.status == "assigned").scalar() or 0,
            "total_ips": db.query(func.count(IPAddress.id)).scalar() or 0,
        }

    inventory = empty_inventory
    if _allowed(current_user, "inventory:read"):
        inventory = {
            "total_hosts": db.query(func.count(Host.id)).scalar() or 0,
            "active_hosts": db.query(func.count(Host.id)).filter(Host.status == "active").scalar() or 0,
            "unknown_hosts": db.query(func.count(Host.id)).filter(Host.status == "unknown").scalar() or 0,
        }

    dns = empty_dns
    if _allowed(current_user, "dns:read"):
        dns = {
            "total_zones": db.query(func.count(DnsZone.id)).scalar() or 0,
            "forward_zones": db.query(func.count(DnsZone.id)).filter(DnsZone.kind == "forward").scalar() or 0,
            "total_records": db.query(func.count(DnsRecord.id)).scalar() or 0,
        }

    dhcp = empty_dhcp
    if _allowed(current_user, "dhcp:read"):
        dhcp = {
            "total_servers": db.query(func.count(DhcpServer.id)).scalar() or 0,
            "total_pools": db.query(func.count(DhcpPool.id)).scalar() or 0,
            "active_leases": db.query(func.count(DhcpLease.id)).filter(DhcpLease.status == "active").scalar() or 0,
            "total_reservations": db.query(func.count(DhcpReservation.id)).scalar() or 0,
        }

    pki = empty_pki
    if _allowed(current_user, "pki:read"):
        now = datetime.utcnow()
        pki = {
            "total_cas": db.query(func.count(CertificateAuthority.id)).scalar() or 0,
            "total_certs": db.query(func.count(Certificate.id)).scalar() or 0,
            "active_certs": db.query(func.count(Certificate.id)).filter(Certificate.status == "active").scalar() or 0,
            "expiring_30d": db.query(func.count(Certificate.id))
            .filter(
                Certificate.status == "active",
                Certificate.expires_at.isnot(None),
                Certificate.expires_at <= now + timedelta(days=30),
            )
            .scalar()
            or 0,
        }

    ldap = {"total_servers": 0, "last_ok": 0}
    if _allowed(current_user, "ldap:read"):
        ldap = {
            "total_servers": db.query(func.count(LdapServer.id)).scalar() or 0,
            "last_ok": db.query(func.count(LdapServer.id)).filter(LdapServer.last_test_status == "ok").scalar() or 0,
        }

    database = "ok"
    try:
        db.query(func.count(User.id)).scalar()
    except Exception:
        database = "error"

    audit: list[dict] = []
    if _allowed(current_user, "audit:read"):
        recent_audit = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(8).all()
        audit = [
            {
                "id": log.id,
                "action": log.action,
                "resource": log.resource,
                "success": log.success,
                "created_at": log.created_at.isoformat(),
            }
            for log in recent_audit
        ]

    return {
        "auth": auth,
        "ipam": ipam,
        "inventory": inventory,
        "dns": dns,
        "dhcp": dhcp,
        "pki": pki,
        "ldap": ldap,
        "health": {"api": "ok", "database": database},
        "audit": audit,
    }
