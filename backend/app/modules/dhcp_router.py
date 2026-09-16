"""Fetch DHCP leases from common home/lab routers."""

from __future__ import annotations

import ipaddress
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx

from app.modules.cloudflare_dns import decrypt_token, encrypt_token
from app.modules.dhcp_local import ParsedLease, normalize_mac

logger = logging.getLogger("nexusops.dhcp")

ROUTER_TYPES = ("auto", "openwrt", "mikrotik", "opnsense", "unifi")


class RouterFetchError(Exception):
    pass


def encrypt_password(password: str) -> str:
    return encrypt_token(password)


def decrypt_password(blob: str) -> str:
    return decrypt_token(blob)


def parse_lease_dump(text: str) -> list[ParsedLease]:
    """Accept dnsmasq leases or a simple IP MAC hostname table."""
    rows: list[ParsedLease] = []
    seen: set[tuple[str, str]] = set()
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.lower().startswith("ip"):
            continue
        parts = re.split(r"[\s,;|]+", line)
        if len(parts) >= 4 and parts[0].isdigit():
            try:
                expiry = int(parts[0])
                mac = normalize_mac(parts[1])
                ip = parts[2]
                hostname = parts[3] if parts[3] not in {"*", ""} else None
                expires = datetime.fromtimestamp(expiry, tz=timezone.utc) if expiry > 0 else None
                key = (ip, mac)
                if key in seen:
                    continue
                seen.add(key)
                rows.append(ParsedLease(ip, mac, hostname, expires))
                continue
            except ValueError:
                pass
        ip = next((item for item in parts if _is_ip(item)), None)
        mac = next((item for item in parts if _looks_mac(item)), None)
        if not ip or not mac:
            continue
        hostname = next((item for item in parts if item not in {ip, mac} and not _is_ip(item) and not _looks_mac(item)), None)
        key = (ip, normalize_mac(mac))
        if key in seen:
            continue
        seen.add(key)
        rows.append(ParsedLease(ip, normalize_mac(mac), hostname, None))
    return rows


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False


def _looks_mac(value: str) -> bool:
    cleaned = value.replace("-", ":").lower()
    if re.fullmatch(r"(?:[0-9a-f]{2}:){5}[0-9a-f]{2}", cleaned):
        return True
    return len(re.sub(r"[^0-9a-f]", "", value.lower())) == 12


def _client(https: bool, timeout: float = 8.0) -> httpx.Client:
    return httpx.Client(timeout=timeout, verify=False, follow_redirects=True)


def _base(host: str, port: int | None, https: bool) -> str:
    scheme = "https" if https else "http"
    if port:
        return f"{scheme}://{host}:{port}"
    return f"{scheme}://{host}"


def fetch_openwrt(host: str, username: str, password: str, port: int | None, https: bool) -> list[ParsedLease]:
    base = _base(host, port, https)
    with _client(https) as client:
        login = client.post(
            f"{base}/ubus",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "call",
                "params": ["00000000000000000000000000000000", "session", "login", {"username": username, "password": password}],
            },
        )
        login.raise_for_status()
        body = login.json()
        result = body.get("result") or []
        session = None
        if isinstance(result, list) and len(result) > 1 and isinstance(result[1], dict):
            session = result[1].get("ubus_rpc_session")
        if not session:
            raise RouterFetchError("OpenWrt login failed. Check user, password, and that ubus is enabled.")
        leases = client.post(
            f"{base}/ubus",
            json={"jsonrpc": "2.0", "id": 2, "method": "call", "params": [session, "luci-rpc", "getDHCPLeases", {}]},
        )
        leases.raise_for_status()
        payload = leases.json().get("result") or []
        data = payload[1] if isinstance(payload, list) and len(payload) > 1 else {}
        rows = []
        for item in (data.get("dhcp_leases") or data.get("leases") or []):
            ip = item.get("ipaddr") or item.get("ip")
            mac = item.get("macaddr") or item.get("mac")
            if not ip or not mac:
                continue
            expires = None
            if item.get("expires"):
                expires = datetime.now(timezone.utc) + timedelta(seconds=int(item["expires"]))
            rows.append(ParsedLease(ip, normalize_mac(mac), item.get("hostname"), expires))
        if not rows:
            raise RouterFetchError("OpenWrt login worked but no DHCP leases were returned.")
        return rows


