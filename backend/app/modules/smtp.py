"""SMTP relay profiles, test send, and LAN listener status."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user, require_permission
from app.db import get_db
from app.models import SmtpMessage, SmtpRelay
from app.modules.smtp_client import SmtpSendError, apply_provider_defaults, send_via_relay
from app.schemas import (
    SmtpMessageRead,
    SmtpRelayCreate,
    SmtpRelayRead,
    SmtpRelayUpdate,
    SmtpSendRequest,
    SmtpStatusRead,
)

router = APIRouter(prefix="/api/v1/smtp", tags=["smtp"])


def _relay_read(relay: SmtpRelay) -> SmtpRelayRead:
    data = SmtpRelayRead.model_validate(relay)
    return data.model_copy(update={"has_password": bool(relay.password)})


def _get_relay(relay_id: int, db: Session) -> SmtpRelay:
    relay = db.query(SmtpRelay).filter(SmtpRelay.id == relay_id).first()
    if not relay:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SMTP relay not found")
    return relay


def _set_default(db: Session, relay: SmtpRelay) -> None:
    if not relay.is_default:
        return
    db.query(SmtpRelay).filter(SmtpRelay.id != relay.id, SmtpRelay.is_default.is_(True)).update({"is_default": False})


def _validate_crypto(encryption: str) -> str:
    value = (encryption or "starttls").lower()
    if value not in {"starttls", "ssl", "none"}:
        raise HTTPException(status_code=400, detail="encryption must be starttls, ssl, or none")
    return value


def _validate_provider(provider: str) -> str:
    value = (provider or "custom").lower()
    if value not in {"google", "microsoft", "custom"}:
        raise HTTPException(status_code=400, detail="provider must be google, microsoft, or custom")
    return value


@router.get("/status", response_model=SmtpStatusRead)
def smtp_status(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> SmtpStatusRead:
    from app.modules.smtp_listen import listener_running

    default = (
        db.query(SmtpRelay)
        .filter(SmtpRelay.enabled.is_(True), SmtpRelay.is_default.is_(True))
        .first()
    )
    if default is None:
        default = db.query(SmtpRelay).filter(SmtpRelay.enabled.is_(True)).order_by(SmtpRelay.id).first()
    return SmtpStatusRead(
        listening=listener_running(),
        listen_host=settings.smtp_listen_host,
        listen_port=settings.smtp_listen_port,
        published_port=settings.smtp_published_port,
        default_relay=default.name if default else None,
        default_smart_host=f"{default.host}:{default.port}" if default else None,
    )


@router.get("/relays", response_model=list[SmtpRelayRead])
def list_relays(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[SmtpRelayRead]:
    return [_relay_read(row) for row in db.query(SmtpRelay).order_by(SmtpRelay.name).all()]


@router.post("/relays", response_model=SmtpRelayRead, status_code=status.HTTP_201_CREATED)
def create_relay(
    payload: SmtpRelayCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("smtp:write")),
) -> SmtpRelayRead:
    provider = _validate_provider(payload.provider)
    host, port, encryption = apply_provider_defaults(provider, payload.host, payload.port, payload.encryption)
    if not host:
        raise HTTPException(status_code=400, detail="SMTP host is required")
    relay = SmtpRelay(
        name=payload.name.strip(),
        provider=provider,
        host=host,
        port=port,
        encryption=_validate_crypto(encryption),
        username=(payload.username or "").strip() or None,
        password=payload.password or None,
        from_address=payload.from_address.strip(),
        allowed_networks=(payload.allowed_networks or "").strip()
        or "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32",
        is_default=payload.is_default,
        enabled=payload.enabled,
        notes=payload.notes,
    )
    db.add(relay)
    db.flush()
    _set_default(db, relay)
    db.commit()
    db.refresh(relay)
    return _relay_read(relay)


@router.patch("/relays/{relay_id}", response_model=SmtpRelayRead)
def update_relay(
    relay_id: int,
    payload: SmtpRelayUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("smtp:write")),
) -> SmtpRelayRead:
    relay = _get_relay(relay_id, db)
    data = payload.model_dump(exclude_none=True)
    if "password" in data and data["password"] == "":
        data.pop("password")
    if "provider" in data:
        data["provider"] = _validate_provider(data["provider"])
        host, port, encryption = apply_provider_defaults(
            data["provider"],
            data.get("host", relay.host),
            data.get("port", relay.port),
            data.get("encryption", relay.encryption),
        )
        data.setdefault("host", host)
        data.setdefault("port", port)
        data.setdefault("encryption", encryption)
    if "encryption" in data:
        data["encryption"] = _validate_crypto(data["encryption"])
    for field, value in data.items():
        setattr(relay, field, value)
    _set_default(db, relay)
    db.commit()
    db.refresh(relay)
    return _relay_read(relay)


@router.delete("/relays/{relay_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_relay(
    relay_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("smtp:write")),
) -> None:
    relay = _get_relay(relay_id, db)
    db.delete(relay)
    db.commit()


@router.post("/relays/{relay_id}/test", response_model=SmtpMessageRead)
def test_relay(
    relay_id: int,
    payload: SmtpSendRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("smtp:write")),
) -> SmtpMessageRead:
    return _send(db, _get_relay(relay_id, db), payload, direction="outbound")


@router.post("/send", response_model=SmtpMessageRead)
def send_mail(
    payload: SmtpSendRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("smtp:write")),
) -> SmtpMessageRead:
    relay = (
        db.query(SmtpRelay).filter(SmtpRelay.enabled.is_(True), SmtpRelay.is_default.is_(True)).first()
        or db.query(SmtpRelay).filter(SmtpRelay.enabled.is_(True)).order_by(SmtpRelay.id).first()
    )
    if not relay:
        raise HTTPException(status_code=400, detail="Add an SMTP relay first")
    return _send(db, relay, payload, direction="outbound")


@router.get("/messages", response_model=list[SmtpMessageRead])
def list_messages(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[SmtpMessage]:
    return db.query(SmtpMessage).order_by(SmtpMessage.created_at.desc()).limit(limit).all()


def _send(db: Session, relay: SmtpRelay, payload: SmtpSendRequest, direction: str) -> SmtpMessageRead:
    recipients = [part.strip() for part in payload.to.replace(";", ",").split(",") if part.strip()]
    row = SmtpMessage(
        relay_id=relay.id,
        direction=direction,
        sender=relay.from_address,
        recipients=", ".join(recipients),
        subject=payload.subject,
        status="sent",
    )
    try:
        send_via_relay(relay, recipients, payload.subject, payload.body)
        relay.last_test_at = datetime.utcnow()
        relay.last_test_status = "ok"
        relay.last_test_error = None
    except SmtpSendError as exc:
        row.status = "error"
        row.error_message = str(exc)
        relay.last_test_at = datetime.utcnow()
        relay.last_test_status = "error"
        relay.last_test_error = str(exc)
        db.add(row)
        db.commit()
        db.refresh(row)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.add(row)
    db.commit()
    db.refresh(row)
    return SmtpMessageRead.model_validate(row)
