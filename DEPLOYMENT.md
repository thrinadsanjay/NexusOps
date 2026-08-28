# Deployment Guide

## Docker Compose

Build from source (default for first-time and local development):

```bash
cd NexusOps
cp .env.example .env
docker compose up --build
```

Or pull images published by GitHub Actions (after CI has pushed at least once):

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
docker compose pull
docker compose up -d
```

## New server (published images)

Copy only `docker-compose.server.yml` and `.env.server.example` to the host. No application source tree is required.

```bash
mkdir -p /opt/nexusops && cd /opt/nexusops
# copy docker-compose.server.yml and .env.server.example here
cp .env.server.example .env
# set PUBLIC_HOST to this server's DNS name or IP, then matching URLs:
#   APP_BASE_URL, FRONTEND_URL, VITE_API_BASE_URL
# rotate POSTGRES_PASSWORD (and DATABASE_URL), JWT_SECRET_KEY, DEFAULT_ADMIN_PASSWORD

echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d
```

`VITE_API_BASE_URL` and `FRONTEND_URL` must be URLs the **browser** uses (host IP or DNS), not Docker service names like `http://backend:8000`. CORS is taken from `FRONTEND_URL`.

Postgres, Redis, and LDAP ports bind to `127.0.0.1` by default. The UI (`FRONTEND_PORT`, default 5173), API (`BACKEND_PORT`, default 8000), and phpLDAPadmin (`LDAPADMIN_PORT`, default 8082) bind on all interfaces.

Optional LDAP directory seed (only if you also copied `ldap-bootstrap/init.ldif` and kept the default `dc=homelab,dc=local` tree):

```bash
docker compose -f docker-compose.server.yml cp ldap-bootstrap/init.ldif openldap:/tmp/init.ldif
docker compose -f docker-compose.server.yml exec openldap ldapadd -x \
  -D "cn=admin,dc=homelab,dc=local" -w "$LDAP_ADMIN_PASSWORD" -f /tmp/init.ldif
```

`docker compose pull` uses:

| Service | Default image |
|---|---|
| `backend`, `worker` | `ghcr.io/thrinadsanjay/nexusops-backend:latest` |
| `frontend` | `ghcr.io/thrinadsanjay/nexusops-frontend:latest` |

Override the tags with `NEXUSOPS_BACKEND_IMAGE` and `NEXUSOPS_FRONTEND_IMAGE` in `.env`.

This stack includes:

- PostgreSQL on port 5432
- Redis on port 6379
- FastAPI backend on port 8000
- Celery worker
- Vite frontend on port 5173

## CI/CD images

Workflow: [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)

| Event | Tests | Build | Push |
|---|---|---|---|
| Pull request to `Development` or `main` | yes | yes | no |
| Push to `Development` | yes | yes | GHCR (`latest` + branch + `sha-*`) |
| Push to `main` | yes | yes | GHCR (`stable` + branch + `sha-*`) |
| Tag `v*` | yes | yes | GHCR (semver tags) |
| Manual **Run workflow** | yes | yes | GHCR (unless run on a PR ref) |

Optional second registry: set repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`. The same image names (`nexusops-backend`, `nexusops-frontend`) are then also pushed to Docker Hub.

GHCR packages are private until you change visibility under **Packages**. Grant `GITHUB_TOKEN` package write access if the first push returns 403 (**Settings → Actions → General → Workflow permissions**).

## Environment configuration

Copy `.env.example` to `.env` and adjust values for your homelab deployment.

## Reverse proxy

Deploy behind a reverse proxy such as Nginx or Traefik and configure the public URL via `APP_BASE_URL` and `FRONTEND_URL`.

## Production guidance

- rotate the JWT secret and database credentials
- set `APP_ENV=production`
- disable debug mode
- enable secure cookies and TLS termination at the proxy layer
