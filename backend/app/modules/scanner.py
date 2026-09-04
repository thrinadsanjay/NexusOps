"""Network scanner – ICMP ping with TCP-connect fallback, no root required for TCP."""

from __future__ import annotations

import ipaddress
import socket
import subprocess
import concurrent.futures
from dataclasses import dataclass

# Common home/office gateway IPs to probe when no SCAN_NETWORKS is configured
_PROBE_GATEWAYS = [
    "192.168.0.1",   "192.168.1.1",   "192.168.2.1",   "192.168.3.1",
    "192.168.10.1",  "192.168.11.1",  "192.168.20.1",  "192.168.50.1",
    "192.168.100.1", "192.168.101.1", "192.168.254.1",
    "10.0.0.1",      "10.0.1.1",      "10.1.0.1",      "10.1.1.1",
    "10.10.0.1",     "10.10.10.1",
    "172.16.0.1",    "172.16.1.1",    "172.16.10.1",
]


@dataclass
class ScanResult:
    address: str
    hostname: str | None
    is_alive: bool
    mac_address: str | None = None


def _probe(ip: str) -> ScanResult:
    from app.modules.ipam_enrich import lookup_network_details

    alive = _icmp_ping(ip) or _tcp_ping(ip)
    hostname: str | None = None
    mac_address: str | None = None
    if alive:
        details = lookup_network_details(ip, ping_first=False)
        hostname = details.hostname
        mac_address = details.mac_address
    return ScanResult(address=ip, hostname=hostname, is_alive=alive, mac_address=mac_address)


def _icmp_ping(ip: str) -> bool:
    try:
        r = subprocess.run(
            ["ping", "-c", "1", "-W", "1", ip],
            capture_output=True, timeout=3,
        )
        return r.returncode == 0
    except Exception:
        return False


def _tcp_ping(ip: str, ports: tuple[int, ...] = (22, 53, 80, 443, 445, 8080, 8443)) -> bool:
    for port in ports:
        try:
            with socket.create_connection((ip, port), timeout=0.5):
                return True
        except (OSError, ConnectionRefusedError, TimeoutError):
            pass
    return False


def scan_network(cidr: str, max_workers: int = 64) -> list[ScanResult]:
    """Scan all host addresses in cidr and return only the alive ones."""
    network = ipaddress.ip_network(cidr, strict=False)
    hosts = [str(h) for h in network.hosts()]

    alive: list[ScanResult] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        for result in pool.map(_probe, hosts):
            if result.is_alive:
                alive.append(result)
    return alive


def get_local_networks() -> list[dict[str, str]]:
    """Return CIDRs from the container's own network interfaces."""
    try:
        import psutil  # type: ignore[import-untyped]
        nets = []
        for iface, addrs in psutil.net_if_addrs().items():
            if iface.startswith("lo"):
                continue
            for addr in addrs:
                if addr.family == socket.AF_INET:
                    try:
                        net = ipaddress.ip_interface(f"{addr.address}/{addr.netmask}").network
                        nets.append({"cidr": str(net), "interface": iface})
                    except Exception:
                        pass
        return nets
    except ImportError:
        return []


def probe_lan_gateways() -> list[dict[str, str]]:
    """Probe common gateway IPs to discover reachable LAN subnets (zero-config)."""
    found: list[dict[str, str]] = []

    def _check(gw: str) -> tuple[str, bool]:
        return gw, (_icmp_ping(gw) or _tcp_ping(gw, ports=(22, 53, 80, 443, 8080)))

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(_PROBE_GATEWAYS)) as pool:
        for gw, alive in pool.map(lambda g: _check(g), _PROBE_GATEWAYS):
            if alive:
                parts = gw.split(".")
                cidr = f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
                found.append({"cidr": cidr, "interface": "auto-detected"})

    return found
