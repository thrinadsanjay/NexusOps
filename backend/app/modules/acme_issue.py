"""Issue and complete Let's Encrypt certificates using ACME + DNS/HTTP challenges."""

from __future__ import annotations

import json
import time

import httpx
from sqlalchemy.orm import Session

from app.models import AcmeHttpChallenge, Certificate, CertificateAuthority, DnsRecord, DnsZone
from app.modules.acme_client import (
    AcmeChallenge,
    AcmeClient,
    AcmeError,
    build_csr,
    directory_url,
    generate_rsa_pem,
    names_for_order,
    parse_cert_expiry,
    split_pem_chain,
    validate_acme_names,
)

CF_API = "https://api.cloudflare.com/client/v4"
DOH_URL = "https://cloudflare-dns.com/dns-query"


def pending_payload(challenges: list[AcmeChallenge], extra: dict | None = None) -> str:
    data = {
        "challenges": [
            {
                "identifier": item.identifier,
                "type": item.type,
                "url": item.url,
                "token": item.token,
                "key_authorization": item.key_authorization,
                "record_name": item.record_name,
                "record_value": item.record_value,
            }
            for item in challenges
        ],
        **(extra or {}),
    }
    return json.dumps(data)


def load_pending(cert: Certificate) -> dict:
    if not cert.acme_pending_json:
        return {}
    try:
        return json.loads(cert.acme_pending_json)
    except json.JSONDecodeError:
        return {}


def dns_records_from_pending(pending: dict) -> list[dict]:
    records = []
    for item in pending.get("challenges") or []:
        if item.get("type") == "dns-01" and item.get("record_name") and item.get("record_value"):
            records.append({"name": item["record_name"], "type": "TXT", "value": item["record_value"]})
    return records


def http_urls_from_pending(pending: dict) -> list[str]:
    return [
        f"http://{item['identifier']}/.well-known/acme-challenge/{item['token']}"
        for item in pending.get("challenges") or []
        if item.get("type") == "http-01" and item.get("identifier") and item.get("token")
    ]


def lookup_public_txt(name: str) -> list[str]:
    response = httpx.get(
        DOH_URL,
        params={"name": name.rstrip("."), "type": "TXT"},
        headers={"Accept": "application/dns-json"},
        timeout=10,
    )
    response.raise_for_status()
    body = response.json()
    values: list[str] = []
    for row in body.get("Answer") or []:
        if int(row.get("type") or 0) != 16:
            continue
        raw = str(row.get("data") or "").strip()
        if raw.startswith('"') and raw.endswith('"'):
            raw = raw[1:-1]
        values.append(raw.replace('" "', ""))
    return values


def assert_public_dns01(pending: dict, lookup=lookup_public_txt) -> None:
    records = dns_records_from_pending(pending)
    if not records:
        return
    missing: list[str] = []
    checked = 0
    for rec in records:
        try:
            seen = lookup(rec["name"])
        except Exception:
            continue
        checked += 1
        if rec["value"] not in seen:
            missing.append(rec["name"])
    if checked and missing:
        names = ", ".join(missing)
        raise AcmeError(
            f"Public DNS does not have the required TXT records yet ({names}). "
            "Add them at the registrar or Cloudflare for this domain (not only in NexusOps DNS), "
            "wait until they resolve, then click Complete issuance. "
            "Do not click Retry after publishing — that creates new tokens."
        )


def choose_challenge_type(names: list[str], requested: str | None) -> str:
    wanted = (requested or "").strip() or None
    wildcard = any(name.startswith("*.") for name in names)
    if wanted == "http-01" and wildcard:
        raise AcmeError("Wildcard names require DNS-01. Let's Encrypt cannot validate *.domains over HTTP.")
    if wanted in {"http-01", "dns-01"}:
        return wanted
    # Homelab hosts are rarely reachable on public port 80, so DNS-01 is the default.
    return "dns-01"


