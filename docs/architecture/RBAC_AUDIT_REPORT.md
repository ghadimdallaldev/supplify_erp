# RBAC Audit Report

Date: 2026-05-27 (RBAC hardening pass — complete)

## Summary

This pass closed the remaining coarse-auth gaps on org, reviews, subscriptions, suppliers, files, and notifications routes, and added page-level `RequirePermission` gates on Staff, Fulfillment, Invoices, Receiving, Settings, and Organization pages. Backend remains the source of truth; Keycloak is identity-only.

**The application is not “fully secure” in the abstract** — security depends on deployment, secrets, and ongoing review — but every route in the focus list now uses fine-grained permission checks, and default roles enforce Viewer read-only and Accountant finance-only scopes.

## Routes that were missing fine-grained checks (fixed)

| Route file                 | Before                                            | After                                                                                                                         |
| -------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `restaurant-org.routes.js` | `requireAuth` + org membership + legacy Org Owner | `resolveTenantContext` + `orgStructureGuard` (`SETTINGS_VIEW` / `SETTINGS_MANAGE`, `STAFF_VIEW` / `STAFF_MANAGE` on `/users`) |
| `org.routes.js`            | Same (supplier org)                               | Same `orgStructureGuard`                                                                                                      |
| `reviews.routes.js`        | Auth + feature flag only on writes                | `reviewsAccessGuard` (`ORDERS_VIEW` read, `ORDERS_CREATE`/`EDIT`/`MANAGE` write)                                              |
| `subscriptions.routes.js`  | Mixed; plans/recommendation open                  | `subscriptionRouteGuard` — `entitlements` + `current` stay open; other routes use `billingAccessGuard`                        |
| `suppliers.routes.js`      | Role-only on follow/block/statistics/`GET :id`    | `CATALOG_VIEW`, `SETTINGS_EDIT`, `restaurantSupplierMutationGuard` on follow/block; tenant-scoped blocklist fix               |
| `files.routes.js`          | Auth + role only                                  | `filesUploadGuard` (`CATALOG_EDIT`, `SETTINGS_*`, `STAFF_*`, `RECEIVING_MANAGE`, `INVOICES_*`)                                |
| `notifications.routes.js`  | Auth only                                         | `notificationsMutationGuard` (`SETTINGS_EDIT` for preferences, `SETTINGS_MANAGE` for `/test`)                                 |

Previously hardened (earlier pass): `staff`, `reservations`, `invoices`, `branches`, `quick-lists`, `chat`, `billing`, `orders`, `products`, `promotions`, `receiving`, `fulfillment`, `tenant-roles`, etc.

## Pages that were missing frontend protection (fixed)

| Page                                                    | Gate                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `StaffPage.tsx`                                         | `RequirePermission` `STAFF_VIEW`; write actions hidden without `STAFF_EDIT`/`MANAGE`/`INVITE` |
| `FulfillmentPage.tsx`                                   | `RequirePermission` `FULFILLMENT_VIEW`                                                        |
| `InvoicesPage.tsx`                                      | `RequirePermission` `INVOICES_VIEW`; Pay actions need `INVOICES_*` / `PAYMENTS_MANAGE`        |
| `ReceivingPage.tsx`                                     | `RequirePermission` `RECEIVING_VIEW`; receive submit needs `RECEIVING_MANAGE`                 |
| `SettingsPage.tsx`                                      | `SETTINGS_VIEW` wrapper; notification save needs `SETTINGS_EDIT`/`MANAGE`                     |
| `OrgOverviewPage.tsx` / `RestaurantOrgOverviewPage.tsx` | `SETTINGS_VIEW`; branch admin uses `SETTINGS_MANAGE` (not legacy Org Owner string)            |
| New: `RequirePermission.tsx`                            | Reusable direct-URL block with access-denied card                                             |

`Sidebar.tsx`, `OrdersPage`, `ProductsPage`, `SupplierSettingsPage`, etc. were gated in the prior pass.

## What was fixed (behavior)

- **Viewer**: Cannot POST/PATCH/DELETE on org, reviews, supplier follow/block, file upload, staff (API + UI).
- **Accountant**: Can access invoices/subscriptions views; cannot access staff/org structure or settings admin.
- **Tenant isolation**: Supplier blocklist uses `getRequestTenant()` restaurant id (was incorrectly `userData.id`).
- **Invitation / cache**: Unchanged — `invitation-accept.js` still calls `invalidateUserPermissionCache`; role sync script documented below.

## Tests added / updated

- `apps/api/src/lib/route-permissions.test.js` — `orgStructureGuard`, `reviewsAccessGuard`, `restaurantSupplierMutationGuard`, Viewer/Accountant/Owner matrix writes
- `apps/api/src/lib/tenant-role-matrix.test.js` — (existing) default role coverage
- Route test mocks updated: `requireAnyPermission` + tenant permissions for `subscriptions`, `reviews`, `billing`, `feature-gates`

Run:

```bash
pnpm db:sync-roles
cd apps/api && npx vitest run src/lib/route-permissions.test.js src/lib/tenant-role-matrix.test.js src/lib/permissions.test.js src/lib/invitation-role-assignment.test.js
cd apps/api && npx vitest run src/routes/reviews.routes.test.js src/routes/subscriptions.routes.test.js src/routes/billing.routes.test.js
```

## Role sync (documented)

After deploy or matrix changes:

```bash
pnpm db:sync-roles
# or: node apps/api/scripts/sync-system-roles.mjs
```

Syncs system roles from `apps/api/src/lib/role-matrix.js` via `ensureTenantSystemRoles`. Owner role receives full tenant permission set; custom roles only get assigned permissions.

## Keycloak vs DB

- **Keycloak**: Authentication and high-level realm roles only.
- **DB** (`tenant_user_roles`, `user_workspace_membership`, `role_permission`): Authorization source of truth for workspace actions.

## Manual review still recommended

- **E2E**: Log in as Viewer / Accountant / Purchaser / Owner and hit `/app/staff`, `/app/invoices`, `/app/org` directly.
- **Public routes**: `GET /api/reviews/suppliers/:id` remains public (marketplace ratings).
- **Entitlements**: `GET /subscriptions/entitlements` and `/current` remain available to any authenticated tenant (UI limits); billing detail routes require `SUBSCRIPTIONS_VIEW`.
- **Pre-existing CI**: Web `tsc` failures in socket `transports`, RTK `Conversations` tag, `DealTargetingPickers` — not introduced by this pass.
- **Lint**: Repo uses `--max-warnings 0`; many pre-existing warnings fail `pnpm lint`.

## Key files

- `apps/api/src/lib/route-permissions.js` — shared guards
- `apps/api/src/lib/role-matrix.js` — canonical roles
- `apps/api/scripts/sync-system-roles.mjs` — backfill script
- `apps/web/src/components/RequirePermission.tsx` — page-level gate
