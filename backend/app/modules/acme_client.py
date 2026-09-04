"""Let's Encrypt ACME v2 client (RFC 8555) using RSA account and certificate keys."""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID

LE_DIRECTORY = "https://acme-v02.api.letsencrypt.org/directory"
LE_STAGING_DIRECTORY = "https://acme-staging-v02.api.letsencrypt.org/directory"

DIRECTORY_URLS = {
    "letsencrypt": LE_DIRECTORY,
    "letsencrypt-staging": LE_STAGING_DIRECTORY,
}

USER_AGENT = "NexusOps/0.1 ACME"


class AcmeError(Exception):
    pass


def directory_url(value: str | None) -> str:
    if not value:
        return LE_DIRECTORY
    if value in DIRECTORY_URLS:
        return DIRECTORY_URLS[value]
    if value.startswith("https://"):
        return value
    raise AcmeError(f"Unknown ACME directory '{value}'")


def b64url(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def generate_rsa_pem(bits: int = 2048) -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


def load_rsa(pem: str) -> rsa.RSAPrivateKey:
    key = serialization.load_pem_private_key(pem.encode(), password=None)
    if not isinstance(key, rsa.RSAPrivateKey):
        raise AcmeError("Account key must be RSA")
    return key


def jwk_for(key: rsa.RSAPrivateKey) -> dict:
    pub = key.public_key().public_numbers()
    n = pub.n.to_bytes((pub.n.bit_length() + 7) // 8, "big")
    e = pub.e.to_bytes((pub.e.bit_length() + 7) // 8, "big")
    return {"e": b64url(e), "kty": "RSA", "n": b64url(n)}


def jwk_thumbprint(key: rsa.RSAPrivateKey) -> str:
    jwk = jwk_for(key)
    canonical = json.dumps({"e": jwk["e"], "kty": "RSA", "n": jwk["n"]}, separators=(",", ":"), sort_keys=True)
    return b64url(hashlib.sha256(canonical.encode()).digest())


def names_for_order(common_name: str, sans: str | None) -> list[str]:
    names: list[str] = []
    for raw in [common_name, *(sans or "").split(",")]:
        name = raw.strip().lower().rstrip(".")
        if name and name not in names:
            names.append(name)
    extra: list[str] = []
    for name in names:
        if name.startswith("*."):
            apex = name[2:]
            if apex and apex not in names and apex not in extra:
                extra.append(apex)
    return names + extra


def dns_challenge_name(identifier: str) -> str:
    host = identifier[2:] if identifier.startswith("*.") else identifier
    return f"_acme-challenge.{host}"


def dns01_txt_value(key_authorization: str) -> str:
    return b64url(hashlib.sha256(key_authorization.encode()).digest())


def build_csr(private_key_pem: str, names: list[str]) -> bytes:
    key = load_rsa(private_key_pem)
    cn = names[0][2:] if names[0].startswith("*.") else names[0]
    builder = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)]))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName(n) for n in names]), critical=False)
    )
    csr = builder.sign(key, hashes.SHA256())
    return csr.public_bytes(serialization.Encoding.DER)


def parse_cert_expiry(pem: str) -> tuple[datetime | None, datetime | None, str | None, str | None]:
    cert = x509.load_pem_x509_certificate(pem.encode())
    issued = _aware_naive(cert.not_valid_before_utc if hasattr(cert, "not_valid_before_utc") else cert.not_valid_before)
    expires = _aware_naive(cert.not_valid_after_utc if hasattr(cert, "not_valid_after_utc") else cert.not_valid_after)
    serial = format(cert.serial_number, "x")
    fingerprint = cert.fingerprint(hashes.SHA256()).hex()
    return issued, expires, serial, fingerprint


