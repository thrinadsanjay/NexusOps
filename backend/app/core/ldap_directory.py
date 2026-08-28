from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from fastapi import HTTPException, status
from ldap3 import BASE, HASHED_SALTED_SHA, LEVEL, MODIFY_ADD, MODIFY_DELETE, MODIFY_REPLACE, SUBTREE
from ldap3.utils.conv import escape_filter_chars
from ldap3.utils.dn import escape_rdn
from ldap3.utils.hashed import hashed

from app.core.ldap_utils import bind_password_for, connect_ldap, validate_ldap_filter

USER_ATTRIBUTES = [
    "cn",
    "uid",
    "sn",
    "givenName",
    "displayName",
    "mail",
    "telephoneNumber",
    "title",
    "departmentNumber",
    "physicalDeliveryOfficeName",
    "employeeType",
    "pwdAccountLockedTime",
    "manager",
    "objectClass",
    "createTimestamp",
    "modifyTimestamp",
]
GROUP_ATTRIBUTES = ["cn", "description", "member", "objectClass"]
OU_ATTRIBUTES = ["ou", "description", "objectClass"]


def _first(attrs: dict, *keys: str, default: str | None = None) -> str | None:
    for key in keys:
        values = attrs.get(key)
        if not values:
            continue
        value = values[0] if isinstance(values, list) else values
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return default


def _list(attrs: dict, key: str) -> list[str]:
    values = attrs.get(key) or []
    if not isinstance(values, list):
        values = [values]
    return [str(item) for item in values if item is not None and str(item).strip()]


def users_base(server: Any) -> str:
    return server.user_search_base or f"ou=users,{server.base_dn}"


def groups_base(server: Any) -> str:
    return server.group_search_base or f"ou=groups,{server.base_dn}"


def user_dn(username: str, server: Any) -> str:
    return f"cn={escape_rdn(username)},{users_base(server)}"


def group_dn(name: str, server: Any) -> str:
    return f"cn={escape_rdn(name)},{groups_base(server)}"


def ou_dn(name: str, parent_dn: str) -> str:
    return f"ou={escape_rdn(name)},{parent_dn}"


def is_account_disabled(attrs: dict) -> bool:
    employee_type = (_first(attrs, "employeeType") or "active").lower()
    if employee_type in {"disabled", "inactive", "locked"}:
        return True
    return bool(_first(attrs, "pwdAccountLockedTime"))


def bound_connection(server: Any):
    return connect_ldap(server, bind_dn=server.bind_dn, password=bind_password_for(server))


@contextmanager
def directory_connection(server: Any) -> Iterator[Any]:
    conn = bound_connection(server)
    try:
        yield conn
    finally:
        try:
            conn.unbind()
        except Exception:
            pass


def resolve_member(server: Any, member: str) -> str:
    value = (member or "").strip()
    if not value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Member is required")
    if "=" in value:
        return value
    return user_dn(value, server)


def ensure_base_ous(conn: Any, server: Any) -> None:
    for base in (users_base(server), groups_base(server)):
        if not str(base).lower().startswith("ou="):
            continue
        conn.search(base, "(objectClass=*)", search_scope=BASE, attributes=["objectClass"], size_limit=1)
        if conn.entries:
            continue
        name = base.split(",")[0].split("=", 1)[-1]
        conn.add(base, attributes={"objectClass": ["organizationalUnit", "top"], "ou": name})


def apply_account_enabled(conn: Any, dn: str, enabled: bool) -> None:
    employee_type = "active" if enabled else "disabled"
    if not conn.modify(dn, {"employeeType": [(MODIFY_REPLACE, [employee_type])]}):
        raise _ldap_error(conn, "Unable to update account status")
    if enabled:
        conn.modify(dn, {"pwdAccountLockedTime": [(MODIFY_DELETE, [])]})
    else:
        conn.modify(dn, {"pwdAccountLockedTime": [(MODIFY_REPLACE, ["000001010000Z"])]})


def _ldap_error(conn: Any, fallback: str) -> HTTPException:
    result = getattr(conn, "result", {}) or {}
    detail = str(result.get("description") or result.get("message") or fallback)
    upper = detail.upper()
    if "ALREADY_EXISTS" in upper or "ENTRY_ALREADY_EXISTS" in upper:
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
    if "NO_SUCH_OBJECT" in upper:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)


