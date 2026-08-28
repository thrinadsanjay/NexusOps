from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as v1_router
from app.modules.ipam import router as ipam_router
from app.modules.inventory import router as inventory_router
from app.modules.dns import router as dns_router
from app.modules.dhcp import router as dhcp_router
from app.modules.dashboard import router as dashboard_router
from app.modules.pki import router as pki_router
from app.modules.ldap_module import router as ldap_router
from app.core.bootstrap import ensure_admin_user, ensure_bundled_ldap_server
from app.core.config import settings
from app.db import create_database, get_db

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Infrastructure Operations Platform",
    docs_url="/docs",
    redoc_url="/redoc",
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

try:
    db = next(get_db())
    ensure_admin_user(db)
    ensure_bundled_ldap_server(db)
except Exception:  # pragma: no cover - platform bootstrap safety net
    pass


@app.on_event("startup")
def startup() -> None:
    create_database()
    try:
        ensure_admin_user(next(get_db()))
    except Exception:  # pragma: no cover - platform bootstrap safety net
        pass


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/v1/health")
def api_health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name, "environment": settings.app_env}
