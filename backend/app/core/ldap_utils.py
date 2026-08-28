from __future__ import annotations

import json
import re
import ssl
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret
from app.models import Role, User, UserRole

LDAP_FILTER_ALLOWED = re.compile(r"^[a-zA-Z0-9\s()=*|&!~<>._,\-:@/]+$")

GROUP_ROLE_MAP = {
    "nexusops-admins": "admin",
    "nexusops-operators": "operator",
    "nexusops-viewers": "viewer",
    "admins": "admin",
    "operators": "operator",
    "viewers": "viewer",
}

ROLE_RANK = {"viewer": 1, "operator": 2, "admin": 3}

PRIVATE_LDAP_HOSTS = {"openldap", "localhost", "127.0.0.1", "::1"}


def validate_ldap_filter(search_filter: str) -> str:
    candidate = (search_filter or "").strip()
    if not candidate or len(candidate) > 512:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid LDAP filter")
    if not candidate.startswith("(") or not candidate.endswith(")"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LDAP filter must be a single parenthesized expression",
        )
    if not LDAP_FILTER_ALLOWED.match(candidate):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LDAP filter contains disallowed characters",
        )
    depth = 0
    for char in candidate:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth < 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid LDAP filter")
    if depth != 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid LDAP filter")
    return candidate


def should_use_tls(host: str, use_tls: bool, use_ssl: bool) -> bool:
    if use_ssl:
        return False
    if use_tls:
        return True
    return host not in PRIVATE_LDAP_HOSTS


def connect_ldap(server: Any, bind_dn: str | None = None, password: str | None = None):
    from ldap3 import ANONYMOUS, Connection, Server, SIMPLE, Tls

    tls = Tls(validate=ssl.CERT_NONE)
    ldap_server = Server(
        server.host,
        port=server.port,
        use_ssl=bool(server.use_ssl),
        tls=tls,
        connect_timeout=5,
    )
    auth = SIMPLE if bind_dn else ANONYMOUS
    conn = Connection(
        ldap_server,
        user=bind_dn,
        password=password,
        authentication=auth,
        receive_timeout=10,
        auto_bind=False,
    )
    if should_use_tls(server.host, bool(server.use_tls), bool(server.use_ssl)):
        conn.open()
        conn.start_tls()
    if not conn.bind():
        raise RuntimeError(conn.result.get("description", "Bind failed"))
    return conn


def bind_password_for(server: Any) -> str | None:
    return decrypt_secret(getattr(server, "bind_password", None))


def _group_cns(conn: Any, server: Any, user_dn: str) -> set[str]:
    from ldap3 import SUBTREE

    names: set[str] = set()
    group_base = server.group_search_base or f"ou=groups,{server.base_dn}"
    member_filter = f"(|(member={user_dn})(uniqueMember={user_dn}))"
    try:
        validate_ldap_filter(f"(&{member_filter})")
        conn.search(
            group_base,
            f"(&(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)){member_filter})",
            search_scope=SUBTREE,
            attributes=["cn"],
            size_limit=50,
        )
        for entry in conn.entries:
            attrs = entry.entry_attributes_as_dict
            for value in attrs.get("cn", []):
                names.add(str(value).strip().lower())
    except Exception:
        pass

    try:
        conn.search(
            user_dn,
            "(objectClass=*)",
            search_scope="BASE",
            attributes=["memberOf", "cn"],
            size_limit=1,
        )
        if conn.entries:
            for value in conn.entries[0].entry_attributes_as_dict.get("memberOf", []):
                text = str(value)
                if "cn=" in text.lower():
                    names.add(text.split(",")[0].split("=", 1)[-1].strip().lower())
    except Exception:
        pass
    return names


def resolve_role_name(group_cns: set[str]) -> str:
    matched: list[str] = []
    for group_cn in group_cns:
        role = GROUP_ROLE_MAP.get(group_cn)
        if role:
            matched.append(role)
    if not matched:
        return "viewer"
    return max(matched, key=lambda name: ROLE_RANK.get(name, 0))


def assign_role_to_user(db: Session, user: User, role_name: str) -> None:
    role = db.query(Role).filter(Role.name == role_name).first()
    if role is None:
        return
    existing = {item.role_id for item in db.query(UserRole).filter(UserRole.user_id == user.id).all()}
    if role.id in existing:
        user.roles = [item for item in user.roles]
        return
    db.add(UserRole(user_id=user.id, role_id=role.id))
    db.flush()


def apply_ldap_groups_to_user(db: Session, user: User, server: Any, user_dn: str, conn: Any) -> str:
    role_name = resolve_role_name(_group_cns(conn, server, user_dn))
    assign_role_to_user(db, user, role_name)
    return role_name


def attr_map_for(server: Any) -> dict[str, str]:
    try:
        parsed = json.loads(server.user_attr_map or "{}")
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return {"username": "uid", "email": "mail", "full_name": "cn"}
