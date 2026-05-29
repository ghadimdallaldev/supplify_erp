# RBAC Roles & Permissions — Functionality Audit

**Date:** 2026-05-28  
**Scope:** Restaurant & supplier tenant roles (UI → API → DB → guards → nav → direct API).  
**Out of scope:** Tier pricing/limits, Deals/Promotions business logic, app redesign, RBAC rewrite.

---

## Executive summary

| Question                          | Answer                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Are roles DB-backed?              | **Yes** — `tenant_roles` per tenant; system roles seeded/synced from `role-matrix.js`                       |
| Are permissions DB-backed?        | **Yes** — `tenant_role_permissions.permission` (string codes)                                               |
| Is the Roles UI static?           | **No** — lists from `GET /api/roles`; checkboxes use canonical keys from `permissionLabels.js`              |
| Is backend enforcement mandatory? | **Yes** — `requirePermission` / `requireAnyPermission` on routes; subset/owner guards on assign/grant       |
| Fully functional?                 | **Yes**, with documented residual risks (coarse gates on some legacy routes, `advanced_roles` feature flag) |

**Verdict:** Roles and permissions are end-to-end functional for both tenant types. One UI gap (Driver permission labels in role editor) was fixed in this audit.

---

## 1. Roles page audit (UI)

| #   | Check                       | Result                                                                                                   |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Roles from DB vs static     | **DB** — `useGetTenantRolesQuery` → `GET /api/roles` → `tenant_roles`                                    |
| 2   | Checkboxes map to real keys | **Yes** — keys match `permission-keys.js` / `getAllPermissionsForTenantType()`                           |
| 3   | Permission changes persist  | **Custom roles only** — `PATCH` replaces `tenant_role_permissions`; system roles reject permission edits |
| 4   | Role changes affect access  | **Yes** — `tenant_user_roles` + `invalidateUserPermissionCache`; `/auth/me` returns `tenantPermissions`  |
| 5   | System roles locked         | **Yes** — `is_system`; API blocks name/permission edits; UI shows lock icon, checklist `disabled`        |
| 6   | Custom roles CRUD           | **Yes** — create/edit/delete when `advanced_roles` entitlement enabled                                   |
| 7   | User counts real            | **Yes** — SQL `(SELECT COUNT(*) FROM tenant_user_roles WHERE role_id = tr.id)`                           |
| 8   | Select all / partial        | **Yes** — `RolePermissionChecklist` domain toggles; saves full `permissions[]` on custom role save       |
| 9   | Disabled checkboxes         | **System roles** (read-only expand); **Owner** in assign flow needs Owner confirm                        |
| 10  | Locked roles safe           | **Yes** — cannot delete system roles; Owner cannot change permissions                                    |

**Feature gate:** Roles tab hidden unless `advanced_roles` entitlement. Without it, team is Owner/Viewer only (legacy branch invite).

**Display names vs user list:** UI shows **Accountant** (not “Account”). **Promotions Manager** replaces legacy **Sales Rep** / **Sales/Deals Manager** (DB rename via migration `0105` + `legacyNames` in `role-matrix.js`).

**Files:** `apps/web/src/components/TeamRolesPanel.jsx`, `RolePermissionChecklist.jsx`, `apps/web/src/lib/permissionLabels.js`

---

## 2. Backend RBAC inventory

### Tables

| Table                                                | Purpose                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `tenant_roles`                                       | Per-tenant role definitions (`is_system`, `name`, `description`) |
| `tenant_role_permissions`                            | Role → permission code rows                                      |
| `tenant_user_roles`                                  | User → role per tenant (primary enforcement path)                |
| `role`, `permission`, `role_permission`, `user_role` | Legacy global RBAC (merged if named role empty)                  |
| `drivers.user_id`                                    | Links Driver role users to delivery scope                        |

**Migrations:** `0078_tenant_named_roles.sql`, `0105_rbac_system_roles_matrix.sql`, `0126_rbac_driver_role_hardening.sql`

### Seed / sync

