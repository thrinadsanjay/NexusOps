from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.modules.cloudflare_dns import (
    CfRecord,
    CfZone,
    CloudflareError,
    encrypt_token,
    normalize_cloudflare_token,
    relative_name,
    verify_token,
)


def test_relative_name() -> None:
    assert relative_name("sanjay-lab.online", "sanjay-lab.online") == "@"
    assert relative_name("sanjay-lab.online", "prod-tracker.sanjay-lab.online") == "prod-tracker"


def _auth() -> dict[str, str]:
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_cloudflare_account_never_returns_token_and_can_pull() -> None:
    client = TestClient(app)
    headers = _auth()
    with patch("app.modules.dns_cloudflare.verify_token", return_value={"status": "ok", "message": "ok"}):
        created = client.post(
            "/api/v1/dns/cloudflare/accounts",
            headers=headers,
            json={"name": "Cloudflare", "api_token": "cf-secret-token-value"},
        )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["has_token"] is True
    assert "api_token" not in body
    assert "token_encrypted" not in body
    assert "cf-secret-token-value" not in created.text

    listed = client.get("/api/v1/dns/cloudflare/accounts", headers=headers)
    assert listed.status_code == 200
    assert "cf-secret-token-value" not in listed.text

    remote_zones = [CfZone(id="zone-1", name="sanjay-lab.online", status="active")]
    remote_records = [
        CfRecord(id="rec-1", name="prod-tracker.sanjay-lab.online", type="A", content="10.0.0.10", ttl=300, priority=None, proxied=False),
        CfRecord(id="rec-2", name="sanjay-lab.online", type="TXT", content="v=spf1 include:_spf.google.com ~all", ttl=1, priority=None, proxied=False),
    ]
    with (
        patch("app.modules.dns_cloudflare.list_zones", return_value=remote_zones),
        patch("app.modules.dns_cloudflare.list_records", return_value=remote_records),
        patch("app.modules.dns_cloudflare.decrypt_token", return_value="cf-secret-token-value"),
    ):
        imported = client.post(
            f"/api/v1/dns/cloudflare/accounts/{body['id']}/import",
            headers=headers,
            json={"cloudflare_zone_id": "zone-1"},
        )
    assert imported.status_code == 200, imported.text
    zone = imported.json()
    assert zone["name"] == "sanjay-lab.online"
    assert zone["cloudflare_zone_id"] == "zone-1"
    names = {row["name"]: row for row in zone["records"]}
    assert names["prod-tracker"]["value"] == "10.0.0.10"
    assert names["@"]["record_type"] == "TXT"


def test_local_add_and_delete_sync_to_cloudflare() -> None:
    client = TestClient(app)
    headers = _auth()
    with patch("app.modules.dns_cloudflare.verify_token", return_value={"status": "ok", "message": "ok"}):
        account = client.post(
            "/api/v1/dns/cloudflare/accounts",
            headers=headers,
            json={"name": "CF live", "api_token": "cf-secret-token-value"},
        ).json()
    remote_zones = [CfZone(id="zone-live", name="sync.example.com", status="active")]
    with (
        patch("app.modules.dns_cloudflare.list_zones", return_value=remote_zones),
        patch("app.modules.dns_cloudflare.list_records", return_value=[]),
        patch("app.modules.dns_cloudflare.decrypt_token", return_value="cf-secret-token-value"),
    ):
        imported = client.post(
            f"/api/v1/dns/cloudflare/accounts/{account['id']}/import",
            headers=headers,
            json={"cloudflare_zone_id": "zone-live"},
        )
    assert imported.status_code == 200, imported.text
    zone_id = imported.json()["id"]

    with (
        patch("app.modules.dns_cloudflare.upsert_record", return_value="cf-rec-9") as upserted,
        patch("app.modules.dns_cloudflare.decrypt_token", return_value="cf-secret-token-value"),
    ):
        created = client.post(
            f"/api/v1/dns/zones/{zone_id}/records",
            headers=headers,
            json={"name": "app", "record_type": "A", "value": "10.1.1.8"},
        )
    assert created.status_code == 201, created.text
    assert created.json()["cloudflare_record_id"] == "cf-rec-9"
    upserted.assert_called_once()

    with (
        patch("app.modules.dns_cloudflare.delete_remote_record") as deleted,
        patch("app.modules.dns_cloudflare.decrypt_token", return_value="cf-secret-token-value"),
    ):
        gone = client.delete(f"/api/v1/dns/zones/{zone_id}/records/{created.json()['id']}", headers=headers)
    assert gone.status_code == 204
    deleted.assert_called_once()


def test_encrypt_token_is_not_plaintext() -> None:
    blob = encrypt_token("cf-secret-token-value")
    assert blob != "cf-secret-token-value"
    assert "cf-secret-token-value" not in blob


def test_normalize_cloudflare_token_strips_paste_junk() -> None:
    raw = '\ufeff "Bearer  abc-TOKEN-123  \n" \u200b'
    assert normalize_cloudflare_token(raw) == "abc-TOKEN-123"
    assert normalize_cloudflare_token("  'cf-secret-token-value'  ") == "cf-secret-token-value"


class _FakeResponse:
    def __init__(self, status_code: int, body: dict) -> None:
        self.status_code = status_code
        self._body = body
        self.text = ""
        self.headers = {"content-type": "application/json; charset=utf-8"}

    def json(self) -> dict:
        return self._body


def test_verify_token_falls_back_to_listing_zones() -> None:
    with patch("app.modules.cloudflare_dns.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.get.side_effect = [
            _FakeResponse(401, {"success": False, "errors": [{"message": "Invalid API Token"}]}),
            _FakeResponse(200, {"success": True, "result": []}),
        ]
        out = verify_token('  "cf-real-token-value"  ')
        assert out["status"] == "ok"
        first_headers = client.get.call_args_list[0].kwargs["headers"]
        assert first_headers["Authorization"] == "Bearer cf-real-token-value"
        assert "Content-Type" not in first_headers


def test_verify_token_explains_invalid_paste() -> None:
    with patch("app.modules.cloudflare_dns.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.get.side_effect = [
            _FakeResponse(401, {"success": False, "errors": [{"message": "Invalid API Token"}]}),
            _FakeResponse(401, {"success": False, "errors": [{"message": "Invalid API Token"}]}),
        ]
        try:
            verify_token("not-a-real-token")
        except CloudflareError as exc:
            assert "Paste only the token string" in str(exc)
        else:
            raise AssertionError("expected CloudflareError")


def test_create_account_normalizes_quoted_token() -> None:
    client = TestClient(app)
    headers = _auth()
    with patch("app.modules.dns_cloudflare.verify_token", return_value={"status": "ok", "message": "ok"}) as verify:
        created = client.post(
            "/api/v1/dns/cloudflare/accounts",
            headers=headers,
            json={"name": "Quoted paste", "api_token": '  "cf-secret-token-value"  '},
        )
    assert created.status_code == 201, created.text
    verify.assert_called_once_with("cf-secret-token-value")
    assert "cf-secret-token-value" not in created.text