def serialize_user(entry: Any, member_of: list[str] | None = None) -> dict:
    attrs = entry.entry_attributes_as_dict
    username = _first(attrs, "uid", "cn") or ""
    disabled = is_account_disabled(attrs)
    return {
        "dn": entry.entry_dn,
        "username": username,
        "common_name": _first(attrs, "cn") or username,
        "uid": _first(attrs, "uid") or username,
        "first_name": _first(attrs, "givenName"),
        "last_name": _first(attrs, "sn"),
        "display_name": _first(attrs, "displayName", "cn"),
        "email": _first(attrs, "mail"),
        "phone": _first(attrs, "telephoneNumber"),
        "title": _first(attrs, "title"),
        "department": _first(attrs, "departmentNumber"),
        "office": _first(attrs, "physicalDeliveryOfficeName"),
        "manager_dn": _first(attrs, "manager"),
        "enabled": not disabled,
        "employee_type": _first(attrs, "employeeType") or ("disabled" if disabled else "active"),
        "member_of": member_of or [],
    }


def serialize_group(entry: Any) -> dict:
    attrs = entry.entry_attributes_as_dict
    members = _list(attrs, "member")
    return {
        "dn": entry.entry_dn,
        "name": _first(attrs, "cn") or "",
        "description": _first(attrs, "description"),
        "members": members,
        "member_count": len(members),
    }


def serialize_ou(entry: Any) -> dict:
    attrs = entry.entry_attributes_as_dict
    return {
        "dn": entry.entry_dn,
        "name": _first(attrs, "ou") or "",
        "description": _first(attrs, "description"),
    }


def list_group_memberships(conn: Any, server: Any, user_dn_value: str) -> list[str]:
    safe_dn = escape_filter_chars(user_dn_value)
    search_filter = validate_ldap_filter(f"(&(objectClass=groupOfNames)(member={safe_dn}))")
    conn.search(groups_base(server), search_filter, search_scope=SUBTREE, attributes=["cn"], size_limit=200)
    names: list[str] = []
    for entry in conn.entries:
        name = _first(entry.entry_attributes_as_dict, "cn")
        if name:
            names.append(name)
    return sorted(names)


def get_user_entry(conn: Any, server: Any, username: str):
    safe = escape_filter_chars(username)
    search_filter = validate_ldap_filter(f"(|(uid={safe})(cn={safe}))")
    conn.search(users_base(server), search_filter, search_scope=SUBTREE, attributes=USER_ATTRIBUTES, size_limit=1)
    if not conn.entries:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Directory user not found")
    return conn.entries[0]


def get_group_entry(conn: Any, server: Any, name: str):
    safe = escape_filter_chars(name)
    search_filter = validate_ldap_filter(f"(&(objectClass=groupOfNames)(cn={safe}))")
    conn.search(groups_base(server), search_filter, search_scope=SUBTREE, attributes=GROUP_ATTRIBUTES, size_limit=1)
    if not conn.entries:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Directory group not found")
    return conn.entries[0]


def list_users(conn: Any, server: Any, query: str | None = None, enabled: bool | None = None) -> list[dict]:
    search_filter = "(objectClass=inetOrgPerson)"
    if query:
        safe = escape_filter_chars(query)
        search_filter = f"(&(objectClass=inetOrgPerson)(|(uid=*{safe}*)(cn=*{safe}*)(mail=*{safe}*)(displayName=*{safe}*)))"
        validate_ldap_filter(search_filter)
    conn.search(users_base(server), search_filter, search_scope=SUBTREE, attributes=USER_ATTRIBUTES, size_limit=500)
    results = []
    for entry in conn.entries:
        member_of = list_group_memberships(conn, server, entry.entry_dn)
        payload = serialize_user(entry, member_of)
        if enabled is True and not payload["enabled"]:
            continue
        if enabled is False and payload["enabled"]:
            continue
        results.append(payload)
    results.sort(key=lambda item: item["username"].lower())
    return results


def list_groups(conn: Any, server: Any, query: str | None = None) -> list[dict]:
    search_filter = "(objectClass=groupOfNames)"
    if query:
        safe = escape_filter_chars(query)
        search_filter = f"(&(objectClass=groupOfNames)(|(cn=*{safe}*)(description=*{safe}*)))"
        validate_ldap_filter(search_filter)
    conn.search(groups_base(server), search_filter, search_scope=SUBTREE, attributes=GROUP_ATTRIBUTES, size_limit=500)
    results = [serialize_group(entry) for entry in conn.entries]
    results.sort(key=lambda item: item["name"].lower())
    return results