def fetch_mikrotik(host: str, username: str, password: str, port: int | None, https: bool) -> list[ParsedLease]:
    base = _base(host, port or (443 if https else 80), https)
    with _client(https) as client:
        response = client.get(f"{base}/rest/ip/dhcp-server/lease", auth=(username, password))
        if response.status_code in {401, 403}:
            raise RouterFetchError("MikroTik rejected the login.")
        response.raise_for_status()
        rows = []
        for item in response.json() or []:
            ip = item.get("address")
            mac = item.get("mac-address") or item.get("mac_address")
            if not ip or not mac:
                continue
            status = "active" if str(item.get("status") or "bound").lower() in {"bound", "active", "waiting"} else "released"
            rows.append(ParsedLease(ip, normalize_mac(mac), item.get("host-name") or item.get("comment"), None, status))
        return rows


def fetch_opnsense(host: str, username: str, password: str, port: int | None, https: bool) -> list[ParsedLease]:
    base = _base(host, port or 443, True)
    with _client(True) as client:
        paths = ["/api/dhcpv4/leases/searchLease", "/api/kea/leases4/searchLease"]
        last_error = "OPNsense API did not return leases"
        for path in paths:
            response = client.get(f"{base}{path}", auth=(username, password))
            if response.status_code in {401, 403}:
                raise RouterFetchError("OPNsense rejected the API key or secret.")
            if response.status_code == 404:
                continue
            if not response.is_success:
                last_error = response.text[:200] or last_error
                continue
            body = response.json()
            items = body.get("rows") or body.get("leases") or body
            if not isinstance(items, list):
                continue
            rows = []
            for item in items:
                ip = item.get("address") or item.get("ip")
                mac = item.get("mac") or item.get("macaddr")
                if not ip or not mac:
                    continue
                rows.append(ParsedLease(ip, normalize_mac(mac), item.get("hostname"), None))
            if rows:
                return rows
        raise RouterFetchError(last_error)


def fetch_unifi(host: str, username: str, password: str, port: int | None, https: bool) -> list[ParsedLease]:
    candidates = []
    if port:
        candidates.append(_base(host, port, https if port != 8443 else True))
    candidates.extend([_base(host, 443, True), _base(host, 8443, True)])
    last = "UniFi controller did not accept the login"
    seen = set()
    for base in candidates:
        if base in seen:
            continue
        seen.add(base)
        try:
            with _client(True) as client:
                login = client.post(f"{base}/api/auth/login", json={"username": username, "password": password})
                if login.status_code >= 400:
                    login = client.post(f"{base}/api/login", json={"username": username, "password": password})
                if login.status_code in {401, 403}:
                    last = "UniFi rejected the login."
                    continue
                login.raise_for_status()
                for path in (
                    "/proxy/network/api/s/default/stat/sta",
                    "/api/s/default/stat/sta",
                ):
                    clients = client.get(f"{base}{path}")
                    if not clients.is_success:
                        continue
                    data = clients.json().get("data") or []
                    rows = []
                    for item in data:
                        ip = item.get("ip")
                        mac = item.get("mac")
                        if not ip or not mac:
                            continue
                        rows.append(ParsedLease(ip, normalize_mac(mac), item.get("hostname") or item.get("name"), None))
                    if rows:
                        return rows
        except Exception as exc:
            last = str(exc)
    raise RouterFetchError(last)


FETCHERS = {
    "openwrt": fetch_openwrt,
    "mikrotik": fetch_mikrotik,
    "opnsense": fetch_opnsense,
    "unifi": fetch_unifi,
}


def fetch_router_leases(
    router_type: str,
    host: str,
    username: str,
    password: str,
    port: int | None = None,
    https: bool = False,
    lease_text: str | None = None,
) -> tuple[str, list[ParsedLease]]:
    if lease_text and lease_text.strip():
        rows = parse_lease_dump(lease_text)
        if not rows:
            raise RouterFetchError("Could not parse any IP/MAC pairs from the pasted lease table.")
        return "paste", rows
    kind = (router_type or "auto").strip().lower()
    if kind not in ROUTER_TYPES:
        raise RouterFetchError(f"Unsupported router type {router_type}")
    if not host or not username or not password:
        raise RouterFetchError("Router host, username, and password are required")
    errors: list[str] = []
    order = list(FETCHERS) if kind == "auto" else [kind]
    for name in order:
        try:
            rows = FETCHERS[name](host, username, password, port, https)
            if rows:
                return name, rows
            errors.append(f"{name}: no leases")
        except RouterFetchError as exc:
            errors.append(f"{name}: {exc}")
        except Exception as exc:
            errors.append(f"{name}: {exc}")
    raise RouterFetchError(
        "Could not read DHCP leases from the router. "
        + "; ".join(errors)
        + ". Use OpenWrt, MikroTik, OPNsense, UniFi, or paste the lease table."
    )
