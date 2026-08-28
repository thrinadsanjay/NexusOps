from __future__ import annotations

import hashlib
from datetime import datetime

from fastapi import Cookie, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session, joinedload

from app.core.security import decode_access_token
from app.db import get_db
from app.models import ApiToken, Role, User, UserSession

security = HTTPBearer(auto_error=False)
COOKIE_NAME = "nexusops_token"


def user_permissions(user: User) -> set[str]:
    return {permission.name for role in user.roles for permission in role.permissions}


def _load_user(db: Session, user_id: int) -> User | None:
    return (
        db.query(User)
        .options(joinedload(User.roles).joinedload(Role.permissions))
        .filter(User.id == user_id)
        .first()
    )


def _authenticate_api_token(raw_token: str, db: Session) -> User:
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    record = db.query(ApiToken).filter(ApiToken.token_hash == token_hash).first()
    if record is None or not record.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API token")
    if record.expires_at is not None and record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API token expired")
    user = _load_user(db, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    record.last_used_at = datetime.utcnow()
    db.add(record)
    db.commit()
    return user


def _authenticate_jwt(token: str, db: Session) -> User:
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("user_id"))  # type: ignore[arg-type]
        jti = payload.get("jti")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    if not jti:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    session = (
        db.query(UserSession)
        .filter(
            UserSession.session_token == str(jti),
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
        .first()
    )
    if session is None or session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user = _load_user(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
    nexusops_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> User:
    raw_token = credentials.credentials if credentials is not None else nexusops_token
    if not raw_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            raw_token = auth_header.split(" ", 1)[1].strip()
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    if raw_token.startswith("nxo_"):
        return _authenticate_api_token(raw_token, db)
    return _authenticate_jwt(raw_token, db)


def require_permission(*permission_names: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.is_superuser or set(permission_names).issubset(user_permissions(current_user)):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )

    return dependency


def require_any_permission(*permission_names: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        perms = user_permissions(current_user)
        if current_user.is_superuser or any(name in perms for name in permission_names):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )

    return dependency
