from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.modules.dhcp_local import parse_dnsmasq_leases, render_dnsmasq
from app.modules.dhcp_router import fetch_mikrotik, fetch_openwrt, parse_lease_dump


def _auth() -> dict[str, str]:
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_parse_dnsmasq_and_dump() -> None:
    text = "1710000000 aa:bb:cc:dd:ee:01 192.168.1.24 phone *\n1710000001 11:22:33:44:55:66 192.168.1.30 laptop *\n"
    rows = parse_dnsmasq_leases(text)
    assert {row.ip_address for row in rows} == {"192.168.1.24", "192.168.1.30"}
    pasted = parse_lease_dump("192.168.1.40 aa:bb:cc:dd:ee:ff tv\nip mac host\n")
    assert pasted[0].ip_address == "192.168.1.40"
    assert pasted[0].hostname == "tv"


def test_render_dnsmasq_requires_pool_and_writes_range() -> None:
    pool = MagicMock(
        id=3,
        subnet="192.168.1.0/24",
        range_start="192.168.1.100",
        range_end="192.168.1.200",
        gateway="192.168.1.1",
        dns_servers="1.1.1.1,8.8.8.8",
        lease_time=3600,
    )
    res = MagicMock(mac_address="AA-BB-CC-DD-EE-FF", ip_address="192.168.1.10", hostname="printer")
    text = render_dnsmasq([pool], [res])
    assert "dhcp-range=set:pool3,192.168.1.100,192.168.1.200" in text
    assert "dhcp-option=tag:pool3,3,192.168.1.1" in text
    assert "dhcp-host=aa:bb:cc:dd:ee:ff,192.168.1.10,printer" in text
    try:
        render_dnsmasq([], [])
        raise AssertionError("expected empty pools to fail")
    except ValueError:
        pass


def test_local_enable_disable(tmp_path: Path, monkeypatch) -> None:
    from app.core import config
    from app.modules import dhcp_local

    monkeypatch.setattr(config.settings, "dhcp_data_dir", str(tmp_path))
    monkeypatch.setattr(dhcp_local.settings, "dhcp_data_dir", str(tmp_path))
    client = TestClient(app)
    headers = _auth()
    created = client.post(
        "/api/v1/dhcp/servers",
        headers=headers,
        json={"name": "NexusOps DHCP", "host": "127.0.0.1", "kind": "local"},
    )
    assert created.status_code == 201, created.text
    server_id = created.json()["id"]
    # If ensure_local_server created another, still add a pool on kind=local via enable seed or explicit pool
    pool = client.post(
        f"/api/v1/dhcp/servers/{server_id}/pools",
        headers=headers,
        json={"subnet": "192.168.10.0/24", "range_start": "192.168.10.100", "range_end": "192.168.10.200", "gateway": "192.168.10.1"},
    )
    if pool.status_code != 201:
        listed = client.get("/api/v1/dhcp/servers", headers=headers).json()
        local = next(item for item in listed if item.get("kind") == "local")
        pool = client.post(
            f"/api/v1/dhcp/servers/{local['id']}/pools",
            headers=headers,
            json={"subnet": "192.168.10.0/24", "range_start": "192.168.10.100", "range_end": "192.168.10.200", "gateway": "192.168.10.1"},
        )
    assert pool.status_code == 201, pool.text
    enabled = client.post("/api/v1/dhcp/local/enable", headers=headers)
    assert enabled.status_code == 200, enabled.text
    assert enabled.json()["enabled"] is True
    assert (tmp_path / "enabled").exists()
    assert "dhcp-range" in (tmp_path / "dnsmasq.conf").read_text()
    disabled = client.post("/api/v1/dhcp/local/disable", headers=headers)
    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False
    assert not (tmp_path / "enabled").exists()


def test_local_enable_seeds_default_pool(tmp_path: Path, monkeypatch) -> None:
    from app.core import config
    from app.modules import dhcp_local

    monkeypatch.setattr(config.settings, "dhcp_data_dir", str(tmp_path))
    monkeypatch.setattr(dhcp_local.settings, "dhcp_data_dir", str(tmp_path))
    client = TestClient(app)
    headers = _auth()
    enabled = client.post("/api/v1/dhcp/local/enable", headers=headers)
    assert enabled.status_code == 200, enabled.text
    body = enabled.json()
    assert body["enabled"] is True
    assert body["pools"] >= 1
    assert (tmp_path / "enabled").exists()
    conf = (tmp_path / "dnsmasq.conf").read_text()
    assert "dhcp-range" in conf
    disabled = client.post("/api/v1/dhcp/local/disable", headers=headers)
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["enabled"] is False
    assert not (tmp_path / "enabled").exists()


def test_router_fetch_from_paste() -> None:
    client = TestClient(app)
    headers = _auth()
    fetched = client.post(
        "/api/v1/dhcp/router/fetch",
        headers=headers,
        json={
            "host": "192.168.1.1",
            "router_type": "auto",
            "username": "admin",
            "password": "secret",
            "lease_text": "192.168.1.55 aa:bb:cc:dd:ee:99 camera\n192.168.1.56 11:22:33:44:55:66 laptop",
            "name": "HomeLan",
        },
    )
    assert fetched.status_code == 200, fetched.text
    body = fetched.json()
    assert body["total"] == 2
    assert body["router_type"] == "paste"
    leases = client.get("/api/v1/dhcp/leases?active_only=false", headers=headers)
    ips = {row["ip_address"] for row in leases.json()}
    assert "192.168.1.55" in ips
    assert "192.168.1.56" in ips


def test_openwrt_and_mikrotik_adapters() -> None:
    class Fake:
        def __init__(self, payload):
            self._payload = payload
            self.status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

        @property
        def is_success(self):
            return True

    class Session:
        def __init__(self):
            self.posts = 0

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, json=None):
            self.posts += 1
            if json and json.get("id") == 1:
                return Fake({"result": [0, {"ubus_rpc_session": "abc"}]})
            return Fake({"result": [0, {"dhcp_leases": [{"ipaddr": "192.168.1.9", "macaddr": "aa:bb:cc:dd:ee:10", "hostname": "ap"}]}]})

        def get(self, url, auth=None):
            return Fake([{"address": "192.168.1.8", "mac-address": "aa:bb:cc:dd:ee:11", "host-name": "nas", "status": "bound"}])

    with patch("app.modules.dhcp_router._client", return_value=Session()):
        rows = fetch_openwrt("192.168.1.1", "root", "pw", None, False)
        assert rows[0].hostname == "ap"
        rows = fetch_mikrotik("192.168.1.1", "admin", "pw", None, False)
        assert rows[0].ip_address == "192.168.1.8"
