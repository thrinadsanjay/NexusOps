from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import COOKIE_NAME, get_current_user, require_permission
from app.core.ldap_utils import apply_ldap_groups_to_user, assign_role_to_user, connect_ldap
from app.core.rate_limit import login_limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.db import get_db
from app.models import ApiToken, AppSetting, AuditLog, Permission, Role, User, UserSession
from app.schemas import (
    ApiTokenCreate,
    ApiTokenCreated,
    ApiTokenRead,
    AuditLogRead,
    AuthToken,
    ChangePasswordRequest,
    LoginRequest,
    PermissionRead,
    RolePermissionUpdate,
    RoleRead,
    SettingsUpdate,
    UserCreate,
    UserRead,
    UserRoleUpdate,
)

router = APIRouter(prefix="/api/v1")


def _client_key(request: Request, username: str) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    return f"{ip}:{username.lower()}"


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
        max_age=settings.access_token_expire_minutes * 60,
    )


def _try_ldap_auth(username: str, password: str, db: Session) -> tuple[bool, object | None, str | None]:
    """Return (ok, ldap_server, user_dn) for the first successful bind."""
    try:
        from app.models import LdapServer

        servers = db.query(LdapServer).filter(LdapServer.status == "active").all()
        for ldap_srv in servers:
            search_base = ldap_srv.user_search_base or ldap_srv.base_dn
            for dn_tmpl in [f"uid={username},{search_base}", f"cn={username},{search_base}"]:
                try:
                    conn = connect_ldap(ldap_srv, bind_dn=dn_tmpl, password=password)
                    conn.unbind()
                    return True, ldap_srv, dn_tmpl
                except Exception:
                    continue
    except Exception:
        pass
    return False, None, None


def _provision_ldap_user(username: str, db: Session) -> User | None:
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        return existing
    new_user = User(
        username=username,
        email=f"{username}@ldap.homelab.local",
        full_name=username,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        is_active=True,
        is_superuser=False,
    )
    db.add(new_user)
    db.flush()
    return new_user


@router.post("/auth/login", response_model=AuthToken)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> AuthToken:
    key = _client_key(request, payload.username)
    login_limiter.check(key)

    user = db.query(User).filter((User.username == payload.username) | (User.email == payload.username)).first()
    authenticated = bool(user and verify_password(payload.password, user.password_hash))
    auth_source = "local"
    ldap_server = None
    user_dn = None

    if not authenticated:
        authenticated, ldap_server, user_dn = _try_ldap_auth(payload.username, payload.password, db)
        if authenticated:
            auth_source = "ldap"
            if not user:
                user = _provision_ldap_user(payload.username, db)
        else:
            login_limiter.record_failure(key)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    if not user:
        login_limiter.record_failure(key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    if auth_source == "ldap" and ldap_server is not None and user_dn:
        try:
            conn = connect_ldap(ldap_server, bind_dn=user_dn, password=payload.password)
            apply_ldap_groups_to_user(db, user, ldap_server, user_dn, conn)
            conn.unbind()
        except Exception:
            if not user.roles:
                assign_role_to_user(db, user, "viewer")

    jti = str(uuid.uuid4())
    token = create_access_token(str(user.id), user.id, jti=jti)
    db.add(
        UserSession(
            user_id=user.id,
            session_token=jti,
            user_agent=(request.headers.get("user-agent") or "unknown")[:255],
            ip_address=(request.client.host if request.client else "unknown"),
            expires_at=datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes),
        )
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="USER_LOGIN",
            resource="auth",
            resource_id=str(user.id),
            details=f"User signed in via {auth_source} authentication",
            source=auth_source,
            success=True,
        )
    )
    db.commit()
    login_limiter.reset(key)
    _set_session_cookie(response, token)
    from sqlalchemy.orm import joinedload

    user = (
        db.query(User)
        .options(joinedload(User.roles).joinedload(Role.permissions))
        .filter(User.id == user.id)
        .first()
    )
    return AuthToken(access_token=token, user=UserRead.from_user(user))


@router.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    raw_token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        raw_token = auth_header.split(" ", 1)[1].strip()
    if not raw_token:
        raw_token = request.cookies.get(COOKIE_NAME)

    jti = None
    if raw_token and not raw_token.startswith("nxo_"):
        try:
            from app.core.security import decode_access_token

            jti = decode_access_token(raw_token).get("jti")
        except Exception:
            jti = None

    query = db.query(UserSession).filter(UserSession.user_id == current_user.id, UserSession.revoked_at.is_(None))
    if jti:
        query = query.filter(UserSession.session_token == str(jti))
    now = datetime.utcnow()
    for session in query.all():
        session.revoked_at = now
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
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"status": "ok", "message": "Logged out"}


@router.get("/auth/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.from_user(current_user)


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
    assign_role_to_user(db, user, "viewer")
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
    db.refresh(user)
    return user


@router.get("/users", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users:read")),
) -> list[UserRead]:
    _ = current_user
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [UserRead.from_user(user) for user in users]


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
    current_user: User = Depends(require_permission("roles:write")),
) -> Role:
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
    records = db.query(AppSetting).all()
    return {item.key: item.value for item in records}


@router.put("/settings")
def save_setting(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("settings:write")),
) -> dict[str, str]:
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


@router.post("/api-tokens", response_model=ApiTokenCreated)
def create_api_token(
    payload: ApiTokenCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("tokens:write")),
) -> ApiTokenCreated:
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
    db.refresh(token)
    return ApiTokenCreated(
        id=token.id,
        name=token.name,
        prefix=token.prefix,
        token=raw_token,
        expires_at=token.expires_at,
        is_active=token.is_active,
    )


@router.get("/api-tokens", response_model=list[ApiTokenRead])
def list_api_tokens(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("tokens:write")),
) -> list[ApiToken]:
    return db.query(ApiToken).filter(ApiToken.user_id == current_user.id).all()


@router.delete("/api-tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def revoke_api_token(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("tokens:write")),
) -> None:
    token = (
        db.query(ApiToken)
        .filter(ApiToken.id == token_id, ApiToken.user_id == current_user.id)
        .first()
    )
    if token is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API token not found")
    token.is_active = False
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="API_TOKEN_REVOKE",
            resource="api_tokens",
            resource_id=str(token.id),
            details=f"Revoked token {token.name}",
            source="web",
            success=True,
        )
    )
    db.commit()


@router.post("/auth/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different")

    current_user.password_hash = hash_password(payload.new_password)
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
