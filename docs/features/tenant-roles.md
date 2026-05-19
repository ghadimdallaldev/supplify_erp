# Tenant role system

Plan feature key: `advanced_roles` (Bronze/Silver, Gold, and Platinum — not on Free).

Named roles let restaurant and supplier tenants assign **Owner**, **Manager**, and other predefined system roles, or create **custom roles** with a permission checklist. Permission checks in the API still use the existing `permissions.js` keys; this feature adds per-tenant storage and management UI.

## System roles

### Restaurant

| Role            | Description            | Highlights                                                            |
| --------------- | ---------------------- | --------------------------------------------------------------------- |
| Owner           | Full access            | All restaurant permissions                                            |
| Manager         | Operations & approvals | Orders, inventory, staff, receiving, chat                             |
| Purchaser       | Ordering               | Orders, inventory view, receiving view, chat                          |
| Accountant      | Finance                | Invoices, payments, orders view                                       |
| Inventory Clerk | Stock & receiving      | Inventory + receiving manage                                          |
| FOH Staff       | Reservations           | Reservations create/edit                                              |
| Viewer          | Read-only              | View orders, invoices, inventory, reservations, staff, settings, chat |

### Supplier

| Role            | Description        | Highlights                                           |
| --------------- | ------------------ | ---------------------------------------------------- |
| Owner           | Full access        | All supplier permissions                             |
| Manager         | Operations         | Orders, catalog, warehouses, staff                   |
| Sales Rep       | Customers & orders | Orders, catalog view, chat                           |
| Catalog Manager | Products           | Catalog + inventory edit                             |
| Warehouse Staff | Fulfillment        | Orders view, inventory, warehouses, receiving        |
| Accountant      | Finance            | Invoices, payments                                   |
| Viewer          | Read-only          | Orders, catalog, invoices, inventory, settings, chat |

## Custom roles

Tenants with `advanced_roles` enabled can create roles under **Settings → Team → Roles**. Reserved names (Owner, Manager, etc.) cannot be reused. Custom roles can be edited or deleted only when no users are assigned.

## Permission resolution

1. `tenant_user_roles` links a user to one role per tenant.
2. `tenant_role_permissions` lists permission keys for that role.
3. `getPermissionsForUser()` in `apps/api/src/lib/permissions.js` loads tenant role permissions and **merges** them with legacy `user_role` / `role_permission` rows so existing access is never removed during migration.
4. Results are cached in Redis (or in-memory fallback) under `perms:{userId}:{tenantId}:{tenantType}` for **5 minutes**.
5. Cache is cleared via `invalidateUserPermissionCache()` when a user’s role is assigned or a custom role’s permissions change.

`GET /auth/me` and `resolveTenantContext` use the same resolution path and are **not** gated by `advanced_roles`.

## API (`/api/roles`)

All management routes require `requireAuth`, `resolveTenantContext`, and `requireFeature('advanced_roles')`. System roles are seeded on first access when the feature is enabled.

| Method | Path                              | Permission      | Notes                                  |
| ------ | --------------------------------- | --------------- | -------------------------------------- |
| GET    | `/api/roles`                      | SETTINGS_VIEW   | List roles + permissions + user counts |
| POST   | `/api/roles`                      | SETTINGS_MANAGE | Create custom role                     |
| PATCH  | `/api/roles/:id`                  | SETTINGS_MANAGE | System: description only               |
| DELETE | `/api/roles/:id`                  | SETTINGS_MANAGE | Custom only; 409 if users assigned     |
| GET    | `/api/roles/users`                | SETTINGS_VIEW   | Users with role                        |
| POST   | `/api/roles/users/:userId/assign` | SETTINGS_MANAGE | Owner role: assigner must be Owner     |
| GET    | `/api/roles/:id/permissions`      | SETTINGS_VIEW   | Checklist data for UI                  |

## Migration

- **SQL:** `0078_tenant_named_roles.sql`, `0079_advanced_roles_feature.sql`
- **Script:** `node apps/api/scripts/migrate-users-to-roles.js` (idempotent; runs automatically in Docker `migrate` on deploy when backfill is incomplete). From repo root: `pnpm db:migrate-users-to-roles`.
- **Dev startup:** `pnpm dev` / `migrate.js` skips the script when every tenant has an Owner system role and all `user_role` rows have a matching `tenant_user_roles` row (see [PERFORMANCE.md](../operations/PERFORMANCE.md)).

## Approvals integration

Approval rules can target roles by name (e.g. Manager, Owner). Users with **Manager** or **Owner** tenant roles receive `ORDERS_MANAGE` and are typical approvers when `approvals_budgets` is enabled.

## Frontend

- **Settings → Team:** Users and Roles sub-tabs when `advanced_roles` is on (entitlements hook).
- **Invite:** Role dropdown uses tenant roles when enabled; otherwise Owner / Viewer only.
- **Component:** `RolePermissionChecklist.jsx` — grouped permission toggles.
