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
| **Catalog Manager**         | View                             | —           | Full    | —     | —            | —                  |
| **Promotions Manager**      | View                             | —           | View    | Full  | —            | —                  |
| **Accountant**              | View                             | —           | —       | —     | —            | Finance only       |
| **Viewer**                  | View                             | View        | View    | —     | —            | —                  |

### Decline orders

- **Supplier:** `ORDERS_MANAGE` (maps to `orders.decline`)
- **Not granted** to Order Fulfillment Staff, Accountant, Viewer by default

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