def start_issue(db: Session, cert: Certificate, ca: CertificateAuthority, challenge_type: str | None = None) -> dict:
    if ca.kind != "acme":
        raise AcmeError("This CA does not issue Let's Encrypt certificates")
    if not ca.acme_email:
        raise AcmeError("Let's Encrypt requires an account email on the CA")
    if not ca.acme_tos_agreed:
        raise AcmeError("Agree to the Let's Encrypt Terms of Service on the CA first")

    names = names_for_order(cert.common_name, cert.subject_alt_names)
    if not names:
        raise AcmeError("Certificate needs a DNS name")
    validate_acme_names(names)
    selected_type = choose_challenge_type(names, challenge_type)
    if "*" in "".join(names) and selected_type != "dns-01":
        raise AcmeError("Wildcard names require DNS-01")

    if not cert.private_key_pem:
        cert.private_key_pem = generate_rsa_pem()
    if not ca.acme_account_key_pem:
        ca.acme_account_key_pem = generate_rsa_pem()

    cert.acme_challenge_type = selected_type
    cert.acme_error = None
    cert.status = "pending"

    with AcmeClient(directory_url(ca.acme_directory), ca.acme_account_key_pem, ca.acme_account_url) as client:
        ca.acme_account_url = client.ensure_account(ca.acme_email, ca.acme_tos_agreed)
        order = client.new_order(names)
        cert.acme_order_url = order.url
        challenges = client.select_challenges(order, selected_type)
        extra: dict = {}
        if selected_type == "http-01":
            _store_http_challenges(db, cert, challenges)
        else:
            extra = _publish_dns(db, ca, challenges)
        cert.acme_pending_json = pending_payload(challenges, extra)
        db.commit()
        db.refresh(cert)

        if ca.dns_provider == "cloudflare" and selected_type == "dns-01":
            try:
                return complete_issue(db, cert, ca, wait_seconds=25)
            except AcmeError as exc:
                cert.acme_error = str(exc)
                db.commit()
                db.refresh(cert)
                return _pending_result(cert, started=True, message=str(exc))

    return _pending_result(cert, started=True)


def complete_issue(db: Session, cert: Certificate, ca: CertificateAuthority, wait_seconds: float = 2) -> dict:
    pending = load_pending(cert)
    if not cert.acme_order_url or not pending.get("challenges"):
        raise AcmeError("No pending Let's Encrypt order. Start issuance first.")
    if not cert.private_key_pem:
        raise AcmeError("Certificate key is missing")
    if wait_seconds > 0:
        time.sleep(wait_seconds)

    names = names_for_order(cert.common_name, cert.subject_alt_names)
    with AcmeClient(directory_url(ca.acme_directory), ca.acme_account_key_pem or "", ca.acme_account_url) as client:
        current = client.load_order(cert.acme_order_url)
        if current.status == "invalid":
            raise AcmeError(
                "This Let's Encrypt order already failed. Click Retry with DNS-01, "
                "publish the new TXT records on public DNS, wait, then Complete issuance."
            )
        if current.status not in {"ready", "valid"}:
            assert_public_dns01(pending)
        for item in pending["challenges"]:
            client.answer_challenge(item["url"])
        order = client.wait_order(cert.acme_order_url)
        if order.status == "invalid":
            detail = client.authorization_error_detail(order)
            if detail:
                raise AcmeError(detail)
            raise AcmeError(
                "Let's Encrypt could not validate the challenge. For a hostname like "
                "lab-prd-server01.sanjay-lab.online use DNS-01: publish the TXT records, wait, then complete."
            )
        if order.status != "ready" and order.status != "valid":
            raise AcmeError(f"Order is not ready yet (status={order.status})")
        if order.status != "valid":
            csr = build_csr(cert.private_key_pem, names)
            order = client.finalize(order, csr)
        elif not order.certificate:
            csr = build_csr(cert.private_key_pem, names)
            order = client.finalize(order, csr)
        bundle = client.fetch_certificate(order.certificate or "")
        leaf, chain = split_pem_chain(bundle)
        issued, expires, serial, fingerprint = parse_cert_expiry(leaf)
        cert.certificate_pem = leaf
        cert.chain_pem = chain or None
        cert.issued_at = issued
        cert.expires_at = expires
        cert.serial_number = serial
        cert.fingerprint = fingerprint
        cert.status = "active"
        cert.acme_error = None
        cert.acme_pending_json = None
        db.query(AcmeHttpChallenge).filter(AcmeHttpChallenge.certificate_id == cert.id).delete()
        _cleanup_dns(db, ca, pending)
        db.commit()
        db.refresh(cert)
        return {
            "status": "issued",
            "message": "Let's Encrypt signed the certificate.",
            "dns_records": [],
            "http_urls": [],
        }


