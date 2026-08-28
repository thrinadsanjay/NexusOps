# Deployment Guide

## Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

Published ports:

- Frontend `5173`
- Backend `8000`

Postgres, Redis, and OpenLDAP are not published. phpLDAPadmin is not part of the stack; use the in-app Directory Manager at `/ldap`.

On first boot with an empty LDAP volume, `ldap-bootstrap/init.ldif` is applied through the osixia `--copy-service` bootstrap path.

## Environment

Copy `.env.example` to `.env`. For anything other than local development:

- `APP_ENV=production`
- unique `JWT_SECRET_KEY` (≥ 32 characters)
- unique `DEFAULT_ADMIN_PASSWORD` and `LDAP_ADMIN_PASSWORD`
- `SESSION_COOKIE_SECURE=true` behind TLS

The process refuses to start in production-like environments with bundled development secrets.

## Reverse proxy

Terminate TLS at Nginx or Traefik. Set `APP_BASE_URL` and `FRONTEND_URL` to the public origins. CORS allows only `FRONTEND_URL`.

## Operations

- `docker compose exec backend alembic upgrade head` if you need to migrate manually (the backend command already runs this)
- Directory users/groups are managed in the UI; sync imports them into local NexusOps accounts
- Rotate LDAP admin and bind passwords after first deploy
