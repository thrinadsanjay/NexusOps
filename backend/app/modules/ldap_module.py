"""Phase 10 – LDAP Integration API."""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_permission
from app.core.security import hash_password
from app.db import get_db
from app.models import LdapServer, LdapSyncLog, User
from app.schemas import (
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


# ── Server CRUD ───────────────────────────────────────────────────────────────

@router.get("/servers", response_model=list[LdapServerRead])
def list_servers(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[LdapServer]:
    return db.query(LdapServer).order_by(LdapServer.name).all()


@router.post("/servers", response_model=LdapServerRead, status_code=status.HTTP_201_CREATED)
def create_server(payload: LdapServerCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("ldap:write"))) -> LdapServer:
    server = LdapServer(**payload.model_dump())
    db.add(server); db.commit(); db.refresh(server)
    return server


@router.get("/servers/{server_id}", response_model=LdapServerRead)
def get_server(server_id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> LdapServer:
    return _get_server_or_404(server_id, db)


@router.patch("/servers/{server_id}", response_model=LdapServerRead)
def update_server(server_id: int, payload: LdapServerUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("ldap:write"))) -> LdapServer:
    server = _get_server_or_404(server_id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(server, field, value)
    db.commit(); db.refresh(server)
    return server


@router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_server(server_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("ldap:write"))) -> None:
    server = _get_server_or_404(server_id, db)
    db.delete(server); db.commit()


# ── Connection test ───────────────────────────────────────────────────────────

@router.post("/servers/{server_id}/test", response_model=dict)
def test_connection(server_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("ldap:write"))) -> dict:
    server = _get_server_or_404(server_id, db)
    now = datetime.utcnow()
    try:
        from ldap3 import ANONYMOUS, Connection, Server, SIMPLE  # type: ignore[import-untyped]
        ldap_server = Server(server.host, port=server.port, use_ssl=server.use_ssl, connect_timeout=5)
        auth = SIMPLE if server.bind_dn else ANONYMOUS
        conn = Connection(ldap_server, user=server.bind_dn, password=server.bind_password, authentication=auth, receive_timeout=5)
        if not conn.bind():
            raise RuntimeError(conn.result.get("description", "Bind failed"))
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


# ── Directory browse ──────────────────────────────────────────────────────────

@router.post("/servers/{server_id}/browse", response_model=dict)
def browse_directory(
    server_id: int,
    search_base: str | None = None,
    search_filter: str = "(objectClass=*)",
    attributes: list[str] | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> dict:
    server = _get_server_or_404(server_id, db)
    base = search_base or server.user_search_base or server.base_dn
    attrs = attributes or ["cn", "mail", "sAMAccountName", "uid", "objectClass"]
    try:
        from ldap3 import ANONYMOUS, Connection, Server, SIMPLE, SUBTREE  # type: ignore[import-untyped]
        ldap_server = Server(server.host, port=server.port, use_ssl=server.use_ssl, connect_timeout=5)
        auth = SIMPLE if server.bind_dn else ANONYMOUS
        conn = Connection(ldap_server, user=server.bind_dn, password=server.bind_password, authentication=auth, receive_timeout=10)
        if not conn.bind():
            raise RuntimeError(conn.result.get("description", "Bind failed"))
        conn.search(base, search_filter, search_scope=SUBTREE, attributes=attrs, size_limit=limit)
        entries = [
            {"dn": e.entry_dn, "attributes": {k: str(v) for k, v in e.entry_attributes_as_dict.items()}}
            for e in conn.entries
        ]
        conn.unbind()
        return {"count": len(entries), "base": base, "entries": entries}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ── User sync ─────────────────────────────────────────────────────────────────

@router.post("/servers/{server_id}/sync", response_model=LdapSyncLogRead)
def sync_users(server_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("ldap:write"))) -> LdapSyncLog:
    """Import LDAP users as local NexusOps accounts (creates or updates, never deletes)."""
    server = _get_server_or_404(server_id, db)
    log = LdapSyncLog(server_id=server_id, status="running")
    db.add(log); db.flush()

    try:
        attr_map = json.loads(server.user_attr_map)
        username_attr = attr_map.get("username", "sAMAccountName")
        email_attr = attr_map.get("email", "mail")
        name_attr = attr_map.get("full_name", "cn")

        from ldap3 import ANONYMOUS, Connection, Server, SIMPLE, SUBTREE  # type: ignore[import-untyped]
        ldap_server = Server(server.host, port=server.port, use_ssl=server.use_ssl, connect_timeout=5)
        auth = SIMPLE if server.bind_dn else ANONYMOUS
        conn = Connection(ldap_server, user=server.bind_dn, password=server.bind_password, authentication=auth, receive_timeout=30)
        if not conn.bind():
            raise RuntimeError(conn.result.get("description", "Bind failed"))

        search_base = server.user_search_base or server.base_dn
        conn.search(search_base, server.user_filter, search_scope=SUBTREE, attributes=[username_attr, email_attr, name_attr], size_limit=500)

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

            if not username or not email:
                continue

            existing = db.query(User).filter((User.username == username) | (User.email == email)).first()
            if existing:
                existing.full_name = full_name or existing.full_name
                updated += 1
            else:
                db.add(User(
                    username=username,
                    email=email,
                    full_name=full_name,
                    password_hash=hash_password(f"ldap:{username}"),  # unusable local password
                    is_active=True,
                    is_superuser=False,
                ))
                created += 1

        conn.unbind()
        db.flush()

        log.status = "success"
        log.users_found = found
        log.users_created = created
        log.users_updated = updated
        log.finished_at = datetime.utcnow()
        server.last_sync_at = datetime.utcnow()
        db.commit(); db.refresh(log)

    except Exception as exc:
        log.status = "error"
        log.error_message = str(exc)
        log.finished_at = datetime.utcnow()
        db.commit(); db.refresh(log)

    return log


# ── Sync logs ─────────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/sync-logs", response_model=list[LdapSyncLogRead])
def list_sync_logs(server_id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[LdapSyncLog]:
    _get_server_or_404(server_id, db)
    return db.query(LdapSyncLog).filter(LdapSyncLog.server_id == server_id).order_by(LdapSyncLog.started_at.desc()).limit(20).all()
