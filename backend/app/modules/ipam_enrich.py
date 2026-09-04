"""Fill missing IPAM host details from reverse DNS, ARP, DHCP, DNS records, and inventory."""

from __future__ import annotations

import re
import socket
import subprocess
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

_MAC_RE = re.compile(r"(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}", re.IGNORECASE)


@dataclass
class HostDetails:
    hostname: str | None = None
    dns_name: str | None = None
    mac_address: str | None = None
    sources: list[str] = field(default_factory=list)


def normalize_mac(value: str | None) -> str | None:
    if not value:
        return None
    match = _MAC_RE.search(value.strip())
    if not match:
        return None
    parts = re.split(r"[:-]", match.group(0).lower())
    if len(parts) != 6:
        return None
    mac = ":".join(parts)
    if mac == "00:00:00:00:00:00":
        return None
    return mac


def reverse_dns(ip: str) -> str | None:
    try:
        name = socket.gethostbyaddr(ip)[0]
    except Exception:
        return None
    name = (name or "").strip().rstrip(".")
    return name or None


def parse_arp_table(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for line in text.splitlines():
        if line.lower().startswith("ip address") or not line.strip():
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        ip, mac = parts[0], normalize_mac(parts[3] if len(parts) >= 4 else "")
        if ip and mac:
            found[ip] = mac
    return found


def read_arp_table() -> dict[str, str]:
    try:
        with open("/proc/net/arp", encoding="utf-8") as handle:
            return parse_arp_table(handle.read())
    except OSError:
        return {}


def lookup_mac(ip: str, ping_first: bool = True) -> str | None:
    table = read_arp_table()
    if ip in table:
        return table[ip]
    if ping_first:
        try:
            subprocess.run(["ping", "-c", "1", "-W", "1", ip], capture_output=True, timeout=3)
        except Exception:
            pass
        table = read_arp_table()
    return table.get(ip)


def lookup_network_details(ip: str, ping_first: bool = True) -> HostDetails:
    details = HostDetails()
    hostname = reverse_dns(ip)
    if hostname:
        details.hostname = hostname
        details.dns_name = hostname
        details.sources.append("reverse-dns")
    mac = lookup_mac(ip, ping_first=ping_first)
    if mac:
        details.mac_address = mac
        details.sources.append("arp")
    return details


def _set_if_empty(details: HostDetails, field: str, value: str | None, source: str) -> None:
    if not value:
        return
    current = getattr(details, field)
    if current:
        return
    if field == "mac_address":
        value = normalize_mac(value)
        if not value:
            return
    setattr(details, field, value)
    if source not in details.sources:
        details.sources.append(source)


def lookup_details(db: Session, ip: str, ping_first: bool = True) -> HostDetails:
    details = lookup_network_details(ip, ping_first=ping_first)

    from app.models import DhcpLease, DhcpReservation, DnsRecord, Host

    lease = (
        db.query(DhcpLease)
        .filter(DhcpLease.ip_address == ip)
        .order_by(DhcpLease.id.desc())
        .first()
    )
    if lease:
        _set_if_empty(details, "hostname", lease.hostname, "dhcp-lease")
        _set_if_empty(details, "mac_address", lease.mac_address, "dhcp-lease")

    reservation = db.query(DhcpReservation).filter(DhcpReservation.ip_address == ip).first()
    if reservation:
        _set_if_empty(details, "hostname", reservation.hostname, "dhcp-reservation")
        _set_if_empty(details, "mac_address", reservation.mac_address, "dhcp-reservation")

    host = db.query(Host).filter(Host.ip_address == ip).first()
    if host:
        _set_if_empty(details, "hostname", host.hostname, "inventory")
        _set_if_empty(details, "dns_name", host.fqdn, "inventory")
        _set_if_empty(details, "mac_address", host.mac_address, "inventory")

    record = (
        db.query(DnsRecord)
        .filter(DnsRecord.record_type == "A", DnsRecord.value == ip)
        .order_by(DnsRecord.id.desc())
        .first()
    )
    if record and record.name and record.name != "@":
        _set_if_empty(details, "hostname", record.name, "dns-record")
        _set_if_empty(details, "dns_name", record.name, "dns-record")

    return details


def _is_blank(value: str | None) -> bool:
    return not (value or "").strip()


def apply_missing(ip_row, details: HostDetails) -> list[str]:
    filled: list[str] = []
    if details.hostname and _is_blank(ip_row.hostname):
        ip_row.hostname = details.hostname
        filled.append("hostname")
    if details.dns_name and _is_blank(ip_row.dns_name):
        ip_row.dns_name = details.dns_name
        filled.append("dns_name")
    if details.mac_address and _is_blank(ip_row.mac_address):
        ip_row.mac_address = details.mac_address
        filled.append("mac_address")
    return filled