def _store_http_challenges(db: Session, cert: Certificate, challenges: list[AcmeChallenge]) -> None:
    db.query(AcmeHttpChallenge).filter(AcmeHttpChallenge.certificate_id == cert.id).delete()
    for item in challenges:
        if item.type != "http-01":
            continue
        db.add(AcmeHttpChallenge(token=item.token, key_authorization=item.key_authorization, certificate_id=cert.id))


def _publish_dns(db: Session, ca: CertificateAuthority, challenges: list[AcmeChallenge]) -> dict:
    extra: dict = {"cf_records": []}
    if ca.dns_provider == "internal":
        for item in challenges:
            if item.type != "dns-01" or not item.record_name or not item.record_value:
                continue
            _upsert_internal_txt(db, item.record_name, item.record_value)
        return extra
    if ca.dns_provider == "cloudflare":
        if not ca.dns_api_token:
            raise AcmeError("Cloudflare API token is missing on this CA")
        for item in challenges:
            if item.type != "dns-01" or not item.record_name or not item.record_value:
                continue
            record_id, zone_id = _cloudflare_upsert_txt(ca.dns_api_token, item.record_name, item.record_value)
            extra["cf_records"].append({"id": record_id, "zone_id": zone_id, "name": item.record_name})
        return extra
    return extra


def _cleanup_dns(db: Session, ca: CertificateAuthority, pending: dict) -> None:
    if ca.dns_provider == "internal":
        for item in pending.get("challenges") or []:
            if item.get("record_name"):
                _delete_internal_txt(db, item["record_name"], item.get("record_value"))
    if ca.dns_provider == "cloudflare" and ca.dns_api_token:
        for item in pending.get("cf_records") or []:
            try:
                _cloudflare_delete(ca.dns_api_token, item["zone_id"], item["id"])
            except Exception:
                pass


def _best_zone(db: Session, fqdn: str) -> DnsZone | None:
    host = fqdn.lower().rstrip(".")
    zones = db.query(DnsZone).filter(DnsZone.kind == "forward").all()
    matches = [z for z in zones if host == z.name.lower() or host.endswith("." + z.name.lower())]
    matches.sort(key=lambda z: len(z.name), reverse=True)
    return matches[0] if matches else None


def _relative_name(zone: DnsZone, fqdn: str) -> str:
    host = fqdn.lower().rstrip(".")
    zone_name = zone.name.lower().rstrip(".")
    if host == zone_name:
        return "@"
    suffix = "." + zone_name
    if host.endswith(suffix):
        return host[: -len(suffix)]
    return host


def _upsert_internal_txt(db: Session, fqdn: str, value: str) -> None:
    zone = _best_zone(db, fqdn)
    if not zone:
        raise AcmeError(
            f"No NexusOps DNS zone covers {fqdn}. Add the zone first, or use Cloudflare / publish the TXT yourself."
        )
    relative = _relative_name(zone, fqdn)
    existing = (
        db.query(DnsRecord)
        .filter(DnsRecord.zone_id == zone.id, DnsRecord.record_type == "TXT", DnsRecord.name == relative, DnsRecord.comment == "acme-challenge")
        .all()
    )
    if existing:
        existing[0].value = value
        for extra in existing[1:]:
            db.delete(extra)
        return
    db.add(DnsRecord(zone_id=zone.id, name=relative, record_type="TXT", value=value, ttl=60, comment="acme-challenge"))


