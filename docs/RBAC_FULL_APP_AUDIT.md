# RBAC Full Application Audit

**Date:** 2026-05-28  
**Scope:** Restaurants, suppliers, drivers, platform admins, branches/warehouses, impersonation, and all major product areas.  
**Out of scope:** New features, tier pricing/limit changes, Deals/Promotions business logic (except permission bugs), UI redesign.

**Related:** `docs/RBAC_ROLES_PERMISSIONS_AUDIT.md` (driver hardening slice), `docs/architecture/RBAC_PERMISSION_MATRIX.md`, `docs/architecture/RBAC.md`.

---

## 1. Roles found

### Restaurant workspace (`tenant_roles`, `RESTAURANT`)

| System role        | Aliases                                  |
| ------------------ | ---------------------------------------- |
| Owner              | Main Admin                               |
| Restaurant Manager | Manager, Admin/Manager                   |
| Purchaser          | Purchasing Staff                         |
| Receiving Staff    | Inventory Clerk, Kitchen/Receiving Staff |
| Accountant         | Finance Staff                            |
| FOH Staff          | Reservations/Host Staff                  |
| Viewer             | Read-only Staff                          |

### Supplier workspace (`tenant_roles`, `SUPPLIER`)

| System role             | Aliases                            |
| ----------------------- | ---------------------------------- |
| Owner                   | Main Admin                         |
| Supplier Manager        | Manager, Admin/Manager             |
| Warehouse Manager       | —                                  |
| Order Fulfillment Staff | Warehouse Staff, Fulfillment Staff |
| Driver                  | —                                  |
| Catalog Manager         | Catalog/Product Manager            |
| Promotions Manager      | Sales Rep, Sales/Deals Manager     |
| Accountant              | Finance Staff                      |
| Viewer                  | Read-only Staff                    |

### Platform (`app_user.role` + `user_role` / admin permissions)

| Role           | Purpose                                                     |
| -------------- | ----------------------------------------------------------- |
| `ADMIN`        | Platform dashboard, impersonation, tenant/plan management   |
| `RESTAURANT`   | Restaurant tenant workspace                                 |
| `SUPPLIER`     | Supplier tenant workspace                                   |
| `STAFF_PORTAL` | Restaurant employee self-service (separate route namespace) |
| `PENDING`      | Pre-onboarding (blocked from tenant APIs)                   |

Source: `apps/api/src/lib/role-matrix.js`, `apps/api/src/lib/tenant-roles.js`.

---

## 2. Permissions found

All tenant-scoped codes in `apps/api/src/lib/permission-keys.js`:

| Domain                  | Codes                                                          |
| ----------------------- | -------------------------------------------------------------- |
| Orders                  | `ORDERS_VIEW`, `ORDERS_CREATE`, `ORDERS_EDIT`, `ORDERS_MANAGE` |
| Invoices / payments     | `INVOICES_*`, `PAYMENTS_*`                                     |
| Inventory               | `INVENTORY_*`                                                  |
| Reservations            | `RESERVATIONS_*`                                               |
| Team                    | `STAFF_VIEW`, `STAFF_INVITE`, `STAFF_EDIT`, `STAFF_MANAGE`     |
| Settings / custom roles | `SETTINGS_VIEW`, `SETTINGS_EDIT`, `SETTINGS_MANAGE`            |
| Chat                    | `CHAT_VIEW`, `CHAT_SEND`, `CHAT_MANAGE`                        |
| Billing                 | `SUBSCRIPTIONS_VIEW`, `SUBSCRIPTIONS_MANAGE`                   |
| Catalog                 | `CATALOG_VIEW`, `CATALOG_EDIT`, `CATALOG_MANAGE`               |
| Warehouses              | `WAREHOUSES_VIEW`, `WAREHOUSES_EDIT`, `WAREHOUSES_MANAGE`      |
| Receiving               | `RECEIVING_VIEW`, `RECEIVING_MANAGE`                           |
| Fulfillment             | `FULFILLMENT_VIEW`, `FULFILLMENT_MANAGE`                       |
| Promotions / deals      | `PROMOTIONS_VIEW`, `PROMOTIONS_MANAGE`                         |
| Driver portal           | `DRIVER_DELIVERIES_VIEW`, `DRIVER_DELIVERIES_MANAGE`           |

