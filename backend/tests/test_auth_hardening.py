from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.core.config import Settings, validate_runtime_secrets
from app.core.ldap_utils import validate_ldap_filter
from app.main import app


client = TestClient(app)


def _admin_headers() -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _unique(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def test_login_and_me_include_permissions() -> None:
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert login.status_code == 200
    body = login.json()
    assert "access_token" in body
    assert body["user"]["is_superuser"] is True
    permissions = client.get("/api/v1/permissions", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert permissions.status_code == 200
    assert any(item["name"] == "roles:write" for item in permissions.json())
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


def test_logout_invalidates_jwt() -> None:
    headers = _admin_headers()
    logout = client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 200
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 401


def test_change_password_requires_current_password_in_body() -> None:
    headers = _admin_headers()
    query_style = client.post("/api/v1/auth/change-password?new_password=NewPassword123!", headers=headers)
    assert query_style.status_code in {400, 422}

    wrong = client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": "wrong", "new_password": "NewPassword123!"},
    )
    assert wrong.status_code == 400

    ok = client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": "ChangeMe123!", "new_password": "ChangeMe123!"},
    )
    assert ok.status_code == 400


def test_api_token_auth_and_revoke() -> None:
    headers = _admin_headers()
    created = client.post("/api/v1/api-tokens", headers=headers, json={"name": "ci-token", "expires_days": 1})
    assert created.status_code == 200, created.text
    raw = created.json()["token"]
    token_id = created.json()["id"]
    assert raw.startswith("nxo_")

    token_headers = {"Authorization": f"Bearer {raw}"}
    me = client.get("/api/v1/auth/me", headers=token_headers)
    assert me.status_code == 200

    revoke = client.delete(f"/api/v1/api-tokens/{token_id}", headers=headers)
    assert revoke.status_code == 204
    denied = client.get("/api/v1/auth/me", headers=token_headers)
    assert denied.status_code == 401


def test_viewer_cannot_mutate_role_permissions() -> None:
    headers = _admin_headers()
    username = _unique("viewerrbac")
    create = client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "email": f"{username}@example.com",
            "username": username,
            "full_name": "Viewer RBAC",
            "password": "ViewerPass123!",
        },
    )
    assert create.status_code == 200, create.text

    login = client.post("/api/v1/auth/login", json={"username": username, "password": "ViewerPass123!"})
    assert login.status_code == 200, login.text
    viewer_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    roles = client.get("/api/v1/roles", headers=headers).json()
    viewer_role = next(role for role in roles if role["name"] == "viewer")
    permissions = client.get("/api/v1/permissions", headers=headers).json()
    users_write = next(item["id"] for item in permissions if item["name"] == "users:write")

    forbidden = client.put(
        f"/api/v1/roles/{viewer_role['id']}/permissions",
        headers=viewer_headers,
        json={"permission_ids": [users_write]},
    )
    assert forbidden.status_code == 403


def test_roleless_user_cannot_read_ipam() -> None:
    headers = _admin_headers()
    username = _unique("noroles")
    create = client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "email": f"{username}@example.com",
            "username": username,
            "full_name": "No Roles",
            "password": "NoRoles123!",
        },
    )
    assert create.status_code == 200, create.text
    user_id = create.json()["id"]
    stripped = client.put(f"/api/v1/users/{user_id}/roles", headers=headers, json={"role_ids": []})
    assert stripped.status_code == 200

    login = client.post("/api/v1/auth/login", json={"username": username, "password": "NoRoles123!"})
    assert login.status_code == 200
    denied = client.get("/api/v1/ipam/vlans", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert denied.status_code == 403


def test_scan_rejects_large_cidr() -> None:
    headers = _admin_headers()
    created = client.post(
        "/api/v1/ipam/subnets",
        headers=headers,
        json={"cidr": f"10.{uuid.uuid4().int % 200 + 10}.0.0/16", "name": _unique("too-big"), "status": "active"},
    )
    assert created.status_code == 201, created.text
    scan = client.post(f"/api/v1/ipam/subnets/{created.json()['id']}/scan", headers=headers)
    assert scan.status_code == 400
    assert "Scan refused" in scan.json()["detail"]


def test_ldap_filter_rejects_injection() -> None:
    from fastapi import HTTPException

    assert validate_ldap_filter("(objectClass=inetOrgPerson)") == "(objectClass=inetOrgPerson)"
    try:
        validate_ldap_filter("*)(uid=*))(|(uid=*")
        raise AssertionError("expected invalid filter to fail")
    except HTTPException as exc:
        assert exc.status_code == 400


def test_production_secrets_are_rejected() -> None:
    values = Settings.model_construct(
        app_env="production",
        secret_key="change-me-in-production",
        default_admin_password="ChangeMe123!",
        ldap_admin_password="NexusOps2024!",
    )
    try:
        validate_runtime_secrets(values)
        raise AssertionError("expected production defaults to fail")
    except RuntimeError:
        pass


def test_login_rate_limit() -> None:
    username = _unique("ratelimit")
    for _ in range(5):
        response = client.post("/api/v1/auth/login", json={"username": username, "password": "wrong"})
        assert response.status_code == 401
    blocked = client.post("/api/v1/auth/login", json={"username": username, "password": "wrong"})
    assert blocked.status_code == 429
