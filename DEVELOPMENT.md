# Development Guide

## Local backend

```bash
cd backend
python -m pip install -r requirements.txt
PYTHONPATH=. python -m pytest -q
PYTHONPATH=. python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

SQLite is the default database for local pytest (`sqlite:///./nexusops.db`). Use unique usernames/emails in tests (`@example.com`).

## Frontend

```bash
cd frontend
npm install
npm run test
npm run build
npm run dev -- --host 0.0.0.0 --port 5173
```

`VITE_API_BASE_URL` controls API and docs links. Auth tokens live in `sessionStorage`.

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

OpenLDAP bootstrap LDIF is mounted into the osixia container and applied on first empty data volume (`--copy-service`). Directory management is in the NexusOps UI at `/ldap`.

## Layout

- `backend/app/api/v1/router.py` — auth, users, roles, audit, settings, tokens
- `backend/app/modules/` — ipam, inventory, dns, dhcp, pki, ldap, dashboard
- `backend/app/core/ldap_directory.py` — OpenLDAP user/group/OU operations
- `frontend/src/Ldap.tsx` — directory manager UI
