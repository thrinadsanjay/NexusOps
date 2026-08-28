from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, status

from app.core.config import settings


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def _prune(self, key: str, now: float, window: int) -> list[float]:
        return [stamp for stamp in self._hits.get(key, []) if now - stamp < window]

    def check(self, key: str) -> None:
        now = time.monotonic()
        window = settings.login_lockout_seconds
        with self._lock:
            recent = self._prune(key, now, window)
            self._hits[key] = recent
            if len(recent) >= settings.login_max_attempts:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many login attempts. Try again later.",
                )

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        window = settings.login_lockout_seconds
        with self._lock:
            recent = self._prune(key, now, window)
            recent.append(now)
            self._hits[key] = recent

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)


login_limiter = SlidingWindowLimiter()
