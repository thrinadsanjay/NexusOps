from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.bootstrap import ensure_admin_user
from app.core.dependencies import get_current_user, require_permission
from app.core.security import create_access_token, hash_password, verify_password
from app.db import get_db
from app.models import ApiToken, AppSetting, AuditLog, Permission, Role, User, UserSession
from app.schemas import (
    ApiTokenCreate,
    ApiTokenRead,
    AuditLogRead,
    AuthToken,
    LoginRequest,
    PermissionRead,
    RolePermissionUpdate,
    RoleRead,
    SettingsUpdate,
    UserCreate,
    UserRead,
    UserRoleUpdate,
    UserUpdate,
)

router = APIRouter(prefix="/api/v1")


def _try_ldap_auth(username: str, password: str, db: Session) -> bool:
    """Attempt LDAP bind for the given credentials against all active LDAP servers."""
    try:
        from ldap3 import ANONYMOUS, Connection, Server, SIMPLE  # type: ignore[import-untyped]
        from app.models import LdapServer
        servers = db.query(LdapServer).filter(LdapServer.status == "active").all()
        for ldap_srv in servers:
            try:
                srv = Server(ldap_srv.host, port=ldap_srv.port, use_ssl=ldap_srv.use_ssl, connect_timeout=3)
                search_base = ldap_srv.user_search_base or ldap_srv.base_dn
                for dn_tmpl in [f"uid={username},{search_base}", f"cn={username},{search_base}"]:
                    conn = Connection(srv, user=dn_tmpl, password=password, authentication=SIMPLE, receive_timeout=5)
                    if conn.bind():
                        conn.unbind()
                        return True
            except Exception:
                continue
    except Exception:
        pass
    return False


def _provision_ldap_user(username: str, db: Session) -> User | None:
    """Create a minimal NexusOps User record for an LDAP-authenticated user."""
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            return existing
        new_user = User(
            username=username,
            email=f"{username}@ldap.homelab.local",
            full_name=username,
            password_hash=hash_password(f"__ldap__{username}"),  # non-usable local password
            is_active=True,
            is_superuser=False,
        )
        db.add(new_user)
        db.flush()
        return new_user
    except Exception:
        return None


@router.on_event("startup")
def startup() -> None:
    db = next(get_db())
    ensure_admin_user(db)


@router.post("/auth/login", response_model=AuthToken)
def login(payload: LoginRequest, db: Session = Depends(get_db), response: Response = None) -> AuthToken:
    user = db.query(User).filter((User.username == payload.username) | (User.email == payload.username)).first()
    authenticated = user and verify_password(payload.password, user.password_hash)

    if not authenticated:
        # LDAP fallback – try every active LDAP server
        authenticated = _try_ldap_auth(payload.username, payload.password, db)
        if authenticated and not user:
            # Auto-provision user from LDAP on first login
            user = _provision_ldap_user(payload.username, db)
        elif not authenticated:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = create_access_token(str(user.id), user.id)
    session_token = secrets.token_urlsafe(32)
    db.add(
        UserSession(
            user_id=user.id,
            session_token=session_token,
            user_agent="unknown",
            ip_address="unknown",
            expires_at=datetime.utcnow() + timedelta(days=1),
        )
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="USER_LOGIN",
            resource="auth",
            resource_id=str(user.id),
            details="User signed in via local authentication",
            source="web",
            success=True,
        )
    )
    db.commit()

    if response is not None:
        response.set_cookie(key="nexusops_token", value=token, httponly=True, samesite="lax")

    return AuthToken(
        access_token=token,
        user=UserRead.model_validate(user),
    )


@router.post("/auth/logout")
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, str]:
    db.query(UserSession).filter(UserSession.user_id == current_user.id).delete()
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="USER_LOGOUT",
            resource="auth",
            resource_id=str(current_user.id),
            details="User signed out",
            source="web",
            success=True,
        )
    )
    db.commit()
    return {"status": "ok", "message": "Logged out"}


@router.get("/auth/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/users", response_model=UserRead)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users:write")),
) -> User:
    if db.query(User).filter((User.email == payload.email) | (User.username == payload.username)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")

    user = User(
        email=payload.email,
        username=payload.username,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="USER_CREATE",
            resource="users",
            resource_id=str(user.id),
            details=f"Created user {user.username}",
            source="web",
            success=True,
        )
    )
    db.commit()
    return user


