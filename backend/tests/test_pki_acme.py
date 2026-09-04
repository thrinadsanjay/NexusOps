from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import AcmeHttpChallenge
from app.modules.acme_client import dns_challenge_name, names_for_order, validate_acme_names
from app.modules.acme_issue import choose_challenge_type, http_urls_from_pending
from app.modules.acme_client import AcmeError


def test_names_for_order_adds_apex_for_wildcard() -> None:
    assert names_for_order("*.sanjay-lab.online", "www.sanjay-lab.online") == [
        "*.sanjay-lab.online",
        "www.sanjay-lab.online",
        "sanjay-lab.online",
    ]


def test_dns_challenge_name_strips_wildcard() -> None:
    assert dns_challenge_name("*.sanjay-lab.online") == "_acme-challenge.sanjay-lab.online"
    assert dns_challenge_name("vpn.sanjay-lab.online") == "_acme-challenge.vpn.sanjay-lab.online"


def test_wildcard_requires_dns01() -> None:
    assert choose_challenge_type(["vpn.example.com"], None) == "dns-01"
    assert choose_challenge_type(["lab-prd-server01.sanjay-lab.online"], None) == "dns-01"
    assert choose_challenge_type(["vpn.example.com"], "http-01") == "http-01"
    assert choose_challenge_type(["*.example.com"], None) == "dns-01"
    try:
        choose_challenge_type(["*.example.com"], "http-01")
    except AcmeError as exc:
        assert "Wildcard" in str(exc)
    else:
        raise AssertionError("expected AcmeError")


def test_validate_acme_names_suggests_truncated_tld() -> None:
    validate_acme_names(["prod-tracker.sanjay-lab.online", "lab-prd-server01.sanjay-lab.online"])
    try:
        validate_acme_names(["prod-mongo.sanjay-lab.onlin", "prod-tracker.sanjay-lab.onli"])
    except AcmeError as exc:
        text = str(exc)
        assert "prod-mongo.sanjay-lab.online" in text
        assert "prod-tracker.sanjay-lab.online" in text
    else:
        raise AssertionError("expected AcmeError")
    try:
        validate_acme_names(["nas.homelab.local"])
    except AcmeError as exc:
        assert "private suffix" in str(exc)
    else:
        raise AssertionError("expected AcmeError")


def test_http_urls_from_pending() -> None:
    urls = http_urls_from_pending(
        {
            "challenges": [
                {
                    "type": "http-01",
                    "identifier": "lab-prd-server01.sanjay-lab.online",
                    "token": "abc",
                }
            ]
        }
    )
    assert urls == ["http://lab-prd-server01.sanjay-lab.online/.well-known/acme-challenge/abc"]
    assert http_urls_from_pending({"challenges": [{"type": "dns-01", "identifier": "x", "token": "y"}]}) == []


def _auth() -> dict[str, str]:
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_letsencrypt_ca_requires_tos_and_email() -> None:
    client = TestClient(app)
    headers = _auth()
    missing = client.post(
        "/api/v1/pki/cas",
        headers=headers,
        json={"name": "LE", "common_name": "LE", "kind": "acme", "acme_email": "ops@example.com"},
    )
    assert missing.status_code == 400

    created = client.post(
        "/api/v1/pki/cas",
        headers=headers,
        json={
            "name": "Let's Encrypt staging",
            "common_name": "Let's Encrypt",
            "kind": "acme",
            "acme_directory": "letsencrypt-staging",
            "acme_email": "ops@example.com",
            "acme_tos_agreed": True,
            "dns_provider": "manual",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["kind"] == "acme"
    assert body["is_root"] is False
    assert body["has_dns_credential"] is False
    assert "acme_account_key_pem" not in body
    assert "dns_api_token" not in body


def test_http01_well_known_serves_key_authorization() -> None:
    token = "test-token-nexusops"
    db = SessionLocal()
    try:
        existing = db.query(AcmeHttpChallenge).filter(AcmeHttpChallenge.token == token).first()
        if existing:
            existing.key_authorization = "test-token-nexusops.thumb"
        else:
            db.add(AcmeHttpChallenge(token=token, key_authorization="test-token-nexusops.thumb"))
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    missing = client.get("/.well-known/acme-challenge/no-such-token")
    assert missing.status_code == 404

    found = client.get("/.well-known/acme-challenge/test-token-nexusops")
    assert found.status_code == 200
    assert found.text == "test-token-nexusops.thumb"
    assert "text/plain" in found.headers.get("content-type", "")


def test_internal_ca_and_manual_certificate_still_work() -> None:
    client = TestClient(app)
    headers = _auth()
    ca = client.post(
        "/api/v1/pki/cas",
        headers=headers,
        json={"name": "Homelab CA", "common_name": "Homelab CA", "kind": "internal", "is_root": True},
    )
    assert ca.status_code == 201, ca.text
    cert = client.post(
        "/api/v1/pki/certificates",
        headers=headers,
        json={"common_name": "nas.homelab.local", "ca_id": ca.json()["id"], "cert_type": "server", "status": "active"},
    )
    assert cert.status_code == 201, cert.text
    assert cert.json()["has_certificate"] is False
    assert cert.json()["status"] == "active"
