# Supplier branch accounts & organization roles

Supplier tenants can operate as a **multi-branch organization**: one parent org with several branch accounts (each branch is a full `supplier` tenant with its own catalog, orders, warehouses, staff, and settings).

## Concepts

| Term                  | Meaning                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| **Organization**      | `supplier_organizations` row; owns branches and org-level users                            |
| **Branch**            | A `supplier` row linked via `organization_id`; the main branch has `is_main_branch = true` |
| **Org-level user**    | `org_user_roles` — may access one or all branches depending on role                        |
| **Branch-level user** | `tenant_user_roles` with `tenant_type = 'SUPPLIER'` — scoped to a single branch            |

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

| Method | Path                                          | Who                             | Notes                                    |
| ------ | --------------------------------------------- | ------------------------------- | ---------------------------------------- |
| GET    | `/api/org`                                    | Org members                     | Org info + accessible branches           |
| GET    | `/api/org/branches`                           | Org members                     | Branch list + stats                      |
| POST   | `/api/org/branches`                           | Org Owner                       | Requires `multi_branch` feature          |
| GET    | `/api/org/branches/:supplierId`               | Branch access                   | Detail                                   |
| PATCH  | `/api/org/branches/:supplierId`               | Owner / Regional Mgr (assigned) | Name, code, phone, address               |
| DELETE | `/api/org/branches/:supplierId`               | Org Owner                       | Deactivates; not main; no pending orders |
| GET    | `/api/org/users`                              | Org Owner                       | Org users + branch assignments           |
| POST   | `/api/org/users/:userId/branches`             | Org Owner                       | Grant Regional Manager branch            |
| DELETE | `/api/org/users/:userId/branches/:supplierId` | Org Owner                       | Revoke                                   |
| POST   | `/api/org/users/:userId/role`                 | Org Owner                       | Assign org role                          |
| POST   | `/api/org/context/switch`                     | Branch access                   | Set active branch cookie                 |

Restaurant linked accounts remain on `/api/branches`.

## Feature flag

`multi_branch` on subscription plans:

- **Free / Bronze:** single branch; no switcher dropdown; org overview shows upgrade copy.
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
