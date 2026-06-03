# RBAC Roles & Permissions Audit

**Date:** 2026-05-28  
**Scope:** Restaurant & supplier tenant roles, supplier pain-killer features, driver portal, impersonation effective permissions.  
**Out of scope:** Tier pricing/limits, Deals/Promotions business logic, app redesign.

---

## 1. Permission list (tenant-scoped)

| Code                                                  | Domain                             |
| ----------------------------------------------------- | ---------------------------------- |
| `ORDERS_VIEW` / `CREATE` / `EDIT` / `MANAGE`          | Orders                             |
| `INVOICES_*`                                          | Invoices & receivables             |
| `INVENTORY_*`                                         | Inventory                          |
| `RESERVATIONS_*`                                      | Restaurant reservations            |
| `STAFF_*`                                             | Team                               |
| `SETTINGS_*`                                          | Workspace settings & custom roles  |
| `CHAT_*`                                              | Messaging                          |
| `SUBSCRIPTIONS_*` / `PAYMENTS_*`                      | Billing                            |
| `CATALOG_*`                                           | Products & import                  |
| `WAREHOUSES_*`                                        | Warehouses                         |
| `RECEIVING_*`                                         | Restaurant receiving               |
| `FULFILLMENT_*`                                       | Supplier fulfillment board         |
| `PROMOTIONS_*`                                        | Deals & promotions                 |
| `DRIVER_DELIVERIES_VIEW` / `DRIVER_DELIVERIES_MANAGE` | **New** — driver-scoped deliveries |

Platform admin permissions: `ADMIN_ACCESS`, `ADMIN_TENANTS`, `ADMIN_PLANS`, etc.

Source: `apps/api/src/lib/permission-keys.js`

---

## 2. System roles

### Restaurant

| Role                          | Purpose                    |
| ----------------------------- | -------------------------- |
| Owner                         | Full access                |
| Restaurant Manager            | Ops; no billing/team admin |
| Purchaser                     | Order & catalog browse     |
| Receiving Staff               | Receive & disputes context |
| Accountant (Finance Staff)    | Invoices & payments        |
| FOH Staff (Reservations/Host) | Reservations only          |
| Viewer (Read-only Staff)      | All views, no writes       |

### Supplier

| Role                                     | Purpose                    |
| ---------------------------------------- | -------------------------- |
| Owner                                    | Full access                |
| Supplier Manager (Admin/Manager)         | Ops; no billing/team admin |
| Warehouse Manager                        | Warehouses + fulfillment   |
| Order Fulfillment Staff                  | Fulfillment board          |
| Driver                                   | Assigned deliveries only   |
| Catalog Manager                          | Catalog & import           |
| Promotions Manager (Sales/Deals Manager) | Deals + reorder intel      |
| Accountant (Finance Staff)               | Receivables & invoices     |
| Viewer                                   | Read-only                  |

Source: `apps/api/src/lib/role-matrix.js` — synced to DB via `ensureTenantSystemRoles`.

Migration: `0126_rbac_driver_role_hardening.sql` adds `drivers.user_id` for linking app users to driver profiles.

---

## 3. Restaurant role matrix (high level)

| Capability              | Owner | Manager | Purchaser | Receiving | Finance | FOH | Viewer |
| ----------------------- | :---: | :-----: | :-------: | :-------: | :-----: | :-: | :----: |
| Orders create           |   ✓   |    ✓    |     ✓     |     —     |  view   |  —  |  view  |
| Receiving / disputes    |   ✓   |    ✓    |     —     |     ✓     |    —    |  —  |  view  |
| Reservations            |   ✓   |    ✓    |     —     |     —     |    —    |  ✓  |  view  |
| Invoices / payments     |   ✓   |  view   |     —     |     —     |    ✓    |  —  |  view  |
| Staff / settings manage |   ✓   |    —    |     —     |     —     |    —    |  —  |   —    |
| Catalog browse          |   ✓   |    ✓    |     ✓     |     —     |    —    |  —  |  view  |

---

## 4. Supplier role matrix (high level)

| Capability               | Owner | Manager | Warehouse | Fulfillment | Driver | Catalog |  Sales  | Finance | Viewer |
| ------------------------ | :---: | :-----: | :-------: | :---------: | :----: | :-----: | :-----: | :-----: | :----: |
| Command Center           |   ✓   |    ✓    |  partial  |   partial   |   —    | partial | partial | partial |  view  |
| Reorder intelligence     |   ✓   |    ✓    |     —     |      —      |   —    |    —    |    ✓    |    —    |  view  |
| Receivables              |   ✓   |  view   |     —     |      —      |   —    |    —    |    —    |    ✓    |  view  |
| Delivery board (all)     |   ✓   |    ✓    |     ✓     |      ✓      | scoped |    —    |    —    |    —    |  view  |
| Product import           |   ✓   |    ✓    |     —     |      —      |   —    |    ✓    |    —    |    —    |   —    |
| Substitutes (propose)    |   ✓   |    ✓    |     —     |      ✓      |   —    |    ✓    |    —    |    —    |   —    |
| Assign drivers           |   ✓   |    ✓    |     ✓     |      ✓      |   —    |    —    |    —    |    —    |   —    |
| Delivery status (driver) |   ✓   |    ✓    |     ✓     |      ✓      | scoped |    —    |    —    |    —    |   —    |
| Deals                    |   ✓   |  view   |     —     |      —      |   —    |    —    |    ✓    |    —    |  view  |
| Staff / billing          |   ✓   |    —    |     —     |      —      |   —    |    —    |    —    | partial |  view  |