Platform admin: `ADMIN_ACCESS`, `ADMIN_TENANTS`, `ADMIN_PLANS`, `ADMIN_SUPPORT`, `ADMIN_FINANCE`, `ADMIN_GROWTH`.

Conceptual aliases (UI/docs): `PERMISSION_ALIASES` in `permission-keys.js`.

---

## 3. Restaurant role matrix

| Capability                      | Owner | Manager | Purchaser | Receiving | Finance | FOH | Viewer |
| ------------------------------- | :---: | :-----: | :-------: | :-------: | :-----: | :-: | :----: |
| Dashboard / orders browse       |   ✓   |    ✓    |     ✓     |   view    |  view   |  —  |  view  |
| Create orders / cart            |   ✓   |    ✓    |     ✓     |     —     |    —    |  —  |   —    |
| Quick lists                     |   ✓   |    ✓    |     ✓     |     —     |    —    |  —  |  view  |
| Receiving                       |   ✓   |    ✓    |     —     |     ✓     |    —    |  —  |  view  |
| Disputes (via orders/receiving) |   ✓   |    ✓    |     —     |    ✓\*    |    —    |  —  |  view  |
| Reservations                    |   ✓   |    ✓    |     —     |     —     |    —    |  ✓  |  view  |
| Invoices / payments             |   ✓   |  view   |     —     |     —     |    ✓    |  —  |  view  |
| Staff / roles                   |   ✓   |    —    |     —     |     —     |    —    |  —  |   —    |
| Settings / org / billing manage |   ✓   |  view   |     —     |     —     |  view   |  —  |   —    |
| Catalog / suppliers browse      |   ✓   |    ✓    |     ✓     |     —     |    —    |  —  |  view  |
| Reports                         |   ✓   |   ✓†    |    ✓†     |     —     |   ✓†    |  —  | view†  |

\* Receiving staff: `RECEIVING_MANAGE` + `ORDERS_VIEW`; dispute create uses `RECEIVING_MANAGE` or `ORDERS_CREATE`.  
† Requires plan feature `reports` + `ORDERS_VIEW`.

---

## 4. Supplier role matrix

| Capability               | Owner | Manager | Warehouse | Fulfillment | Driver | Catalog |  Sales  | Finance | Viewer |
| ------------------------ | :---: | :-----: | :-------: | :---------: | :----: | :-----: | :-----: | :-----: | :----: |
| Command center           |   ✓   |    ✓    |  partial  |   partial   |   —    | partial | partial | partial |  view  |
| Orders (all)             |   ✓   |    ✓    |   view    |  view/edit  |   —    |  view   |  view   |  view   |  view  |
| Fulfillment board        |   ✓   |    ✓    |     ✓     |      ✓      | scoped |    —    |    —    |    —    |  view  |
| Delivery routes          |   ✓   |    ✓    |     ✓     |      ✓      | scoped |    —    |    —    |    —    |   —    |
| Warehouses               |   ✓   |  view   |     ✓     |    view     |   —    |    —    |    —    |    —    |  view  |
| Product catalog / import |   ✓   |    ✓    |     —     |      —      |   —    |    ✓    |    —    |    —    |  view  |
| Substitutes              |   ✓   |    ✓    |     —     |   propose   |   —    |    ✓    |    —    |    —    |   —    |
| Reorder intelligence     |   ✓   |    ✓    |     —     |      —      |   —    |    —    |    ✓    |    —    |   —    |
| Receivables              |   ✓   |  view   |     —     |      —      |   —    |    —    |    —    |    ✓    |  view  |
| Deals / promotions       |   ✓   |  view   |     —     |      —      |   —    |    —    |    ✓    |    —    |  view  |
| Assign drivers           |   ✓   |    ✓    |     ✓     |      ✓      |   —    |    —    |    —    |    —    |   —    |
| Driver status updates    |   ✓   |    ✓    |     ✓     |      ✓      | scoped |    —    |    —    |    —    |   —    |
| Staff / billing          |   ✓   |    —    |     —     |      —      |   —    |    —    |    —    | partial |  view  |

---

## 5. Driver role matrix