- **Canonical matrix:** `apps/api/src/lib/role-matrix.js`
- **Runtime sync:** `ensureTenantSystemRoles()` on roles API access and deploy script `sync-system-roles.mjs`
- **Owner backfill:** `assignOwnerRoleForUser`, `migrate-users-to-roles.js`

### Permission resolution

`getPermissionsForUser()` → tenant named role perms + legacy + org overlays; cached 5 min (`perms:{userId}:{tenantId}:{tenantType}`).

### Guards

| Layer               | Module                                                                             |
| ------------------- | ---------------------------------------------------------------------------------- | ---------- | ---------- |
| Auth                | `requireAuth`, `requireRole(['RESTAURANT'                                          | 'SUPPLIER' | 'ADMIN'])` |
| Tenant context      | `resolveTenantContext`                                                             |
| Permission          | `requirePermission`, `requireAnyPermission`                                        |
| Mutation tiers      | `route-permissions.js` (staff, invoices, reservations, orders, settings)           |
| Assign/grant safety | `rbac-guards.js` (`assertCanAssignRole`, `assertCanGrantPermissions`, last Owner)  |
| Driver scope        | `driver-rbac.js`, `driver-user-link.js`, fulfillment board filters                 |
| Impersonation       | `impersonation.js` — effective perms; **no** blanket bypass in `requirePermission` |
| Feature limits      | `requireFeature` (separate from RBAC)                                              |

### APIs

| Endpoint                           | Permission                                         |
| ---------------------------------- | -------------------------------------------------- |
| `GET/POST/PATCH/DELETE /api/roles` | `SETTINGS_VIEW` / `SETTINGS_MANAGE`                |
| `GET /api/roles/users`             | `SETTINGS_VIEW`                                    |
| `POST /api/roles/users/:id/assign` | `SETTINGS_MANAGE` + `assertCanAssignRole`          |
| Team invite                        | Branch/org invitations + role assignment on accept |

---

## 3. Restaurant roles (system)

| UI name                 | DB name                | Editable perms               | Notes                                  |
| ----------------------- | ---------------------- | ---------------------------- | -------------------------------------- |
| Owner                   | Owner                  | No (always full set on sync) | All `RESTAURANT_*` permissions         |
| Admin/Manager           | **Restaurant Manager** | No                           | Ops; no billing/team admin             |
| Purchasing Staff        | **Purchaser**          | No                           | Orders + catalog browse                |
| Kitchen/Receiving Staff | **Receiving Staff**    | No                           | Receiving + order view                 |
| Finance Staff           | **Accountant**         | No                           | Invoices, payments, subscriptions view |
| Reservations/Host Staff | **FOH Staff**          | No                           | Reservations create/edit               |
| Read-only Staff         | **Viewer**             | No                           | All `*_VIEW` for restaurant workspace  |
| Custom                  | User-defined           | Yes                          | Subset grant + reserved name check     |

---

## 4. Supplier roles (system)

| UI name                  | DB name                     | Editable perms | Notes                                              |
| ------------------------ | --------------------------- | -------------- | -------------------------------------------------- |
| Owner                    | Owner                       | No             | Full supplier permission set                       |
| Supplier Manager / Admin | **Supplier Manager**        | No             | Ops; no `SETTINGS_MANAGE` / `SUBSCRIPTIONS_MANAGE` |
| Catalog/Product Manager  | **Catalog Manager**         | No             | Catalog + inventory; no invoices/settings          |
| Warehouse Manager        | **Warehouse Manager**       | No             | Warehouses, fulfillment, inventory                 |
| Order Fulfillment Staff  | **Order Fulfillment Staff** | No             | Fulfillment board; no decline/billing              |
| Driver                   | **Driver**                  | No             | `DRIVER_DELIVERIES_*` only                         |
| Finance/Account Staff    | **Accountant**              | No             | Invoices, payments                                 |
| Sales Rep (legacy)       | **Promotions Manager**      | No             | Promotions + orders manage                         |
| Viewer                   | **Viewer**                  | No             | Supplier `*_VIEW` set (read-only)                  |
| Custom                   | User-defined                | Yes            | Validated against `SUPPLIER_PERMISSIONS`           |