def _delete_internal_txt(db: Session, fqdn: str, value: str | None) -> None:
    zone = _best_zone(db, fqdn)
    if not zone:
        return
    relative = _relative_name(zone, fqdn)
    q = db.query(DnsRecord).filter(DnsRecord.zone_id == zone.id, DnsRecord.record_type == "TXT", DnsRecord.name == relative, DnsRecord.comment == "acme-challenge")
    if value:
        q = q.filter(DnsRecord.value == value)
    for row in q.all():
        db.delete(row)


def _cf_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _cloudflare_zone_id(token: str, fqdn: str) -> str:
    host = fqdn.lower().rstrip(".")
    parts = host.split(".")
    with httpx.Client(timeout=20) as client:
        for i in range(len(parts) - 1):
            name = ".".join(parts[i:])
            response = client.get(f"{CF_API}/zones", params={"name": name}, headers=_cf_headers(token))
            data = response.json()
            if response.status_code == 200 and data.get("result"):
                return data["result"][0]["id"]
    raise AcmeError(f"Cloudflare zone not found for {fqdn}. Check the API token permissions.")


def _cloudflare_upsert_txt(token: str, fqdn: str, value: str) -> tuple[str, str]:
    zone_id = _cloudflare_zone_id(token, fqdn)
    with httpx.Client(timeout=20) as client:
        listed = client.get(
            f"{CF_API}/zones/{zone_id}/dns_records",
            params={"type": "TXT", "name": fqdn},
            headers=_cf_headers(token),
        )
        listed.raise_for_status()
        for row in listed.json().get("result") or []:
            if row.get("content") == value:
                return row["id"], zone_id
        created = client.post(
            f"{CF_API}/zones/{zone_id}/dns_records",
            headers=_cf_headers(token),
            json={"type": "TXT", "name": fqdn, "content": value, "ttl": 60},
        )
        body = created.json()
        if created.status_code not in {200, 201} or not body.get("success"):
            errors = body.get("errors") or [{"message": created.text}]
            raise AcmeError(errors[0].get("message") or "Cloudflare TXT create failed")
        return body["result"]["id"], zone_id


def _cloudflare_delete(token: str, zone_id: str, record_id: str) -> None:
    with httpx.Client(timeout=20) as client:
        client.delete(f"{CF_API}/zones/{zone_id}/dns_records/{record_id}", headers=_cf_headers(token))


def _pending_result(cert: Certificate, started: bool, message: str | None = None) -> dict:
    pending = load_pending(cert)
    records = dns_records_from_pending(pending)
    http_urls = [
        f"http://{item['identifier']}/.well-known/acme-challenge/{item['token']}"
        for item in pending.get("challenges") or []
        if item.get("type") == "http-01"
    ]
    if cert.acme_challenge_type == "dns-01":
        default = (
            "Publish these TXT records on the public DNS for the domain, wait a minute, then click Complete issuance."
            if not records
            else "Add the TXT records below at the public DNS host for this domain (Cloudflare or registrar — not only NexusOps DNS). Wait until they resolve, then Complete issuance. Do not Retry after publishing."
        )
    else:
        default = "Let's Encrypt will fetch the HTTP challenge on port 80. Point the hostname at this NexusOps host, or switch to DNS-01."
    return {
        "status": "pending_dns" if cert.acme_challenge_type == "dns-01" else "pending_http",
        "message": message or default,
        "dns_records": records,
        "http_urls": http_urls,
        "started": started,
    }
