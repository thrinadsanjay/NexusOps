from __future__ import annotations

from datetime import datetime

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "nexusops",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "cloudflare-dns-daily": {
            "task": "nexusops.sync_cloudflare_dns",
            "schedule": crontab(hour=3, minute=0),
        }
    },
)


@celery_app.task
def ping() -> str:
    return "pong"


@celery_app.task(name="nexusops.sync_cloudflare_dns")
def sync_cloudflare_dns_task() -> dict:
    from app.modules.dns_cloudflare import sync_all_linked_zones

    return sync_all_linked_zones()


@celery_app.task(bind=True, name="nexusops.scan_subnet")
def scan_subnet_task(self, subnet_id: int) -> dict:  # type: ignore[override]
    """Ping-sweep a subnet and upsert discovered hosts into ip_addresses."""
    from app.db import SessionLocal
    from app.models import IPAddress, Subnet
    from app.modules.scanner import scan_network

    db = SessionLocal()
    try:
        subnet = db.query(Subnet).filter(Subnet.id == subnet_id).first()
        if not subnet:
            return {"error": "Subnet not found"}

        results = scan_network(subnet.cidr)
        now = datetime.utcnow()
        added = updated = 0

        for r in results:
            existing = db.query(IPAddress).filter(IPAddress.address == r.address).first()
            if existing:
                existing.status = "assigned"
                existing.last_seen_at = now
                if r.hostname and not existing.hostname:
                    existing.hostname = r.hostname
                if r.hostname and not existing.dns_name:
                    existing.dns_name = r.hostname
                if r.mac_address and not existing.mac_address:
                    existing.mac_address = r.mac_address
                updated += 1
            else:
                db.add(IPAddress(
                    address=r.address,
                    subnet_id=subnet.id,
                    hostname=r.hostname,
                    dns_name=r.hostname,
                    mac_address=r.mac_address,
                    status="assigned",
                    last_seen_at=now,
                ))
                added += 1

        db.commit()
        return {"added": added, "updated": updated, "total": len(results)}
    finally:
        db.close()