---

## 5. Permission key list (tenant-scoped)

Restaurant-only extras: `RESERVATIONS_*`  
Supplier-only extras: `CATALOG_*`, `WAREHOUSES_*`, `FULFILLMENT_*`, `PROMOTIONS_*`, `DRIVER_DELIVERIES_*`

Shared: `ORDERS_*`, `INVOICES_*`, `INVENTORY_*`, `STAFF_*`, `SETTINGS_*`, `CHAT_*`, `SUBSCRIPTIONS_*`, `RECEIVING_*`, `PAYMENTS_*`

**Removed (cannot assign):** `approvals_budgets` and any key not in `getAllPermissionsForTenantType()` → `400 Invalid permissions`.

**Source:** `apps/api/src/lib/permission-keys.js`, `apps/api/src/lib/tenant-roles.js` (`RESTAURANT_PERMISSIONS` / `SUPPLIER_PERMISSIONS`)

---

## 6. Role → permission matrix (canonical)

Defined in `apps/api/src/lib/role-matrix.js`, synced to DB on every `ensureTenantSystemRoles` run.

See also: `docs/architecture/RBAC_PERMISSION_MATRIX.md`

### Restaurant (abbreviated)

| Permission           | Owner |   Mgr   | Purchaser | Receiving | Accountant |   FOH   | Viewer |
| -------------------- | :---: | :-----: | :-------: | :-------: | :--------: | :-----: | :----: |
| ORDERS_CREATE        |   ✓   |    ✓    |     ✓     |     —     |     —      |    —    |   —    |
| RECEIVING_MANAGE     |   ✓   |    ✓    |     —     |     ✓     |     —      |    —    |   —    |
| RESERVATIONS_CREATE  |   ✓   |    ✓    |     —     |     —     |     —      |    ✓    |   —    |
| INVOICES_MANAGE      |   ✓   |    —    |     —     |     —     |     ✓      |    —    |   —    |
| STAFF_MANAGE         |   ✓   |    —    |     —     |     —     |     —      |    —    |   —    |
| SETTINGS_MANAGE      |   ✓   |    —    |     —     |     —     |     —      |    —    |   —    |
| \*\_VIEW (workspace) |   ✓   | partial |  partial  |  partial  |  partial   | partial |   ✓    |

### Supplier (abbreviated)

| Permission           | Owner | Mgr | Warehouse | Fulfillment | Driver | Catalog | Promotions | Accountant | Viewer |
| -------------------- | :---: | :-: | :-------: | :---------: | :----: | :-----: | :--------: | :--------: | :----: |
| ORDERS_MANAGE        |   ✓   |  ✓  |     —     |      —      |   —    |    —    |     ✓      |     —      |   —    |
| FULFILLMENT_MANAGE   |   ✓   |  ✓  |     ✓     |      ✓      |   —    |    —    |     —      |     —      |   —    |
| DRIVER*DELIVERIES*\* |   ✓   |  —  |     —     |      —      |   ✓    |    —    |     —      |     —      |  view  |
| CATALOG_MANAGE       |   ✓   |  ✓  |     —     |      —      |   —    |    ✓    |     —      |     —      |   —    |
| PROMOTIONS_MANAGE    |   ✓   |  —  |     —     |      —      |   —    |    —    |     ✓      |     —      |   —    |
| INVOICES_VIEW        |   ✓   |  ✓  |     —     |      —      |   —    |    —    |     —      |     ✓      |   ✓    |
| SETTINGS_MANAGE      |   ✓   |  —  |     —     |      —      |   —    |    —    |     —      |     —      |   —    |

---

## 7. Permission group → API route matrix