def list_ous(conn: Any, server: Any) -> list[dict]:
    conn.search(server.base_dn, "(objectClass=organizationalUnit)", search_scope=SUBTREE, attributes=OU_ATTRIBUTES, size_limit=200)
    results = [serialize_ou(entry) for entry in conn.entries]
    results.sort(key=lambda item: item["dn"].lower())
    return results


def list_tree(conn: Any, base_dn: str) -> list[dict]:
    conn.search(base_dn, "(objectClass=*)", search_scope=LEVEL, attributes=["objectClass", "cn", "ou", "uid"], size_limit=200)
    children = []
    for entry in conn.entries:
        classes = [str(item).lower() for item in _list(entry.entry_attributes_as_dict, "objectClass")]
        kind = "entry"
        if "organizationalunit" in classes:
            kind = "ou"
        elif "groupofnames" in classes or "posixgroup" in classes:
            kind = "group"
        elif "inetorgperson" in classes or "person" in classes:
            kind = "user"
        children.append(
            {
                "dn": entry.entry_dn,
                "name": _first(entry.entry_attributes_as_dict, "cn", "ou", "uid") or entry.entry_dn.split(",")[0],
                "kind": kind,
            }
        )
    return children


def create_user(conn: Any, server: Any, payload: dict) -> dict:
    ensure_base_ous(conn, server)
    username = payload["username"].strip()
    dn = user_dn(username, server)
    attributes = {
        "objectClass": ["inetOrgPerson", "organizationalPerson", "person", "top"],
        "cn": username,
        "uid": username,
        "sn": payload.get("last_name") or username,
        "displayName": payload.get("display_name") or username,
        "employeeType": "active" if payload.get("enabled", True) else "disabled",
    }
    optional = {
        "givenName": payload.get("first_name"),
        "mail": payload.get("email"),
        "telephoneNumber": payload.get("phone"),
        "title": payload.get("title"),
        "departmentNumber": payload.get("department"),
        "physicalDeliveryOfficeName": payload.get("office"),
        "manager": payload.get("manager_dn"),
    }
    for key, value in optional.items():
        if value:
            attributes[key] = value
    if payload.get("password"):
        attributes["userPassword"] = hashed(HASHED_SALTED_SHA, payload["password"])
    if not conn.add(dn, attributes=attributes):
        raise _ldap_error(conn, "Unable to create directory user")
    for group_name in payload.get("member_of") or []:
        add_group_member(conn, server, group_name, dn)
    return get_user(conn, server, username)


def get_user(conn: Any, server: Any, username: str) -> dict:
    entry = get_user_entry(conn, server, username)
    return serialize_user(entry, list_group_memberships(conn, server, entry.entry_dn))


def modify_user(conn: Any, server: Any, username: str, payload: dict) -> dict:
    entry = get_user_entry(conn, server, username)
    changes: dict[str, list] = {}
    mapping = {
        "first_name": "givenName",
        "last_name": "sn",
        "display_name": "displayName",
        "email": "mail",
        "phone": "telephoneNumber",
        "title": "title",
        "department": "departmentNumber",
        "office": "physicalDeliveryOfficeName",
        "manager_dn": "manager",
    }
    for field, attribute in mapping.items():
        if field not in payload:
            continue
        value = payload[field]
        if value in (None, ""):
            if attribute in entry.entry_attributes_as_dict:
                changes[attribute] = [(MODIFY_DELETE, [])]
        else:
            changes[attribute] = [(MODIFY_REPLACE, [value])]
    if changes and not conn.modify(entry.entry_dn, changes):
        raise _ldap_error(conn, "Unable to update directory user")
    if payload.get("enabled") is True:
        apply_account_enabled(conn, entry.entry_dn, True)
    elif payload.get("enabled") is False:
        apply_account_enabled(conn, entry.entry_dn, False)
    if "member_of" in payload and payload["member_of"] is not None:
        desired = {str(name) for name in payload["member_of"]}
        current = set(list_group_memberships(conn, server, entry.entry_dn))
        for name in desired - current:
            add_group_member(conn, server, name, entry.entry_dn)
        for name in current - desired:
            remove_group_member(conn, server, name, entry.entry_dn)
    return get_user(conn, server, username)


