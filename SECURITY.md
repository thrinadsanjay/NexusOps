# Security Notes

## Runtime secrets

Non-development environments (`APP_ENV` not in `development`, `dev`, `test`, `testing`, `local`) refuse to start with bundled JWT, admin, or LDAP secrets. Set unique values of at least 32 characters for `JWT_SECRET_KEY`.

LDAP bind passwords are stored as Fernet `enc:` ciphertext derived from the JWT secret. Login bind passwords are never returned by the API.

## Authentication

- Local password hashing via passlib/bcrypt
- JWT access tokens bound to `user_sessions.jti`; logout revokes the session
- httponly session cookie plus `Authorization: Bearer`
- API tokens use the `nxo_` prefix and can be revoked
- Login rate limit: 5 failures / 15 minutes per IP+username
- LDAP logins try `cn={user},ou=users,{base}` and reject disabled accounts (`employeeType` or `pwdAccountLockedTime`)

## Authorization

Every module GET requires the matching `:read` permission. Writes require `:write`. Role permission edits require `roles:write`. Dashboard stats are filtered per permission.

## LDAP / directory

Directory mutations (users, groups, OUs, passwords, membership) require `ldap:write` and are written to the audit log. LDAP search filters are validated before they reach OpenLDAP. phpLDAPadmin is not shipped; directory management is in-app.

Network scans are capped at `/24` (`max_scan_hosts=256`). Postgres, Redis, and OpenLDAP ports are not published on the host by default.