| Action                                      | Allowed                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| View assigned deliveries only               | ✓ (`DRIVER_DELIVERIES_VIEW`, board scoped via `drivers.user_id`) |
| Update delivery status                      | ✓ `out_for_delivery`, `delivered`, `failed`, `rescheduled` only  |
| Proof of delivery / notes                   | ✓ on assigned orders                                             |
| View all supplier orders                    | ✗ (`ORDERS_VIEW` not granted)                                    |
| Catalog, invoices, settings, billing, deals | ✗                                                                |
| Disputes, warehouses, team                  | ✗                                                                |
| Other drivers’ assignments                  | ✗ (`assertDriverAssignmentAccess`)                               |

Implementation: `apps/api/src/lib/driver-rbac.js`, `supplier-ops.routes.js`, `orders-driver.routes.js`, `fulfillment.routes.js`.

---

## 6. Admin / platform role matrix

| Capability                                         | Platform admin (`ADMIN_ACCESS`)                        |
| -------------------------------------------------- | ------------------------------------------------------ |
| Admin dashboard tabs                               | Per `adminPermissions` (tenants, plans, finance, etc.) |
| Impersonate restaurant/supplier                    | ✓ signed cookie; effective tenant permissions          |
| Bypass tenant RBAC while impersonating             | ✗ uses `getImpersonationEffectivePermissions`          |
| Bypass tenant RBAC on `/api/admin-dashboard`       | ✓ when not impersonating                               |
| Cross-tenant resource access without impersonation | ✗                                                      |

---

## 7. Route protection matrix (API)

Middleware stack pattern: `requireAuth` → `resolveTenantContext` → `requireRole([tenant types])` → `requirePermission` / guards → `requireFeature` (tier) → handler with ownership (`requireRestaurantId`, `requireSupplierId`, scoped SQL).

| Prefix                                     | Role gate                          | Permission gate (typical)                                 | Feature gate       |
| ------------------------------------------ | ---------------------------------- | --------------------------------------------------------- | ------------------ |
| `/api/orders`                              | implicit tenant                    | `ORDERS_VIEW`; mutations `ORDERS_CREATE`/`MANAGE`         | order limits       |
| `/api/products`                            | tenant                             | GET: catalog/orders/inventory view; write: `CATALOG_EDIT` | catalog limits     |
| `/api/quick-lists`                         | `RESTAURANT` routes                | `ORDERS_VIEW`; writes `ORDERS_CREATE`                     | `quick_lists`      |
| `/api/receiving`                           | tenant                             | `RECEIVING_VIEW` / `RECEIVING_MANAGE`                     | receiving          |
| `/api/reservations`                        | `RESTAURANT`                       | `RESERVATIONS_*` guards                                   | reservations       |
| `/api/restaurant-finance`, `/api/invoices` | tenant                             | `INVOICES_VIEW` + mutations                               | `finance_invoices` |
| `/api/disputes`                            | per-route `RESTAURANT`/`SUPPLIER`  | `ORDERS_VIEW` / `ORDERS_MANAGE` / `RECEIVING_MANAGE`      | `disputes_returns` |
| `/api/supplier/*`                          | `SUPPLIER`                         | per-endpoint (command center, receivables, board, import) | mixed              |
| `/api/fulfillment`, `/api/drivers`         | `SUPPLIER`                         | `FULFILLMENT_VIEW` / manage                               | `fulfillment`      |
| `/api/warehouses`                          | `SUPPLIER`                         | `WAREHOUSES_VIEW` / edit / manage                         | `warehouses`       |
| `/api/promotions` (supplier CRUD)          | `SUPPLIER`                         | GET: `PROMOTIONS_VIEW` or `MANAGE`; write: `MANAGE`       | `promotions`       |
| `/api/promotions` (restaurant deals)       | `RESTAURANT`                       | public discovery routes                                   | `supplier_deals`   |
| `/api/promotions/pricing`                  | `SUPPLIER`                         | `PROMOTIONS_VIEW` or `MANAGE`                             | —                  |
| `/api/chat`                                | tenant                             | `CHAT_VIEW`; send `CHAT_SEND`                             | chat               |
| `/api/staff`                               | `RESTAURANT` HR routes             | `STAFF_VIEW` + mutation guard                             | staff features     |
| `/api/roles`                               | `RESTAURANT`/`SUPPLIER`            | `SETTINGS_VIEW` / `SETTINGS_MANAGE`                       | `advanced_roles`   |
| `/api/subscriptions`, `/api/billing`       | tenant                             | billing guard / entitlements exempt                       | —                  |
| `/api/reports`                             | per-report `RESTAURANT`/`SUPPLIER` | `ORDERS_VIEW`                                             | reports feature    |
| `/api/admin-dashboard`                     | `ADMIN`                            | `ADMIN_*`                                                 | —                  |
| `/api/branches`, `/api/org`                | tenant                             | `SETTINGS_VIEW` / `SETTINGS_MANAGE` / `STAFF_*`           | org features       |

