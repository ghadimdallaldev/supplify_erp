# Branches and Warehouses Implementation Report

**Date:** 2026-07-20  
**Branch:** `dev` (worked directly; backup branch `backup/branches-warehouses-pre-impl` exists)  
**Scope:** Production-harden Branch Accounts, org lifecycle, linking, billing ownership, consolidated reporting foundation, central purchasing foundation, warehouse stock compatibility.

## Architecture

### Restaurant organization

Organization → multiple **Branch Accounts** (`restaurant` tenants with `organization_id`). Org owns roles, billing (via main Branch Account), access, consolidated reporting, and central-purchasing drafts. Orders stay owned by destination Branch Accounts.

### Supplier organization

Same pattern with `supplier` Branch Accounts. **Warehouses** remain operational locations under one supplier tenant (not accounts, not shared across Branch Accounts in this version).

### Terminology

| Concept                           | Product term                |
| --------------------------------- | --------------------------- |
| Org child `restaurant`/`supplier` | Branch Account              |
| Legacy `branch` table             | Location / Service Location |
| `warehouse`                       | Warehouse                   |

## Changes (summary)

| Area                   | Previous                  | New                                                                             | Tests                                                 |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `userCanAccessTenant`  | Supplier org only         | Restaurant org mirror + deny deactivated                                        | `tenant-switch.test.js`                               |
| Create Branch Account  | Roles after commit        | Roles inside txn + main-branch `FOR UPDATE`                                     | Covered via org route mocks                           |
| Link existing account  | Migration-only            | `0191` + `branch-account-link-invitations.js` + public accept                   | Route mocks                                           |
| Billing on link/unlink | Child Free rows confusing | Snapshot + suspend child renewal + `billing_review_required`                    | Lib + routes                                          |
| Reactivate / unlink    | Missing                   | Org Owner APIs both tenant types                                                | `org.routes.test.js`, `restaurant-org.routes.test.js` |
| Dead `updateBranch`    | Client PUT                | Removed / unused                                                                | —                                                     |
| Consolidated reports   | Cards only                | `org-reports.service.js` + `/reports/overview`                                  | Route tests                                           |
| Central purchasing     | Catalog string only       | Draft foundation + UI page                                                      | Service + routes                                      |
| Warehouse stock        | Dual SoT, silent skip     | Fail-closed reserve; `supplier-stock.service.js` aggregate; seed script dry-run | `warehouseInventory.test.js`                          |

## Branch lifecycle status

| Action                                            | Status                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Create                                            | Done (transactional)                                         |
| Link / Invite / Accept / Reject / Cancel / Resend | Done (`branch_account_link_invitations`)                     |
| Switch                                            | Done (cookie + org-aware access + active check)              |
| Deactivate / Reactivate                           | Done (capacity check on reactivate)                          |
| Unlink                                            | Done (billing hand-back + history)                           |
| Billing transfer                                  | Done with admin review flag when prepaid cannot auto-resolve |

## Organization capabilities

| Capability             | Status                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| Consolidated reporting | Foundation KPIs + by-branch comparison                                    |
| Organization roles     | Existing; access gap fixed for restaurants                                |
| Central purchasing     | Foundation only (drafts, per-branch submit) — not full compare/pricing UX |

## Warehouses

| Item                   | Status                                              |
| ---------------------- | --------------------------------------------------- |
| Inventory source       | Compatibility layer prefers warehouse when enabled  |
| Default warehouse      | Existing lazy create retained                       |
| Reserve fail-closed    | Done                                                |
| Commit on DELIVERED    | Done (`DISPATCH_ORDER_STATUSES` includes DELIVERED) |
| Aggregated stock       | `listSupplierStockDisplay`                          |
| Transfers              | Not implemented (out of scope)                      |
| Per-warehouse user ACL | Not added; reuse `WAREHOUSES_*`                     |

## Security

- Restaurant org access in `userCanAccessTenant`
- Deactivated Branch Accounts denied
- Regional Manager requires assignment
- Remaining risk: polymorphic UUIDs without FKs; legacy linked-account model still present

## Billing and limits

- Active Branch Accounts (`is_branch_active = true`, including main) count toward plan `branches`
- Growth 1 / Scale 3 / add-ons +1
- Pending invites and deactivated accounts do not count
- Child renewals suspended while org billing owns the Branch Account

## Database

- Migration: `apps/api/db/migrations/0191_branch_account_link_invitations.sql`
- Non-destructive columns + invitation/history/central_purchasing_draft tables
- Dry-run: run migration against development DB before production; review `billing_review_required` rows after link pilots
- Seed script: `apps/api/scripts/seed-warehouse-inventory-from-inventory.js` (verification first; no destructive drop of `inventory`)

## Tests

```text
cd apps/api
npx vitest run src/lib/tenant-switch.test.js src/routes/org.routes.test.js src/routes/restaurant-org.routes.test.js src/services/warehouseInventory.test.js
```

Results (2026-07-20): **25 passed** across 4 files.

## Git workflow

- Implemented on `dev` directly (pricing + AI Reorder already pushed)
- Local backup: `backup/branches-warehouses-pre-impl`
- No commit created by this workstream (awaiting explicit request)

## Remaining limitations

- Central purchasing is foundation-only
- Warehouse transfers not built
- Global `inventory` still exists for legacy consumers
- Full E2E org smoke and migration dry-run against live DB not executed in this report
- Mobile parity: API-compatible; web UI surfaces may need mobile follow-up (document in mobile parity checklist if shipping UI-only)
