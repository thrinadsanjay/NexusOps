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

## New server (clone `main`)

`main` publishes `docker-compose.yml`, `.env.example`, `README.md`, and `nexusops`. Clone it and use Compose with no `-f`:

```bash
git clone --branch main --single-branch https://github.com/thrinadsanjay/NexusOps.git /opt/nexusops
cd /opt/nexusops
./nexusops install
# edit .env (PUBLIC_HOST, URLs, secrets) then: ./nexusops restart
```

Equivalent without the helper: `cp .env.example .env && docker compose pull && docker compose up -d`.

Later: `git pull && ./nexusops start` (or `docker compose pull && docker compose up -d`).

| Command | What it does |
|---|---|
| `./nexusops install` | Detect OS, install Docker CE + Compose + libseccomp, create `.env`, pull, start |
| `./nexusops start` | Pull images and `up -d` |
| `./nexusops stop` | Stop containers |
| `./nexusops uninstall` | Remove containers (`--purge` also deletes volumes) |

### Postgres Unix socket `Permission denied` (Proxmox / Debian)

If logs show initdb **Success** then:

```
could not create Unix socket for address "/var/run/postgresql/.s.PGSQL.5432": Permission denied
FATAL: could not create any Unix-domain sockets
```

the data volume is fine. The `postgres` user cannot write `/var/run/postgresql` (common on Proxmox VE, LXC, and AppArmor). Compose mounts a tmpfs there. Recreate Postgres only:

```bash
docker compose up -d --force-recreate postgres
```

### Postgres `Operation not permitted` on initdb

Recent `postgres:*-alpine` images (Alpine 3.24) call syscalls that older Docker/`libseccomp` on RHEL lab hosts reject. Logs look like:

```
could not write to file "postmaster.pid": Operation not permitted
FATAL: could not write to file "pg_wal/xlogtemp.*": Operation not permitted
initdb: removing contents of data directory
```

The server compose uses `postgres:16` (Debian) and `seccomp:unconfined` for that service. After `git pull`, remove the failed volume (it is empty) and start again:

```bash
docker compose down
docker volume rm nexusops_postgres_data
./nexusops start
```

The lasting host fix is to update Docker Engine and `libseccomp`.

`VITE_API_BASE_URL` and `FRONTEND_URL` must be URLs the **browser** uses (host IP or DNS), not Docker service names like `http://backend:8000`. CORS is taken from `FRONTEND_URL`.

Postgres, Redis, and LDAP ports bind to `127.0.0.1` by default. The UI (`FRONTEND_PORT`, default 5173) and API (`BACKEND_PORT`, default 8000) bind on all interfaces. Manage the bundled OpenLDAP directory from the NexusOps **LDAP** page (`/ldap`); there is no separate LDAP admin container.

Optional LDAP directory seed (only if you also copied `ldap-bootstrap/init.ldif` and kept the default `dc=homelab,dc=local` tree):

```bash
docker compose cp ldap-bootstrap/init.ldif openldap:/tmp/init.ldif
docker compose exec openldap ldapadd -x \
  -D "cn=admin,dc=homelab,dc=local" -w "$LDAP_ADMIN_PASSWORD" -f /tmp/init.ldif
```

`docker compose pull` uses:

| Service | Default image |
|---|---|
| `backend`, `worker` | `ghcr.io/thrinadsanjay/nexusops-backend:latest` |
| `frontend` | `ghcr.io/thrinadsanjay/nexusops-frontend:latest` |

Override the tags with `NEXUSOPS_BACKEND_IMAGE` and `NEXUSOPS_FRONTEND_IMAGE` in `.env`.

This stack includes:

- PostgreSQL (loopback `5432` on server compose)
- Redis (loopback `6379` on server compose)
- FastAPI backend on port 8000
- Celery worker
- Vite frontend on port 5173
- OpenLDAP (loopback `389` on server compose; manage it from the NexusOps LDAP page)

## CI/CD images

Workflow: [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)

| Event | Tests | Build | Push |
|---|---|---|---|
| Pull request to `Development` | yes | yes | no |
| Push to `Development` | yes | yes | GHCR (`latest` + branch + `sha-*`) |
| Tag `v*` | yes | yes | GHCR (semver tags) |
| Manual **Run workflow** | yes | yes | GHCR (unless run on a PR ref) |

Pushing those deploy files to `Development` also runs [`.github/workflows/sync-deploy-files.yml`](.github/workflows/sync-deploy-files.yml), which publishes `docker-compose.yml`, `.env.example`, `README.md`, and `nexusops` on `main`. Image builds do not run on `main`.

If the sync job cannot push, allow GitHub Actions write access to `main` (**Settings → Actions → General → Workflow permissions**, and any branch-protection rules on `main`).

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
