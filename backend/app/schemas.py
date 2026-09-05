from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class TokenData(BaseModel):
    sub: str
    user_id: int


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=80)
    full_name: str | None = None
    password: str = Field(min_length=8)


class UserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    username: str
    full_name: str | None = None
    is_active: bool
    is_superuser: bool
    created_at: datetime


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    permissions: list[PermissionRead] = []


class RolePermissionUpdate(BaseModel):
    permission_ids: list[int]


class UserRoleUpdate(BaseModel):
    role_ids: list[int]


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    resource: str
    resource_id: str | None = None
    details: str | None = None
    source: str
    success: bool
    created_at: datetime
    user_id: int | None = None
    username: str | None = None


class SettingsUpdate(BaseModel):
    key: str
    value: str
    description: str | None = None


class SettingsGeneralUpdate(BaseModel):
    app_name: str = Field(min_length=1, max_length=80)
    app_description: str = Field(min_length=1, max_length=200)
    theme: str = Field(default="dark", max_length=20)


class SettingsGeneralRead(BaseModel):
    app_name: str
    app_description: str
    theme: str
    environment: str


class AppLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = None
    level: str
    logger: str
    message: str
    created_at: datetime


class CredentialStatusRead(BaseModel):
    id: str
    name: str
    provider: str
    category: str
    status: str
    summary: str
    href: str
    configured: bool
    planned: bool = False


class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    expires_days: int | None = Field(default=30, ge=1, le=3650)


class ApiTokenRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    prefix: str
    created_at: datetime
    expires_at: datetime | None = None
    last_used_at: datetime | None = None
    is_active: bool


class ApiTokenCreated(BaseModel):
    token: str
    name: str
    prefix: str
    expires_at: datetime | None = None


# ---------------------------------------------------------------------------
# Phase 2 – Network / IPAM
# ---------------------------------------------------------------------------

class VLanCreate(BaseModel):
    vid: int = Field(ge=1, le=4094)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    status: str = "active"


class VLanUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None


class VLanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vid: int
    name: str
    description: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class SubnetCreate(BaseModel):
    cidr: str = Field(min_length=7, max_length=50)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    gateway: str | None = None
    vlan_id: int | None = None
    status: str = "active"


class SubnetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    gateway: str | None = None
    vlan_id: int | None = None
    status: str | None = None


class SubnetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cidr: str
    name: str
    description: str | None = None
    gateway: str | None = None
    vlan_id: int | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class IPAddressCreate(BaseModel):
    address: str = Field(min_length=7, max_length=50)
    subnet_id: int | None = None
    hostname: str | None = None
    description: str | None = None
    status: str = "assigned"
    dns_name: str | None = None
    mac_address: str | None = None


class IPAddressUpdate(BaseModel):
    subnet_id: int | None = None
    hostname: str | None = None
    description: str | None = None
    status: str | None = None
    dns_name: str | None = None
    mac_address: str | None = None


class IPAddressRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    address: str
    subnet_id: int | None = None
    hostname: str | None = None
    description: str | None = None
    status: str
    dns_name: str | None = None
    mac_address: str | None = None
    last_seen_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SubnetUtilization(BaseModel):
    subnet_id: int
    cidr: str
    total: int
    used: int
    available: int
    percent_used: float


class ScanRequest(BaseModel):
    subnet_id: int


class DiscoveredNetwork(BaseModel):
    cidr: str
    interface: str


# ---------------------------------------------------------------------------
# Phase 3 – Infrastructure Inventory
# ---------------------------------------------------------------------------

class HostTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    color: str


class HostTagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(default="cyan", max_length=30)


class HostGroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None
    created_at: datetime


class HostGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None


class HostCreate(BaseModel):
    hostname: str = Field(min_length=1, max_length=255)
    fqdn: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    os: str | None = None
    role: str | None = None
    status: str = "active"
    description: str | None = None
    notes: str | None = None
    location: str | None = None
    subnet_id: int | None = None
    tag_ids: list[int] = []
    group_ids: list[int] = []


class HostUpdate(BaseModel):
    hostname: str | None = None
    fqdn: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    os: str | None = None
    role: str | None = None
    status: str | None = None
    description: str | None = None
    notes: str | None = None
    location: str | None = None
    subnet_id: int | None = None
    tag_ids: list[int] | None = None
    group_ids: list[int] | None = None


class HostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    hostname: str
    fqdn: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    os: str | None = None
    role: str | None = None
    status: str
    description: str | None = None
    notes: str | None = None
    location: str | None = None
    subnet_id: int | None = None
    last_seen_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    tags: list[HostTagRead] = []
    groups: list[HostGroupRead] = []


# ---------------------------------------------------------------------------
# Phase 4 – DNS Management
# ---------------------------------------------------------------------------

class DnsRecordCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    record_type: str = Field(min_length=1, max_length=10)
    value: str = Field(min_length=1)
    ttl: int | None = None
    priority: int | None = None
    comment: str | None = None


