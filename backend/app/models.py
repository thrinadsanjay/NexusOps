from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, relationship

from app.db import Base


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(80), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = Column(String(255), nullable=True)

    users: Mapped[list["User"]] = relationship("User", secondary="user_roles", back_populates="roles")
    permissions: Mapped[list["Permission"]] = relationship(
        "Permission",
        secondary="role_permissions",
        back_populates="roles",
    )


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(120), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = Column(String(255), nullable=True)

    roles: Mapped[list[Role]] = relationship("Role", secondary="role_permissions", back_populates="permissions")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    email: Mapped[str] = Column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = Column(String(80), unique=True, nullable=False, index=True)
    full_name: Mapped[str | None] = Column(String(255), nullable=True)
    password_hash: Mapped[str] = Column(String(255), nullable=False)
    is_active: Mapped[bool] = Column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = Column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    roles: Mapped[list[Role]] = relationship("Role", secondary="user_roles", back_populates="users")
    sessions: Mapped[list["UserSession"]] = relationship("UserSession", back_populates="user")
    api_tokens: Mapped[list["ApiToken"]] = relationship("ApiToken", back_populates="user")
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="user")


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[int] = Column(ForeignKey("users.id"), primary_key=True)
    role_id: Mapped[int] = Column(ForeignKey("roles.id"), primary_key=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = Column(ForeignKey("roles.id"), primary_key=True)
    permission_id: Mapped[int] = Column(ForeignKey("permissions.id"), primary_key=True)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = Column(ForeignKey("users.id"), nullable=False, index=True)
    session_token: Mapped[str] = Column(String(255), unique=True, nullable=False, index=True)
    user_agent: Mapped[str | None] = Column(String(255), nullable=True)
    ip_address: Mapped[str | None] = Column(String(128), nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime] = Column(DateTime, default=lambda: datetime.utcnow() + timedelta(days=1), nullable=False)
    revoked_at: Mapped[datetime | None] = Column(DateTime, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="sessions")


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = Column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = Column(String(120), nullable=False)
    token_hash: Mapped[str] = Column(String(255), unique=True, nullable=False, index=True)
    prefix: Mapped[str] = Column(String(20), default="nxo", nullable=False)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    last_used_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    is_active: Mapped[bool] = Column(Boolean, default=True, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="api_tokens")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = Column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = Column(String(120), nullable=False, index=True)
    resource: Mapped[str] = Column(String(120), nullable=False, index=True)
    resource_id: Mapped[str | None] = Column(String(120), nullable=True)
    details: Mapped[str | None] = Column(Text, nullable=True)
    source: Mapped[str] = Column(String(80), default="web", nullable=False)
    success: Mapped[bool] = Column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped[User | None] = relationship("User", back_populates="audit_logs")


class AppSetting(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    key: Mapped[str] = Column(String(120), unique=True, nullable=False, index=True)
    value: Mapped[str] = Column(Text, nullable=False)
    description: Mapped[str | None] = Column(String(255), nullable=True)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AppLog(Base):
    __tablename__ = "app_logs"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    level: Mapped[str] = Column(String(20), nullable=False, index=True)
    logger: Mapped[str] = Column(String(120), nullable=False, index=True)
    message: Mapped[str] = Column(Text, nullable=False)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


# ---------------------------------------------------------------------------
# Phase 2 – Network / IPAM
# ---------------------------------------------------------------------------

class VLan(Base):
    __tablename__ = "vlans"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    vid: Mapped[int] = Column(Integer, unique=True, nullable=False, index=True)  # 802.1Q VLAN ID 1-4094
    name: Mapped[str] = Column(String(120), nullable=False)
    description: Mapped[str | None] = Column(String(255), nullable=True)
    status: Mapped[str] = Column(String(40), default="active", nullable=False)   # active | reserved | deprecated
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    subnets: Mapped[list["Subnet"]] = relationship("Subnet", back_populates="vlan")


class Subnet(Base):
    __tablename__ = "subnets"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    cidr: Mapped[str] = Column(String(50), unique=True, nullable=False, index=True)   # e.g. 192.168.10.0/24
    name: Mapped[str] = Column(String(120), nullable=False)
    description: Mapped[str | None] = Column(String(255), nullable=True)
    gateway: Mapped[str | None] = Column(String(50), nullable=True)
    vlan_id: Mapped[int | None] = Column(ForeignKey("vlans.id"), nullable=True, index=True)
    status: Mapped[str] = Column(String(40), default="active", nullable=False)        # active | reserved | deprecated
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    vlan: Mapped[VLan | None] = relationship("VLan", back_populates="subnets")
    ip_addresses: Mapped[list["IPAddress"]] = relationship("IPAddress", back_populates="subnet")


class IPAddress(Base):
    __tablename__ = "ip_addresses"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    address: Mapped[str] = Column(String(50), unique=True, nullable=False, index=True)
    subnet_id: Mapped[int | None] = Column(ForeignKey("subnets.id"), nullable=True, index=True)
    hostname: Mapped[str | None] = Column(String(255), nullable=True)
    description: Mapped[str | None] = Column(String(255), nullable=True)
    status: Mapped[str] = Column(String(40), default="available", nullable=False)  # available | assigned | reserved | deprecated
    dns_name: Mapped[str | None] = Column(String(255), nullable=True)
    mac_address: Mapped[str | None] = Column(String(20), nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    subnet: Mapped[Subnet | None] = relationship("Subnet", back_populates="ip_addresses")
    last_seen_at: Mapped[datetime | None] = Column(DateTime, nullable=True)


# ---------------------------------------------------------------------------
# Phase 3 – Infrastructure Inventory
# ---------------------------------------------------------------------------

# Association table: many hosts ↔ many groups
host_groups_assoc = Table(
    "host_group_members",
    Base.metadata,
    Column("host_id", ForeignKey("hosts.id"), primary_key=True),
    Column("group_id", ForeignKey("host_groups.id"), primary_key=True),
)

# Association table: many hosts ↔ many tags
host_tags_assoc = Table(
    "host_tag_members",
    Base.metadata,
    Column("host_id", ForeignKey("hosts.id"), primary_key=True),
    Column("tag_id", ForeignKey("host_tags.id"), primary_key=True),
)


class HostGroup(Base):
    __tablename__ = "host_groups"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(120), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = Column(String(255), nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)

    hosts: Mapped[list["Host"]] = relationship("Host", secondary=host_groups_assoc, back_populates="groups")


class HostTag(Base):
    __tablename__ = "host_tags"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(80), unique=True, nullable=False, index=True)
    color: Mapped[str] = Column(String(30), default="cyan", nullable=False)  # CSS color name / hex

    hosts: Mapped[list["Host"]] = relationship("Host", secondary=host_tags_assoc, back_populates="tags")


class Host(Base):
    __tablename__ = "hosts"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    hostname: Mapped[str] = Column(String(255), nullable=False, index=True)
    fqdn: Mapped[str | None] = Column(String(255), nullable=True, index=True)
    ip_address: Mapped[str | None] = Column(String(50), nullable=True, index=True)  # primary management IP
    mac_address: Mapped[str | None] = Column(String(20), nullable=True)
    os: Mapped[str | None] = Column(String(120), nullable=True)                     # e.g. Ubuntu 24.04, Windows 11
    role: Mapped[str | None] = Column(String(120), nullable=True)                   # e.g. router, server, workstation, printer
    status: Mapped[str] = Column(String(40), default="active", nullable=False)      # active | inactive | decommissioned | unknown
    description: Mapped[str | None] = Column(Text, nullable=True)
    notes: Mapped[str | None] = Column(Text, nullable=True)
    location: Mapped[str | None] = Column(String(255), nullable=True)               # rack, room, site label
    # optional link to IPAM subnet
    subnet_id: Mapped[int | None] = Column(ForeignKey("subnets.id"), nullable=True, index=True)
    last_seen_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    groups: Mapped[list[HostGroup]] = relationship("HostGroup", secondary=host_groups_assoc, back_populates="hosts")
    tags: Mapped[list[HostTag]] = relationship("HostTag", secondary=host_tags_assoc, back_populates="hosts")


# ---------------------------------------------------------------------------
# Phase 4 – DNS Management
# ---------------------------------------------------------------------------

class DnsCloudAccount(Base):
    __tablename__ = "dns_cloud_accounts"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(120), nullable=False)
    provider: Mapped[str] = Column(String(40), default="cloudflare", nullable=False)
    token_encrypted: Mapped[str] = Column(Text, nullable=False)
    last_test_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    last_test_status: Mapped[str | None] = Column(String(40), nullable=True)
    last_test_error: Mapped[str | None] = Column(Text, nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    zones: Mapped[list["DnsZone"]] = relationship("DnsZone", back_populates="cloud_account")


class DnsZone(Base):
    __tablename__ = "dns_zones"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(255), unique=True, nullable=False, index=True)  # e.g. homelab.local
    kind: Mapped[str] = Column(String(20), default="forward", nullable=False)         # forward | reverse
    description: Mapped[str | None] = Column(String(255), nullable=True)
    default_ttl: Mapped[int] = Column(Integer, default=300, nullable=False)
    status: Mapped[str] = Column(String(40), default="active", nullable=False)
    cloud_account_id: Mapped[int | None] = Column(ForeignKey("dns_cloud_accounts.id"), nullable=True, index=True)
    cloudflare_zone_id: Mapped[str | None] = Column(String(64), nullable=True)
    last_sync_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    last_sync_direction: Mapped[str | None] = Column(String(20), nullable=True)
    last_sync_status: Mapped[str | None] = Column(String(40), nullable=True)
    last_sync_error: Mapped[str | None] = Column(Text, nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    records: Mapped[list["DnsRecord"]] = relationship("DnsRecord", back_populates="zone", cascade="all, delete-orphan")
    cloud_account: Mapped["DnsCloudAccount | None"] = relationship("DnsCloudAccount", back_populates="zones")


class DnsRecord(Base):
    __tablename__ = "dns_records"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    zone_id: Mapped[int] = Column(ForeignKey("dns_zones.id"), nullable=False, index=True)
    name: Mapped[str] = Column(String(255), nullable=False, index=True)   # relative or @ for apex
    record_type: Mapped[str] = Column(String(10), nullable=False, index=True)  # A AAAA CNAME MX TXT PTR NS SRV
    value: Mapped[str] = Column(Text, nullable=False)
    ttl: Mapped[int | None] = Column(Integer, nullable=True)               # None → use zone default
    priority: Mapped[int | None] = Column(Integer, nullable=True)          # MX / SRV priority
    comment: Mapped[str | None] = Column(String(255), nullable=True)
    cloudflare_record_id: Mapped[str | None] = Column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    zone: Mapped[DnsZone] = relationship("DnsZone", back_populates="records")


# ---------------------------------------------------------------------------
# Phase 5 – DHCP
# ---------------------------------------------------------------------------

class DhcpServer(Base):
    __tablename__ = "dhcp_servers"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(120), nullable=False)
    host: Mapped[str] = Column(String(255), nullable=False)          # IP or hostname of the DHCP server/router
    description: Mapped[str | None] = Column(String(255), nullable=True)
    status: Mapped[str] = Column(String(40), default="active", nullable=False)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    pools: Mapped[list["DhcpPool"]] = relationship("DhcpPool", back_populates="server", cascade="all, delete-orphan")


class DhcpPool(Base):
    __tablename__ = "dhcp_pools"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = Column(ForeignKey("dhcp_servers.id"), nullable=False, index=True)
    subnet: Mapped[str] = Column(String(50), nullable=False)          # e.g. 192.168.1.0/24
    range_start: Mapped[str] = Column(String(50), nullable=False)
    range_end: Mapped[str] = Column(String(50), nullable=False)
    gateway: Mapped[str | None] = Column(String(50), nullable=True)
    dns_servers: Mapped[str | None] = Column(String(255), nullable=True)   # comma-separated IPs
    lease_time: Mapped[int] = Column(Integer, default=86400, nullable=False)  # seconds
    description: Mapped[str | None] = Column(String(255), nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    server: Mapped[DhcpServer] = relationship("DhcpServer", back_populates="pools")
    leases: Mapped[list["DhcpLease"]] = relationship("DhcpLease", back_populates="pool", cascade="all, delete-orphan")
    reservations: Mapped[list["DhcpReservation"]] = relationship("DhcpReservation", back_populates="pool", cascade="all, delete-orphan")


class DhcpLease(Base):
    __tablename__ = "dhcp_leases"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    pool_id: Mapped[int | None] = Column(ForeignKey("dhcp_pools.id"), nullable=True, index=True)
    ip_address: Mapped[str] = Column(String(50), nullable=False, index=True)
    mac_address: Mapped[str] = Column(String(20), nullable=False, index=True)
    hostname: Mapped[str | None] = Column(String(255), nullable=True)
    status: Mapped[str] = Column(String(20), default="active", nullable=False)  # active | expired | released
    lease_start: Mapped[datetime | None] = Column(DateTime, nullable=True)
    lease_end: Mapped[datetime | None] = Column(DateTime, nullable=True)
    last_seen_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    pool: Mapped[DhcpPool | None] = relationship("DhcpPool", back_populates="leases")


class DhcpReservation(Base):
    __tablename__ = "dhcp_reservations"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    pool_id: Mapped[int] = Column(ForeignKey("dhcp_pools.id"), nullable=False, index=True)
    ip_address: Mapped[str] = Column(String(50), nullable=False, index=True)
    mac_address: Mapped[str] = Column(String(20), nullable=False, index=True)
    hostname: Mapped[str | None] = Column(String(255), nullable=True)
    description: Mapped[str | None] = Column(String(255), nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    pool: Mapped[DhcpPool] = relationship("DhcpPool", back_populates="reservations")


# ---------------------------------------------------------------------------
# Phase 9 – PKI (Certificate Management)
# ---------------------------------------------------------------------------

class CertificateAuthority(Base):
    __tablename__ = "certificate_authorities"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(120), nullable=False, index=True)
    common_name: Mapped[str] = Column(String(255), nullable=False)
    subject: Mapped[str | None] = Column(String(500), nullable=True)   # full subject DN
    is_root: Mapped[bool] = Column(Boolean, default=True, nullable=False)
    status: Mapped[str] = Column(String(40), default="active", nullable=False)
    expires_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    notes: Mapped[str | None] = Column(Text, nullable=True)
    # internal = metadata only; acme = Let's Encrypt (or other ACME) issuance
    kind: Mapped[str] = Column(String(40), default="internal", nullable=False)
    acme_directory: Mapped[str | None] = Column(String(40), nullable=True)  # letsencrypt | letsencrypt-staging
    acme_email: Mapped[str | None] = Column(String(255), nullable=True)
    acme_account_key_pem: Mapped[str | None] = Column(Text, nullable=True)
    acme_account_url: Mapped[str | None] = Column(String(500), nullable=True)
    acme_tos_agreed: Mapped[bool] = Column(Boolean, default=False, nullable=False)
    dns_provider: Mapped[str] = Column(String(40), default="manual", nullable=False)  # manual | internal | cloudflare
    dns_api_token: Mapped[str | None] = Column(Text, nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    certificates: Mapped[list["Certificate"]] = relationship("Certificate", back_populates="ca", cascade="all, delete-orphan")


class Certificate(Base):
    __tablename__ = "certificates"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    ca_id: Mapped[int | None] = Column(ForeignKey("certificate_authorities.id"), nullable=True, index=True)
    common_name: Mapped[str] = Column(String(255), nullable=False, index=True)
    subject_alt_names: Mapped[str | None] = Column(Text, nullable=True)   # comma-separated SANs
    cert_type: Mapped[str] = Column(String(40), default="server", nullable=False)  # server | client | wildcard | email
    status: Mapped[str] = Column(String(40), default="active", nullable=False)     # active | expired | revoked | pending
    serial_number: Mapped[str | None] = Column(String(120), nullable=True, index=True)
    fingerprint: Mapped[str | None] = Column(String(255), nullable=True)
    issued_to: Mapped[str | None] = Column(String(255), nullable=True)    # hostname, service, or person
    issued_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = Column(DateTime, nullable=True, index=True)
    revoked_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    notes: Mapped[str | None] = Column(Text, nullable=True)
    # link to inventory host
    host_id: Mapped[int | None] = Column(ForeignKey("hosts.id"), nullable=True, index=True)
    private_key_pem: Mapped[str | None] = Column(Text, nullable=True)
    certificate_pem: Mapped[str | None] = Column(Text, nullable=True)
    chain_pem: Mapped[str | None] = Column(Text, nullable=True)
    acme_order_url: Mapped[str | None] = Column(String(500), nullable=True)
    acme_challenge_type: Mapped[str | None] = Column(String(40), nullable=True)
    acme_error: Mapped[str | None] = Column(Text, nullable=True)
    acme_pending_json: Mapped[str | None] = Column(Text, nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    ca: Mapped[CertificateAuthority | None] = relationship("CertificateAuthority", back_populates="certificates")


class AcmeHttpChallenge(Base):
    __tablename__ = "acme_http_challenges"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    token: Mapped[str] = Column(String(255), unique=True, nullable=False, index=True)
    key_authorization: Mapped[str] = Column(String(500), nullable=False)
    certificate_id: Mapped[int | None] = Column(ForeignKey("certificates.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Phase 10 – LDAP Integration
# ---------------------------------------------------------------------------

class LdapServer(Base):
    __tablename__ = "ldap_servers"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(120), nullable=False, index=True)
    host: Mapped[str] = Column(String(255), nullable=False)
    port: Mapped[int] = Column(Integer, default=389, nullable=False)
    use_ssl: Mapped[bool] = Column(Boolean, default=False, nullable=False)
    use_tls: Mapped[bool] = Column(Boolean, default=False, nullable=False)
    base_dn: Mapped[str] = Column(String(255), nullable=False)           # e.g. dc=homelab,dc=local
    bind_dn: Mapped[str | None] = Column(String(255), nullable=True)     # service account DN
    bind_password: Mapped[str | None] = Column(String(255), nullable=True)  # stored in plaintext – use vault in prod
    user_search_base: Mapped[str | None] = Column(String(255), nullable=True)
    user_filter: Mapped[str] = Column(String(255), default="(objectClass=person)", nullable=False)
    user_attr_map: Mapped[str] = Column(Text, default='{"username":"sAMAccountName","email":"mail","full_name":"cn"}', nullable=False)  # JSON
    group_search_base: Mapped[str | None] = Column(String(255), nullable=True)
    status: Mapped[str] = Column(String(40), default="active", nullable=False)
    last_sync_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    last_test_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    last_test_status: Mapped[str | None] = Column(String(40), nullable=True)   # ok | error
    notes: Mapped[str | None] = Column(Text, nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    sync_logs: Mapped[list["LdapSyncLog"]] = relationship("LdapSyncLog", back_populates="server", cascade="all, delete-orphan")


class LdapSyncLog(Base):
    __tablename__ = "ldap_sync_logs"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = Column(ForeignKey("ldap_servers.id"), nullable=False, index=True)
    status: Mapped[str] = Column(String(40), default="running", nullable=False)   # running | success | error
    users_found: Mapped[int] = Column(Integer, default=0, nullable=False)
    users_created: Mapped[int] = Column(Integer, default=0, nullable=False)
    users_updated: Mapped[int] = Column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = Column(Text, nullable=True)
    started_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    finished_at: Mapped[datetime | None] = Column(DateTime, nullable=True)

    server: Mapped[LdapServer] = relationship("LdapServer", back_populates="sync_logs")


# ---------------------------------------------------------------------------
# SMTP relay
# ---------------------------------------------------------------------------

class SmtpRelay(Base):
    __tablename__ = "smtp_relays"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(120), nullable=False, index=True)
    provider: Mapped[str] = Column(String(40), default="custom", nullable=False)  # google | microsoft | custom
    host: Mapped[str] = Column(String(255), nullable=False)
    port: Mapped[int] = Column(Integer, default=587, nullable=False)
    encryption: Mapped[str] = Column(String(20), default="starttls", nullable=False)  # starttls | ssl | none
    username: Mapped[str | None] = Column(String(255), nullable=True)
    password: Mapped[str | None] = Column(String(500), nullable=True)
    from_address: Mapped[str] = Column(String(255), nullable=False)
    allowed_networks: Mapped[str] = Column(
        String(500),
        default="10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32",
        nullable=False,
    )
    is_default: Mapped[bool] = Column(Boolean, default=False, nullable=False)
    enabled: Mapped[bool] = Column(Boolean, default=True, nullable=False)
    last_test_at: Mapped[datetime | None] = Column(DateTime, nullable=True)
    last_test_status: Mapped[str | None] = Column(String(40), nullable=True)
    last_test_error: Mapped[str | None] = Column(Text, nullable=True)
    notes: Mapped[str | None] = Column(Text, nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    messages: Mapped[list["SmtpMessage"]] = relationship("SmtpMessage", back_populates="relay")


class SmtpMessage(Base):
    __tablename__ = "smtp_messages"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    relay_id: Mapped[int | None] = Column(ForeignKey("smtp_relays.id"), nullable=True, index=True)
    direction: Mapped[str] = Column(String(20), default="outbound", nullable=False)  # outbound | inbound
    sender: Mapped[str] = Column(String(255), nullable=False)
    recipients: Mapped[str] = Column(Text, nullable=False)
    subject: Mapped[str | None] = Column(String(500), nullable=True)
    status: Mapped[str] = Column(String(40), default="sent", nullable=False)  # sent | error | rejected
    error_message: Mapped[str | None] = Column(Text, nullable=True)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)

    relay: Mapped[SmtpRelay | None] = relationship("SmtpRelay", back_populates="messages")
