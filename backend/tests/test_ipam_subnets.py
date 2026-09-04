from fastapi.testclient import TestClient

from app.main import app


def test_admin_can_create_subnet_from_host_cidr() -> None:
    client = TestClient(app)
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "ChangeMe123!"},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    created = client.post(
        "/api/v1/ipam/subnets",
        headers=headers,
        json={"cidr": "10.250.1.50/24", "name": "Lab LAN", "status": "active"},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["cidr"] == "10.250.1.0/24"
    assert body["name"] == "Lab LAN"