| Group             | Representative routes                                    | Gate                                                  |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| Orders            | `/api/orders/*`                                          | `ORDERS_VIEW` + `ordersRouterMutationGuard`           |
| Invoices          | `/api/invoices/*`, `/api/supplier/invoices/receivables*` | `INVOICES_VIEW` + mutation guards                     |
| Inventory         | `/api/inventory/*`, restaurant inventory                 | `INVENTORY_VIEW` / `*_EDIT`                           |
| Catalog           | `/api/products/*`, supplier import                       | `CATALOG_VIEW` / `CATALOG_EDIT`                       |
| Warehouses        | `/api/warehouses/*`                                      | `WAREHOUSES_VIEW` / `*_EDIT`                          |
| Staff             | `/api/staff/*`                                           | `STAFF_VIEW` + `staffMutationGuard`                   |
| Settings          | `/api/settings/*`, `/api/roles/*`                        | `SETTINGS_VIEW` / `SETTINGS_MANAGE`                   |
| Chat              | `/api/chat/*`                                            | `CHAT_VIEW` / `CHAT_SEND`                             |
| Subscriptions     | `/api/subscriptions/*`, billing                          | `SUBSCRIPTIONS_*` + `requireFeature`                  |
| Reservations      | `/api/reservations/*`                                    | `RESERVATIONS_*` (restaurant)                         |
| Receiving         | `/api/receiving/*`                                       | `RECEIVING_*`                                         |
| Disputes          | `/api/disputes/*`                                        | Often `ORDERS_VIEW` / `RECEIVING_MANAGE`              |
| Credit notes      | `/api/credit-notes/*`                                    | Invoice/order context                                 |
| Promotions/Deals  | `/api/promotions/*`                                      | `PROMOTIONS_VIEW` (GET) / `PROMOTIONS_MANAGE` (write) |
| Fulfillment       | `/api/fulfillment/*`                                     | `FULFILLMENT_VIEW` / `FULFILLMENT_MANAGE`             |
| Driver deliveries | `/api/orders/driver/*`, delivery status POD              | `DRIVER_DELIVERIES_*` + driver assignment scope       |
| Branches          | `/api/branches/*`                                        | `SETTINGS_*` + org membership                         |
| Reports           | `/api/reports/*`                                         | `ORDERS_VIEW` / `INVOICES_VIEW`                       |
| Supplier ops      | `/api/supplier/command-center`, reorder intel            | `requireAnyPermission` (least privilege)              |

**Tenant isolation:** Restaurant routes use `requireRole(['RESTAURANT', 'ADMIN'])`; supplier routes use `requireRole(['SUPPLIER', 'ADMIN'])`. Cross-tenant resource access blocked by `resolveTenantContext` + ownership checks.

---

## 8. Permission group → frontend page / action matrix

| Area             | Route / component                      | Gate                                 |
| ---------------- | -------------------------------------- | ------------------------------------ |
| Sidebar          | `Sidebar.tsx`                          | `permission` / `anyOf` per item      |
| Driver home      | `SupplierHome.tsx`, `useWorkspaceRole` | Redirect to `/app/driver-deliveries` |
| Pages            | `RequirePermission` wrapper            | Direct URL → “Access restricted”     |
| Orders actions   | `OrdersPage`, `OrderDetailPage`        | `can()` / `isViewOnly()`             |
| Products         | `ProductsPage`                         | `CATALOG_VIEW`                       |
| Invoices         | `InvoicesPage`                         | `INVOICES_VIEW`                      |
| Fulfillment      | `FulfillmentPage`                      | `FULFILLMENT_VIEW`                   |
| Promotions/Deals | `PromotionsPage`, `DealsPage`          | `PROMOTIONS_VIEW`                    |
| Reservations     | `ReservationsPage`                     | `RESERVATIONS_VIEW`                  |
| Receiving        | `ReceivingPage`                        | `RECEIVING_VIEW`                     |
| Staff/Roles      | `StaffPage`, `TeamRolesPanel`          | `STAFF_VIEW`, `SETTINGS_*`           |
| Settings         | `SettingsPage`, `SupplierSettingsPage` | `SETTINGS_VIEW`                      |

**Note:** Frontend hiding is defense-in-depth; API returns **403** without permission.

---

## 9. System locked roles

