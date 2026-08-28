from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(subject: str, user_id: int, jti: str | None = None) -> str:
    token_id = jti or str(uuid.uuid4())
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode = {
        "sub": subject,
        "user_id": user_id,
        "jti": token_id,
        "exp": expires,
        "typ": "access",
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict[str, object]:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
