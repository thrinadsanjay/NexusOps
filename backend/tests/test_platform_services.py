from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.modules import platform_services


def _auth() -> dict[str, str]:
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_list_services_without_docker() -> None:
    client = TestClient(app)
    headers = _auth()
    with patch.object(platform_services, "docker_available", return_value=False), patch.object(
        platform_services, "_container_map", return_value={}
    ), patch.object(platform_services, "_worker_ping", return_value=None):
        listed = client.get("/api/v1/platform/services", headers=headers)
    assert listed.status_code == 200, listed.text
    rows = listed.json()
    ids = [item["id"] for item in rows]
    assert ids == ["postgres", "redis", "backend", "worker", "frontend", "openldap", "dhcp", "smtp"]
    smtp = next(item for item in rows if item["id"] == "smtp")
    assert smtp["kind"] == "process"
    assert smtp["controllable"] is True
    backend = next(item for item in rows if item["id"] == "backend")
    assert backend["status"] == "running"
    postgres = next(item for item in rows if item["id"] == "postgres")
    assert postgres["docker_available"] is False
    assert postgres["controllable"] is False


def test_unknown_service_returns_404() -> None:
    client = TestClient(app)
    headers = _auth()
    missing = client.post("/api/v1/platform/services/not-a-service/start", headers=headers)
    assert missing.status_code == 404
    assert "Unknown service" in missing.text


def test_invalid_action_returns_400() -> None:
    client = TestClient(app)
    headers = _auth()
    bad = client.post("/api/v1/platform/services/smtp/pause", headers=headers)
    assert bad.status_code == 400


def test_smtp_start_stop_and_restart() -> None:
    client = TestClient(app)
    headers = _auth()
    with (
        patch("app.modules.smtp_listen.start_listener") as start,
        patch("app.modules.smtp_listen.stop_listener") as stop,
        patch("app.modules.smtp_listen.listener_running", return_value=True),
    ):
        started = client.post("/api/v1/platform/services/smtp/start", headers=headers)
        assert started.status_code == 200, started.text
        start.assert_called_with(force=True)
        assert started.json()["status"] == "running"

        stopped = client.post("/api/v1/platform/services/smtp/stop", headers=headers)
        assert stopped.status_code == 200
        stop.assert_called()

        start.reset_mock()
        stop.reset_mock()
        restarted = client.post("/api/v1/platform/services/smtp/restart", headers=headers)
        assert restarted.status_code == 200
        stop.assert_called()
        start.assert_called_with(force=True)


def test_docker_action_mocked() -> None:
    client = TestClient(app)
    headers = _auth()
    with patch.object(platform_services, "_docker_action", return_value="ok") as docker_action:
        restarted = client.post("/api/v1/platform/services/redis/restart", headers=headers)
    assert restarted.status_code == 200, restarted.text
    docker_action.assert_called_once()
    assert docker_action.call_args[0][1] == "restart"
    assert restarted.json()["message"] == "Redis restart requested"


def test_docker_missing_socket_returns_503() -> None:
    client = TestClient(app)
    headers = _auth()
    with patch.object(platform_services, "docker_available", return_value=False):
        stopped = client.post("/api/v1/platform/services/redis/stop", headers=headers)
    assert stopped.status_code == 503
    assert "Docker socket" in stopped.text


def test_dashboard_stats_include_utilization() -> None:
    client = TestClient(app)
    headers = _auth()
    stats = client.get("/api/v1/dashboard/stats", headers=headers)
    assert stats.status_code == 200, stats.text
    body = stats.json()
    assert "available_ips" in body["ipam"]
    assert "zones" in body["dns"]
    assert "expired" in body["pki"]
    assert "total_groups" in body["inventory"]


def test_list_uses_docker_inspect_when_present() -> None:
    row = {
        "Names": ["/nexusops-redis"],
        "State": "running",
        "Status": "Up 2 hours (healthy)",
        "Created": 1_700_000_000,
    }
    client = TestClient(app)
    headers = _auth()
    with patch.object(platform_services, "docker_available", return_value=True), patch.object(
        platform_services, "_container_map", return_value={"nexusops-redis": row}
    ), patch.object(platform_services, "_probe_tcp", return_value=True), patch.object(
        platform_services, "_worker_ping", return_value=True
    ):
        listed = client.get("/api/v1/platform/services", headers=headers)
    redis = next(item for item in listed.json() if item["id"] == "redis")
    assert redis["status"] == "running"
    assert redis["health"] == "healthy"
    assert redis["controllable"] is True
    assert redis["started_at"]
