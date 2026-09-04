from __future__ import annotations

from app.core.config import settings
from app.db import redact_database_url, resolve_database_url


def test_redact_database_url_hides_password() -> None:
    redacted = redact_database_url("postgresql+psycopg2://nexusops:s3cret@postgres:5432/nexusops")
    assert "s3cret" not in redacted
    assert "***" in redacted
    assert "postgres:5432/nexusops" in redacted


def test_resolve_rewrites_sqlite_when_compose_postgres_host_is_set(monkeypatch) -> None:
    monkeypatch.setenv("POSTGRES_HOST", "postgres")
    monkeypatch.setenv("POSTGRES_USER", "nexusops")
    monkeypatch.setenv("POSTGRES_PASSWORD", "change-me")
    monkeypatch.setenv("POSTGRES_DB", "nexusops")
    monkeypatch.setattr(settings, "database_url", "sqlite:///./nexusops.db")
    url = resolve_database_url()
    assert url.startswith("postgresql+psycopg2://")
    assert "@postgres:5432/nexusops" in url
    assert "sqlite" not in url


def test_resolve_rewrites_localhost_when_compose_postgres_host_is_set(monkeypatch) -> None:
    monkeypatch.setenv("POSTGRES_HOST", "postgres")
    monkeypatch.setenv("POSTGRES_USER", "nexusops")
    monkeypatch.setenv("POSTGRES_PASSWORD", "change-me")
    monkeypatch.setenv("POSTGRES_DB", "nexusops")
    monkeypatch.setattr(
        settings,
        "database_url",
        "postgresql+psycopg2://nexusops:change-me@localhost:5432/nexusops",
    )
    url = resolve_database_url()
    assert "@postgres:5432/nexusops" in url
    assert "localhost" not in url


def test_resolve_keeps_explicit_remote_postgres(monkeypatch) -> None:
    monkeypatch.setenv("POSTGRES_HOST", "postgres")
    monkeypatch.setattr(
        settings,
        "database_url",
        "postgresql+psycopg2://nexusops:change-me@db.internal:5432/nexusops",
    )
    url = resolve_database_url()
    assert url == "postgresql+psycopg2://nexusops:change-me@db.internal:5432/nexusops"


def test_resolve_keeps_sqlite_outside_compose(monkeypatch) -> None:
    monkeypatch.delenv("POSTGRES_HOST", raising=False)
    monkeypatch.setattr(settings, "database_url", "sqlite:///./nexusops.db")
    assert resolve_database_url() == "sqlite:///./nexusops.db"