@router.get("/users", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users:read")),
) -> list[User]:
    _ = current_user
    return db.query(User).order_by(User.created_at.desc()).all()


@router.get("/permissions", response_model=list[PermissionRead])
def list_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles:read")),
) -> list[Permission]:
    _ = current_user
    return db.query(Permission).order_by(Permission.name).all()


@router.get("/roles", response_model=list[RoleRead])
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles:read")),
) -> list[Role]:
    _ = current_user
    return db.query(Role).all()


@router.get("/users/{user_id}/roles", response_model=list[RoleRead])
def list_user_roles(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users:read")),
) -> list[Role]:
    _ = current_user
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.roles


@router.put("/users/{user_id}/roles", response_model=list[RoleRead])
def assign_user_roles(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users:write")),
) -> list[Role]:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    roles = db.query(Role).filter(Role.id.in_(payload.role_ids)).all()
    user.roles = roles
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="USER_ROLE_UPDATE",
            resource="users",
            resource_id=str(user_id),
            details=f"Assigned {len(roles)} roles",
            source="web",
            success=True,
        )
    )
    db.commit()
    db.refresh(user)
    return user.roles


@router.put("/roles/{role_id}/permissions", response_model=RoleRead)
def assign_role_permissions(
    role_id: int,
    payload: RolePermissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles:read")),
) -> Role:
    _ = current_user
    role = db.query(Role).filter(Role.id == role_id).first()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    permissions = db.query(Permission).filter(Permission.id.in_(payload.permission_ids)).all()
    role.permissions = permissions
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="ROLE_PERMISSIONS_UPDATE",
            resource="roles",
            resource_id=str(role_id),
            details=f"Assigned {len(permissions)} permissions",
            source="web",
            success=True,
        )
    )
    db.commit()
    db.refresh(role)
    return role


@router.get("/audit", response_model=list[AuditLogRead])
def list_audit(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("audit:read")),
) -> list[AuditLog]:
    _ = current_user
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(50).all()


@router.get("/settings")
def list_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("settings:read")),
) -> dict[str, str]:
    _ = current_user
    settings = db.query(AppSetting).all()
    return {item.key: item.value for item in settings}


@router.put("/settings")
def save_setting(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("settings:write")),
) -> dict[str, str]:
    _ = current_user
    setting = db.query(AppSetting).filter(AppSetting.key == payload.key).first()
    if setting is None:
        setting = AppSetting(key=payload.key, value=payload.value, description=payload.description)
        db.add(setting)
    else:
        setting.value = payload.value
        setting.description = payload.description

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="SETTINGS_UPDATE",
            resource="settings",
            resource_id=payload.key,
            details=f"Updated {payload.key}",
            source="web",
            success=True,
        )
    )
    db.commit()
    return {"status": "ok", "key": payload.key, "value": payload.value}


@router.post("/api-tokens", response_model=ApiTokenRead)
def create_api_token(
    payload: ApiTokenCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("tokens:write")),
) -> dict[str, object]:
    raw_token = f"nxo_{secrets.token_urlsafe(24)}"
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(days=payload.expires_days) if payload.expires_days else None
    token = ApiToken(
        user_id=current_user.id,
        name=payload.name,
        token_hash=token_hash,
        prefix="nxo",
        expires_at=expires_at,
    )
    db.add(token)
    db.commit()
    return {"token": raw_token, "name": token.name, "prefix": token.prefix, "expires_at": token.expires_at}


@router.get("/api-tokens", response_model=list[ApiTokenRead])
def list_api_tokens(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("tokens:write")),
) -> list[ApiToken]:
    _ = current_user
    return db.query(ApiToken).filter(ApiToken.user_id == current_user.id).all()


@router.post("/auth/change-password")
def change_password(
    new_password: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    if len(new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")

    current_user.password_hash = hash_password(new_password)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="PASSWORD_CHANGE",
            resource="users",
            resource_id=str(current_user.id),
            details="Password changed successfully",
            source="web",
            success=True,
        )
    )
    db.commit()
    return {"status": "ok", "message": "Password updated"}
