"""Phase 9 – PKI Certificate Management API, including Let's Encrypt ACME issuance."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_permission
from app.db import get_db
from app.models import AcmeHttpChallenge, Certificate, CertificateAuthority
from app.modules.acme_client import AcmeError, generate_rsa_pem, names_for_order, validate_acme_names
from app.modules.acme_issue import complete_issue, dns_records_from_pending, http_urls_from_pending, load_pending, start_issue
from app.schemas import (
    AcmeIssueRequest,
    AcmeIssueResponse,
    CertificateAuthorityCreate,
    CertificateAuthorityRead,
    CertificateAuthorityUpdate,
    CertificateCreate,
    CertificateRead,
    CertificateUpdate,
)

router = APIRouter(prefix="/api/v1/pki", tags=["pki"])


def _ca_read(ca: CertificateAuthority) -> CertificateAuthorityRead:
    data = CertificateAuthorityRead.model_validate(ca)
    return data.model_copy(update={"has_dns_credential": bool(ca.dns_api_token)})


def _cert_read(cert: Certificate) -> CertificateRead:
    data = CertificateRead.model_validate(cert)
    pending = load_pending(cert)
    return data.model_copy(
        update={
            "has_private_key": bool(cert.private_key_pem),
            "has_certificate": bool(cert.certificate_pem),
            "acme_dns_records": dns_records_from_pending(pending) or None,
            "acme_http_urls": http_urls_from_pending(pending) or None,
        }
    )


def _acme_http(detail: str, code: int = status.HTTP_400_BAD_REQUEST) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


# ── Certificate Authorities ───────────────────────────────────────────────────

@router.get("/cas", response_model=list[CertificateAuthorityRead])
def list_cas(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> list[CertificateAuthorityRead]:
    return [_ca_read(ca) for ca in db.query(CertificateAuthority).order_by(CertificateAuthority.name).all()]


@router.post("/cas", response_model=CertificateAuthorityRead, status_code=status.HTTP_201_CREATED)
def create_ca(payload: CertificateAuthorityCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> CertificateAuthorityRead:
    data = payload.model_dump()
    kind = data.get("kind") or "internal"
    if kind == "acme":
        if not data.get("acme_email"):
            raise _acme_http("Let's Encrypt needs an account email")
        if not data.get("acme_tos_agreed"):
            raise _acme_http("Agree to the Let's Encrypt Terms of Service to issue certificates")
        data["is_root"] = False
        data["acme_directory"] = data.get("acme_directory") or "letsencrypt"
        if data["acme_directory"] not in {"letsencrypt", "letsencrypt-staging"}:
            raise _acme_http("acme_directory must be letsencrypt or letsencrypt-staging")
        provider = data.get("dns_provider") or "manual"
        if provider not in {"manual", "internal", "cloudflare"}:
            raise _acme_http("dns_provider must be manual, internal, or cloudflare")
        if provider == "cloudflare" and not data.get("dns_api_token"):
            raise _acme_http("Cloudflare DNS needs an API token with Zone.DNS edit")
        data["acme_account_key_pem"] = generate_rsa_pem()
    ca = CertificateAuthority(**data)
    db.add(ca)
    db.commit()
    db.refresh(ca)
    return _ca_read(ca)


@router.patch("/cas/{ca_id}", response_model=CertificateAuthorityRead)
def update_ca(ca_id: int, payload: CertificateAuthorityUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> CertificateAuthorityRead:
    ca = db.query(CertificateAuthority).filter(CertificateAuthority.id == ca_id).first()
    if not ca:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CA not found")
    data = {key: value for key, value in payload.model_dump(exclude_none=True).items() if value != ""}
    if ca.kind == "acme":
        provider = data.get("dns_provider", ca.dns_provider)
        if provider not in {"manual", "internal", "cloudflare"}:
            raise _acme_http("dns_provider must be manual, internal, or cloudflare")
        token = data.get("dns_api_token", ca.dns_api_token)
        if provider == "cloudflare" and not token:
            raise _acme_http("Cloudflare DNS needs an API token with Zone.DNS edit")
    for field, value in data.items():
        setattr(ca, field, value)
    db.commit()
    db.refresh(ca)
    return _ca_read(ca)


@router.delete("/cas/{ca_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_ca(ca_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> None:
    ca = db.query(CertificateAuthority).filter(CertificateAuthority.id == ca_id).first()
    if not ca:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CA not found")
    db.delete(ca)
    db.commit()


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
) -> list[CertificateRead]:
    query = db.query(Certificate)
    if ca_id is not None:
        query = query.filter(Certificate.ca_id == ca_id)
    if cert_type:
        query = query.filter(Certificate.cert_type == cert_type)
    if status_filter:
        query = query.filter(Certificate.status == status_filter)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Certificate.common_name.ilike(like), Certificate.issued_to.ilike(like), Certificate.serial_number.ilike(like)))
    if expiring_days is not None:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None)
        limit = cutoff + timedelta(days=expiring_days)
        query = query.filter(Certificate.expires_at.isnot(None), Certificate.expires_at <= limit, Certificate.status == "active")
    return [_cert_read(row) for row in query.order_by(Certificate.expires_at.asc().nullslast()).all()]


@router.post("/certificates", response_model=CertificateRead, status_code=status.HTTP_201_CREATED)
def create_certificate(payload: CertificateCreate, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> CertificateRead:
    ca = None
    if payload.ca_id:
        ca = db.query(CertificateAuthority).filter(CertificateAuthority.id == payload.ca_id).first()
        if not ca:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CA not found")
    data = payload.model_dump()
    if ca and ca.kind == "acme":
        try:
            validate_acme_names(names_for_order(payload.common_name, payload.subject_alt_names))
        except AcmeError as exc:
            raise _acme_http(str(exc)) from exc
        data["status"] = "pending"
        if payload.common_name.startswith("*."):
            data["cert_type"] = "wildcard"
    cert = Certificate(**data)
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return _cert_read(cert)


@router.get("/certificates/{cert_id}", response_model=CertificateRead)
def get_certificate(cert_id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> CertificateRead:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    return _cert_read(cert)


@router.patch("/certificates/{cert_id}", response_model=CertificateRead)
def update_certificate(cert_id: int, payload: CertificateUpdate, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> CertificateRead:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(cert, field, value)
    db.commit()
    db.refresh(cert)
    return _cert_read(cert)


@router.delete("/certificates/{cert_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_certificate(cert_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> None:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    db.delete(cert)
    db.commit()


@router.post("/certificates/{cert_id}/revoke", response_model=CertificateRead)
def revoke_certificate(cert_id: int, db: Session = Depends(get_db), _: object = Depends(require_permission("pki:write"))) -> CertificateRead:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    cert.status = "revoked"
    cert.revoked_at = datetime.utcnow()
    db.commit()
    db.refresh(cert)
    return _cert_read(cert)


@router.post("/certificates/{cert_id}/acme/issue", response_model=AcmeIssueResponse)
def acme_issue_certificate(
    cert_id: int,
    payload: AcmeIssueRequest | None = None,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("pki:write")),
) -> AcmeIssueResponse:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    ca = db.query(CertificateAuthority).filter(CertificateAuthority.id == cert.ca_id).first() if cert.ca_id else None
    if not ca or ca.kind != "acme":
        raise _acme_http("Pick a Let's Encrypt CA to issue a signed certificate")
    try:
        result = start_issue(db, cert, ca, (payload.challenge_type if payload else None))
    except AcmeError as exc:
        cert.acme_error = str(exc)
        db.commit()
        db.refresh(cert)
        raise _acme_http(str(exc)) from exc
    db.refresh(cert)
    return AcmeIssueResponse(certificate=_cert_read(cert), **{k: result[k] for k in ("status", "message", "dns_records", "http_urls")})


@router.post("/certificates/{cert_id}/acme/complete", response_model=AcmeIssueResponse)
def acme_complete_certificate(
    cert_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("pki:write")),
) -> AcmeIssueResponse:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    ca = db.query(CertificateAuthority).filter(CertificateAuthority.id == cert.ca_id).first() if cert.ca_id else None
    if not ca or ca.kind != "acme":
        raise _acme_http("Pick a Let's Encrypt CA to issue a signed certificate")
    try:
        result = complete_issue(db, cert, ca, wait_seconds=0)
    except AcmeError as exc:
        cert.acme_error = str(exc)
        db.commit()
        db.refresh(cert)
        raise _acme_http(str(exc)) from exc
    db.refresh(cert)
    return AcmeIssueResponse(certificate=_cert_read(cert), **{k: result[k] for k in ("status", "message", "dns_records", "http_urls")})


@router.get("/certificates/{cert_id}/pem")
def download_pem(
    cert_id: int,
    part: str = Query(default="fullchain"),
    db: Session = Depends(get_db),
    _: object = Depends(require_permission("pki:write")),
) -> Response:
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    mapping = {
        "cert": (cert.certificate_pem, f"{cert.common_name}.crt"),
        "chain": (cert.chain_pem, f"{cert.common_name}.chain.crt"),
        "fullchain": (
            ((cert.certificate_pem or "") + (cert.chain_pem or "")).strip() + "\n" if cert.certificate_pem else None,
            f"{cert.common_name}.fullchain.pem",
        ),
        "key": (cert.private_key_pem, f"{cert.common_name}.key"),
    }
    if part not in mapping:
        raise _acme_http("part must be cert, chain, fullchain, or key")
    body, filename = mapping[part]
    if not body:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That PEM is not available yet")
    safe_name = filename.replace("*", "wildcard").replace("/", "_")
    return Response(
        content=body,
        media_type="application/x-pem-file",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


# ── Expiry summary ────────────────────────────────────────────────────────────

@router.get("/expiry-summary", response_model=dict)
def expiry_summary(db: Session = Depends(get_db), _: object = Depends(get_current_user)) -> dict:
    now = datetime.utcnow()
    active = db.query(func.count(Certificate.id)).filter(Certificate.status == "active").scalar() or 0
    expired = db.query(func.count(Certificate.id)).filter(Certificate.status == "expired").scalar() or 0
    revoked = db.query(func.count(Certificate.id)).filter(Certificate.status == "revoked").scalar() or 0
    exp_30 = db.query(func.count(Certificate.id)).filter(Certificate.status == "active", Certificate.expires_at.isnot(None), Certificate.expires_at <= now + timedelta(days=30)).scalar() or 0
    exp_90 = db.query(func.count(Certificate.id)).filter(Certificate.status == "active", Certificate.expires_at.isnot(None), Certificate.expires_at <= now + timedelta(days=90)).scalar() or 0
    return {"active": active, "expired": expired, "revoked": revoked, "expiring_30d": exp_30, "expiring_90d": exp_90}


@router.get("/acme-challenge/{token}", include_in_schema=False)
def acme_challenge_alias(token: str, db: Session = Depends(get_db)) -> Response:
    return _http01_body(token, db)


def http01_response(token: str, db: Session) -> Response:
    return _http01_body(token, db)


def _http01_body(token: str, db: Session) -> Response:
    row = db.query(AcmeHttpChallenge).filter(AcmeHttpChallenge.token == token).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown ACME challenge")
    return Response(content=row.key_authorization, media_type="text/plain")
