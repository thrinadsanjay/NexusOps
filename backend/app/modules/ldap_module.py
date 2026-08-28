"""LDAP server registry, directory management, and user sync."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.crypto import encrypt_secret
from app.core.dependencies import require_permission
from app.core.ldap_directory import (
    add_group_member,
    create_group,
    create_ou,
    create_user,
    delete_group,
    delete_ou,
    delete_user,
    directory_connection,
    get_user,
    list_groups,
    list_ous,
    list_tree,
    list_users,
    modify_group,
    modify_user,
    remove_group_member,
    resolve_member,
    set_user_password,
)
from app.core.ldap_utils import (
    apply_ldap_groups_to_user,
    assign_role_to_user,
    attr_map_for,
    bind_password_for,
    connect_ldap,
    validate_ldap_filter,
)
from app.core.security import hash_password
from app.db import get_db
from app.models import AuditLog, LdapServer, LdapSyncLog, User
from app.schemas import (
    DirectoryGroupCreate,
    DirectoryGroupRead,
    DirectoryGroupUpdate,
    DirectoryMemberChange,
    DirectoryOuCreate,
    DirectoryOuRead,
    DirectoryPasswordReset,
    DirectoryTreeNode,
    DirectoryUserCreate,
    DirectoryUserRead,
    DirectoryUserUpdate,
    LdapServerCreate,
    LdapServerRead,
    LdapServerUpdate,
    LdapSyncLogRead,
)

router = APIRouter(prefix="/api/v1/ldap", tags=["ldap"])


def _get_server_or_404(server_id: int, db: Session) -> LdapServer:
    server = db.query(LdapServer).filter(LdapServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LDAP server not found")
    return server


def _prepare_server_payload(data: dict) -> dict:
    if "bind_password" in data and data["bind_password"]:
        data["bind_password"] = encrypt_secret(data["bind_password"])
    if "user_filter" in data and data["user_filter"]:
        data["user_filter"] = validate_ldap_filter(data["user_filter"])
    return data


def _audit(db: Session, user: User, action: str, resource_id: str, details: str, success: bool = True) -> None:
    db.add(
        AuditLog(
            user_id=user.id,
            action=action,
            resource="ldap",
            resource_id=resource_id,
            details=details,
            source="web",
            success=success,
        )
    )


def _directory_error(exc: Exception) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.get("/servers", response_model=list[LdapServerRead])
def list_servers(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:read")),
) -> list[LdapServer]:
    return db.query(LdapServer).order_by(LdapServer.name).offset(offset).limit(limit).all()


@router.post("/servers", response_model=LdapServerRead, status_code=status.HTTP_201_CREATED)
def create_server(
    payload: LdapServerCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:write")),
) -> LdapServer:
    server = LdapServer(**_prepare_server_payload(payload.model_dump()))
    db.add(server)
    db.commit()
    db.refresh(server)
    return server


@router.get("/servers/{server_id}", response_model=LdapServerRead)
def get_server(
    server_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:read")),
) -> LdapServer:
    return _get_server_or_404(server_id, db)


@router.patch("/servers/{server_id}", response_model=LdapServerRead)
def update_server(
    server_id: int,
    payload: LdapServerUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:write")),
) -> LdapServer:
    server = _get_server_or_404(server_id, db)
    updates = _prepare_server_payload(payload.model_dump(exclude_none=True))
    for field, value in updates.items():
        setattr(server, field, value)
    db.commit()
    db.refresh(server)
    return server


@router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_server(
    server_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:write")),
) -> None:
    server = _get_server_or_404(server_id, db)
    db.delete(server)
    db.commit()


@router.post("/servers/{server_id}/test", response_model=dict)
def test_connection(
    server_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:write")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    now = datetime.utcnow()
    try:
        conn = connect_ldap(server, bind_dn=server.bind_dn, password=bind_password_for(server))
        conn.unbind()
        server.last_test_at = now
        server.last_test_status = "ok"
        db.commit()
        return {"status": "ok", "message": "Connection successful"}
    except Exception as exc:
        server.last_test_at = now
        server.last_test_status = "error"
        db.commit()
        return {"status": "error", "message": str(exc)}


@router.post("/servers/{server_id}/browse", response_model=dict)
def browse_directory(
    server_id: int,
    search_base: str | None = None,
    search_filter: str = "(objectClass=inetOrgPerson)",
    attributes: list[str] | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:read")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    safe_filter = validate_ldap_filter(search_filter)
    base = search_base or server.user_search_base or server.base_dn
    attrs = attributes or ["cn", "mail", "sAMAccountName", "uid", "objectClass"]
    try:
        from ldap3 import SUBTREE

        conn = connect_ldap(server, bind_dn=server.bind_dn, password=bind_password_for(server))
        conn.search(base, safe_filter, search_scope=SUBTREE, attributes=attrs, size_limit=min(limit, 100))
        entries = [
            {"dn": e.entry_dn, "attributes": {k: str(v) for k, v in e.entry_attributes_as_dict.items()}}
            for e in conn.entries
        ]
        conn.unbind()
        return {"count": len(entries), "base": base, "entries": entries}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/servers/{server_id}/sync", response_model=LdapSyncLogRead)
def sync_users(
    server_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:write")),
) -> LdapSyncLog:
    from app.core.ldap_directory import is_account_disabled

    server = _get_server_or_404(server_id, db)
    log = LdapSyncLog(server_id=server_id, status="running")
    db.add(log)
    db.flush()

    try:
        attr_map = attr_map_for(server)
        username_attr = attr_map.get("username", "sAMAccountName")
        email_attr = attr_map.get("email", "mail")
        name_attr = attr_map.get("full_name", "cn")
        user_filter = validate_ldap_filter(server.user_filter or "(objectClass=person)")

        from ldap3 import SUBTREE

        conn = connect_ldap(server, bind_dn=server.bind_dn, password=bind_password_for(server))
        search_base = server.user_search_base or server.base_dn
        conn.search(
            search_base,
            user_filter,
            search_scope=SUBTREE,
            attributes=[username_attr, email_attr, name_attr, "employeeType", "pwdAccountLockedTime"],
            size_limit=500,
        )

        found = created = updated = 0
        for entry in conn.entries:
            found += 1
            attrs = entry.entry_attributes_as_dict
            raw_username = attrs.get(username_attr, [None])[0]
            raw_email = attrs.get(email_attr, [None])[0]
            raw_name = attrs.get(name_attr, [None])[0]

            username = str(raw_username).strip() if raw_username else None
            email = str(raw_email).strip() if raw_email else None
            full_name = str(raw_name).strip() if raw_name else username
            active = not is_account_disabled(attrs)

            if not username or not email:
                continue

            existing = db.query(User).filter((User.username == username) | (User.email == email)).first()
            if existing:
                existing.full_name = full_name or existing.full_name
                existing.is_active = active
                apply_ldap_groups_to_user(db, existing, server, entry.entry_dn, conn)
                updated += 1
            else:
                user = User(
                    username=username,
                    email=email,
                    full_name=full_name,
                    password_hash=hash_password(f"ldap:{username}"),
                    is_active=active,
                    is_superuser=False,
                )
                db.add(user)
                db.flush()
                apply_ldap_groups_to_user(db, user, server, entry.entry_dn, conn)
                if not user.roles:
                    assign_role_to_user(db, user, "viewer")
                created += 1

        conn.unbind()
        db.flush()

        log.status = "success"
        log.users_found = found
        log.users_created = created
        log.users_updated = updated
        log.finished_at = datetime.utcnow()
        server.last_sync_at = datetime.utcnow()
        db.commit()
        db.refresh(log)

    except Exception as exc:
        log.status = "error"
        log.error_message = str(exc)
        log.finished_at = datetime.utcnow()
        db.commit()
        db.refresh(log)

    return log


@router.get("/servers/{server_id}/sync-logs", response_model=list[LdapSyncLogRead])
def list_sync_logs(
    server_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:read")),
) -> list[LdapSyncLog]:
    _get_server_or_404(server_id, db)
    return (
        db.query(LdapSyncLog)
        .filter(LdapSyncLog.server_id == server_id)
        .order_by(LdapSyncLog.started_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


# ── Directory users ───────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/directory/users", response_model=list[DirectoryUserRead])
def directory_list_users(
    server_id: int,
    q: str | None = Query(default=None),
    enabled: bool | None = Query(default=None),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:read")),
) -> list[dict]:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            results = list_users(conn, server, query=q, enabled=enabled)
        return results[offset : offset + limit]
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.post("/servers/{server_id}/directory/users", response_model=DirectoryUserRead, status_code=status.HTTP_201_CREATED)
def directory_create_user(
    server_id: int,
    payload: DirectoryUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            created = create_user(conn, server, payload.model_dump())
        _audit(db, current_user, "LDAP_USER_CREATE", created["username"], f"Created directory user {created['dn']}")
        db.commit()
        return created
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.get("/servers/{server_id}/directory/users/{username}", response_model=DirectoryUserRead)
def directory_get_user(
    server_id: int,
    username: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:read")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            return get_user(conn, server, username)
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.patch("/servers/{server_id}/directory/users/{username}", response_model=DirectoryUserRead)
def directory_update_user(
    server_id: int,
    username: str,
    payload: DirectoryUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            updated = modify_user(conn, server, username, payload.model_dump(exclude_unset=True))
        _audit(db, current_user, "LDAP_USER_UPDATE", username, f"Updated directory user {updated['dn']}")
        db.commit()
        return updated
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.delete("/servers/{server_id}/directory/users/{username}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def directory_delete_user(
    server_id: int,
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> None:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            delete_user(conn, server, username)
        _audit(db, current_user, "LDAP_USER_DELETE", username, f"Deleted directory user {username}")
        db.commit()
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.post("/servers/{server_id}/directory/users/{username}/password", response_model=dict)
def directory_reset_password(
    server_id: int,
    username: str,
    payload: DirectoryPasswordReset,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            set_user_password(conn, server, username, payload.password)
        _audit(db, current_user, "LDAP_USER_PASSWORD", username, f"Reset directory password for {username}")
        db.commit()
        return {"status": "ok", "message": "Password updated"}
    except Exception as exc:
        raise _directory_error(exc) from exc


# ── Directory groups ──────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/directory/groups", response_model=list[DirectoryGroupRead])
def directory_list_groups(
    server_id: int,
    q: str | None = Query(default=None),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:read")),
) -> list[dict]:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            results = list_groups(conn, server, query=q)
        return results[offset : offset + limit]
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.post("/servers/{server_id}/directory/groups", response_model=DirectoryGroupRead, status_code=status.HTTP_201_CREATED)
def directory_create_group(
    server_id: int,
    payload: DirectoryGroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            created = create_group(conn, server, payload.model_dump())
        _audit(db, current_user, "LDAP_GROUP_CREATE", created["name"], f"Created directory group {created['dn']}")
        db.commit()
        return created
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.get("/servers/{server_id}/directory/groups/{name}", response_model=DirectoryGroupRead)
def directory_get_group(
    server_id: int,
    name: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:read")),
) -> dict:
    from app.core.ldap_directory import get_group_entry, serialize_group

    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            return serialize_group(get_group_entry(conn, server, name))
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.patch("/servers/{server_id}/directory/groups/{name}", response_model=DirectoryGroupRead)
def directory_update_group(
    server_id: int,
    name: str,
    payload: DirectoryGroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            updated = modify_group(conn, server, name, payload.model_dump(exclude_unset=True))
        _audit(db, current_user, "LDAP_GROUP_UPDATE", name, f"Updated directory group {updated['dn']}")
        db.commit()
        return updated
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.delete("/servers/{server_id}/directory/groups/{name}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def directory_delete_group(
    server_id: int,
    name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> None:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            delete_group(conn, server, name)
        _audit(db, current_user, "LDAP_GROUP_DELETE", name, f"Deleted directory group {name}")
        db.commit()
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.post("/servers/{server_id}/directory/groups/{name}/members", response_model=DirectoryGroupRead)
def directory_add_member(
    server_id: int,
    name: str,
    payload: DirectoryMemberChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    member = resolve_member(server, payload.member)
    try:
        with directory_connection(server) as conn:
            updated = add_group_member(conn, server, name, member)
        _audit(db, current_user, "LDAP_GROUP_MEMBER_ADD", name, f"Added {member} to {name}")
        db.commit()
        return updated
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.delete("/servers/{server_id}/directory/groups/{name}/members", response_model=DirectoryGroupRead)
def directory_remove_member(
    server_id: int,
    name: str,
    member: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    member_dn = resolve_member(server, member)
    try:
        with directory_connection(server) as conn:
            updated = remove_group_member(conn, server, name, member_dn)
        _audit(db, current_user, "LDAP_GROUP_MEMBER_REMOVE", name, f"Removed {member_dn} from {name}")
        db.commit()
        return updated
    except Exception as exc:
        raise _directory_error(exc) from exc


# ── Organizational units and tree ─────────────────────────────────────────────

@router.get("/servers/{server_id}/directory/ous", response_model=list[DirectoryOuRead])
def directory_list_ous(
    server_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:read")),
) -> list[dict]:
    server = _get_server_or_404(server_id, db)
    try:
        with directory_connection(server) as conn:
            return list_ous(conn, server)
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.post("/servers/{server_id}/directory/ous", response_model=DirectoryOuRead, status_code=status.HTTP_201_CREATED)
def directory_create_ou(
    server_id: int,
    payload: DirectoryOuCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> dict:
    server = _get_server_or_404(server_id, db)
    parent = payload.parent_dn or server.base_dn
    try:
        with directory_connection(server) as conn:
            created = create_ou(conn, parent, payload.name, payload.description)
        _audit(db, current_user, "LDAP_OU_CREATE", created["dn"], f"Created OU {created['dn']}")
        db.commit()
        return created
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.delete("/servers/{server_id}/directory/ous", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def directory_delete_ou(
    server_id: int,
    dn: str = Query(..., min_length=3),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ldap:write")),
) -> None:
    server = _get_server_or_404(server_id, db)
    if not dn.lower().endswith(server.base_dn.lower()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OU DN is outside this directory base")
    try:
        with directory_connection(server) as conn:
            delete_ou(conn, dn)
        _audit(db, current_user, "LDAP_OU_DELETE", dn, f"Deleted OU {dn}")
        db.commit()
    except Exception as exc:
        raise _directory_error(exc) from exc


@router.get("/servers/{server_id}/directory/tree", response_model=list[DirectoryTreeNode])
def directory_tree(
    server_id: int,
    base_dn: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("ldap:read")),
) -> list[dict]:
    server = _get_server_or_404(server_id, db)
    target = base_dn or server.base_dn
    if not target.lower().endswith(server.base_dn.lower()) and target.lower() != server.base_dn.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tree base is outside this directory")
    try:
        with directory_connection(server) as conn:
            return list_tree(conn, target)
    except Exception as exc:
        raise _directory_error(exc) from exc
