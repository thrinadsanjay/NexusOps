# NexusOps API Reference

## Overview

This Phase 0 API surface is intentionally minimal and safe. It provides startup and operational health endpoints for the application shell.

## Health endpoints

### GET /health

Returns:

```json
{
  "status": "ok",
  "service": "nexusops"
}
```

### GET /api/v1/health

Returns:

```json
{
  "status": "ok",
  "service": "nexusops",
  "environment": "development"
}
```

## Future modules

The API will expand in later phases to cover:

- authentication and RBAC
- IPAM and DNS management
- DHCP, PKI, and certificate lifecycle
- LDAP identity and SMTP relay
- Ansible automation and infrastructure jobs
