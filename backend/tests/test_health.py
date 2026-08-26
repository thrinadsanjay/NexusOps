from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "service" in body


def test_api_health_endpoint_returns_metadata() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "nexusops"


def test_auth_login_invalid_credentials_returns_401() -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "missing-user", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert "detail" in response.json()
