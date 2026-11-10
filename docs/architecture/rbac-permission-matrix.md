> Current Phase 1 matrix: [docs/security/rbac-permission-matrix.md](../security/rbac-permission-matrix.md). This architecture document is retained as historical context.

# RBAC Permission Matrix

Stored permission codes use `SNAKE_CASE` in `tenant_role_permissions.permission`. Conceptual keys (e.g. `orders.decline`) map via `PERMISSION_ALIASES` in `apps/api/src/lib/permission-keys.js`.

Source of truth for default roles: `apps/api/src/lib/role-matrix.js`.

## Restaurant workspace

| Role                   | Orders                     | Receiving / disputes         | Catalog | Team / roles | Settings / billing                     | Notes                                                         |
| ---------------------- | -------------------------- | ---------------------------- | ------- | ------------ | -------------------------------------- | ------------------------------------------------------------- |
| **Owner**              | Full                       | Full                         | Full    | Full         | Full                                   | Main Admin; immutable full access                             |
| **Restaurant Manager** | Create, edit, manage, view | Receive (`RECEIVING_MANAGE`) | View    | —            | View only                              | No `STAFF_*`, no `SETTINGS_MANAGE`, no `SUBSCRIPTIONS_MANAGE` |
| **Purchaser**          | Create, edit, view         | —                            | View    | —            | —                                      | No team/billing/settings                                      |
| **Receiving Staff**    | View only                  | Receive + dispute path       | —       | —            | —                                      | No `ORDERS_CREATE`                                            |
| **Accountant**         | View (financial context)   | —                            | —       | —            | Invoices, payments, subscriptions view | Finance only                                                  |
| **Viewer**             | View                       | View                         | View    | —            | —                                      | Read-only                                                     |

### Permission codes (Restaurant Manager example)

- `ORDERS_VIEW`, `ORDERS_CREATE`, `ORDERS_EDIT`, `ORDERS_MANAGE`
- `RECEIVING_VIEW`, `RECEIVING_MANAGE` (receive + open dispute while receiving)
- `CATALOG_VIEW`, `INVENTORY_VIEW`, `INVOICES_VIEW`, `CHAT_VIEW`, `CHAT_SEND`, `SETTINGS_VIEW`

## Supplier workspace

| Role                        | Orders                           | Fulfillment | Catalog | Deals | Team / roles | Billing            |
| --------------------------- | -------------------------------- | ----------- | ------- | ----- | ------------ | ------------------ |
| **Owner**                   | Full                             | Full        | Full    | Full  | Full         | Full               |
| **Supplier Manager**        | View, edit, **manage (decline)** | Full        | Full    | View  | —            | View settings only |
| **Order Fulfillment Staff** | View, edit (status)              | Full        | —       | —     | —            | —                  |
| **Catalog Manager**         | —                                | —           | Full    | —     | —            | —                  |
| **Promotions Manager**      | View                             | —           | View    | Full  | —            | —                  |
| **Accountant**              | View                             | —           | —       | —     | —            | Finance only       |
| **Viewer**                  | View                             | View        | View    | —     | —            | —                  |

### Decline orders

- **Supplier:** `ORDERS_MANAGE` (maps to `orders.decline`)
- **Not granted** to Order Fulfillment Staff, Accountant, Viewer by default

### Resolve disputes (supplier)

- `POST /api/disputes/:id/resolve` with `credit_note` or `refund` issues money, so it requires `INVOICES_MANAGE` (Owner and Accountant by default). Order Fulfillment Staff and Warehouse Manager (`FULFILLMENT_MANAGE` only) can no longer issue credit notes or refunds.
- `replacement` and `no_action` resolutions, review and reject still use `FULFILLMENT_MANAGE`.
- The route uses the dynamic `requirePermission` (key chosen from `resolutionType`); `requireAnyPermission` with one key would be identical. Owner passes through `rolesIncludeOwner`.
- **Promotions Manager** no longer holds `ORDERS_MANAGE` (read-only `ORDERS_VIEW` + `CATALOG_VIEW`), so it cannot accept, decline or cancel orders.
- Existing tenants: `ensureTenantSystemRoles` rewrites system role permissions from `role-matrix.js` whenever it runs (tenant/branch creation, owner permission cache miss, first-role setup). There is no boot-time sweep, so run `pnpm --filter api roles:sync` (calls `syncAllTenantsSystemRoles`) after deploying matrix changes to update every tenant immediately.

### Customer growth (supplier)

| Permission         | Owner | Supplier Manager | Notes                                |
| ------------------ | ----- | ---------------- | ------------------------------------ |
| `CUSTOMERS_IMPORT` | Yes   | Yes              | CSV import preview/execute           |
| `CUSTOMERS_MANAGE` | Yes   | No               | Invite, sponsor, connection requests |
| `GROWTH_VIEW`      | Yes   | Yes              | Prospects list + metrics dashboard   |

See [../features/supplier-customer-growth.md](../features/supplier-customer-growth.md).

## Guards (backend)

- `ensureTenantSystemRoles` — seeds + syncs permissions per tenant
- `assertCanAssignRole` — subset + last Owner protection
- `assertCanGrantPermissions` — custom roles cannot exceed editor
- Owner role: cannot delete; permissions always full set on sync
- Strict resolution: `tenant_user_roles` assignments do not merge legacy `user_role` owner grants

## Backfill

After deploy:

```bash
pnpm db:migrate
node apps/api/scripts/sync-system-roles.mjs
```

Legacy role names (`Manager`, `Inventory Clerk`, `Warehouse Staff`) are renamed via migration `0105_rbac_system_roles_matrix.sql` and matched on sync by `legacyNames` in `role-matrix.js`.