---

## 5. Platform roles

| Role                      | Access                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN`                   | Platform admin dashboard; tenant impersonation with **effective** tenant permissions (Owner default, optional `viewAsRoleId`) |
| `RESTAURANT` / `SUPPLIER` | Tenant workspace via `tenant_user_roles`                                                                                      |
| `STAFF_PORTAL`            | Separate staff portal auth                                                                                                    |

---

## 6. Route protection matrix (supplier pain-killer & driver)

| Route                                          | Permission gate                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/supplier/command-center`             | Any: `ORDERS_MANAGE`, `INVOICES_VIEW`, `CATALOG_EDIT`, `FULFILLMENT_VIEW`, `PROMOTIONS_MANAGE`   |
| `GET/POST /api/supplier/reorder-intelligence*` | `ORDERS_MANAGE` or `PROMOTIONS_MANAGE`                                                           |
| `GET /api/supplier/deliveries/board`           | `FULFILLMENT_VIEW` or `DRIVER_DELIVERIES_VIEW` (driver → auto-scope to linked `drivers.user_id`) |
| `GET /api/supplier/invoices/receivables*`      | `INVOICES_VIEW` + finance feature                                                                |
| `POST /api/supplier/products/import*`          | `CATALOG_EDIT`                                                                                   |
| Substitutes CRUD                               | `CATALOG_VIEW` / `CATALOG_EDIT`                                                                  |
| Substitute propose                             | `ORDERS_MANAGE` or `CATALOG_EDIT` or `FULFILLMENT_MANAGE`                                        |
| `PATCH /api/orders/:id/delivery-status`        | `FULFILLMENT_MANAGE` or `DRIVER_DELIVERIES_MANAGE` (driver: assigned only + status whitelist)    |
| POD submit/get                                 | Same as above + supplier ownership on GET                                                        |

All supplier routes: `requireRole(['SUPPLIER','ADMIN'])` + `resolveTenantContext`.

---

## 7. Frontend gating matrix

| Page / nav           | Gate                                                    |
| -------------------- | ------------------------------------------------------- |
| Sidebar items        | `permission` or `anyOf` via `usePermissions`            |
| Driver nav           | Only **My Deliveries** when `isDriverRole`              |
| Command Center       | `RequirePermission` anyOf command-center perms          |
| Products             | `CATALOG_VIEW` or `ORDERS_VIEW`                         |
| Fulfillment          | `FULFILLMENT_VIEW`                                      |
| Invoices             | `INVOICES_VIEW`                                         |
| Reservations         | `RESERVATIONS_VIEW`                                     |
| Staff                | `STAFF_VIEW`                                            |
| Settings             | `SETTINGS_VIEW`                                         |
| Driver home redirect | `/app/driver-deliveries`                                |
| Impersonation UI     | Uses `tenantPermissions` from `/me` (not blanket allow) |

---

## 8. Bugs found (pre-fix)

1. No **Driver** tenant role; drivers were DB records only.
2. Supplier ops routes used weak gates (`ORDERS_VIEW` for command center & reorder).
3. Admin impersonation bypassed all `requirePermission` checks.
4. Frontend `usePermissions` returned `true` for all keys while impersonating.
5. Command Center / products lacked `RequirePermission` (sidebar-only hiding).
6. POD GET lacked supplier ownership check.
7. Delivery board showed all supplier deliveries to any fulfillment viewer (no driver scope).

---

## 9. Fixes made

- Added `DRIVER_DELIVERIES_*` permissions and **Driver** system role.
- Added **Warehouse Manager**; aligned legacy names (Finance, Sales, Host, Read-only).
- `driver-rbac.js`: link user ↔ driver, scope board, restrict driver status updates.
- Hardened `supplier-ops.routes.js` permission gates.
- Impersonation: effective permissions from view-as role or Owner; removed tenant bypass in `requirePermission`.
- `/me` returns impersonation-effective `tenantPermissions`.
- Frontend: driver page, sidebar, home redirects, `RequirePermission` on key pages.
- `getProofOfDelivery(orderId, supplierId)` ownership check.

### 9.1 Plan-tier feature warnings (Quick Lists on Gold)

**Root cause:** The plan-tier banner (`Layout.tsx` → `getPlanTierDisabledFeatures`) treated any `featureSources[key] === 'default'` with `features.quick_lists === false` as “not included,” even when the plan JSON never defined `quick_lists` (e.g. Supplier Gold). Separately, `resolveAllFeaturesForTenant` coerced enabled plan values to boolean `true`, so tier strings like `full_schedule` were lost in `features.*` and strict UI checks could mis-read entitlements.

**Fixes:**

