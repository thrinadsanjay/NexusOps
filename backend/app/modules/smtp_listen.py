"""LAN SMTP listener that forwards accepted mail through the default smart host."""

from __future__ import annotations

import logging
from email import message_from_bytes
from email.policy import default as email_default

from app.core.config import settings
from app.db import SessionLocal
from app.models import SmtpMessage, SmtpRelay
from app.modules.smtp_client import SmtpSendError, ip_allowed, send_via_relay

logger = logging.getLogger("nexusops.smtp")

_controller = None


def listener_running() -> bool:
    return _controller is not None and getattr(_controller, "server", None) is not None


def _active_relay(db) -> SmtpRelay | None:
    relay = db.query(SmtpRelay).filter(SmtpRelay.enabled.is_(True), SmtpRelay.is_default.is_(True)).first()
    if relay:
        return relay
    return db.query(SmtpRelay).filter(SmtpRelay.enabled.is_(True)).order_by(SmtpRelay.id).first()


class RelayHandler:
    async def handle_MAIL(self, server, session, envelope, address, mail_options):
        envelope.mail_from = address
        return "250 OK"

    async def handle_RCPT(self, server, session, envelope, address, rcpt_options):
        peer = session.peer[0] if session.peer else ""
        db = SessionLocal()
        try:
            relay = _active_relay(db)
            if not relay:
                return "451 No SMTP relay is configured in NexusOps"
            if not ip_allowed(peer, relay.allowed_networks):
                row = SmtpMessage(
                    relay_id=relay.id,
                    direction="inbound",
                    sender=envelope.mail_from or "",
                    recipients=address,
                    subject=None,
                    status="rejected",
                    error_message=f"Client {peer} is outside allowed_networks",
                )
                db.add(row)
                db.commit()
                return "550 Relay not permitted from your network"
        finally:
            db.close()
        envelope.rcpt_tos.append(address)
        return "250 OK"

    async def handle_DATA(self, server, session, envelope):
        db = SessionLocal()
        try:
            relay = _active_relay(db)
            if not relay:
                return "451 No SMTP relay is configured in NexusOps"
            parsed = message_from_bytes(envelope.content or b"", policy=email_default)
            subject = str(parsed.get("Subject") or "(no subject)")
            body = parsed.get_body(preferencelist=("plain", "html"))
            text = body.get_content() if body is not None else (envelope.content or b"").decode("utf-8", "replace")
            sender = envelope.mail_from or relay.from_address
            recipients = list(envelope.rcpt_tos)
            row = SmtpMessage(
                relay_id=relay.id,
                direction="inbound",
                sender=sender,
                recipients=", ".join(recipients),
                subject=subject,
                status="sent",
            )
            try:
                send_via_relay(relay, recipients, subject, text, from_addr=relay.from_address)
            except SmtpSendError as exc:
                row.status = "error"
                row.error_message = str(exc)
                db.add(row)
                db.commit()
                return f"451 {exc}"
            db.add(row)
            db.commit()
            return "250 Message accepted for delivery"
        except Exception as exc:
            logger.exception("SMTP inbound failed")
            return f"451 {exc}"
        finally:
            db.close()


def start_listener() -> None:
    global _controller
    if not settings.smtp_listen_enable:
        return
    if _controller is not None:
        return
    try:
        from aiosmtpd.controller import Controller
    except ImportError:
        logger.warning("aiosmtpd is not installed; LAN SMTP listener is off")
        return
    _controller = Controller(RelayHandler(), hostname=settings.smtp_listen_host, port=settings.smtp_listen_port)
    _controller.start()
    logger.info("SMTP listener on %s:%s", settings.smtp_listen_host, settings.smtp_listen_port)


def stop_listener() -> None:
    global _controller
    if _controller is None:
        return
    try:
        _controller.stop()
    except Exception:
        logger.exception("SMTP listener stop failed")
    _controller = None
