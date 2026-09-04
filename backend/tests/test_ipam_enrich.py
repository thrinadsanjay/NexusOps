import random
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.modules.ipam_enrich import HostDetails, apply_missing, normalize_mac, parse_arp_table


def test_normalize_mac_accepts_colon_and_hyphen() -> None:
    assert normalize_mac("AA-BB-CC-DD-EE-FF") == "aa:bb:cc:dd:ee:ff"
    assert normalize_mac("aa:bb:cc:dd:ee:ff") == "aa:bb:cc:dd:ee:ff"
    assert normalize_mac("00:00:00:00:00:00") is None
    assert normalize_mac("not-a-mac") is None


def test_parse_arp_table_reads_proc_net_arp() -> None:
    table = parse_arp_table(
        "IP address       HW type     Flags       HW address            Mask     Device\n"
        "192.168.0.1      0x1         0x2         aa:bb:cc:dd:ee:ff     *        eth0\n"
        "192.168.0.10     0x1         0x0         00:00:00:00:00:00     *        eth0\n"
    )
    assert table == {"192.168.0.1": "aa:bb:cc:dd:ee:ff"}


def test_apply_missing_fills_blank_fields_only() -> None:
    row = SimpleNamespace(hostname=None, dns_name="", mac_address="aa:bb:cc:dd:ee:01")
    filled = apply_missing(
        row,
        HostDetails(hostname="gw", dns_name="gw.lab", mac_address="11:22:33:44:55:66"),
    )
    assert filled == ["hostname", "dns_name"]
    assert row.hostname == "gw"
    assert row.dns_name == "gw.lab"
    assert row.mac_address == "aa:bb:cc:dd:ee:01"


def _auth_headers() -> dict[str, str]:
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _unused_ip() -> str:
    return f"10.{random.randint(64, 126)}.{random.randint(1, 254)}.{random.randint(1, 254)}"


def test_lookup_fills_from_inventory_without_overwriting_manual_values() -> None:
    client = TestClient(app)
    headers = _auth_headers()
    ip = _unused_ip()

    host = client.post(
        "/api/v1/inventory/hosts",
        headers=headers,
        json={
            "hostname": f"gw-lab-{ip.replace('.', '-')}",
            "fqdn": "gw-lab.example.test",
            "ip_address": ip,
            "mac_address": "AA-BB-CC-DD-EE-01",
            "status": "active",
        },
    )
    assert host.status_code == 201, host.text

    created = client.post(
        "/api/v1/ipam/addresses",
        headers=headers,
        json={"address": ip, "status": "assigned"},
    )
    assert created.status_code == 201, created.text
    ip_id = created.json()["id"]
    assert created.json()["hostname"] is None
    assert created.json()["mac_address"] is None

    with patch("app.modules.ipam_enrich.lookup_network_details", return_value=HostDetails()):
        looked = client.post(f"/api/v1/ipam/addresses/{ip_id}/lookup", headers=headers)
    assert looked.status_code == 200, looked.text
    body = looked.json()
    assert set(body["filled"]) == {"hostname", "dns_name", "mac_address"}
    assert "inventory" in body["sources"]
    assert body["address"]["hostname"] == f"gw-lab-{ip.replace('.', '-')}"
    assert body["address"]["dns_name"] == "gw-lab.example.test"
    assert body["address"]["mac_address"] == "aa:bb:cc:dd:ee:01"

    patched = client.patch(
        f"/api/v1/ipam/addresses/{ip_id}",
        headers=headers,
        json={"hostname": "manual-gw"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["hostname"] == "manual-gw"

    with patch("app.modules.ipam_enrich.lookup_network_details", return_value=HostDetails()):
        again = client.post(f"/api/v1/ipam/addresses/{ip_id}/lookup", headers=headers)
    assert again.status_code == 200, again.text
    assert again.json()["address"]["hostname"] == "manual-gw"
    assert "hostname" not in again.json()["filled"]


def test_patch_address_accepts_manual_hostname_and_mac() -> None:
    client = TestClient(app)
    headers = _auth_headers()
    created = client.post(
        "/api/v1/ipam/addresses",
        headers=headers,
        json={"address": _unused_ip(), "status": "assigned"},
    )
    assert created.status_code == 201, created.text
    ip_id = created.json()["id"]

    patched = client.patch(
        f"/api/v1/ipam/addresses/{ip_id}",
        headers=headers,
        json={"hostname": "printer", "mac_address": "00:11:22:33:44:55", "dns_name": "printer.lab"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["hostname"] == "printer"
    assert patched.json()["mac_address"] == "00:11:22:33:44:55"
    assert patched.json()["dns_name"] == "printer.lab"
