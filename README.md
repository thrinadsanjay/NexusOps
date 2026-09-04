# NexusOps

**NexusOps** is a self-hosted Infrastructure Operations Platform built for homelabs and small enterprise environments. It provides a unified, browser-based control plane for network management, identity, security, device inventory, and platform operations — all running inside a single Docker Compose stack.

---

## Project Status

```
Project Status : Active Development
Current Phase  : Phase 10 (LDAP Integration)
```

| State | Areas |
|---|---|
| ✅ Implemented | Auth/RBAC, Network/IPAM, DNS, DHCP, Inventory, PKI, LDAP (in-app directory UI + bundled OpenLDAP), Dashboard, Audit, API tokens, CI/CD image publish, image-only server deploy |
| 🔄 In Progress | Diagnostics (ping/traceroute/port check), SMTP module |
| 📋 Planned | Ansible automation, n8n integration, Forge integration, PowerDNS backend, Kea DHCP backend, step-ca, SMTP relay (Postfix) |

### Recent additions

- **CI/CD** — GitHub Actions tests the API and UI, then builds and pushes `nexusops-backend` and `nexusops-frontend` to GHCR (`latest` on `Development`, plus branch/`sha-*` tags; semver on `v*` tags). Optional Docker Hub when repository secrets are set.
- **New-server deploy** — One compose file (`docker-compose.yml`) plus `.env.example` and `./nexusops` are mirrored to `main`. `./nexusops install` installs Docker Engine for Debian/Proxmox or RHEL and starts the stack.
- **LDAP in the product UI** — directory browse, bind test, user sync, and server registry live under **LDAP**. The old phpLDAPadmin sidecar (`nexusops-ldapadmin` on port 8082) is removed. Bundled **OpenLDAP** remains.
- **Public PyPI builds** — the backend image installs Python packages from `https://pypi.org/simple` unless you override `PIP_INDEX_URL`.
- **Frontend image** — SPA is built in CI (`node:20-bookworm-slim`) and **served by nginx**. The image does not run `vite` at container start (Vite/esbuild `ENOTCONN` on Proxmox LXC).

---

## Quick Start

### Local (build from source)

```bash
cp .env.example .env
docker compose up -d --build

# Seed the bundled LDAP directory (first run only)
docker compose cp ldap-bootstrap/init.ldif openldap:/tmp/init.ldif
docker compose exec openldap ldapadd -x -D "cn=admin,dc=homelab,dc=local" \
  -w NexusOps2024! -f /tmp/init.ldif
```

### Local (pull published images)

```bash
docker login ghcr.io
docker compose pull
docker compose up -d
```

### New server (clone `main`)

`main` is a deploy mirror of the same files used on `Development`:

- `docker-compose.yml`
- `.env.example`
- `README.md`
- `nexusops`

On the server:

```bash
git clone --branch main --single-branch https://github.com/thrinadsanjay/NexusOps.git /opt/nexusops
cd /opt/nexusops
./nexusops install
# first run: edit .env (PUBLIC_HOST, URLs, secrets) then ./nexusops restart
```

Or without the helper:

```bash
cp .env.example .env
docker compose pull
docker compose up -d
```

Later updates:

```bash
cd /opt/nexusops
git pull
./nexusops start          # pull + up -d
# or: docker compose pull && docker compose up -d
```

| Command | What it does |
|---|---|
| `./nexusops install` | Detect OS, install Docker CE + Compose + libseccomp, create `.env`, pull, start |
| `./nexusops start` | `docker compose pull && up -d` |
| `./nexusops stop` | Stop containers (data volumes kept) |
| `./nexusops uninstall` | Remove containers (`--purge` also deletes volumes) |

Do **not** clone `Development` onto a production host unless you intend to build from source. Application code and image builds stay on `Development`.

**Postgres on Proxmox/Debian** (`could not create Unix-domain socket in directory "/var/run/postgresql"`): initdb worked; the server cannot write its socket. Compose mounts a writable tmpfs on that path and health-checks over TCP. Recreate the container (keep the volume):

```bash
docker compose up -d --force-recreate postgres
```

**Backend `PermissionError: [Errno 13]` then uvloop `Cannot close a running event loop`**: the first error is the real one; uvloop noise is teardown. Common on Proxmox LXC. Compose now runs uvicorn with `--loop asyncio`, drops `NET_ADMIN`, and always points `DATABASE_URL` at the `postgres` service (not sqlite or localhost from a host `.env`). Recreate the API after `git pull`:

