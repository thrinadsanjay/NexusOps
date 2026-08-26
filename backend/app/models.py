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