Driver-specific: `PATCH /api/orders/:id/delivery-status` → `DRIVER_DELIVERIES_MANAGE` or `FULFILLMENT_MANAGE` + assignment scope.

---

## 8. Frontend page / sidebar gating matrix

| Page / nav            | Sidebar permission        | Page guard (`RequirePermission`)  |
| --------------------- | ------------------------- | --------------------------------- |
| Orders                | `ORDERS_VIEW`             | ✓ `ORDERS_VIEW`                   |
| Order detail          | —                         | ✓ `ORDERS_VIEW`                   |
| Cart                  | `ORDERS_CREATE`           | ✓ `ORDERS_CREATE`                 |
| Products              | `CATALOG_VIEW`            | ✓ `CATALOG_VIEW` or `ORDERS_VIEW` |
| Quick lists           | `ORDERS_VIEW`             | ✓ `ORDERS_VIEW`                   |
| Receiving             | `RECEIVING_VIEW`          | ✓                                 |
| Reservations          | `RESERVATIONS_VIEW`       | ✓                                 |
| Disputes              | `ORDERS_VIEW` + feature   | ✓ `ORDERS_VIEW`                   |
| Invoices              | `INVOICES_VIEW` + feature | ✓                                 |
| Fulfillment           | `FULFILLMENT_VIEW`        | ✓                                 |
| Driver deliveries     | driver role only          | ✓ `DRIVER_DELIVERIES_VIEW`        |
| Command center        | anyOf ops perms           | ✓                                 |
| Promotions (supplier) | `PROMOTIONS_*` + feature  | ✓ `PROMOTIONS_VIEW`/`MANAGE`      |
| Deals (restaurant)    | feature                   | ✓ `ORDERS_VIEW` or `CATALOG_VIEW` |
| Staff                 | `STAFF_VIEW`              | ✓                                 |
| Settings (both)       | `SETTINGS_VIEW`           | ✓                                 |
| Supplier settings     | `SETTINGS_VIEW`           | ✓                                 |
| Org                   | `SETTINGS_VIEW`           | ✓                                 |
| Chat                  | `CHAT_VIEW`               | ✓ `CHAT_VIEW`                     |
| Reports               | `ORDERS_VIEW` + feature   | ✓ `ORDERS_VIEW`                   |
| Inventory             | `INVENTORY_VIEW`          | ✓                                 |
| Admin dashboard       | `ADMIN_ACCESS`            | admin role in `AuthGuard`         |

Driver sidebar: only **My Deliveries** (`useWorkspaceRole.isDriverRole`).  
Impersonation: `usePermissions` uses `tenantPermissions` from `/me` (no blanket allow).

---

## 9. API ownership / scope checks

| Resource              | Enforcement                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Orders                | `restaurant_id` / `supplier_id` in queries; supplier status updates check tenant + permissions |
| Invoices              | `assertInvoiceTenantAccess` in `invoices.routes.js`                                            |
| Disputes              | `requireRestaurantId` / `requireSupplierId` on list/detail/actions                             |
| Promotions (supplier) | `supplier_id` on all mutations; IDOR test in `promotions.supplier-security.test.js`            |
| Warehouses            | `getWarehouseForSupplier(warehouseId, supplierId)`                                             |
| Driver assignments    | `assertDriverAssignmentAccess`                                                                 |
| POD                   | `getProofOfDelivery(orderId, supplierId)` ownership                                            |
| Products              | supplier-scoped catalog queries                                                                |

