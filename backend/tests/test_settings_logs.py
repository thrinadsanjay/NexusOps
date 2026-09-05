from fastapi.testclient import TestClient

from app.main import app
from app.modules.app_logs import persist_entry, redact


def _auth() -> dict[str, str]:
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_redact_strips_token_like_values() -> None:
    assert "secret-value" not in redact("Authorization: Bearer secret-value")
    assert "***" in redact("api_token=abc123xyz")


def test_general_settings_round_trip() -> None:
    client = TestClient(app)
    headers = _auth()
    updated = client.put(
        "/api/v1/settings/general",
        headers=headers,
        json={"app_name": "Lab NexusOps", "app_description": "Home lab control", "theme": "dark"},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["app_name"] == "Lab NexusOps"
    assert body["theme"] == "dark"
    listed = client.get("/api/v1/settings/general", headers=headers)
    assert listed.json()["app_description"] == "Home lab control"


def test_credentials_catalog_and_api_token_lifecycle() -> None:
    client = TestClient(app)
    headers = _auth()
    catalog = client.get("/api/v1/settings/credentials", headers=headers)
    assert catalog.status_code == 200, catalog.text
    ids = {item["id"] for item in catalog.json()}
    assert "nexusops-api" in ids
    assert "cloudflare-dns" in ids
    assert "cloudflare-acme" in ids
    assert "github" in ids
    assert not any("nxo_" in str(item) for item in catalog.json())

    created = client.post(
        "/api/v1/api-tokens",
        headers=headers,
        json={"name": "ci-settings-test", "expires_days": 7},
    )
    assert created.status_code == 200, created.text
    raw = created.json()["token"]
    assert raw.startswith("nxo_")
    listed = client.get("/api/v1/api-tokens", headers=headers)
    match = next(item for item in listed.json() if item["name"] == "ci-settings-test")
    assert match["is_active"] is True
    assert raw not in listed.text

    revoked = client.delete(f"/api/v1/api-tokens/{match['id']}", headers=headers)
    assert revoked.status_code == 204
    again = client.get("/api/v1/api-tokens", headers=headers)
    match = next(item for item in again.json() if item["name"] == "ci-settings-test")
    assert match["is_active"] is False


def test_audit_and_system_logs() -> None:
    client = TestClient(app)
    headers = _auth()
    persist_entry(
        {
            "level": "INFO",
            "logger": "nexusops.test",
            "message": "settings pages ready token=should-hide",
            "created_at": __import__("datetime").datetime.utcnow(),
        }
    )
    logs = client.get("/api/v1/logs/system?q=settings pages", headers=headers)
    assert logs.status_code == 200, logs.text
    assert logs.json()
    assert "should-hide" not in logs.text
    assert any("settings pages ready" in row["message"] for row in logs.json())

    audit = client.get("/api/v1/audit?limit=20", headers=headers)
    assert audit.status_code == 200
    assert isinstance(audit.json(), list)
