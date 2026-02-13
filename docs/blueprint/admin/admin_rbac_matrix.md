# Admin RBAC matrix

| Resource / Action        | Permission    | Role  | Notes                          |
|--------------------------|---------------|-------|--------------------------------|
| Admin dashboard (all)    | ADMIN_ACCESS  | ADMIN | All tabs: overview, plans, subscriptions, tenants, health, finance, usage, audit, impersonation |
| Plans CRUD                | (ADMIN_ACCESS)| ADMIN | GET/POST/PATCH /plans          |
| Subscriptions list/PATCH | (ADMIN_ACCESS)| ADMIN | GET/PATCH /subscriptions, preview-change |
| Tenants list             | (ADMIN_ACCESS)| ADMIN | GET /tenants/suppliers, /tenants/restaurants |
| Override limits          | (ADMIN_ACCESS)| ADMIN | POST/DELETE .../override-limit |
| Health                   | (ADMIN_ACCESS)| ADMIN | GET /health                    |
| Financial overview       | (ADMIN_ACCESS)| ADMIN | GET /financial-overview        |
| Audit logs               | (ADMIN_ACCESS)| ADMIN | GET /audit-logs                |
| Impersonate              | (ADMIN_ACCESS)| ADMIN | POST /impersonate, /impersonate/stop |

Tenant-facing routes use resolveTenantContext and requirePermission(permission); admin routes use resolveAdminContext and requirePermission('ADMIN_ACCESS').
