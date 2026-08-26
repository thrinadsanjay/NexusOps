from fastapi.testclient import TestClient

from app.main import app


def test_admin_can_assign_role_to_user() -> None:
    client = TestClient(app)
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "ChangeMe123!"},
    )
    assert login.status_code == 200, login.text

    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    users_response = client.get("/api/v1/users", headers=headers)
    assert users_response.status_code == 200, users_response.text
    admin = next(user for user in users_response.json() if user["username"] == "admin")

    roles_response = client.get("/api/v1/roles", headers=headers)
    assert roles_response.status_code == 200, roles_response.text
    viewer_role = next(role for role in roles_response.json() if role["name"] == "viewer")

    assign_response = client.put(
        f"/api/v1/users/{admin['id']}/roles",
        headers=headers,
        json={"role_ids": [viewer_role["id"]]},
    )
    assert assign_response.status_code == 200, assign_response.text

    user_roles = client.get(f"/api/v1/users/{admin['id']}/roles", headers=headers)
    assert user_roles.status_code == 200, user_roles.text
    assert any(role["name"] == "viewer" for role in user_roles.json())
