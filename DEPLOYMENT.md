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