- Seeded per tenant with `is_system = true`
- Permissions **replaced** from `role-matrix.js` on each sync (not user-editable)
- Name changes blocked except legacy rename via `legacyNames` matching
- **Owner:** cannot delete; cannot patch permissions; always full permission set in guards
- UI: lock icon, expanded read-only checklist, no Edit on permission matrix (description-only via API if exposed)

---

## 10. Custom roles

- Create: `POST /api/roles` — validates keys ⊆ tenant allowlist, `assertCanGrantPermissions`
- Update: `PATCH` permissions — deletes/reinserts rows, invalidates cache for assigned users
- Delete: blocked if `user_count > 0` (409 + user list)
- Reserved names: `RESERVED_SYSTEM_ROLE_NAMES` → 400
- Cannot escalate beyond assigner’s permissions (unless platform `ADMIN`)

---

## 11. Critical checks (20/20)

| #   | Check                                                          | Status                         |
| --- | -------------------------------------------------------------- | ------------------------------ |
| 1   | Restaurant cannot access supplier APIs                         | ✓ `requireRole`                |
| 2   | Supplier cannot access restaurant APIs                         | ✓ `requireRole`                |
| 3   | No cross-tenant resources                                      | ✓ `resolveTenantContext`       |
| 4   | Driver sees assigned deliveries only                           | ✓ `driver-rbac` + board filter |
| 5   | Driver blocked from catalog/invoices/settings/deals/warehouses | ✓ matrix + tests               |
| 6   | Catalog Manager: products yes, billing/settings no             | ✓                              |
| 7   | Finance: invoices/payments yes, catalog/settings no            | ✓                              |
| 8   | Warehouse Manager: warehouses/fulfillment yes, billing no      | ✓                              |
| 9   | Fulfillment staff: board yes, finance/decline limited          | ✓                              |
| 10  | Promotions Manager: deals yes, billing/settings no             | ✓                              |
| 11  | Sales/Promotions: orders manage as designed                    | ✓                              |
| 12  | Viewer: no mutations                                           | ✓ view-only keys               |
| 13  | Owner: full tenant access                                      | ✓                              |
| 14  | Last owner cannot be removed/downgraded                        | ✓ `assertNotLastOwnerRemoval`  |
| 15  | Non-owner cannot self-grant higher perms                       | ✓ `assertCanAssignRole`        |
| 16  | Cannot grant perms you lack                                    | ✓ `assertCanGrantPermissions`  |
| 17  | Custom roles validated (no invalid keys)                       | ✓                              |
| 18  | `approvals_budgets` cannot be assigned                         | ✓ allowlist                    |
| 19  | Impersonation uses effective perms + audit                     | ✓                              |
| 20  | RBAC does not bypass feature limits                            | ✓ separate `requireFeature`    |

---

## 12. Bugs found

| ID  | Severity | Issue                                                                                | Status                            |
| --- | -------- | ------------------------------------------------------------------------------------ | --------------------------------- |
| B1  | Low      | Role editor missing labels/domain for `DRIVER_DELIVERIES_*` (raw keys in UI)         | **Fixed** — `permissionLabels.js` |
| B2  | Info     | “Sales Rep” / “Account” in docs ≠ current DB names (Promotions Manager / Accountant) | Documented                        |
| B3  | Low      | System roles cannot edit description from UI (API allows)                            | Open — UX only                    |
| B4  | Medium   | Some routes still use coarse `ORDERS_VIEW` only                                      | Residual — see risks              |

No P0/P1 functional gaps found in automated suite for core role matrix.

---

## 13. Fixes made (this audit)

1. **`apps/web/src/lib/permissionLabels.js`** — Added Driver deliveries labels and supplier permission domain group.
2. **`apps/api/src/routes/tenant-roles.routes.test.js`** — Tests for invalid permissions, custom role PATCH persist, system role permission block.
3. **`apps/web/src/lib/permissionLabels.test.ts`** — Regression for driver permission labels/domains.

---

## 14. Remaining risks

