"""Outbound SMTP via smtplib, including Gmail / Google Workspace smart hosts."""

from __future__ import annotations

import ipaddress
import smtplib
import ssl
from email.message import EmailMessage

from app.models import SmtpRelay

PROVIDERS = {
    "google": ("smtp.gmail.com", 587, "starttls"),
    "microsoft": ("smtp.office365.com", 587, "starttls"),
}

DEFAULT_NETWORKS = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32"


class SmtpSendError(Exception):
    pass


def apply_provider_defaults(provider: str, host: str | None, port: int | None, encryption: str | None) -> tuple[str, int, str]:
    preset = PROVIDERS.get((provider or "").strip().lower())
    if preset and not (host or "").strip():
        return preset
    return (
        (host or "").strip() or (preset[0] if preset else ""),
        port or (preset[1] if preset else 587),
        (encryption or "").strip() or (preset[2] if preset else "starttls"),
    )


def ip_allowed(ip: str, cidrs: str | None) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    raw = cidrs or DEFAULT_NETWORKS
    for part in raw.split(","):
        item = part.strip()
        if not item:
            continue
        try:
            if addr in ipaddress.ip_network(item, strict=False):
                return True
        except ValueError:
            continue
    return False


def send_via_relay(
    relay: SmtpRelay,
    to_addrs: list[str],
    subject: str,
    body: str,
    from_addr: str | None = None,
) -> None:
    recipients = [item.strip() for item in to_addrs if item and item.strip()]
    if not recipients:
        raise SmtpSendError("At least one recipient is required")
    if not relay.enabled:
        raise SmtpSendError("This relay is disabled")
    sender = (from_addr or relay.from_address or "").strip()
    if not sender:
        raise SmtpSendError("From address is missing")

    message = EmailMessage()
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject or "(no subject)"
    message.set_content(body or "")

    encryption = (relay.encryption or "starttls").lower()
    timeout = 30
    try:
        if encryption == "ssl":
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(relay.host, relay.port, timeout=timeout, context=context) as client:
                _login_and_send(client, relay, message)
            return
        with smtplib.SMTP(relay.host, relay.port, timeout=timeout) as client:
            client.ehlo()
            if encryption == "starttls":
                client.starttls(context=ssl.create_default_context())
                client.ehlo()
            _login_and_send(client, relay, message)
    except SmtpSendError:
        raise
    except Exception as exc:
        raise SmtpSendError(str(exc) or type(exc).__name__) from exc


def _login_and_send(client: smtplib.SMTP, relay: SmtpRelay, message: EmailMessage) -> None:
    if relay.username:
        client.login(relay.username, relay.password or "")
    refused = client.send_message(message) or {}
    if refused:
        raise SmtpSendError(f"Remote SMTP refused recipients: {refused}")
