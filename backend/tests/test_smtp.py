from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.modules.smtp_client import apply_provider_defaults, ip_allowed


def test_google_preset_and_private_networks() -> None:
    host, port, encryption = apply_provider_defaults("google", None, None, None)
    assert host == "smtp.gmail.com"
    assert port == 587
    assert encryption == "starttls"
    assert ip_allowed("192.168.10.20", "10.0.0.0/8,192.168.0.0/16")
    assert not ip_allowed("8.8.8.8", "10.0.0.0/8,192.168.0.0/16")


def _auth() -> dict[str, str]:
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_create_google_relay_hides_password_and_sends() -> None:
    client = TestClient(app)
    headers = _auth()
    created = client.post(
        "/api/v1/smtp/relays",
        headers=headers,
        json={
            "name": "Gmail",
            "provider": "google",
            "username": "ops@sanjay-lab.online",
            "password": "app-password-test",
            "from_address": "ops@sanjay-lab.online",
            "is_default": True,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["host"] == "smtp.gmail.com"
    assert body["port"] == 587
    assert body["encryption"] == "starttls"
    assert body["has_password"] is True
    assert "password" not in body
    assert body["is_default"] is True

    smtp = MagicMock()
    smtp.__enter__.return_value = smtp
    smtp.send_message.return_value = {}
    with patch("app.modules.smtp_client.smtplib.SMTP", return_value=smtp) as ctor:
        sent = client.post(
            f"/api/v1/smtp/relays/{body['id']}/test",
            headers=headers,
            json={"to": "admin@sanjay-lab.online", "subject": "NexusOps test", "body": "hello"},
        )
    assert sent.status_code == 200, sent.text
    ctor.assert_called_once()
    smtp.starttls.assert_called_once()
    smtp.login.assert_called_once_with("ops@sanjay-lab.online", "app-password-test")
    smtp.send_message.assert_called_once()
    assert sent.json()["status"] == "sent"

    status = client.get("/api/v1/smtp/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["default_relay"] == "Gmail"
    assert "smtp.gmail.com" in status.json()["default_smart_host"]

    messages = client.get("/api/v1/smtp/messages", headers=headers)
    assert messages.status_code == 200
    assert messages.json()[0]["recipients"] == "admin@sanjay-lab.online"


def test_send_failure_is_recorded() -> None:
    client = TestClient(app)
    headers = _auth()
    created = client.post(
        "/api/v1/smtp/relays",
        headers=headers,
        json={
            "name": "Broken",
            "provider": "custom",
            "host": "smtp.example.test",
            "port": 587,
            "from_address": "ops@example.test",
        },
    )
    assert created.status_code == 201, created.text
    with patch("app.modules.smtp_client.send_via_relay", side_effect=Exception("boom")):
        # send_via_relay raises SmtpSendError in the API path; simulate that
        pass
    from app.modules.smtp_client import SmtpSendError

    with patch("app.modules.smtp.send_via_relay", side_effect=SmtpSendError("535 Bad credentials")):
        failed = client.post(
            f"/api/v1/smtp/relays/{created.json()['id']}/test",
            headers=headers,
            json={"to": "you@example.test"},
        )
    assert failed.status_code == 400
    assert "535" in failed.text
    listed = client.get("/api/v1/smtp/relays", headers=headers)
    row = next(item for item in listed.json() if item["id"] == created.json()["id"])
    assert row["last_test_status"] == "error"