def set_user_password(conn: Any, server: Any, username: str, password: str) -> None:
    entry = get_user_entry(conn, server, username)
    hashed_password = hashed(HASHED_SALTED_SHA, password)
    try:
        if conn.extend.standard.modify_password(entry.entry_dn, new_password=password):
            return
    except Exception:
        pass
    if not conn.modify(entry.entry_dn, {"userPassword": [(MODIFY_REPLACE, [hashed_password])]}):
        raise _ldap_error(conn, "Unable to reset directory password")


def delete_user(conn: Any, server: Any, username: str) -> None:
    entry = get_user_entry(conn, server, username)
    for name in list_group_memberships(conn, server, entry.entry_dn):
        try:
            remove_group_member(conn, server, name, entry.entry_dn)
        except HTTPException:
            pass
    if not conn.delete(entry.entry_dn):
        raise _ldap_error(conn, "Unable to delete directory user")


def create_group(conn: Any, server: Any, payload: dict) -> dict:
    ensure_base_ous(conn, server)
    name = payload["name"].strip()
    dn = group_dn(name, server)
    members = [resolve_member(server, item) for item in (payload.get("members") or [])]
    if not members:
        if server.bind_dn:
            members = [server.bind_dn]
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A group must have at least one member")
    attributes = {
        "objectClass": ["groupOfNames", "top"],
        "cn": name,
        "member": members,
    }
    if payload.get("description"):
        attributes["description"] = payload["description"]
    if not conn.add(dn, attributes=attributes):
        raise _ldap_error(conn, "Unable to create directory group")
    return serialize_group(get_group_entry(conn, server, name))


def modify_group(conn: Any, server: Any, name: str, payload: dict) -> dict:
    entry = get_group_entry(conn, server, name)
    changes: dict[str, list] = {}
    if "description" in payload:
        value = payload["description"]
        if value in (None, ""):
            changes["description"] = [(MODIFY_DELETE, [])]
        else:
            changes["description"] = [(MODIFY_REPLACE, [value])]
    if changes and not conn.modify(entry.entry_dn, changes):
        raise _ldap_error(conn, "Unable to update directory group")
    return serialize_group(get_group_entry(conn, server, name))


def delete_group(conn: Any, server: Any, name: str) -> None:
    entry = get_group_entry(conn, server, name)
    if not conn.delete(entry.entry_dn):
        raise _ldap_error(conn, "Unable to delete directory group")


def add_group_member(conn: Any, server: Any, name: str, member: str) -> dict:
    entry = get_group_entry(conn, server, name)
    if not conn.modify(entry.entry_dn, {"member": [(MODIFY_ADD, [member])]}):
        description = str((getattr(conn, "result", {}) or {}).get("description", ""))
        if "ATTRIBUTE_OR_VALUE_EXISTS" not in description.upper() and "exists" not in description.lower():
            raise _ldap_error(conn, "Unable to add group member")
    return serialize_group(get_group_entry(conn, server, name))


def remove_group_member(conn: Any, server: Any, name: str, member: str) -> dict:
    entry = get_group_entry(conn, server, name)
    members = _list(entry.entry_attributes_as_dict, "member")
    if len(members) <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the last group member")
    if not conn.modify(entry.entry_dn, {"member": [(MODIFY_DELETE, [member])]}):
        raise _ldap_error(conn, "Unable to remove group member")
    return serialize_group(get_group_entry(conn, server, name))


def create_ou(conn: Any, parent_dn: str, name: str, description: str | None = None) -> dict:
    dn = ou_dn(name, parent_dn)
    attributes = {"objectClass": ["organizationalUnit", "top"], "ou": name}
    if description:
        attributes["description"] = description
    if not conn.add(dn, attributes=attributes):
        raise _ldap_error(conn, "Unable to create organizational unit")
    conn.search(dn, "(objectClass=organizationalUnit)", search_scope=BASE, attributes=OU_ATTRIBUTES, size_limit=1)
    if not conn.entries:
        return {"dn": dn, "name": name, "description": description}
    return serialize_ou(conn.entries[0])


def delete_ou(conn: Any, dn: str) -> None:
    conn.search(dn, "(objectClass=*)", search_scope=LEVEL, attributes=["objectClass"], size_limit=2)
    if conn.entries:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Organizational unit is not empty")
    if not conn.delete(dn):
        raise _ldap_error(conn, "Unable to delete organizational unit")
