# Development Guide

## Local setup

```bash
cd NexusOps/backend
python -m pip install -r requirements.txt
PYTHONPATH=. python -m pytest -q
PYTHONPATH=. python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## Frontend setup

```bash
cd NexusOps/frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

## Docker Compose

```bash
cd NexusOps
docker compose up --build
```

## Notes

- Environment variables are defined in `.env` from `.env.example`.
- The Phase 0 foundation intentionally exposes only health endpoints.
- Future modules will be added under `backend/app/modules/` and consumed by the same service APIs.
