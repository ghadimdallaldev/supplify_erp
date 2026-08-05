# Supplier branch accounts & organization roles

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

Supplier tenants can operate as a **multi-branch organization**: one parent org with several branch accounts (each branch is a full `supplier` tenant with its own catalog, orders, warehouses, staff, and settings).

## Concepts

| Term                  | Meaning                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| **Organization**      | `supplier_organizations` row; owns Branch Accounts and org-level users                  |
| **Branch Account**    | A `supplier` row linked via `organization_id`; main has `is_main_branch = true`         |
| **Warehouse**         | Operational location under one supplier Branch Account (not a tenant)                   |
| **Org-level user**    | `org_user_roles` — may access one or all Branch Accounts depending on role              |
| **Branch-level user** | `tenant_user_roles` with `tenant_type = 'SUPPLIER'` — scoped to a single Branch Account |

## Lifecycle (current)

| Action                                    | Status                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| Create / deactivate / reactivate / unlink | Org Owner APIs under `/api/org/branches`                                         |
| Deactivation guards                       | Blocks main branch; open orders; WH reservations; open invoices                  |
| Permission cache fan-out                  | Deactivate / reactivate / unlink clear caches for all affected users             |
| Unlink billing policy                     | Block on OPEN invoices; review flags for prepaid/credits/org PAST_DUE; no refund |
| Link existing standalone supplier         | `branch_account_link_invitations`                                                |
| Consolidated reporting                    | `GET /api/org/reports/overview`                                                  |
| Warehouse stock                           | Prefer `warehouse_inventory` when warehouses enabled; see supplier-stock service |

Existing single-location suppliers are migrated automatically: one org per primary supplier, main branch flagged, contact users receive **Org Owner**.

## Org-level system roles

| Role             | Branch access          | Notes                                                      |
| ---------------- | ---------------------- | ---------------------------------------------------------- |
| Org Owner        | All branches           | Create/deactivate branches, assign org roles               |
| Org Manager      | All branches           | Operations across branches; no branch create/delete        |
| Org Viewer       | All branches           | Read-only                                                  |
| Regional Manager | Assigned branches only | Full ops on assigned branches via `org_user_branch_access` |

## Branch-level roles

Same named roles as supplier tenant roles (Owner, Manager, Sales Rep, Catalog Manager, Warehouse Staff, Accountant, Viewer). See [tenant-roles.md](./tenant-roles.md).

## Permission resolution

For a request scoped to branch `supplier_id`:

1. If the user has an **org role** for that supplier’s organization **and** branch access (all-scope or explicit assignment) → use **org role permissions** only.
2. Else → use **branch** `tenant_user_roles` + legacy `user_role` (merged, never reduced).
3. Else → deny.

Results are cached in Redis under `perms:{userId}:{supplierId}:SUPPLIER` (5 minutes). Invalidated on org role assignment, branch access grant/revoke, or tenant role changes.

## Branch context switching

- **Cookie:** `active_tenant_token` (same as restaurant/linked-account switcher).
- **Header:** `X-Branch-Id` — optional supplier UUID for API clients.
- **API:** `POST /api/org/context/switch` with `{ "supplier_id": "<uuid>" }`.

After switch, reload the app or reset RTK Query cache so lists use the new branch.

## API (`/api/org`)

All routes: `requireAuth`, supplier role, org membership (except admin with `organization_id` query).

| Method | Path                                          | Who                             | Notes                           |
| ------ | --------------------------------------------- | ------------------------------- | ------------------------------- |
| GET    | `/api/org`                                    | Org members                     | Org info + accessible branches  |
| GET    | `/api/org/branches`                           | Org members                     | Branch list + stats             |
| POST   | `/api/org/branches`                           | Org Owner                       | Requires `multi_branch` feature |
| GET    | `/api/org/branches/:supplierId`               | Branch access                   | Detail                          |
| PATCH  | `/api/org/branches/:supplierId`               | Owner / Regional Mgr (assigned) | Name, code, phone, address      |
| DELETE | `/api/org/branches/:supplierId`               | Org Owner                       | Deactivates; guards below       |
| GET    | `/api/org/users`                              | Org Owner                       | Org users + branch assignments  |
| POST   | `/api/org/users/:userId/branches`             | Org Owner                       | Grant Regional Manager branch   |
| DELETE | `/api/org/users/:userId/branches/:supplierId` | Org Owner                       | Revoke                          |
| POST   | `/api/org/users/:userId/role`                 | Org Owner                       | Assign org role                 |
| POST   | `/api/org/context/switch`                     | Branch access                   | Set active branch cookie        |

The shared linked-accounts API (`/api/branches`) also handles basic branch list, create, switch, and unlink for both restaurants **and** suppliers. It accepts `{ tenantId, tenantType }` on `POST /api/branches/switch`; bearer-authenticated clients additionally receive `{ activeTenantToken }` in the JSON response. The `/api/org` routes above are the authoritative supplier org-management API.

## Feature flag

`multi_branch` on subscription plans:

- **Free / Silver:** single branch; no switcher dropdown; org overview shows upgrade copy.
- **Silver+:** multiple branches; switcher and **Org overview** (`/app/org`) for Org Owner / Org Manager.

## Migrations

- **SQL:** `0082_supplier_branch_accounts.sql`
- **Script:** `pnpm db:migrate-suppliers-to-orgs` (also runs from `pnpm db:migrate` when incomplete)

## Adding a branch

1. Ensure plan includes `multi_branch`.
2. Org Owner: **Org overview** → **Add branch**, or `POST /api/org/branches`.
3. System seeds branch tenant roles; creator is assigned branch **Owner** and keeps org access.

## Regional Manager setup

1. Org Owner assigns **Regional Manager** via `POST /api/org/users/:userId/role`.
2. Grant branches: `POST /api/org/users/:userId/branches` with `{ "supplierId": "..." }`.
