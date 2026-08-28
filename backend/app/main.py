from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as v1_router
from app.core.bootstrap import ensure_admin_user, ensure_bundled_ldap_server, ensure_system_settings
from app.core.config import settings, validate_runtime_secrets
from app.db import SessionLocal, create_database
from app.modules.dashboard import router as dashboard_router
from app.modules.dhcp import router as dhcp_router
from app.modules.dns import router as dns_router
from app.modules.inventory import router as inventory_router
from app.modules.ipam import router as ipam_router
from app.modules.ldap_module import router as ldap_router
from app.modules.pki import router as pki_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    validate_runtime_secrets()
    create_database()
    db = SessionLocal()
    try:
        ensure_admin_user(db)
        ensure_system_settings(db)
        ensure_bundled_ldap_server(db)
    finally:
        db.close()
    yield


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
app.include_router(dhcp_router)
app.include_router(dashboard_router)
app.include_router(pki_router)
app.include_router(ldap_router)

create_database()
_bootstrap_db = SessionLocal()
try:
    ensure_admin_user(_bootstrap_db)
    ensure_system_settings(_bootstrap_db)
    ensure_bundled_ldap_server(_bootstrap_db)
finally:
    _bootstrap_db.close()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/v1/health")
def api_health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name, "environment": settings.app_env}