| Risk                                                              | Mitigation                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `advanced_roles` off → simplified Owner/Viewer only               | Document entitlement requirement                                  |
| Legacy `user_role` merge could widen access if named role missing | Backfill script; prefer `tenant_user_roles`                       |
| Not every route has granular mutation guards                      | Continue per-route audit; matrix tests in `rbac-full-app.test.js` |
| Restaurant disputes gated by `ORDERS_VIEW`                        | By design for receiving/manager roles                             |
| Custom role created by Owner can be broad                         | Subset rules for non-owners; Owner trusted                        |
| Driver must link `drivers.user_id`                                | Assign dialog + Drivers settings panel                            |
| Plan features vs RBAC                                             | Both middlewares required                                         |

---

## 15. Tests

### Run (non-watch)

```bash
pnpm test:rbac
cd apps/api && pnpm exec vitest run src/routes/tenant-roles.routes.test.js src/lib/tenant-role-matrix.test.js src/lib/tenant-roles.test.js src/lib/invitation-role-assignment.test.js
cd apps/web && pnpm exec vitest run src/lib/permissionLabels.test.ts
```

### Results (2026-05-28)

| Suite                                       | Result               |
| ------------------------------------------- | -------------------- |
| `pnpm test:rbac` (api 48 + web 5)           | **Pass**             |
| Tenant roles / matrix / invitation (api 35) | **Pass**             |
| `permissionLabels.test.ts` (web 3)          | **Pass** (after add) |

### Coverage map

| Requirement              | Test file                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Role matrix expectations | `tenant-role-matrix.test.js`, `rbac-role-access.test.js`, `rbac-full-app.test.js`                                             |
| Tenant type isolation    | `rbac-full-app.test.js`                                                                                                       |
| Driver scope             | `driver-rbac.js`, `fulfillment.routes.test.js`, `rbacGating.test.tsx`                                                         |
| Escalation / subset      | `rbac-guards.test.js`, `rbac-full-app.test.js`                                                                                |
| Impersonation            | `rbac.impersonation.test.js`                                                                                                  |
| Promotions read vs write | `promotions.rbac.test.js`                                                                                                     |
| Sidebar gating           | `rbacGating.test.tsx`, `rbacCatalogManagerGating.test.tsx`, `rbacRestaurantHostGating.test.tsx`, `rbacFullAppGating.test.tsx` |
| Role API                 | `tenant-roles.routes.test.js`                                                                                                 |
| Invalid permission keys  | `tenant-roles.routes.test.js` (added)                                                                                         |

---

## 16. Manual QA checklist

Use two suppliers and two restaurants on a plan with **`advanced_roles`** enabled.

### Supplier

- [ ] **Custom catalog-only role:** Create role with only Catalog permissions → assign user → products/import work; `GET /api/supplier/invoices/receivables` and settings mutations return **403**.
- [ ] **Driver:** Assign Driver + link driver profile → sidebar shows only **My Deliveries** → board shows assigned orders only → direct `GET /api/products` **403**.
- [ ] **Finance (Accountant):** Receivables/invoices work; product import **403**; settings manage **403**.
- [ ] **Promotions Manager:** Deals/reorder intel work; billing/settings **403**.
- [ ] **Viewer:** All pages read-only; `POST`/`PATCH`/`DELETE` **403**.

### Restaurant

- [ ] **FOH Staff:** Reservations work; staff/billing **403**.
- [ ] **Receiving Staff:** Receiving works; invoices/staff **403**.
- [ ] **Accountant:** Invoices/payments work; catalog admin **403**.

### Cross-cutting

- [ ] Direct URL to forbidden page → “Access restricted”.
- [ ] Refresh role editor after custom role save → permissions match DB.
- [ ] Remove/downgrade last Owner → blocked with clear error.
- [ ] Non-owner cannot assign Owner role to self.
- [ ] Admin impersonation: UI matches effective role; sensitive actions still audited.

---

## Related docs

- `docs/RBAC_ROLES_PERMISSIONS_AUDIT.md` — Driver hardening & prior fixes
- `docs/features/tenant-roles.md` — Feature overview
- `docs/architecture/RBAC.md`, `RBAC_PERMISSION_MATRIX.md`