Cross-tenant: `userCanAccessTenant`, `getRequestTenant`, org/branch link checks (`impersonationCanAccessBranch`).

---

## 10. Branch / org scope checks

| Mechanism                       | Behavior                                                    |
| ------------------------------- | ----------------------------------------------------------- |
| `x-branch-id` header            | Supplier branch switch; `userCanAccessTenant`               |
| `active_tenant` cookie          | Primary/linked tenant selection                             |
| `/api/org/*`, `/api/branches/*` | `orgStructureGuard`, `settingsMutationGuard`                |
| Impersonation branch            | Must share `organization_id` or `tenant_account_link`       |
| Org user listing                | `STAFF_VIEW` read; `STAFF_MANAGE` / `SETTINGS_MANAGE` write |

---

## 11. Impersonation checks

| Check                                                   | Status                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| Only initiating admin’s cookie honored                  | ✓ `getEffectiveTenant` matches `adminUserId`                     |
| Effective permissions from view-as role or Owner        | ✓ `getImpersonationEffectivePermissions`                         |
| `requirePermission` does not bypass while impersonating | ✓ admin bypass only when `!isImpersonating && adminContext`      |
| `/me` returns impersonation `tenantPermissions`         | ✓ `auth.routes.js`                                               |
| Frontend respects effective permissions                 | ✓ `usePermissions`                                               |
| Audit actor                                             | Platform audit logs; tenant mutations use real `req.userData.id` |
| `viewAsRoleId` in JWT                                   | Supported; admin UI exposure optional                            |

---

## 12. Bugs found

| #   | Severity | Issue                                                                                                                                                         |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | High     | Supplier promotions **list** (`GET /api/promotions`) required `PROMOTIONS_MANAGE`, blocking Viewer and view-only Manager/Sales browse                         |
| B2  | Medium   | `GET /api/promotions/pricing` had role-only gate — **Driver** could read boost pricing without `PROMOTIONS_VIEW`                                              |
| B3  | Medium   | Many app pages relied on sidebar hiding only — **direct URL** showed full page (orders, cart, chat, disputes, promotions, settings, reports, inventory, etc.) |
| B4  | Low      | Documented in prior audit: some routes still use coarse `ORDERS_VIEW` only (acceptable for disputes list)                                                     |
| B5  | Low      | `viewAsRoleId` not exposed in admin impersonation UI                                                                                                          |

**Not bugs (verified):** Driver blocked from `/api/orders` (no `ORDERS_VIEW`); supplier ops behind `SUPPLIER` role; impersonation no longer blanket-allows tenant mutations; last-owner and subset assignment in `rbac-guards.js`.

---

## 13. Fixes made (this pass)

| Area                   | Change                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `promotions.routes.js` | `promotionsAccessGuard`: GET allows `PROMOTIONS_VIEW` or `MANAGE`; mutations require `MANAGE`; pricing requires view permission                            |
| Frontend pages         | `RequirePermission` on Orders, Order detail, Cart, Quick lists, Chat, Disputes, Promotions, Deals, Reports, Inventory, Supplier settings                   |
| Tests                  | `rbac-full-app.test.js`, `promotions.rbac.test.js`, `rbacFullAppGating.test.tsx`, `rbacCatalogManagerGating.test.tsx`, `rbacRestaurantHostGating.test.tsx` |
| Scripts                | `npm run test:rbac` (root + `apps/api`)                                                                                                                    |

Prior session (see `RBAC_ROLES_PERMISSIONS_AUDIT.md`): Driver role, driver-rbac scoping, impersonation effective permissions, supplier-ops gates, driver user linking.

---

## 14. Remaining risks

| Risk                                                                      | Mitigation                                                       |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Custom roles created by Owner may over-grant                              | `assertCanGrantPermissions` subset rules; Owner-only creates     |
| Action-level buttons may still show before API 403 on some legacy screens | Prefer `usePermissions` + `isViewOnly` on mutations; QA per role |
| Entitlement cache staleness after plan change                             | Re-fetch `/entitlements` on billing/settings                     |
| Restaurant disputes share `ORDERS_VIEW` with general order access         | Aligns with receiving staff matrix                               |
| Admin `viewAsRoleId` not in UI                                            | Defaults to Owner effective perms                                |
| E2E multi-tenant isolation                                                | Run manual QA + future supertest with seeded tenants             |

