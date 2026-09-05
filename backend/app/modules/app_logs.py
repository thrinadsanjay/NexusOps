"""Capture application logs for the Platform → Logs page. Secrets are never stored."""

from __future__ import annotations

import logging
import re
from collections import deque
from datetime import datetime

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import AppLog

RING: deque[dict] = deque(maxlen=400)
_installed = False
_BEARER = re.compile(r"(?i)\bbearer\s+\S+")
_ASSIGNED = re.compile(
    r"(?i)(\b(?:api[_-]?token|token|password|secret|authorization)\b\s*[=:]\s*)\S+"
)


def redact(message: str) -> str:
    cleaned = _BEARER.sub("Bearer ***", message)
    cleaned = _ASSIGNED.sub(r"\1***", cleaned)
    return cleaned[:4000]


def _entry(level: str, logger_name: str, message: str, created_at: datetime | None = None) -> dict:
    return {
        "level": level.upper(),
        "logger": logger_name[:120],
        "message": redact(message),
        "created_at": created_at or datetime.utcnow(),
    }


def persist_entry(entry: dict) -> None:
    entry = {**entry, "message": redact(str(entry.get("message") or ""))}
    RING.appendleft(entry)
    db = SessionLocal()
    try:
        db.add(
            AppLog(
                level=entry["level"],
                logger=entry["logger"],
                message=entry["message"],
                created_at=entry["created_at"],
            )
        )
        count = db.query(AppLog).count()
        if count > 2500:
            stale_ids = [row.id for row in db.query(AppLog.id).order_by(AppLog.id.asc()).limit(count - 2000)]
            if stale_ids:
                db.query(AppLog).filter(AppLog.id.in_(stale_ids)).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


class AppLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            persist_entry(
                _entry(
                    record.levelname,
                    record.name,
                    record.getMessage(),
                    datetime.utcfromtimestamp(record.created),
                )
            )
        except Exception:
            pass


def install_log_handler() -> None:
    global _installed
    if _installed:
        return
    handler = AppLogHandler()
    handler.setLevel(logging.INFO)
    for name in ("nexusops", "nexusops.dns", "uvicorn.error"):
        target = logging.getLogger(name)
        target.addHandler(handler)
        if target.level == logging.NOTSET or target.level > logging.INFO:
            target.setLevel(logging.INFO)
    _installed = True
    logging.getLogger("nexusops").info("Application log capture is on")


def list_logs(
    db: Session,
    *,
    level: str | None = None,
    q: str | None = None,
    limit: int = 200,
) -> list[dict]:
    query = db.query(AppLog).order_by(AppLog.id.desc())
    if level:
        query = query.filter(AppLog.level == level.upper())
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(AppLog.message.ilike(like))
    rows = query.limit(max(1, min(limit, 500))).all()
    if rows:
        return [
            {
                "id": row.id,
                "level": row.level,
                "logger": row.logger,
                "message": row.message,
                "created_at": row.created_at,
            }
            for row in rows
        ]
    filtered = list(RING)
    if level:
        filtered = [item for item in filtered if item["level"] == level.upper()]
    if q:
        needle = q.strip().lower()
        filtered = [item for item in filtered if needle in item["message"].lower()]
    return filtered[: max(1, min(limit, 500))]
