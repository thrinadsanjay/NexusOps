from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class SettingsUpdate(BaseModel):
    key: str
    value: str
    description: str | None = None


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
