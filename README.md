# NexusOps

NexusOps is a self-hosted Infrastructure Operations Platform for the homelab. It is designed as a modular, API-first control plane for DNS, IPAM, DHCP, PKI, LDAP, SMTP, automation, diagnostics, and provisioning.

## Phase 0 status

This repository contains the Phase 0 foundation only:

- API-first FastAPI backend skeleton
- Vite + React + TypeScript frontend shell
- PostgreSQL + Redis + Celery services in Docker Compose
- Alembic migration foundation
- health endpoints, configuration, security defaults, and documentation
- automated test coverage for the skeleton

## Project purpose

NexusOps is intentionally separate from Forge and focuses on the operational control plane needed to configure, provision, automate, and operate infrastructure. It exposes REST APIs that external systems, including Forge, can consume in the future.

## Quick start

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Start the stack:
   ```bash
   docker compose up --build
   ```
3. Frontend: http://localhost:5173
4. Backend API: http://localhost:8000/docs
5. PostgreSQL: localhost:5432
6. Redis: localhost:6379

## Repository layout

- `backend/` – FastAPI backend and migration setup
- `frontend/` – React + Vite + TypeScript admin UI shell
- `docs/` – architecture and operations documentation
- `docker-compose.yml` – development stack

## Security notice

This Phase 0 foundation does not implement privileged infrastructure modules yet. It does, however, establish security conventions: environment-driven configuration, structured logging, and a health-only API surface without any unsafe command execution.
