from __future__ import annotations

import ipaddress
import re
from typing import Annotated

from pydantic import AfterValidator

MAC_RE = re.compile(r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$")


def parse_cidr(value: str) -> str:
    text = (value or "").strip()
    if not text:
        raise ValueError("CIDR is required")
    try:
        return str(ipaddress.ip_network(text, strict=False))
    except ValueError as exc:
        raise ValueError("Invalid CIDR network") from exc


def parse_ip(value: str) -> str:
    text = (value or "").strip()
    if not text:
        raise ValueError("IP address is required")
    try:
        return str(ipaddress.ip_address(text))
    except ValueError as exc:
        raise ValueError("Invalid IP address") from exc


def parse_mac(value: str) -> str:
    text = (value or "").strip().replace("-", ":")
    if not MAC_RE.match(text):
        raise ValueError("Invalid MAC address")
    return ":".join(part.lower().zfill(2) for part in text.split(":"))


def parse_optional_ip(value: str | None) -> str | None:
    if value is None or str(value).strip() == "":
        return None
    return parse_ip(value)


def parse_optional_mac(value: str | None) -> str | None:
    if value is None or str(value).strip() == "":
        return None
    return parse_mac(value)


def parse_optional_cidr(value: str | None) -> str | None:
    if value is None or str(value).strip() == "":
        return None
    return parse_cidr(value)


CidrStr = Annotated[str, AfterValidator(parse_cidr)]
IpStr = Annotated[str, AfterValidator(parse_ip)]
MacStr = Annotated[str, AfterValidator(parse_mac)]
OptionalIp = Annotated[str | None, AfterValidator(parse_optional_ip)]
OptionalMac = Annotated[str | None, AfterValidator(parse_optional_mac)]
OptionalCidr = Annotated[str | None, AfterValidator(parse_optional_cidr)]
