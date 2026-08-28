# Changelog

## 0.2.0 - Auth hardening, directory manager, P2 polish

- P0/P1: permission-gated GET routes, JWT session binding, encrypted LDAP secrets, login rate limits, scan caps, production secret checks
- In-app LDAP directory manager for users, groups, OUs, passwords, enable/disable, and membership (AD-style operations)
- Removed the phpLDAPadmin container; Tools links to `/ldap`
- Auto-seed bundled OpenLDAP from `ldap-bootstrap/init.ldif`
- CIDR/IP/MAC validation, list pagination (`offset`/`limit`), delete confirmations, host edit, inventory tag/group filters, DHCP bulk lease import
- Dashboard health indicator driven by API/database status

## 0.1.0 - Phase 0 foundation

- initialized the NexusOps repository structure
- created a FastAPI backend shell with health endpoints
- created a React/Vite frontend shell
- configured Docker Compose for PostgreSQL, Redis, Celery, backend, worker, and frontend
- added Alembic migration scaffolding
- added backend test coverage for the health API
- added architecture and operations documentation