class DnsRecordUpdate(BaseModel):
    name: str | None = None
    record_type: str | None = None
    value: str | None = None
    ttl: int | None = None
    priority: int | None = None
    comment: str | None = None


class DnsRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    zone_id: int
    name: str
    record_type: str
    value: str
    ttl: int | None = None
    priority: int | None = None
    comment: str | None = None
    cloudflare_record_id: str | None = None
    created_at: datetime
    updated_at: datetime


class DnsZoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    kind: str = "forward"
    description: str | None = None
    default_ttl: int = 300
    status: str = "active"


class DnsZoneUpdate(BaseModel):
    description: str | None = None
    default_ttl: int | None = None
    status: str | None = None


class DnsZoneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    kind: str
    description: str | None = None
    default_ttl: int
    status: str
    cloud_account_id: int | None = None
    cloudflare_zone_id: str | None = None
    last_sync_at: datetime | None = None
    last_sync_direction: str | None = None
    last_sync_status: str | None = None
    last_sync_error: str | None = None
    created_at: datetime
    updated_at: datetime
    records: list[DnsRecordRead] = []


class DnsCloudAccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    api_token: str = Field(min_length=8, max_length=4096)

    @field_validator("api_token")
    @classmethod
    def _normalize_api_token(cls, value: str) -> str:
        from app.modules.cloudflare_dns import normalize_cloudflare_token

        token = normalize_cloudflare_token(value)
        if len(token) < 8:
            raise ValueError("Cloudflare API token is missing or too short")
        return token


class DnsCloudAccountUpdate(BaseModel):
    name: str | None = None
    api_token: str | None = Field(default=None, min_length=8, max_length=4096)

    @field_validator("api_token")
    @classmethod
    def _normalize_api_token(cls, value: str | None) -> str | None:
        if value is None:
            return None
        from app.modules.cloudflare_dns import normalize_cloudflare_token

        token = normalize_cloudflare_token(value)
        if not token:
            return None
        if len(token) < 8:
            raise ValueError("Cloudflare API token is missing or too short")
        return token


class DnsCloudAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    provider: str
    has_token: bool = False
    last_test_at: datetime | None = None
    last_test_status: str | None = None
    last_test_error: str | None = None
    created_at: datetime
    updated_at: datetime


class DnsCloudZoneRead(BaseModel):
    id: str
    name: str
    status: str
    imported: bool = False


class DnsCloudImportRequest(BaseModel):
    cloudflare_zone_id: str | None = None
    zone_name: str | None = None


class DnsCloudLinkRequest(BaseModel):
    account_id: int
    cloudflare_zone_id: str | None = None


class DnsSyncResult(BaseModel):
    direction: str
    created: int
    updated: int
    unchanged: int
    errors: list[str] = []
    message: str


# ---------------------------------------------------------------------------
# Phase 5 – DHCP
# ---------------------------------------------------------------------------

class DhcpLeaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pool_id: int | None = None
    ip_address: str
    mac_address: str
    hostname: str | None = None
    status: str
    lease_start: datetime | None = None
    lease_end: datetime | None = None
    last_seen_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DhcpLeaseCreate(BaseModel):
    ip_address: str
    mac_address: str
    hostname: str | None = None
    status: str = "active"
    lease_start: datetime | None = None
    lease_end: datetime | None = None


class DhcpReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pool_id: int
    ip_address: str
    mac_address: str
    hostname: str | None = None
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class DhcpReservationCreate(BaseModel):
    ip_address: str
    mac_address: str
    hostname: str | None = None
    description: str | None = None


class DhcpPoolRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    server_id: int
    subnet: str
    range_start: str
    range_end: str
    gateway: str | None = None
    dns_servers: str | None = None
    lease_time: int
    description: str | None = None
    created_at: datetime
    updated_at: datetime
    leases: list[DhcpLeaseRead] = []
    reservations: list[DhcpReservationRead] = []


class DhcpPoolCreate(BaseModel):
    subnet: str
    range_start: str
    range_end: str
    gateway: str | None = None
    dns_servers: str | None = None
    lease_time: int = 86400
    description: str | None = None


class DhcpPoolUpdate(BaseModel):
    gateway: str | None = None
    dns_servers: str | None = None
    lease_time: int | None = None
    description: str | None = None


class DhcpServerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    host: str
    description: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    pools: list[DhcpPoolRead] = []


class DhcpServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    host: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: str = "active"


class DhcpServerUpdate(BaseModel):
    name: str | None = None
    host: str | None = None
    description: str | None = None
    status: str | None = None


# ---------------------------------------------------------------------------
# Phase 9 – PKI
# ---------------------------------------------------------------------------

class CertificateAuthorityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    common_name: str = Field(min_length=1, max_length=255)
    subject: str | None = None
    is_root: bool = True
    status: str = "active"
    expires_at: datetime | None = None
    notes: str | None = None
    kind: str = "internal"
    acme_directory: str | None = None
    acme_email: str | None = None
    acme_tos_agreed: bool = False
    dns_provider: str = "manual"
    dns_api_token: str | None = None


class CertificateAuthorityUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    notes: str | None = None
    expires_at: datetime | None = None
    acme_email: str | None = None
    acme_tos_agreed: bool | None = None
    dns_provider: str | None = None
    dns_api_token: str | None = None


class CertificateAuthorityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    common_name: str
    subject: str | None = None
    is_root: bool
    status: str
    expires_at: datetime | None = None
    notes: str | None = None
    kind: str = "internal"
    acme_directory: str | None = None
    acme_email: str | None = None
    acme_tos_agreed: bool = False
    dns_provider: str = "manual"
    has_dns_credential: bool = False
    created_at: datetime
    updated_at: datetime


class CertificateCreate(BaseModel):
    common_name: str = Field(min_length=1, max_length=255)
    ca_id: int | None = None
    subject_alt_names: str | None = None
    cert_type: str = "server"
    status: str = "active"
    serial_number: str | None = None
    fingerprint: str | None = None
    issued_to: str | None = None
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    notes: str | None = None
    host_id: int | None = None


class CertificateUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    fingerprint: str | None = None
    host_id: int | None = None


class CertificateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ca_id: int | None = None
    common_name: str
    subject_alt_names: str | None = None
    cert_type: str
    status: str
    serial_number: str | None = None
    fingerprint: str | None = None
    issued_to: str | None = None
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    notes: str | None = None
    host_id: int | None = None
    has_private_key: bool = False
    has_certificate: bool = False
    acme_challenge_type: str | None = None
    acme_error: str | None = None
    acme_dns_records: list[dict] | None = None
    acme_http_urls: list[str] | None = None
    created_at: datetime
    updated_at: datetime


class AcmeIssueRequest(BaseModel):
    challenge_type: str | None = None


class AcmeIssueResponse(BaseModel):
    certificate: CertificateRead
    status: str
    message: str
    dns_records: list[dict] = []
    http_urls: list[str] = []


# ---------------------------------------------------------------------------
# Phase 10 – LDAP
# ---------------------------------------------------------------------------

class LdapServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    host: str = Field(min_length=1, max_length=255)
    port: int = 389
    use_ssl: bool = False
    use_tls: bool = False
    base_dn: str = Field(min_length=1, max_length=255)
    bind_dn: str | None = None
    bind_password: str | None = None
    user_search_base: str | None = None
    user_filter: str = "(objectClass=person)"
    user_attr_map: str = '{"username":"sAMAccountName","email":"mail","full_name":"cn"}'
    group_search_base: str | None = None
    status: str = "active"
    notes: str | None = None


class LdapServerUpdate(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    use_ssl: bool | None = None
    use_tls: bool | None = None
    base_dn: str | None = None
    bind_dn: str | None = None
    bind_password: str | None = None
    user_search_base: str | None = None
    user_filter: str | None = None
    user_attr_map: str | None = None
    group_search_base: str | None = None
    status: str | None = None
    notes: str | None = None


class LdapServerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    host: str
    port: int
    use_ssl: bool
    use_tls: bool
    base_dn: str
    bind_dn: str | None = None
    # bind_password intentionally excluded from read response
    user_search_base: str | None = None
    user_filter: str
    user_attr_map: str
    group_search_base: str | None = None
    status: str
    last_sync_at: datetime | None = None
    last_test_at: datetime | None = None
    last_test_status: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class LdapSyncLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    server_id: int
    status: str
    users_found: int
    users_created: int
    users_updated: int
    error_message: str | None = None
    started_at: datetime
    finished_at: datetime | None = None


class SmtpRelayCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: str = "custom"
    host: str | None = None
    port: int | None = None
    encryption: str | None = None
    username: str | None = None
    password: str | None = None
    from_address: str = Field(min_length=1, max_length=255)
    allowed_networks: str | None = None
    is_default: bool = False
    enabled: bool = True
    notes: str | None = None


class SmtpRelayUpdate(BaseModel):
    name: str | None = None
    provider: str | None = None
    host: str | None = None
    port: int | None = None
    encryption: str | None = None
    username: str | None = None
    password: str | None = None
    from_address: str | None = None
    allowed_networks: str | None = None
    is_default: bool | None = None
    enabled: bool | None = None
    notes: str | None = None


class SmtpRelayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    provider: str
    host: str
    port: int
    encryption: str
    username: str | None = None
    has_password: bool = False
    from_address: str
    allowed_networks: str
    is_default: bool
    enabled: bool
    last_test_at: datetime | None = None
    last_test_status: str | None = None
    last_test_error: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class SmtpSendRequest(BaseModel):
    to: str = Field(min_length=1)
    subject: str = "NexusOps test message"
    body: str = "This is a test message from the NexusOps SMTP relay."


class SmtpMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    relay_id: int | None = None
    direction: str
    sender: str
    recipients: str
    subject: str | None = None
    status: str
    error_message: str | None = None
    created_at: datetime


class SmtpStatusRead(BaseModel):
    listening: bool
    listen_host: str
    listen_port: int
    published_port: int | None = None
    default_relay: str | None = None
    default_smart_host: str | None = None
