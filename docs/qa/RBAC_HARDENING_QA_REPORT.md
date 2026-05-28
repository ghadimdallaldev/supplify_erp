# QA Report — RBAC Hardening Pass

Date: 2026-05-27

## Scope

Verification of the RBAC hardening pass: backend fine-grained permissions on remaining routes, frontend page gates, role matrix tests, and build/test pipeline.

## Automated verification

| Step                  | Command                                                                                  | Result                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Role sync             | `node apps/api/scripts/sync-system-roles.mjs`                                            | **Pass** — “System roles synced for all tenants”                                                         |
| RBAC unit tests       | `vitest run route-permissions tenant-role-matrix permissions invitation-role-assignment` | **Pass** — 43 tests                                                                                      |
| Route tests (touched) | `vitest run reviews subscriptions billing feature-gates`                                 | **Pass** — 36 tests                                                                                      |
| API full suite        | `cd apps/api && npx vitest run`                                                          | **Partial** — 396 passed, 19 failed (pre-existing / unrelated mocks; RBAC-focused tests pass)            |
| Lint                  | `pnpm lint`                                                                              | **Fail** — pre-existing warnings (`max-warnings 0` on web)                                               |
| Typecheck             | `pnpm typecheck`                                                                         | **Fail** — pre-existing TS errors (socket `transports`, RTK tag `Conversations`, `DealTargetingPickers`) |
| Web build             | Not run to completion (blocked by typecheck)                                             | **Blocked**                                                                                              |

## RBAC test scenarios (automated)

| Scenario                             | Evidence                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Viewer cannot write (matrix)         | `route-permissions.test.js` — no `ORDERS_CREATE`, `STAFF_INVITE`, `SETTINGS_MANAGE`, etc. |
| Accountant finance-only              | `tenant-role-matrix.test.js` + `route-permissions` Accountant case                        |
| Owner full access                    | Matrix Owner has all tenant permissions                                                   |
| Org POST branches blocked for viewer | `orgStructureGuard` test                                                                  |
| Review POST blocked for viewer       | `reviewsAccessGuard` test                                                                 |
| Follow supplier blocked for viewer   | `restaurantSupplierMutationGuard` test                                                    |
| Staff POST blocked for viewer        | `staffMutationGuard` test (prior pass)                                                    |

## Manual QA checklist (recommended)

### Restaurant Viewer

- [ ] Open `/app/staff` → “Access denied” (no team data from UI)
- [ ] `POST /api/staff/members` → **403**
- [ ] Open `/app/invoices` → can view; no Pay button
- [ ] `POST /api/reviews/suppliers/:id` → **403**
- [ ] Open `/app/settings` → read-only or denied per `SETTINGS_VIEW`

### Restaurant Accountant

- [ ] `/app/invoices` loads; can record payment if `INVOICES_MANAGE` / `PAYMENTS_MANAGE`
- [ ] `/app/staff` → denied
- [ ] `/app/org` → denied without `SETTINGS_VIEW`

### Restaurant Owner (Main Admin)

- [ ] All above pages load; create staff, pay invoice, manage org branches

### Supplier Order Fulfillment / Viewer

- [ ] `/app/fulfillment` — Viewer sees board read-only; mutations **403** without `FULFILLMENT_MANAGE`

### Cross-tenant

- [ ] User A cannot `GET`/`PATCH` supplier B profile or follow as restaurant B

## Files changed (summary)

**API:** `route-permissions.js`, `restaurant-org.routes.js`, `org.routes.js`, `reviews.routes.js`, `subscriptions.routes.js`, `suppliers.routes.js`, `files.routes.js`, `notifications.routes.js`, related `*.test.js`

**Web:** `RequirePermission.tsx`, `StaffPage`, `FulfillmentPage`, `InvoicesPage`, `ReceivingPage`, `SettingsPage`, `OrgOverviewPage`, `RestaurantOrgOverviewPage`

**Docs:** [RBAC audit report](../architecture/RBAC_AUDIT_REPORT.md), this file

## Sign-off

- RBAC focus routes: **addressed**
- Default role matrix: **verified in unit tests**
- Production readiness: **requires** manual E2E checklist above + fixing pre-existing typecheck/lint before release
