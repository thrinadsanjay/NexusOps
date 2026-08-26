# NexusOps Architecture Proposal

## Goal

NexusOps is a modular, self-hosted Infrastructure Operations Platform designed to centralize network, identity, security, automation, and provisioning functions for a homelab. It complements Forge, which focuses on visibility into what is running, by providing the operating plane for configuration, automation, and lifecycle management.

## System architecture

### Frontend

- React + TypeScript + Vite
- Tailwind CSS for a compact, infrastructure-friendly admin interface
- shadcn/ui patterns for consistency and accessibility
- TanStack Query for API data access
- React Router for module-level navigation

### Backend

- FastAPI service layer for API-first operations
- SQLAlchemy 2.x ORM with PostgreSQL as the primary database
- Alembic for schema migration management
- Service-oriented modular layout for network, identity, PKI, SMTP, automation, diagnostics, and provisioning
- Pydantic validation and structured settings

### Background workers

- Redis for broker and result backend
- Celery for scheduled and long-running tasks, including Ansible execution, certificate renewal, network scans, and SMTP retries

### Deployment model

- Docker Compose for development and homelab deployments
- Persistent volumes for PostgreSQL and Redis
- Health checks and environment configuration via `.env`
- Reverse proxy support through configurable application and public URLs

## Foundational principles for Phase 0

- Keep the application shell intentionally minimal and safe
- Separate domain modules from infrastructure providers
- Avoid business logic in the UI
- Keep all configuration in environment variables
- Provide a health API and a clean migration path for future modules

## Future module boundaries

The first phase intentionally does not add DNS, DHCP, LDAP, or certificate logic. The project is structured so those modules can be added under `backend/app/modules/...` while preserving shared APIs, settings, and auditing patterns.