```bash
git pull
docker compose up -d --force-recreate backend worker
docker logs nexusops-backend --tail 80
```

If it still dies, the **first** `PermissionError` line (the file path) is the one that matters. Keep `postgres` healthy (`docker inspect --format '{{.State.Health.Status}}' nexusops-postgres`). A new backend image from CI is not required for the compose-side fix.

**Frontend `Error: read ENOTCONN` / `ensureServiceIsRunning` (esbuild/vite)**: the published UI image used to run `vite` (dev server) at start. Esbuild then spawns a helper; on Proxmox LXC that socket is `ENOTCONN` and the container loops. The image now **builds the SPA in CI and serves it with nginx**. After this lands on `main` and GHCR has the new `nexusops-frontend:latest`:

```bash
git pull
docker compose pull frontend
docker compose up -d --force-recreate frontend
docker logs nexusops-frontend --tail 40
```

`localhost` in `VITE_API_BASE_URL` is treated as same-origin: the UI calls `/api` on port 5173 and nginx proxies to the backend. Set `PUBLIC_HOST` to the host DNS/IP so CORS and a non-localhost API URL still match how you open the browser.

**Postgres `postmaster.pid`: Operation not permitted** (older Docker/`libseccomp` + Alpine): compose uses `postgres:16` (Debian). Only if initdb never finished, wipe the empty volume once:

```bash
docker compose down
docker volume rm nexusops_postgres_data
./nexusops start
```

`VITE_API_BASE_URL` and `FRONTEND_URL` must be URLs the **browser** uses (host IP or DNS), not Docker service names. See `DEPLOYMENT.md` on `Development` for GHCR login, package visibility, and LDAP seed.

| Service | URL |
|---|---|
| NexusOps UI | http://localhost:5173 |
| NexusOps API + Swagger | http://localhost:8000/docs |
| LDAP (in the UI) | http://localhost:5173/ldap |

**Default local admin:** `admin` / `ChangeMe123!`  
**Default LDAP users:** `nexusadmin` / `NexusOps2024!` · `operator1` / `Operator123!` · `viewer1` / `Viewer123!`

> Change all default passwords before any network-exposed deployment.

---

## Feature Reference

### ✅ Authentication & Access Control

| Feature | Status |
|---|---|
| Local username/password login | ✅ |
| LDAP authentication fallback | ✅ |
| LDAP user auto-provisioning on first login | ✅ |
| JWT access tokens | ✅ |
| Session management | ✅ |
| API tokens (create / list / revoke) | ✅ |
| Role-based access control (RBAC) | ✅ |
| Roles: admin, operator, viewer | ✅ |
| Permissions (15 granular scopes) | ✅ |
| Audit log | ✅ |

---

### ✅ Network / IPAM

| Feature | Status |
|---|---|
| VLAN registry (802.1Q) | ✅ |
| Subnet / CIDR registry | ✅ |
| IP address assignments | ✅ |
| Subnet utilization (used / available / %) | ✅ |
| Live host discovery scan (TCP + ICMP) | ✅ |
| Celery background scan task | ✅ |
| `SCAN_NETWORKS` env configuration | ✅ |
| Reverse DNS resolution during scan | ✅ |
| MAC address tracking | ✅ |
| Last-seen timestamps | ✅ |
| Import A records to DNS from IPAM scan | ✅ |
| Subnet/CIDR calculator | 📋 |
| Port/service discovery | 📋 |

---

### ✅ DNS Management

| Feature | Status |
|---|---|
| DNS zone registry (forward + reverse) | ✅ |
| Record types: A, AAAA, CNAME, MX, TXT, PTR, NS, SRV, SOA, CAA | ✅ |
| Default TTL per zone | ✅ |
| Per-record TTL override | ✅ |
| MX/SRV priority | ✅ |
| Cross-zone record search | ✅ |
| Auto-generate A records from IPAM scan results | ✅ |
| Reverse DNS / PTR records | ✅ (manual) |
| PowerDNS backend | 📋 |
| DNS diagnostics / lookup tool | 📋 |

---

### ✅ DHCP Management

| Feature | Status |
|---|---|
| DHCP server registry | ✅ |
| Address pool management | ✅ |
| Active lease tracking | ✅ |
| Static reservations | ✅ |
| Promote dynamic lease → static reservation | ✅ |
| Bulk lease import (JSON list) | ✅ |
| Lease expiry timestamps | ✅ |
| Kea DHCP backend | 📋 |

---

