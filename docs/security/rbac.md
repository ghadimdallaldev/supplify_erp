# RBAC & access control

Active reference for tenant roles, permissions, and how they combine with subscription features.

## Core docs

| Topic                           | Location                                                               |
| ------------------------------- | ---------------------------------------------------------------------- |
| Roles, middleware, tenant roles | [rbac-overview.md](../architecture/rbac-overview.md)                   |
| Default permission matrix       | [rbac-permission-matrix.md](../architecture/rbac-permission-matrix.md) |
| Features vs permissions         | [access-control.md](../architecture/access-control.md)                 |
| Multi-tenant isolation          | [tenancy.md](../architecture/tenancy.md)                               |
| Production hardening            | [hardening.md](../architecture/hardening.md)                           |
| Security baseline               | [security-baseline.md](../architecture/security-baseline.md)           |

## Feature specs

- [tenant-roles.md](../features/tenant-roles.md) — custom roles (Gold+)
- [staff-portal.md](../features/staff-portal.md) — operational staff vs platform users
- [admin-impersonation.md](../features/admin-impersonation.md) — admin impersonation rules

## Audits (historical)

Full-app and hardening reports: [archive/audits/](../archive/audits/) (`rbac-full-app-audit.md`, `rbac-roles-*`, `rbac-hardening-qa-report.md`, etc.).

## Admin RBAC

Platform admin permissions: [blueprint admin matrix](../archive/old/blueprint/admin/admin_rbac_matrix.md) (archived diagram companion).
