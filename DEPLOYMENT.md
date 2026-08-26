# Deployment Guide

## Docker Compose

```bash
cd NexusOps
docker compose up --build
```

This stack includes:

- PostgreSQL on port 5432
- Redis on port 6379
- FastAPI backend on port 8000
- Celery worker
- Vite frontend on port 5173

## Environment configuration

Copy `.env.example` to `.env` and adjust values for your homelab deployment.

## Reverse proxy

Deploy behind a reverse proxy such as Nginx or Traefik and configure the public URL via `APP_BASE_URL` and `FRONTEND_URL`.

## Production guidance

- rotate the JWT secret and database credentials
- set `APP_ENV=production`
- disable debug mode
- enable secure cookies and TLS termination at the proxy layer