- `feature-flags.js`: store raw plan feature values when enabled (strings count as on).
- `externallyControlledFeatures.ts`: skip `default`-source keys absent from `planFeatures`.
- Page/sidebar gates use `isEntitlementFeatureEnabled` (checks `features` and `planFeatures`, treats tier strings as enabled).

### 9.2 Driver user linking

**API:** `driver-user-link.js` — link/unlink, list unlinked, auto-create on Driver role assign; `drivers.routes.js` accepts `user_id`; `tenant-roles.routes.js` accepts `driver_id` / `create_driver_profile`; branch invite accept syncs Driver profile.

**UI:** `DriversSettingsPanel` — link driver to team user, linked/unlinked badges; `TeamRolesPanel` — Driver role assign dialog (link existing unlinked profile or auto-create); `BranchInviteModal` — note that Driver invites auto-link on accept.

**Validation:** One active `drivers.user_id` per supplier user; driver profile cannot link two users.

---

## 10. Remaining risks

| Risk                                                                       | Mitigation                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------ |
| Team invite still uses branch invitations; Driver auto-link runs on accept | Settings → Drivers panel for manual link before accept |
| Optional `viewAsRoleId` on impersonate API not exposed in admin UI yet     | Defaults to Owner permissions                          |
| Custom tenant roles may over-grant if created by Owner                     | Existing `assertCanAssignRole` subset rules            |
| Some legacy routes may still use coarse `ORDERS_VIEW` only                 | Continue audit per-route                               |
| Restaurant disputes use `ORDERS_VIEW` not a dedicated permission           | Acceptable for receiving staff per matrix              |
| Entitlement cache staleness after plan change                              | Re-fetch `/entitlements` on settings/plan tab          |

---

## 11. Manual QA checklist

- [ ] Supplier **Driver**: login → only My Deliveries nav; board shows assigned orders only; can set out_for_delivery / delivered / failed / rescheduled; cannot open `/app/products`, `/app/invoices`, `/app/settings`.
- [ ] Supplier **Finance**: receivables on invoices; cannot product import.
- [ ] Supplier **Catalog Manager**: import works; receivables API 403.
- [ ] Supplier **Fulfillment**: fulfillment board; billing 403.
- [ ] Supplier **Sales**: reorder intelligence; not driver board assign.
- [ ] Restaurant **FOH**: reservations; staff/billing pages blocked.
- [ ] Restaurant **Receiving**: receiving; no invoices/staff.
- [ ] Restaurant **Finance**: invoices; no settings manage.
- [ ] Direct URL to blocked page shows “Access restricted”.
- [ ] API direct call without permission returns 403.
- [ ] Last owner cannot be removed/downgraded (staff UI).
- [ ] Admin impersonation: UI matches Owner (or view-as role); billing mutations still audited.

---

## 12. Tests

| File                                                    | Coverage                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/api/src/lib/rbac-role-access.test.js`             | Role matrix expectations, driver status rules                    |
| `apps/api/src/lib/rbac-guards.test.js`                  | Permission subset / escalation                                   |
| `apps/api/src/lib/driver-user-link.test.js`             | Link validation, Driver role sync                                |
| `apps/api/src/lib/feature-flags.test.js`                | Tier string values preserved in entitlements                     |
| `apps/web/src/hooks/rbacGating.test.tsx`                | Driver sidebar hiding                                            |
| `apps/web/src/lib/externallyControlledFeatures.test.ts` | Gold/Silver quick_lists, branch billing, supplier plan omissions |

Run:

```bash
cd apps/api && npx vitest run src/lib/rbac-role-access.test.js src/lib/rbac-guards.test.js src/lib/driver-user-link.test.js src/lib/feature-flags.test.js
cd apps/web && npx vitest run src/hooks/rbacGating.test.tsx src/lib/externallyControlledFeatures.test.ts
```

---

## Files changed (summary)

**API:** `permission-keys.js`, `role-matrix.js`, `tenant-roles.js`, `tenant-roles.routes.js`, `viewer-permissions.js`, `driver-rbac.js`, `driver-user-link.js`, `drivers.routes.js`, `branch-invitations.js`, `rbac.js`, `impersonation.js`, `auth.routes.js`, `supplier-ops.routes.js`, `orders-driver.routes.js`, `driver-fulfillment.service.js`, `feature-flags.js`, `subscriptions.routes.js`, `0126_rbac_driver_role_hardening.sql`, `rbac-role-access.test.js`, `driver-user-link.test.js`, `feature-flags.test.js`

**Web:** `usePermissions.ts`, `useWorkspaceRole.ts`, `Sidebar.tsx`, `Layout.tsx` (via `externallyControlledFeatures`), `externallyControlledFeatures.ts`, `planLimits.ts`, `SupplierHome.tsx`, `DriverDeliveriesPage.tsx`, `SupplierCommandCenterPage.tsx`, `ProductsPage.tsx`, `ReservationsPage.tsx`, `DriversSettingsPanel.tsx`, `TeamRolesPanel.jsx`, `BranchInviteModal.tsx`, disputes/orders/invoices pages, `App.tsx`, `api.ts`, `rbacGating.test.tsx`, `externallyControlledFeatures.test.ts`
