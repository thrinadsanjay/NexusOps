# NexusOps Architecture

NexusOps is a modular, self-hosted infrastructure control plane for homelabs. IPAM, DNS, DHCP, and PKI are **registries** in PostgreSQL, not live PowerDNS/Kea/step-ca servers. Identity uses bundled OpenLDAP plus local RBAC.

## Stack

- Frontend: React 18 + TypeScript + Vite + Tailwind
- API: FastAPI + SQLAlchemy 2 + Alembic
- Jobs: Celery + Redis
- Identity: OpenLDAP (osixia) managed in-app; JWT sessions and `nxo_` API tokens
- Data: PostgreSQL 16

## Request path

Browser → frontend (nginx in Compose) → FastAPI. Auth is cookie or Bearer JWT/`nxo_` token. `require_permission` gates module routes. Directory writes go through `ldap_directory` over ldap3 using the server's encrypted bind password.

## Directory model

Seed DIT:

- `ou=users,{base}` — `inetOrgPerson` users (`cn={uid}`)
- `ou=groups,{base}` — `groupOfNames` (`nexusops-admins` / `operators` / `viewers`)
- Group CN maps to NexusOps roles on login and sync
- Disabled accounts: `employeeType=disabled` (optional `pwdAccountLockedTime`)

## Modules

`backend/app/modules/` owns HTTP for IPAM, inventory, DNS, DHCP, PKI, LDAP, and dashboard stats. Shared auth, crypto, pagination, and validators live in `backend/app/core/`.

## Deployment

Docker Compose publishes the UI (`5173`) and API (`8000`). Postgres, Redis, and LDAP stay on the internal network. Reverse proxy TLS via `APP_BASE_URL` / `FRONTEND_URL`.
