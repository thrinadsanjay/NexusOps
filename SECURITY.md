# Security Notes

## Phase 0 baseline

- Secrets are configured via environment variables and `.env` files that are not committed to version control.
- The application intentionally exposes only health endpoints; no arbitrary shell execution is enabled.
- Backend configuration is centralized in `backend/app/core/config.py` to reduce secret sprawl and provide a single place for environment validation.
- CORS is restricted to the configured frontend origin.

## Future security work

- password hashing with a modern algorithm
- session management and secure cookie settings
- RBAC and permission enforcement
- audit logging for infrastructure changes
- rate limiting and authentication guardrails
- strict validation of external provider APIs and job payloads