### ✅ Infrastructure Inventory

| Feature | Status |
|---|---|
| Host registry | ✅ |
| Hostname, FQDN, IP, MAC, OS, role, location | ✅ |
| Host groups | ✅ |
| Host tags (with colour labels) | ✅ |
| Status tracking (active / inactive / decommissioned / unknown) | ✅ |
| Import hosts from IPAM scan results | ✅ |
| Link hosts to IPAM subnets | ✅ |
| Filter by hostname, IP, role, status, group, tag | ✅ |
| Last-seen timestamps | ✅ |

---

### ✅ PKI – Certificate Management

| Feature | Status |
|---|---|
| Certificate Authority registry | ✅ |
| Root and intermediate CA tracking | ✅ |
| Certificate registry | ✅ |
| Types: server, client, wildcard, email | ✅ |
| Expiry tracking and 30/90-day warnings | ✅ |
| Certificate revocation | ✅ |
| Fingerprint and serial number fields | ✅ |
| Link certificate to inventory host | ✅ |
| Expiry summary dashboard widget | ✅ |
| step-ca integration | 📋 |
| ACME / Let's Encrypt | 📋 |
| Automatic renewal | 📋 |
| TLS inspector | 📋 |
| Secrets management | 📋 |

---

### ✅ LDAP Integration

| Feature | Status |
|---|---|
| Bundled OpenLDAP container | ✅ |
| Pre-seeded OUs, users, and groups | ✅ |
| LDAP server registry (multiple servers) | ✅ |
| Connection test | ✅ |
| Directory browse (LDAP filter + results) | ✅ |
| User sync → NexusOps local accounts | ✅ |
| Sync history log | ✅ |
| LDAP auth fallback on NexusOps login | ✅ |
| Auto-provision LDAP users on first login | ✅ |
| In-app directory browse, bind test, and user sync | ✅ |
| Configurable attribute mapping | ✅ |
| LDAPS (SSL) | 🔄 (config present, not tested) |
| LDAP group → NexusOps role mapping | 📋 |

---

### ✅ Dashboard & Operations

| Feature | Status |
|---|---|
| Live dashboard with cross-module KPIs | ✅ |
| Hosts / subnets / DNS records / DHCP leases widgets | ✅ |
| PKI expiry widget | ✅ |
| Module navigation cards with live stats | ✅ |
| Audit event feed | ✅ |
| 30-second auto-refresh | ✅ |
| System settings (key/value store) | ✅ |
| Background job status (Celery) | ✅ |
| Notifications / alerts | 📋 |

---

### ✅ Tools & Integrations Portal

| Feature | Status |
|---|---|
| Bundled tools directory | ✅ |
| In-app LDAP module (browse / sync / test) | ✅ |
| API docs and ReDoc links | ✅ |
| LDAP connection health status | ✅ |
| Ansible Runner integration | 📋 |
| n8n integration | 📋 |

---

### 📋 Planned Modules

| Module | Status |
|---|---|
| SMTP relay management | 📋 |
| Diagnostics (ping, traceroute, port check, DNS lookup) | 📋 |
| Automation (Ansible job dispatch, playbook runs, job history) | 📋 |
| Webhooks and scheduled jobs | 📋 |
| Infrastructure provisioning templates | 📋 |
| Forge integration | 📋 |

---

## Architecture

### Current Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| API | FastAPI 0.115 (Python 3.12) |
| ORM / Migrations | SQLAlchemy 2.0 + Alembic |
| Database | PostgreSQL 16 |
| Job queue / cache | Redis 7 |
| Background workers | Celery 5.4 |
| LDAP client | ldap3 2.9 |
| Auth | python-jose (JWT) + passlib/bcrypt |
| Network scanning | Python stdlib (socket, subprocess, concurrent.futures) + psutil |
| Container runtime | Docker Compose |

### Architecture Diagram

```mermaid
graph TD
    Browser["Browser\n(React + Vite)"] -->|HTTP / REST| API["NexusOps API\n(FastAPI)"]
    API --> DB[(PostgreSQL)]
    API --> Cache[(Redis)]
    API --> Worker["Celery Worker"]
    Worker --> DB
    Worker --> Cache

    API -->|ldap3| LDAP["OpenLDAP\n(bundled)"]

    API -.->|planned| PowerDNS["PowerDNS"]
    API -.->|planned| Kea["Kea DHCP"]
    API -.->|planned| StepCA["step-ca"]
    API -.->|planned| Postfix["Postfix SMTP"]
    API -.->|planned| Ansible["Ansible Runner"]
    API -.->|planned| N8N["n8n"]

    subgraph "Implemented Modules"
        direction LR
        M1[IPAM] --- M2[DNS] --- M3[DHCP]
        M4[Inventory] --- M5[PKI] --- M6[LDAP]
        M7[Dashboard] --- M8[Auth/RBAC]
    end

    API --> M1
```

