"""Phase 9 – PKI Certificate Management API."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_permission
from app.db import get_db
from app.models import Certificate, CertificateAuthority
from app.schemas import (
    CertificateAuthorityCreate,
    CertificateAuthorityRead,
    CertificateAuthorityUpdate,
    CertificateCreate,
    CertificateRead,
    CertificateUpdate,
)

router = APIRouter(prefix="/api/v1/pki", tags=["pki"])


# ── Certificate Authorities ───────────────────────────────────────────────────

@router.get("/cas", response_model=list[CertificateAuthorityRead])
def list_cas(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[CertificateAuthority]:
    return db.query(CertificateAuthority).order_by(CertificateAuthority.name).all()


@router.post("/cas", response_model=CertificateAuthorityRead, status_code=status.HTTP_201_CREATED)
def create_ca(payload: CertificateAuthorityCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> CertificateAuthority:
    ca = CertificateAuthority(**payload.model_dump())
    db.add(ca); db.commit(); db.refresh(ca)
    return ca


@router.patch("/cas/{ca_id}", response_model=CertificateAuthorityRead)
def update_ca(ca_id: int, payload: CertificateAuthorityUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> CertificateAuthority:
    ca = db.query(CertificateAuthority).filter(CertificateAuthority.id == ca_id).first()
    if not ca:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CA not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(ca, field, value)
    db.commit(); db.refresh(ca)
    return ca


@router.delete("/cas/{ca_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_ca(ca_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> None:
    ca = db.query(CertificateAuthority).filter(CertificateAuthority.id == ca_id).first()
    if not ca:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CA not found")
    db.delete(ca); db.commit()


# ── Certificates ──────────────────────────────────────────────────────────────

@router.get("/certificates", response_model=list[CertificateRead])
def list_certificates(
    ca_id: int | None = Query(default=None),
    cert_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    expiring_days: int | None = Query(default=None, description="Show certs expiring within N days"),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[Certificate]:
    query = db.query(Certificate)
    if ca_id is not None:
        query = query.filter(Certificate.ca_id == ca_id)
    if cert_type:
        query = query.filter(Certificate.cert_type == cert_type)
    if status_filter:
        query = query.filter(Certificate.status == status_filter)
    if q:
        like = f"%{q}%"
        from sqlalchemy import or_
        query = query.filter(or_(Certificate.common_name.ilike(like), Certificate.issued_to.ilike(like), Certificate.serial_number.ilike(like)))
    if expiring_days is not None:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None)
        from datetime import timedelta
        limit = cutoff + timedelta(days=expiring_days)
        query = query.filter(Certificate.expires_at.isnot(None), Certificate.expires_at <= limit, Certificate.status == "active")
    return query.order_by(Certificate.expires_at.asc().nullslast()).all()


@router.post("/certificates", response_model=CertificateRead, status_code=status.HTTP_201_CREATED)
def create_certificate(payload: CertificateCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> Certificate:
    if payload.ca_id and not db.query(CertificateAuthority).filter(CertificateAuthority.id == payload.ca_id).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CA not found")
    cert = Certificate(**payload.model_dump())
    db.add(cert); db.commit(); db.refresh(cert)
    return cert


@router.get("/certificates/{cert_id}", response_model=CertificateRead)
def get_certificate(cert_id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> Certificate:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    return cert


@router.patch("/certificates/{cert_id}", response_model=CertificateRead)
def update_certificate(cert_id: int, payload: CertificateUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> Certificate:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(cert, field, value)
    db.commit(); db.refresh(cert)
    return cert


@router.delete("/certificates/{cert_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_certificate(cert_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> None:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    db.delete(cert); db.commit()


@router.post("/certificates/{cert_id}/revoke", response_model=CertificateRead)
def revoke_certificate(cert_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> Certificate:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    cert.status = "revoked"
    cert.revoked_at = datetime.utcnow()
    db.commit(); db.refresh(cert)
    return cert


# ── Expiry summary ────────────────────────────────────────────────────────────

@router.get("/expiry-summary", response_model=dict)
def expiry_summary(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> dict:
    from datetime import timedelta
    now = datetime.utcnow()
    active = db.query(func.count(Certificate.id)).filter(Certificate.status == "active").scalar() or 0
    expired = db.query(func.count(Certificate.id)).filter(Certificate.status == "expired").scalar() or 0
    revoked = db.query(func.count(Certificate.id)).filter(Certificate.status == "revoked").scalar() or 0
    exp_30 = db.query(func.count(Certificate.id)).filter(Certificate.status == "active", Certificate.expires_at.isnot(None), Certificate.expires_at <= now + timedelta(days=30)).scalar() or 0
    exp_90 = db.query(func.count(Certificate.id)).filter(Certificate.status == "active", Certificate.expires_at.isnot(None), Certificate.expires_at <= now + timedelta(days=90)).scalar() or 0
    return {"active": active, "expired": expired, "revoked": revoked, "expiring_30d": exp_30, "expiring_90d": exp_90}
