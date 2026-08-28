from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.ldap_directory import is_account_disabled, serialize_user, user_dn, group_dn
from app.core.validators import parse_cidr, parse_ip, parse_mac
from app.schemas import DirectoryUserCreate, SubnetCreate
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class _Server:
    base_dn = "dc=homelab,dc=local"
    user_search_base = "ou=users,dc=homelab,dc=local"
    group_search_base = "ou=groups,dc=homelab,dc=local"


class _Entry:
    def __init__(self, dn: str, attrs: dict) -> None:
        self.entry_dn = dn
        self.entry_attributes_as_dict = attrs


def test_parse_cidr_and_ip_and_mac() -> None:
    assert parse_cidr("192.168.1.0/24") == "192.168.1.0/24"
    assert parse_ip("10.0.0.5") == "10.0.0.5"
    assert parse_mac("AA-BB-CC-DD-EE-FF") == "aa:bb:cc:dd:ee:ff"
    with pytest.raises(ValueError):
        parse_cidr("not-a-network")
    with pytest.raises(ValueError):
        parse_ip("999.1.1.1")
    with pytest.raises(ValueError):
        parse_mac("zz:zz:zz:zz:zz:zz")


def test_subnet_schema_rejects_invalid_cidr() -> None:
    with pytest.raises(ValidationError):
        SubnetCreate(cidr="not-a-cidr", name="bad")
    created = SubnetCreate(cidr="192.168.10.0/24", name="lab")
    assert created.cidr == "192.168.10.0/24"


def test_directory_user_schema_rejects_bad_username() -> None:
    with pytest.raises(ValidationError):
        DirectoryUserCreate(username="bad user")
    DirectoryUserCreate(username="lab-user", password="Password123")


def test_directory_dn_helpers_and_disabled_detection() -> None:
    server = _Server()
    assert user_dn("nexusadmin", server) == "cn=nexusadmin,ou=users,dc=homelab,dc=local"
    assert group_dn("nexusops-admins", server) == "cn=nexusops-admins,ou=groups,dc=homelab,dc=local"
    assert is_account_disabled({"employeeType": ["disabled"]}) is True
    assert is_account_disabled({"employeeType": ["active"]}) is False
    assert is_account_disabled({"pwdAccountLockedTime": ["000001010000Z"]}) is True
    payload = serialize_user(
        _Entry("cn=alice,ou=users,dc=homelab,dc=local", {"uid": ["alice"], "cn": ["alice"], "mail": ["alice@homelab.local"], "employeeType": ["active"]}),
        ["nexusops-viewers"],
    )
    assert payload["username"] == "alice"
    assert payload["enabled"] is True
    assert payload["member_of"] == ["nexusops-viewers"]


def test_list_endpoints_accept_pagination_and_reject_bad_network_data() -> None:
    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    vlans = client.get("/api/v1/ipam/vlans?offset=0&limit=1", headers=headers)
    assert vlans.status_code == 200
    assert isinstance(vlans.json(), list)

    hosts = client.get("/api/v1/inventory/hosts?offset=0&limit=1", headers=headers)
    assert hosts.status_code == 200
    assert isinstance(hosts.json(), list)

    bad = client.post("/api/v1/ipam/subnets", headers=headers, json={"cidr": "not-a-cidr", "name": "bad"})
    assert bad.status_code == 422

    missing = client.get("/api/v1/ldap/servers/99999/directory/users", headers=headers)
    assert missing.status_code == 404