---

## Current Containers

| Container | Image / Build | Purpose | Port(s) | Persistence |
|---|---|---|---|---|
| `nexusops-backend` | `ghcr.io/thrinadsanjay/nexusops-backend` (or local build) | FastAPI REST API, Alembic migrations, bootstrap | `8000` | PostgreSQL |
| `nexusops-frontend` | `ghcr.io/thrinadsanjay/nexusops-frontend` (or local build) | React SPA (nginx) | `5173` | None |
| `nexusops-worker` | same backend image | Celery background worker (subnet scans, sync) | — | Redis + PostgreSQL |
| `nexusops-postgres` | `postgres:16` | Primary application database | `5432` | `postgres_data` volume |
| `nexusops-redis` | `redis:7-alpine` | Celery broker and result backend | `6379` | `redis_data` volume |
| `nexusops-ldap` | `osixia/openldap:1.5.0` | Bundled OpenLDAP directory server | `389` | `ldap_data`, `ldap_config` volumes |

---

## Planned / Future Containers

> These services are part of the planned architecture. None currently exist in `docker-compose.yml`.

| Container | Technology | Purpose |
|---|---|---|
| `nexusops-powerdns` | PowerDNS | Authoritative DNS backend for managed zones |
| `nexusops-kea` | Kea DHCP | Full DHCP server with REST API integration |
| `nexusops-stepca` | step-ca | Internal PKI / certificate authority server |
| `nexusops-postfix` | Postfix | SMTP relay and mail queue |
| `nexusops-n8n` | n8n | Workflow automation and webhook engine |

---

## Repository Layout

```
NexusOps/
├── .github/workflows/
│   ├── docker-publish.yml     # Test, build, and push GHCR images
│   └── sync-deploy-files.yml  # Mirror compose/README/env example to main
├── backend/
│   ├── app/
│   │   ├── api/v1/router.py      # Auth + admin API routes
│   │   ├── modules/              # Feature modules (ipam, dns, dhcp, inventory, pki, ldap, dashboard)
│   │   ├── models.py             # SQLAlchemy ORM models
│   │   ├── schemas.py            # Pydantic request/response schemas
│   │   ├── core/                 # Config, security, bootstrap, dependencies
│   │   ├── db.py                 # Database session
│   │   └── worker.py             # Celery app + tasks
│   ├── alembic/versions/         # Database migrations (8 revisions)
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.tsx               # Shell, routing, auth state
│       ├── Ipam.tsx              # IPAM panels (VLANs, Subnets, IPs, Network Overview)
│       ├── Dns.tsx               # DNS zone + record manager
│       ├── Dhcp.tsx              # DHCP server/pool/lease/reservation manager
│       ├── Inventory.tsx         # Host, group, and tag panels
│       ├── Pki.tsx               # Certificate authority + certificate manager
│       ├── Ldap.tsx              # LDAP server config, browse, sync
│       └── Tools.tsx             # Integrations portal
├── ldap-bootstrap/
│   └── init.ldif                 # Initial LDAP directory seed (OUs, users, groups)
├── docker-compose.yml            # Only compose file (images + optional source build)
├── nexusops                      # Host helper: install / start / stop / uninstall
├── .env.example
└── .env
```

---

## Database Migrations

| Revision | Description |
|---|---|
| `000000000001` | Phase 0 — core auth, RBAC, settings, audit, sessions, API tokens |
| `000000000002` | Phase 2 — VLANs, subnets, IP addresses |
| `000000000003` | Phase 2b — `last_seen_at` on IP addresses |
| `000000000004` | Phase 3 — host inventory, groups, tags |
| `000000000005` | Phase 4 — DNS zones and records |
| `000000000006` | Phase 5 — DHCP servers, pools, leases, reservations |
| `000000000007` | Phase 9 — certificate authorities and certificates |
| `000000000008` | Phase 10 — LDAP servers and sync logs |

---

## Environment Configuration

Key `.env` variables:

| Variable | Default | Purpose |
|---|---|---|
| `PUBLIC_HOST` | `localhost` | DNS name or IP browsers use to reach this host (server compose) |
| `APP_BASE_URL` | `http://localhost:8000` | Public API URL |
| `FRONTEND_URL` | `http://localhost:5173` | Public UI URL (CORS allow-origin) |
| `VITE_API_BASE_URL` | `http://localhost:8000` | API URL the browser calls. `localhost` / empty uses the UI origin (`/api` proxied to the backend). |
| `DATABASE_URL` | `postgresql+psycopg2://nexusops:change-me@postgres:5432/nexusops` | PostgreSQL connection (must match `POSTGRES_*`) |
| `POSTGRES_PASSWORD` | `change-me` | PostgreSQL password |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection |
| `JWT_SECRET_KEY` | `change-me-in-production` | JWT signing key |
| `DEFAULT_ADMIN_USERNAME` | `admin` | First local admin (empty database only) |
| `DEFAULT_ADMIN_PASSWORD` | `ChangeMe123!` | First local admin password |
| `SCAN_NETWORKS` | *(empty)* | Comma-separated CIDRs for network discovery |
| `LDAP_ADMIN_PASSWORD` | `NexusOps2024!` | OpenLDAP admin password |
| `LDAP_DOMAIN` | `homelab.local` | LDAP domain |
| `LDAP_BASE_DN` | `dc=homelab,dc=local` | LDAP base distinguished name |
| `NEXUSOPS_BACKEND_IMAGE` | `ghcr.io/thrinadsanjay/nexusops-backend:latest` | Backend/worker image to pull |
| `NEXUSOPS_FRONTEND_IMAGE` | `ghcr.io/thrinadsanjay/nexusops-frontend:latest` | Frontend image to pull |
| `PIP_INDEX_URL` | `https://pypi.org/simple` | Pip index used when building the backend image |

Server bind/port overrides (`BACKEND_PORT`, `FRONTEND_PORT`, `POSTGRES_BIND`, and so on) are listed in `.env.example`.

---

## CI/CD (Docker images)

GitHub Actions workflow [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) runs tests, then builds and publishes the two application images.

| Image | GHCR |
|---|---|
| API + Celery worker | `ghcr.io/thrinadsanjay/nexusops-backend` |
| UI | `ghcr.io/thrinadsanjay/nexusops-frontend` |

**When images are pushed**

- Pull requests against `Development`: tests + image **build only** (no push)
- Push to `Development`: push tags `latest`, `development`, and `sha-<git-sha>`
- Git tags matching `v*` (for example `v1.2.0`): semver tags (`1.2.0`, `1.2`)
- **Actions → Run workflow**: same as a push of that ref

`main` does not build images. On **every push to `Development`**, CI copies `docker-compose.yml`, `.env.example`, `README.md`, and `nexusops` to `main` immediately (workflow [`.github/workflows/sync-deploy-files.yml`](.github/workflows/sync-deploy-files.yml), also started from the image pipeline). It does not wait for tests or image builds. After it finishes, `git pull` on a server clone of `main` picks up the new compose and `./nexusops`.

**Optional Docker Hub**

Add repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`. When both are set, the workflow also logs in to Docker Hub and tags the same images as `<username>/nexusops-backend` and `<username>/nexusops-frontend`.

**First-time GHCR setup**

1. Under **Settings → Actions → General → Workflow permissions**, allow the `GITHUB_TOKEN` to write packages (or keep the workflow `packages: write` permission and a read/write default).
2. After the first successful push, open the new package under **Packages**, link it to this repository if GitHub did not already, and set visibility (private is the default).
3. To pull a private package: `echo $GHCR_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin` using a PAT with `read:packages` (and `write:packages` if you push locally).

The backend image installs Python dependencies from public PyPI by default (`PIP_INDEX_URL` / `PIP_TRUSTED_HOST` build args). Override those in `docker-compose.yml` or `.env` if you need an internal index.

---

## Security Considerations

- All passwords in `.env` are defaults for local development. Change them before any networked deployment.
- LDAP bind passwords are stored in plaintext in the database. A secrets management integration is planned.
- The `NET_RAW` capability on the backend/worker containers is used for ICMP subnet scanning. `NET_ADMIN` is not added (it breaks startup on unprivileged Proxmox LXC). TCP fallback still works without `NET_RAW`.
- JWT tokens expire after 60 minutes by default (`SESSION_TIMEOUT_MINUTES`).
- On a new server, Postgres, Redis, and LDAP listen on loopback only unless you change `*_BIND`. Do not expose those ports publicly.