def split_pem_chain(bundle: str) -> tuple[str, str]:
    blocks = re.findall(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", bundle, re.S)
    if not blocks:
        raise AcmeError("ACME returned an empty certificate chain")
    leaf = blocks[0] + "\n"
    chain = "\n".join(blocks[1:]) + ("\n" if len(blocks) > 1 else "")
    return leaf, chain


def _aware_naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


@dataclass
class AcmeChallenge:
    identifier: str
    type: str
    url: str
    token: str
    key_authorization: str
    status: str = "pending"
    record_name: str | None = None
    record_value: str | None = None


@dataclass
class AcmeOrder:
    url: str
    status: str
    finalize: str
    certificate: str | None = None
    challenges: list[AcmeChallenge] = field(default_factory=list)
    authorizations: list[str] = field(default_factory=list)


class AcmeClient:
    def __init__(self, directory_url: str, account_key_pem: str, account_url: str | None = None, timeout: float = 30.0):
        self.directory_url = directory_url
        self.account_key_pem = account_key_pem
        self.account_url = account_url
        self._key = load_rsa(account_key_pem)
        self._directory: dict | None = None
        self._nonce: str | None = None
        self._http = httpx.Client(timeout=timeout, follow_redirects=True, headers={"User-Agent": USER_AGENT})

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "AcmeClient":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def directory(self) -> dict:
        if self._directory is None:
            response = self._http.get(self.directory_url)
            response.raise_for_status()
            self._directory = response.json()
            self._nonce = response.headers.get("Replay-Nonce") or self._nonce
        return self._directory

    def ensure_account(self, email: str, tos_agreed: bool = True) -> str:
        if self.account_url:
            return self.account_url
        if not tos_agreed:
            raise AcmeError("You must agree to the Let's Encrypt Terms of Service")
        directory = self.directory()
        payload = {
            "termsOfServiceAgreed": True,
            "contact": [f"mailto:{email}"],
        }
        body, response = self._signed_post(directory["newAccount"], payload)
        location = response.headers.get("Location")
        if response.status_code not in {200, 201} or not location:
            raise AcmeError(_problem(body, response))
        self.account_url = location
        return location

    def new_order(self, names: list[str]) -> AcmeOrder:
        directory = self.directory()
        payload = {"identifiers": [{"type": "dns", "value": name} for name in names]}
        body, response = self._signed_post(directory["newOrder"], payload)
        if response.status_code not in {201, 200}:
            raise AcmeError(_problem(body, response))
        order_url = response.headers.get("Location") or ""
        return self._order_from_body(order_url, body)

    def load_order(self, order_url: str) -> AcmeOrder:
        body, response = self._signed_post(order_url, None)
        if response.status_code != 200:
            raise AcmeError(_problem(body, response))
        return self._order_from_body(order_url, body)

    def answer_challenge(self, challenge_url: str) -> dict:
        body, response = self._signed_post(challenge_url, {})
        if response.status_code not in {200, 202}:
            raise AcmeError(_problem(body, response))
        return body

    def wait_order(self, order_url: str, timeout: float = 90.0) -> AcmeOrder:
        deadline = time.time() + timeout
        delay = 1.5
        last: AcmeOrder | None = None
        while time.time() < deadline:
            last = self.load_order(order_url)
            if last.status in {"ready", "valid", "invalid"}:
                return last
            time.sleep(delay)
            delay = min(delay * 1.4, 8)
        raise AcmeError(f"ACME order did not become ready (status={last.status if last else 'unknown'})")

    def authorization_error_detail(self, order: AcmeOrder) -> str:
        parts: list[str] = []
        for authz_url in order.authorizations:
            body, response = self._signed_post(authz_url, None)
            if response.status_code != 200 or not isinstance(body, dict):
                continue
            ident = body.get("identifier", {}).get("value") or "host"
            errors = []
            if isinstance(body.get("error"), dict) and body["error"].get("detail"):
                errors.append(str(body["error"]["detail"]))
            for challenge in body.get("challenges") or []:
                err = challenge.get("error") or {}
                if err.get("detail"):
                    errors.append(str(err["detail"]))
            if errors:
                parts.append(f"{ident}: {errors[0]}")
        return "; ".join(parts)

    def finalize(self, order: AcmeOrder, csr_der: bytes) -> AcmeOrder:
        body, response = self._signed_post(order.finalize, {"csr": b64url(csr_der)})
        if response.status_code not in {200, 201}:
            raise AcmeError(_problem(body, response))
        current = self._order_from_body(order.url, body)
        if current.status != "valid":
            current = self.wait_order(order.url)
        if current.status != "valid" or not current.certificate:
            raise AcmeError(f"ACME finalize failed (status={current.status})")
        return current

    def fetch_certificate(self, certificate_url: str) -> str:
        body, response = self._signed_post(certificate_url, None, accept="application/pem-certificate-chain")
        if response.status_code != 200:
            if isinstance(body, dict):
                raise AcmeError(_problem(body, response))
            raise AcmeError(f"Failed to download certificate ({response.status_code})")
        if isinstance(body, str):
            return body
        return response.text

    def select_challenges(self, order: AcmeOrder, challenge_type: str) -> list[AcmeChallenge]:
        selected: list[AcmeChallenge] = []
        thumbprint = jwk_thumbprint(self._key)
        for authz_url in order.authorizations:
            body, response = self._signed_post(authz_url, None)
            if response.status_code != 200:
                raise AcmeError(_problem(body, response))
            identifier = body.get("identifier", {}).get("value") or ""
            wildcard = bool(body.get("wildcard"))
            if wildcard and not identifier.startswith("*."):
                identifier = f"*.{identifier}"
            wanted = "dns-01" if (challenge_type == "dns-01" or identifier.startswith("*.")) else "http-01"
            match = None
            for item in body.get("challenges") or []:
                if item.get("type") == wanted:
                    match = item
                    break
            if not match:
                raise AcmeError(f"No {wanted} challenge for {identifier}")
            token = match["token"]
            key_auth = f"{token}.{thumbprint}"
            challenge = AcmeChallenge(
                identifier=identifier,
                type=wanted,
                url=match["url"],
                token=token,
                key_authorization=key_auth,
                status=match.get("status") or "pending",
            )
            if wanted == "dns-01":
                challenge.record_name = dns_challenge_name(identifier)
                challenge.record_value = dns01_txt_value(key_auth)
            selected.append(challenge)
        order.challenges = selected
        return selected

    def _order_from_body(self, url: str, body: dict) -> AcmeOrder:
        return AcmeOrder(
            url=url,
            status=body.get("status") or "pending",
            finalize=body.get("finalize") or "",
            certificate=body.get("certificate"),
            authorizations=list(body.get("authorizations") or []),
        )

    def _signed_post(self, url: str, payload: dict | None, accept: str = "application/json") -> tuple[dict | str, httpx.Response]:
        directory = self.directory()
        nonce = self._nonce or self._http.head(directory["newNonce"]).headers["Replay-Nonce"]
        for _ in range(3):
            protected = {
                "alg": "RS256",
                "nonce": nonce,
                "url": url,
            }
            if self.account_url:
                protected["kid"] = self.account_url
            else:
                protected["jwk"] = jwk_for(self._key)
            protected_b64 = b64url(json.dumps(protected, separators=(",", ":"), sort_keys=True).encode())
            if payload is None:
                payload_b64 = ""
            else:
                payload_b64 = b64url(json.dumps(payload, separators=(",", ":")).encode())
            signing_input = f"{protected_b64}.{payload_b64}".encode()
            signature = self._key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
            body = {"protected": protected_b64, "payload": payload_b64, "signature": b64url(signature)}
            response = self._http.post(
                url,
                json=body,
                headers={"Content-Type": "application/jose+json", "Accept": accept},
            )
            nonce = response.headers.get("Replay-Nonce") or nonce
            self._nonce = nonce
            if response.status_code == 400:
                problem = _json_or_text(response)
                if isinstance(problem, dict) and str(problem.get("type", "")).endswith(":badNonce"):
                    continue
            parsed = _json_or_text(response)
            return parsed, response
        raise AcmeError("ACME nonce retry failed")


def _json_or_text(response: httpx.Response) -> dict | str:
    ctype = response.headers.get("Content-Type", "")
    if "json" in ctype:
        try:
            return response.json()
        except Exception:
            return response.text
    try:
        return response.json()
    except Exception:
        return response.text


def _problem(body: dict | str, response: httpx.Response) -> str:
    if isinstance(body, dict):
        detail = body.get("detail") or body.get("title") or body.get("type")
        if detail:
            return str(detail)
    return f"ACME request failed ({response.status_code})"
