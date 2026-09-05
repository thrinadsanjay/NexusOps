from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import AppSetting, Permission, Role, User, UserRole


def ensure_default_roles_and_permissions(db: Session) -> None:
    default_permissions = {
        "users:read": "Read users",
        "users:write": "Create or update users",
        "roles:read": "Read role metadata",
        "settings:read": "View platform settings",
        "settings:write": "Update platform settings",
        "audit:read": "Read audit logs",
        "logs:read": "Read application and system logs",
        "tokens:write": "Create and manage API tokens",
        "ipam:read": "Read IPAM data (VLANs, subnets, IPs)",
        "ipam:write": "Create and manage IPAM data",
        "inventory:read": "Read inventory hosts, groups, tags",
        "inventory:write": "Create and manage inventory records",
        "dns:read": "Read DNS zones and records",
        "dns:write": "Create and manage DNS zones and records",
        "dhcp:read": "Read DHCP servers, pools, and leases",
        "dhcp:write": "Create and manage DHCP configuration and leases",
        "pki:read": "Read certificate authorities and certificates",
        "pki:write": "Create and manage certificates and CAs",
        "ldap:read": "Read LDAP server configurations and sync logs",
        "ldap:write": "Manage LDAP servers and trigger directory syncs",
        "smtp:read": "Read SMTP relays and message log",
        "smtp:write": "Manage SMTP relays and send mail",
    }

    for permission_name, description in default_permissions.items():
        if not db.query(Permission).filter(Permission.name == permission_name).first():
            db.add(Permission(name=permission_name, description=description))

    db.commit()

    default_roles = {
        "admin": [
            "users:read",
            "users:write",
            "roles:read",
            "settings:read",
            "settings:write",
            "audit:read",
            "logs:read",
            "tokens:write",
            "ipam:read",
            "ipam:write",
            "inventory:read",
            "inventory:write",
            "dns:read",
            "dns:write",
            "dhcp:read",
            "dhcp:write",
            "pki:read",
            "pki:write",
            "ldap:read",
            "ldap:write",
            "smtp:read",
            "smtp:write",
        ],
        "operator": ["users:read", "settings:read", "audit:read", "logs:read", "ipam:read", "ipam:write", "inventory:read", "inventory:write", "dns:read", "dns:write", "dhcp:read", "dhcp:write", "pki:read", "pki:write", "ldap:read", "ldap:write", "smtp:read", "smtp:write"],
        "viewer": ["users:read", "settings:read", "ipam:read", "inventory:read", "dns:read", "dhcp:read", "pki:read", "ldap:read", "smtp:read"],
    }

    for role_name, permission_names in default_roles.items():
        role = db.query(Role).filter(Role.name == role_name).first()
        if role is None:
            role = Role(name=role_name, description=f"{role_name.title()} role")
            db.add(role)
            db.flush()

        permissions = db.query(Permission).filter(Permission.name.in_(permission_names)).all()
        role.permissions = permissions

    db.commit()


def ensure_admin_user(db: Session) -> None:
    ensure_default_roles_and_permissions(db)

    admin = db.query(User).filter(User.email == settings.default_admin_email).first()
    if admin is None:
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        admin = User(
            email=settings.default_admin_email,
            username=settings.default_admin_username,
            full_name="Local Administrator",
            password_hash=hash_password(settings.default_admin_password),
            is_active=True,
            is_superuser=True,
        )
        db.add(admin)
        db.flush()

        if admin_role:
            db.add(UserRole(user_id=admin.id, role_id=admin_role.id))

        db.add(
            AppSetting(
                key="brand_name",
                value="NexusOps",
                description="Application branding",
            )
        )
        db.commit()


def ensure_system_settings(db: Session) -> None:
    defaults = {
        "app_name": "NexusOps",
        "app_description": "Infrastructure Operations Platform",
        "theme": "dark",
    }

    for key, value in defaults.items():
        if not db.query(AppSetting).filter(AppSetting.key == key).first():
            db.add(AppSetting(key=key, value=value, description="System setting"))
    db.commit()


def ensure_bundled_ldap_server(db: Session) -> None:
    """Seed a config entry for the bundled OpenLDAP container if it doesn't exist."""
    try:
        from app.models import LdapServer
        if db.query(LdapServer).filter(LdapServer.name == "NexusOps Bundled LDAP").first():
            return
        db.add(LdapServer(
            name="NexusOps Bundled LDAP",
            host="openldap",
            port=389,
            use_ssl=False,
            use_tls=False,
            base_dn=settings.ldap_base_dn,
            bind_dn=f"cn=admin,{settings.ldap_base_dn}",
            bind_password=settings.ldap_admin_password,
            user_search_base=f"ou=users,{settings.ldap_base_dn}",
            user_filter="(objectClass=inetOrgPerson)",
            user_attr_map='{"username":"uid","email":"mail","full_name":"cn"}',
            status="active",
            notes="Auto-seeded bundled OpenLDAP container",
        ))
        db.commit()
    except Exception:  # pragma: no cover – LDAP table may not exist on older migrations
        db.rollback()
