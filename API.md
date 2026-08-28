# NexusOps API Reference

NexusOps exposes a FastAPI control-plane API. Interactive docs are at `/docs` and `/redoc`.

## Health

### GET /health

```json
{ "status": "ok", "service": "nexusops" }
```

### GET /api/v1/health

```json
{ "status": "ok", "service": "nexusops", "environment": "development" }
```

Authenticated dashboard health is included in `GET /api/v1/dashboard/stats` as `health.api` and `health.database`.

## Authentication

- `POST /api/v1/auth/login` — local password, then LDAP bind fallback. Disabled LDAP accounts are rejected.
- `POST /api/v1/auth/logout` — revokes the current JWT (`jti`) and clears the session cookie.
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/change-password` — JSON `{ "current_password", "new_password" }`

Use `Authorization: Bearer <jwt>` or the `nxo_` API token. Cookie sessions are httponly.

## RBAC

Permission names follow `resource:action` (`ipam:read`, `ldap:write`, `roles:write`, …). GET routes require the matching `:read` permission unless the user is a superuser.

## Pagination

List endpoints accept `offset` (default 0) and `limit` (default 100, max 500) and still return a JSON array.

## Directory manager (`/api/v1/ldap`)

Server registry, connection test, browse, and user sync remain at `/servers`. Directory operations live under `/servers/{id}/directory`:

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/users` | ldap:read / ldap:write |
| GET/PATCH/DELETE | `/users/{username}` | ldap:read / ldap:write |
| POST | `/users/{username}/password` | ldap:write |
| GET/POST | `/groups` | ldap:read / ldap:write |
| GET/PATCH/DELETE | `/groups/{name}` | ldap:read / ldap:write |
| POST | `/groups/{name}/members` | ldap:write |
| DELETE | `/groups/{name}/members?member=` | ldap:write |
| GET/POST/DELETE | `/ous` | ldap:read / ldap:write |
| GET | `/tree?base_dn=` | ldap:read |

Users are `inetOrgPerson` entries at `cn={uid},ou=users,{base}`. Groups are `groupOfNames` at `cn={name},ou=groups,{base}`. Disable uses `employeeType=disabled` and rejects login.

## Other modules

IPAM, inventory, DNS, DHCP, and PKI remain under `/api/v1/{module}`. CIDR, IP, and MAC fields are validated. DHCP bulk lease import is `POST /api/v1/dhcp/servers/{id}/pools/{id}/leases/bulk`.
