from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.api.v1.router import router as v1_router
from app.modules.ipam import router as ipam_router
from app.modules.inventory import router as inventory_router
from app.modules.dns import router as dns_router
from app.modules.dns_cloudflare import router as dns_cloudflare_router
from app.modules.dhcp import router as dhcp_router
from app.modules.dashboard import router as dashboard_router
from app.modules.pki import router as pki_router
from app.modules.ldap_module import router as ldap_router
from app.modules.smtp import router as smtp_router
from app.core.bootstrap import ensure_admin_user, ensure_bundled_ldap_server
from app.core.config import settings
from app.db import create_database, get_db, redact_database_url, DATABASE_URL
from app.modules.app_logs import install_log_handler

logger = logging.getLogger("nexusops")
install_log_handler()


def bootstrap_app() -> None:
    """Create tables and seed the first admin.

    Uvicorn already has the event loop running when it imports ``app.main:app``.
    Compose sets ``NEXUSOPS_SKIP_IMPORT_BOOTSTRAP`` so this runs from lifespan
    instead. A PermissionError at import is handled while that loop is still
    running, which uvloop reports as "Cannot close a running event loop".
    """
    logger.info("Bootstrapping database %s", redact_database_url(DATABASE_URL))
    create_database()
    db = next(get_db())
    try:
        ensure_admin_user(db)
        ensure_bundled_ldap_server(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        bootstrap_app()
    except Exception as exc:
        path = getattr(exc, "filename", None)
        logger.exception(
            "Backend startup failed (%s)%s database=%s",
            type(exc).__name__,
            f" path={path}" if path else "",
            redact_database_url(DATABASE_URL),
        )
        raise
    from app.modules.smtp_listen import start_listener, stop_listener

    start_listener()
    try:
        yield
    finally:
        stop_listener()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Infrastructure Operations Platform",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)
app.include_router(ipam_router)
app.include_router(inventory_router)
app.include_router(dns_router)
app.include_router(dns_cloudflare_router)
app.include_router(dhcp_router)
app.include_router(dashboard_router)
app.include_router(pki_router)
app.include_router(ldap_router)
app.include_router(smtp_router)


@app.get("/.well-known/acme-challenge/{token}")
def letsencrypt_http01(token: str, db: Session = Depends(get_db)) -> Response:
    from app.modules.pki import http01_response

    return http01_response(token, db)

# Pytest and `python -c "from app.main import app"` still need tables without a
# lifespan. Compose sets NEXUSOPS_SKIP_IMPORT_BOOTSTRAP so uvicorn does not
# touch the database while its event loop is already running.
if os.getenv("NEXUSOPS_SKIP_IMPORT_BOOTSTRAP", "").lower() not in {"1", "true", "yes"}:
    try:
        bootstrap_app()
    except Exception:
        logger.exception(
            "Import-time bootstrap failed; lifespan will retry. database=%s",
            redact_database_url(DATABASE_URL),
        )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/v1/health")
def api_health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name, "environment": settings.app_env}
