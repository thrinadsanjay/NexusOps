from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

SECRET_PREFIX = "enc:"


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str | None) -> str | None:
    if not value:
        return value
    if value.startswith(SECRET_PREFIX):
        return value
    token = _fernet().encrypt(value.encode("utf-8")).decode("utf-8")
    return f"{SECRET_PREFIX}{token}"


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return value
    if not value.startswith(SECRET_PREFIX):
        return value
    try:
        return _fernet().decrypt(value[len(SECRET_PREFIX) :].encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return value
