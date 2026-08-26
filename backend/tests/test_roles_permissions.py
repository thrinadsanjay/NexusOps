from fastapi.testclient import TestClient

from app.main import app


def test_admin_can_list_permissions_and_assign_them_to_role() -> None:
    client = TestClient(app)
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "ChangeMe123!"},
    )
    assert login.status_code == 200, login.text

    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    permissions_response = client.get("/api/v1/permissions", headers=headers)
    assert permissions_response.status_code == 200, permissions_response.text
    permissions = permissions_response.json()
    assert any(permission["name"] == "users:write" for permission in permissions)

    roles_response = client.get("/api/v1/roles", headers=headers)
    assert roles_response.status_code == 200, roles_response.text
    viewer_role = next(role for role in roles_response.json() if role["name"] == "viewer")

    viewer_permission_id = next(
        permission["id"] for permission in permissions if permission["name"] == "users:write"
    )

    assign_response = client.put(
        f"/api/v1/roles/{viewer_role['id']}/permissions",
        headers=headers,
        json={"permission_ids": [viewer_permission_id]},
    )
    assert assign_response.status_code == 200, assign_response.text

    refreshed_roles = client.get("/api/v1/roles", headers=headers)
    refreshed_viewer = next(role for role in refreshed_roles.json() if role["name"] == "viewer")
    assert any(permission["name"] == "users:write" for permission in refreshed_viewer["permissions"])
