from __future__ import annotations

import os
from collections.abc import Generator
from typing import Any
from urllib.parse import quote_plus, urlsplit, urlunsplit

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def redact_database_url(url: str) -> str:
    try:
        parts = urlsplit(url)
        if parts.password:
            host = parts.hostname or ""
            port = f":{parts.port}" if parts.port else ""
            user = parts.username or ""
            netloc = f"{user}:***@{host}{port}"
            return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
    except Exception:
        pass
    if "@" in url:
        return url.split("@", 1)[-1]
    return url


def resolve_database_url() -> str:
    """Use the compose Postgres service when a host .env still points at sqlite or localhost.

    A sqlite URL inside the image writes ``./nexusops.db`` on the overlay filesystem.
    On Proxmox/LXC that often raises ``PermissionError: [Errno 13]``, then uvloop
    explodes while uvicorn tears down the already-running loop.
    """
    url = (settings.database_url or "").strip()
    postgres_host = os.getenv("POSTGRES_HOST", "").strip()
    in_compose = postgres_host == "postgres"
    looks_local = (
        not url
        or url.startswith("sqlite")
        or "@localhost" in url
        or "@127.0.0.1" in url
    )
    if in_compose and looks_local:
        user = quote_plus(os.getenv("POSTGRES_USER", "nexusops"))
        password = quote_plus(os.getenv("POSTGRES_PASSWORD", "change-me"))
        db_name = os.getenv("POSTGRES_DB", "nexusops")
        return f"postgresql+psycopg2://{user}:{password}@{postgres_host}:5432/{db_name}"
    return url or "sqlite:///./nexusops.db"


DATABASE_URL = resolve_database_url()

engine_kwargs: dict[str, Any] = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_database() -> None:
    import app.models  # noqa: F401 – register tables on Base.metadata

    Base.metadata.create_all(bind=engine)
    if DATABASE_URL.startswith("sqlite"):
        _sqlite_add_missing_columns()


def _sqlite_add_missing_columns() -> None:
    """create_all will not ALTER existing SQLite tables used by pytest."""
    from sqlalchemy import inspect, text

    wanted = {
        "dns_zones": {
            "cloud_account_id": "INTEGER",
            "cloudflare_zone_id": "VARCHAR(64)",
            "last_sync_at": "DATETIME",
            "last_sync_direction": "VARCHAR(20)",
            "last_sync_status": "VARCHAR(40)",
            "last_sync_error": "TEXT",
        },
        "dns_records": {
            "cloudflare_record_id": "VARCHAR(64)",
        },
    }
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in wanted.items():
            if table not in tables:
                continue
            existing = {col["name"] for col in inspector.get_columns(table)}
            for name, ddl in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
