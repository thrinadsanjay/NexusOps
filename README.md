# NexusOps

**NexusOps** is a self-hosted Infrastructure Operations Platform built for homelabs and small enterprise environments. It provides a unified, browser-based control plane for network management, identity, security, device inventory, and platform operations — all running inside a single Docker Compose stack.

---

## Project Status

```
Project Status : Active Development
Current Phase  : Directory manager + P2 polish
```

| State | Areas |
|---|---|
| ✅ Implemented | Auth/RBAC, Network/IPAM, DNS, DHCP, Inventory, PKI, in-app LDAP directory manager, Dashboard, Audit, API tokens, Bundled OpenLDAP |
| 🔄 In Progress | Diagnostics (ping/traceroute/port check), SMTP module |
| 📋 Planned | Ansible automation, n8n integration, Forge integration, PowerDNS backend, Kea DHCP backend, step-ca, SMTP relay (Postfix) |

---

## Quick Start

```bash
# 1. Copy environment config
cp .env.example .env   # or edit .env directly

# 2. Start the full stack
docker compose up -d --build
```

OpenLDAP is seeded automatically from `ldap-bootstrap/init.ldif` on first empty volume.

| Service | URL |
|---|---|
| NexusOps UI | http://localhost:5173 |
| NexusOps API + Swagger | http://localhost:8000/docs |
| Directory Manager | http://localhost:5173/ldap |

PostgreSQL, Redis, and OpenLDAP are attached to the Compose network only and are not published on the host.

**Default local admin:** `admin` / `ChangeMe123!`  
**Default LDAP users:** `nexusadmin` / `NexusOps2024!` · `operator1` / `Operator123!` · `viewer1` / `Viewer123!`

> Change all default passwords and `JWT_SECRET_KEY` before any network-exposed deployment. Non-development environments refuse to start if those defaults are left in place.

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
| In-app users / groups / OUs / password reset / enable-disable | ✅ |
| User sync → NexusOps local accounts | ✅ |
| Sync history log | ✅ |
| LDAP auth fallback on NexusOps login | ✅ |
| Auto-provision LDAP users on first login | ✅ |
| phpLDAPadmin web UI (bundled) | ❌ removed — use `/ldap` |
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
| LDAP Admin (phpLDAPadmin) link + test | ❌ replaced by Directory Manager |
| API docs link | ✅ |
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
| `nexusops-backend` | Custom (Python 3.12) | FastAPI REST API, Alembic migrations, bootstrap | `8000` | PostgreSQL |
| `nexusops-frontend` | Custom (Node 20) | React + Vite SPA | `5173` | None |
| `nexusops-worker` | Custom (Python 3.12) | Celery background worker (subnet scans, sync) | — | Redis + PostgreSQL |
| `nexusops-postgres` | `postgres:16-alpine` | Primary application database | `5432` | `postgres_data` volume |
| `nexusops-redis` | `redis:7-alpine` | Celery broker and result backend | `6379` | `redis_data` volume |
| `nexusops-ldap` | `osixia/openldap:1.5.0` | Bundled OpenLDAP directory server | internal | `ldap_data`, `ldap_config` volumes |

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
│       ├── Ldap.tsx              # Directory manager (users, groups, OUs, tree, sync)
│       └── Tools.tsx             # Integrations portal
├── ldap-bootstrap/
│   └── init.ldif                 # Initial LDAP directory seed (OUs, users, groups)
├── docker-compose.yml
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
| `000000000009` | Auth hardening — sessions, encrypted bind passwords |

---

## Environment Configuration

Key `.env` variables:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://nexusops:change-me@postgres:5432/nexusops` | PostgreSQL connection |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection |
| `JWT_SECRET_KEY` | `change-me-in-production` | JWT signing key |
| `SCAN_NETWORKS` | *(empty)* | Comma-separated CIDRs for network discovery |
| `LDAP_ADMIN_PASSWORD` | `NexusOps2024!` | OpenLDAP admin password |
| `LDAP_DOMAIN` | `homelab.local` | LDAP domain |
| `LDAP_BASE_DN` | `dc=homelab,dc=local` | LDAP base distinguished name |

---

## Security Considerations

- All passwords in `.env` are defaults for local development. Change them before any networked deployment.
- LDAP bind passwords are stored in plaintext in the database. A secrets management integration is planned.
- The `NET_RAW` / `NET_ADMIN` capabilities on the backend container are required for ICMP-based subnet scanning. Remove them if scanning is not needed.
- JWT tokens expire after 60 minutes by default (`SESSION_TIMEOUT_MINUTES`).