---

## 15. Manual QA checklist

### Cross-cutting

- [ ] Restaurant user: direct `GET /api/supplier/command-center` → 403
- [ ] Supplier user: direct `GET /api/quick-lists` → 403
- [ ] User A cannot open User B’s order/invoice by ID (404/403)
- [ ] Read-only role: all mutation buttons disabled or API returns 403
- [ ] Tier limit exceeded: 403 with limit payload even when RBAC passes

### Restaurant roles

- [ ] **Owner:** settings, staff, billing, orders, receiving, reservations
- [ ] **Manager:** orders + receiving; no staff/billing manage
- [ ] **Purchaser:** catalog + cart; no invoices/staff
- [ ] **Receiving:** receiving + disputes; no billing/staff
- [ ] **Finance:** invoices; no settings/staff/catalog admin
- [ ] **FOH:** reservations only; direct `/app/orders` → Access restricted
- [ ] **Viewer:** pages load read-only; POST mutations 403

### Supplier roles

- [ ] **Owner:** all areas
- [ ] **Driver:** only My Deliveries nav; board scoped; status whitelist; `/app/products` blocked
- [ ] **Finance:** receivables; no catalog import
- [ ] **Catalog Manager:** products/import; no invoices/settings
- [ ] **Fulfillment:** fulfillment board; no billing
- [ ] **Sales:** promotions + reorder intel; not driver assign
- [ ] **Warehouse Manager:** warehouses + fulfillment; no billing

### Admin / impersonation

- [ ] Impersonate supplier Viewer: promotions list works; create deal 403
- [ ] Impersonation banner visible; permissions match view-as role
- [ ] Exit impersonation restores admin context
- [ ] Last owner cannot be removed/downgraded in team UI

---

## Tests

```bash
# API
cd apps/api && npm run test:rbac

# Web
cd apps/web && npx vitest run src/hooks/rbacGating.test.tsx src/hooks/rbacFullAppGating.test.tsx src/hooks/rbacCatalogManagerGating.test.tsx src/hooks/rbacRestaurantHostGating.test.tsx

# Full script (root)
npm run test:rbac
```

| File                                                   | Coverage                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `apps/api/src/lib/rbac-full-app.test.js`               | Tenant isolation, role matrix, driver rules, impersonation policy, promotions read/write |
| `apps/api/src/lib/rbac-role-access.test.js`            | Role expectations                                                                        |
| `apps/api/src/lib/rbac-guards.test.js`                 | Permission subset                                                                        |
| `apps/api/src/lib/rbac.impersonation.test.js`          | Admin impersonation + `requireRole`                                                      |
| `apps/api/src/routes/promotions.rbac.test.js`          | Driver blocked from pricing; viewer read/mutate                                          |
| `apps/web/src/hooks/rbacGating.test.tsx`               | Driver sidebar                                                                           |
| `apps/web/src/hooks/rbacFullAppGating.test.tsx`        | Finance sidebar + page guard                                                             |
| `apps/web/src/hooks/rbacCatalogManagerGating.test.tsx` | Catalog manager sidebar                                                                  |
| `apps/web/src/hooks/rbacRestaurantHostGating.test.tsx` | FOH sidebar                                                                              |

---

## Files changed (this pass)

**API:** `promotions.routes.js`, `rbac-full-app.test.js`, `promotions.rbac.test.js`, `package.json`  
**Web:** `OrdersPage.tsx`, `OrderDetailPage.tsx`, `CartPage.tsx`, `QuickListsPage.tsx`, `ChatPage.tsx`, `DisputesPage.tsx`, `DisputeDetailPage.tsx`, `PromotionsPage.tsx`, `DealsPage.tsx`, `ReportsPage.tsx`, `InventoryPage.tsx`, `SupplierSettingsPage.tsx`, `rbacFullAppGating.test.tsx`, `rbacCatalogManagerGating.test.tsx`, `rbacRestaurantHostGating.test.tsx`  
**Docs:** `docs/RBAC_FULL_APP_AUDIT.md`  
**Root:** `package.json` (`test:rbac`)
