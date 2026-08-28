from __future__ import annotations

from fastapi import Query

DEFAULT_LIMIT = 100
MAX_LIMIT = 500


def pagination_params(
    offset: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
) -> tuple[int, int]:
    return offset, limit
