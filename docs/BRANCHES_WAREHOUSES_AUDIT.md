# Branches & Warehouses End-to-End Audit

**Date:** 2026-05-28  
**Scope:** Restaurant branches, supplier branches (org model), linked branch accounts, supplier warehouses, plan limits, features, RBAC, and operational integration (orders, inventory, fulfillment).  
**Out of scope (per request):** Tier limit/pricing changes, deals/promotions logic, UI redesign.

---

## Executive summary

| Area                                | What it is                                         | Real entity?                                                                                                             |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Restaurant branches (current)**   | `restaurant` rows under `restaurant_organizations` | **Yes** — full tenant per branch (own subscription row, orders, inventory, staff)                                        |
| **Supplier branches (current)**     | `supplier` rows under `supplier_organizations`     | **Yes** — full tenant per branch + catalog                                                                               |
| **Linked branch accounts (legacy)** | `tenant_account_link` + `/api/branches`            | **Yes** — separate tenant, not org-scoped                                                                                |
| **Legacy `branch` table**           | Child row under one `restaurant`                   | **Partial** — still referenced by reservations, restaurant inventory, some order joins; not used for org branch creation |
| **Warehouses**                      | `warehouse` rows under one `supplier`              | **Yes** — operational locations (inventory, zones, fulfillment routing); not separate accounts                           |

**Critical finding (fixed in this audit):** Branch limit enforcement counted `tenant_account_link` only, while the product creates **org sub-tenants**. Gold could create unlimited org branches while usage UI still showed `1/N`. Fix: `countActiveBranchLocations()` in `plan-enforcement.js` + aligned usage snapshot in `subscription.js`.

**Other high-risk gaps (documented, not all fixed):** Dual branch models (`branch` table vs org tenants), Platinum `multi_branch: "central_purchasing"` vs frontend `=== true`, Free tier seeded default warehouse vs `warehouses: 0` limit.

---

## 1. Branch architecture

### 1.1 Canonical model (org sub-tenants)

Introduced in migrations `0086_restaurant_branch_accounts.sql` and `0082_supplier_branch_accounts.sql`.

```
restaurant_organizations (or supplier_organizations)
  └── restaurant / supplier rows (organization_id, is_main_branch, is_branch_active, branch_code)
        └── subscription (per branch tenant — often pending Free on new branch)
        └── tenant_user_roles, orders, inventory, etc.
```

- **Not** a separate login per branch by default; users get **org roles** (`restaurant_org_*` / `supplier_org_*`) and switch active branch via cookie (`POST /api/restaurant-org/context/switch` or `/api/org/context/switch`).
- New branch creation: `createRestaurantOrgBranch` / `createOrgBranch` inserts a new tenant row, `createPendingActivationSubscription(..., 'free')`, seeds tenant RBAC, assigns org owner to branch.

### 1.2 Legacy linked accounts

Migration `0059_tenant_account_links.sql`. Each branch is a **separate** `restaurant` or `supplier` linked via `tenant_account_link`. Switching: `POST /api/branches/switch` + `active_tenant_token` cookie.

Used when `organization_id` is null (pre-migration or unmigrated tenants). Frontend `BranchContext` prefers org API when `organizationId` is present.

### 1.3 Legacy `branch` table

Migration `0023_branches_warehouses.sql` (and `0015_restaurant_onboarding.sql`). Child locations:

- `branch.tenant_id` → `restaurant.id`
- `is_active` flag; triggers update `tenant_usage.branches_count` (often stale vs org model)

Still used by:

- `customer_order.branch_id` (optional join in orders list)
- `restaurant_inventory.branch_id`
- `reservation` / `reservation_table.branch_id`
- `receiving_log`, `inventory_movement_log`

**Org branch tenants do not automatically get rows in `branch` table** — operational data can be split across two concepts.

### 1.4 Registration

`register-account.js` sets `organization_id` + `is_main_branch = true` on signup for new restaurants/suppliers.

---

## 2. Warehouse architecture

### 2.1 Model

- Table: **`warehouse`** (singular), owned by supplier via `supplier_id` and/or `tenant_id` (both may exist; helpers prefer `tenant_id` for filters).
- Extended in `0081_warehouse_fulfillment.sql`: `is_default`, `type`, `warehouse_inventory`, `delivery_zone.warehouse_id`, `warehouse_routing_rule`, `order_warehouse_assignment`.
- Supplier flags: `multi_warehouse_enabled`, `default_warehouse_id`, `fulfillment_mode` (`single` | `multi`).

### 2.2 Operational behavior

- **Real warehouse:** stock in `warehouse_inventory` (multi-warehouse) or `inventory.warehouse_id` (legacy single-warehouse path).
- Order placement can call `assignWarehousesToOrder` (same transaction as order create when multi-warehouse active).
- Soft delete: `PATCH` sets `is_active = false` (inactive warehouses excluded from limit count).
- `createDefaultWarehouseForSupplier` runs for new supplier branches in org flow.

### 2.3 Not a separate account

Warehouses do not create tenants, subscriptions, or logins. They are fulfillment locations under the **active supplier tenant**.

---

## 3. Tables and migrations

| Object                                | Migrations / notes                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `branch`                              | `0015`, `0023` — legacy sub-locations                                            |
| `warehouse`                           | `0002`, `0005`, `0023`, `0081`                                                   |
| `tenant_account_link`                 | `0059`                                                                           |
| `restaurant_organizations`, org roles | `0086`                                                                           |
| `supplier_organizations`, org roles   | `0082`                                                                           |
| `branch_invitations`                  | `0085`                                                                           |
| `tenant_usage`                        | `0023` — branch/warehouse counters (trigger-based; can drift)                    |
| Plan limits/features                  | `0022`, `0044`, `0117` (Silver), `0119` (Gold), `0120` (Platinum), `0094` (Free) |

---

## 4. APIs

### 4.1 Restaurant branches (org)

| Method | Path                                 | Guards                                                   |
| ------ | ------------------------------------ | -------------------------------------------------------- |
| GET    | `/api/restaurant-org`                | Auth, RESTAURANT/ADMIN, org context                      |
| GET    | `/api/restaurant-org/branches`       | Same                                                     |
| POST   | `/api/restaurant-org/branches`       | Org Owner, **`multi_branch`**, `checkLinkedAccountLimit` |
| POST   | `/api/restaurant-org/context/switch` | Branch access check                                      |
| DELETE | `/api/restaurant-org/branches/:id`   | Deactivate (`is_branch_active = false`)                  |

Implementation: `restaurant-org.routes.js`, `restaurant-org.js`.

### 4.2 Supplier branches (org)

| Method | Path                            | Guards                                     |
| ------ | ------------------------------- | ------------------------------------------ |
| GET    | `/api/org`, `/api/org/branches` | Auth, SUPPLIER/ADMIN, org context          |
| POST   | `/api/org/branches`             | Org Owner, **`multi_branch`**, limit check |
| POST   | `/api/org/context/switch`       | Branch access                              |

Implementation: `org.routes.js`, `supplier-org.js`.

### 4.3 Linked branch accounts (legacy)

| Method | Path                           | Guards                                                |
| ------ | ------------------------------ | ----------------------------------------------------- |
| GET    | `/api/branches`                | RESTAURANT/SUPPLIER                                   |
| POST   | `/api/branches`                | Limit check, **`multi_branch`** (added in this audit) |
| POST   | `/api/branches/switch`         | `userCanAccessTenant`                                 |
| DELETE | `/api/branches/:childTenantId` | Unlink only                                           |

Implementation: `branches.routes.js`, `linked-accounts.js`.

### 4.4 Warehouses

| Method             | Path                            | Guards                                                |
| ------------------ | ------------------------------- | ----------------------------------------------------- |
| GET/POST           | `/api/warehouses`               | `warehouses`, `WAREHOUSES_VIEW` / `WAREHOUSES_MANAGE` |
| PATCH/DELETE       | `/api/warehouses/:id`           | Same; delete = soft deactivate                        |
| Routing            | `/api/warehouses/routing/*`     | **`multi_warehouse`**, `WAREHOUSES_MANAGE`            |
| Fulfillment toggle | `/api/suppliers/me/fulfillment` | Supplier auth                                         |
| Order assignments  | `/api/orders/:id/warehouses`    | Fulfillment feature set                               |

Implementation: `warehouses.routes.js`, `warehouseRouting.js`, `warehouse-helpers.js`.

---

## 5. Frontend surfaces

| Surface                 | Path / component                                          | API                                                                      |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| Branch switcher         | `BranchSwitcher.tsx`, `BranchContext.tsx`                 | `/api/restaurant-org/branches` or `/api/org/branches` or `/api/branches` |
| Add restaurant branch   | `RestaurantAddBranchModal.tsx`, onboarding                | `POST /api/restaurant-org/branches`                                      |
| Add supplier branch     | `AddBranchModal.tsx`, `SupplierSettingsPage` branches tab | `POST /api/org/branches`                                                 |
| Linked accounts panel   | `BranchAccountsPanel.tsx`                                 | `/api/branches`                                                          |
| Org overview            | `RestaurantOrgOverviewPage`, `OrgOverviewPage`            | Org GET endpoints                                                        |
| Warehouses UI           | `SupplierSettingsPage` (Warehouses tab)                   | `/api/warehouses`, fulfillment PATCH                                     |
| Products warehouse pick | `ProductsPage`                                            | `warehouse_id` on product create                                         |
| Inventory               | `InventoryPage`                                           | Warehouse list + per-warehouse stock                                     |

**Frontend gating:** `planLimits.ts` — `getBranchAddGate`, `canAddWarehouses`, `featureEnabled()` (string tier values OK).  
**Gap:** `BranchContext` uses `multi_branch === true` only — Platinum `central_purchasing` may hide org switcher while API allows branch APIs.

---

## 6. Permission / RBAC

### Branches

- Org routes: `orgStructureGuard` + org role (Owner for create).
- Tenant routes: `settingsMutationGuard` + `SETTINGS_*` / `STAFF_MANAGE` as applicable.
- Branch-level permissions via `tenant_user_roles` per `restaurant.id` / `supplier.id`.
- Org-level permissions via `restaurant_org_role_permissions` with `branch_scope` (`all` | `assigned`).

### Warehouses

- `WAREHOUSES_VIEW`, `WAREHOUSES_MANAGE` on supplier tenant roles.
- Seeded in `0042_rbac_seed_roles_permissions.sql`.

---

## 7. Tier limits and features (catalog — not changed in this audit)

### Restaurant `branches` limit (location count)

| Plan         | Limit             | `multi_branch` feature                                   |
| ------------ | ----------------- | -------------------------------------------------------- |
| Free / Trial | 1                 | off                                                      |
| Silver       | 1                 | **false**                                                |
| Gold         | 3                 | **true**                                                 |
| Platinum     | unlimited (`-1`)  | **`central_purchasing`** (string; API treats as enabled) |
| Enterprise   | custom / inactive | varies                                                   |

Enforcement: `checkBranchLimit` / `checkLinkedAccountLimit` on **parent/main** tenant subscription. Compare `current < limit` (at limit blocks **another** create).

**Inactive branches:** Org model uses `is_branch_active = false` — excluded from `countActiveBranchLocations`. Linked-account model has no equivalent on link row; deactivated org branches are the supported path.

### Supplier `warehouses` limit

| Plan     | Limit     | `warehouses`          | `multi_warehouse` |
| -------- | --------- | --------------------- | ----------------- |
| Free     | 0         | typically off / no UI | off               |
| Silver   | 1         | on                    | off               |
| Gold     | 3         | on                    | on                |
| Platinum | unlimited | on                    | on                |

Restaurant plans: `warehouses` is **not** in `RESTAURANT_LIMIT_KEYS` (`isLimitKeyApplicable('RESTAURANT', 'warehouses') === false`).

**Counting:** Active rows only: `warehouse WHERE {supplier_col} = $id AND is_active = TRUE`.

**Free-tier nuance:** Migration `0023` may seed a default warehouse for all suppliers; limit `0` blocks **creating** another but leaves one row — UI may show one warehouse while plan says 0 allowed (product inconsistency).

### Supplier `branches` limit

Same `branches` key as restaurants on supplier plans (org supplier locations), enforced via same `countActiveBranchLocations` for `SUPPLIER`.

---

## 8. Answers to key questions

### Branches

**Separate accounts or child records?**  
**Both exist in code.** Production path for migrated tenants: **child tenant records** under an organization (each branch is a `restaurant`/`supplier` UUID). Legacy: **linked separate tenants** without shared `organization_id`. Legacy **`branch` table** is a third, sub-location model still tied to orders/inventory/reservations.

**User switch/manage?**  
Header switcher → org context switch cookie or linked-account switch. Org Owners manage branches in Settings / `/app/org`.

**Subscription on new branch?**  
Each branch still has its own `subscription` row (often pending Free on create) for billing records. **Entitlements** (plan, limits, features) for org members resolve from the **main branch** via `resolveOrgBillingTenantId()` — see §17. Usage meters (orders/day, SKUs, etc.) stay on the **active branch** tenant id.

**Orders / inventory / staff / reservations / reporting?**

- **Orders:** Scoped to `restaurant_id` of active branch tenant. `customer_order.branch_id` (legacy `branch` table) is not consistently set for org branches.
- **Inventory:** Per `restaurant_id`; optional `branch_id` on `restaurant_inventory` (legacy table).
- **Staff:** Per-tenant `tenant_user_roles` + org roles.
- **Reservations:** `branch_id` → legacy `branch` table.
- **Reporting:** `reports.service` can filter `branch_id` when provided.

### Warehouses

**Separate accounts?** No — rows under supplier.

**Products / inventory / orders?**  
Products optional `warehouse_id`; stock in `warehouse_inventory`; orders get `order_warehouse_assignment` when fulfillment runs.

**Stock / delivery logic?**  
Multi-warehouse routing (`warehouseRouting.js`) when plan + `supplier.multi_warehouse_enabled` + `fulfillment_mode = 'multi'`. Otherwise default warehouse.

**Limit enforcement?**  
`checkWarehouseLimit` on `POST /api/warehouses`; feature `warehouses` on all warehouse routes. **Fixed:** count uses correct supplier column via `getWarehouseSupplierColumn()`.

---

## 9. Bugs and gaps

| ID  | Severity     | Issue                                                                     | Status                                                                                                      |
| --- | ------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| B1  | **Critical** | Branch limits counted `tenant_account_link` only, not org siblings        | **Fixed** — `countActiveBranchLocations`                                                                    |
| B2  | High         | `POST /api/branches` lacked `multi_branch` gate                           | **Fixed** — middleware added                                                                                |
| B3  | High         | Usage meter `branches` out of sync with org count                         | **Fixed** — `getUsageSnapshot` uses same counter                                                            |
| B4  | High         | Three branch concepts (`branch` table, org tenants, linked accounts)      | Open — needs consolidation design                                                                           |
| B5  | Medium       | Platinum `multi_branch` string vs `BranchContext === true`                | **Fixed** — `multiBranchEnabled()` / `featureEnabled()`                                                     |
| B6  | Medium       | Child branch Free subscription vs parent paid plan                        | **Mitigated** — entitlements use main branch subscription; per-branch rows remain for billing               |
| B7  | Medium       | Free supplier may have seeded warehouse while limit 0                     | **Mitigated** — no warehouse on Free signup; legacy rows kept; usage shows 0; Silver+ auto-provision on GET |
| B8  | Medium       | `tenant_usage.branches_count` triggers on `branch` table only             | Open — drift from org model                                                                                 |
| B9  | Low          | TENANCY.md still describes linked accounts as primary                     | Docs drift — `restaurant-branches.md` is accurate                                                           |
| B10 | Low          | `checkBranchLimit` compares `branchCount < limit` (at 1/1 cannot add 2nd) | Correct for “max locations” semantics                                                                       |

---

## 10. What is working

- Org branch CRUD with Owner gate, deactivate with pending-order guard, main branch protection.
- Branch switcher and context switch APIs for restaurant and supplier orgs.
- Warehouse CRUD, default warehouse, soft delete, per-warehouse inventory API.
- Multi-warehouse routing rules and simulation (Gold+ feature).
- `requireFeature('warehouses')` and `requireFeature('multi_warehouse')` on appropriate routes.
- RBAC permission keys for warehouse management.
- Frontend `planLimits.ts` gates add-branch/add-warehouse with entitlements.
- Tests: `org.routes.test.js`, `branches.routes.test.js`, `warehouses.routes.test.js`, new `plan-enforcement.test.js`.

---

## 11. What is risky

- Operating two branch abstractions (org tenant vs `branch` table) for reservations/inventory vs switching.
- Child branch **subscription rows** still show Free in admin DB views even though entitlements use main branch.
- Linked-account path still available for unmigrated tenants — divergent UX and counting until fully migrated.
- Enterprise / custom plans — limits in DB; enforcement uses same code paths.
- Legacy Free suppliers may have inactive/default warehouse rows in DB (harmless but confusing in raw SQL).

---

## 12. Recommended fixes (next implementation steps)

1. **Unify branch identity** — Either sync org branch → `branch` row on create, or migrate reservations/inventory to `restaurant_id` only and deprecate `branch` table.
2. **Admin visibility** — Ensure admin dashboard counts org branches per organization, not per arbitrary tenant row.
3. **Billing rows** — Optionally mirror parent `plan_id` onto child subscriptions on branch create (cosmetic; entitlements already use main).
4. **Legacy Free warehouses** — One-time script to set `is_active = false` on orphaned default warehouses for Free suppliers (optional; not required for enforcement).
5. **Integration tests** — E2E: create org → add branches until limit → upgrade plan → add more.

---

## 13. Safe fixes applied (initial audit)

| File                                        | Change                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/api/src/lib/plan-enforcement.js`      | `countActiveBranchLocations()`; warehouse count uses `getWarehouseSupplierColumn()` |
| `apps/api/src/lib/subscription.js`          | Usage snapshot aligns branch/warehouse counting                                     |
| `apps/api/src/routes/branches.routes.js`    | `multi_branch` on `POST /`                                                          |
| `apps/api/src/lib/plan-enforcement.test.js` | **New** — limit + counting tests                                                    |

---

## 17. Follow-up fixes (2026-05-28)

### Platinum `multi_branch` (frontend)

- Added `multiBranchEnabled()` in `planLimits.ts` (uses `featureEnabled()` — same rules as API `evaluatePlanFeatureValue`).
- Replaced `multi_branch === true` in `BranchContext`, `BranchSwitcher`, org overview pages, onboarding, `BranchDetailPage`.

### Org subscription inheritance (backend)

**Decision:** Org branches **inherit entitlements from the main branch** (`is_main_branch = true` under the same `organization_id`). Child `subscription` rows may still exist (e.g. pending Free) but are **not** used for plan/features/limits when `organization_id` is set.

| Concern                                                          | Source tenant id                        |
| ---------------------------------------------------------------- | --------------------------------------- |
| Plan, limits, features, `requireFeature`, `checkLimit` plan caps | Main branch (`billingTenantId`)         |
| Usage meters (orders/day, SKUs, storage, etc.)                   | Active branch (`tenantId` from request) |
| Branch location count for limits                                 | Org-wide (`countActiveBranchLocations`) |

API response adds `billingTenantId` and `usesOrgBilling` on entitlements for debugging.

**Not changed:** Per-branch subscription rows on create; org-level single subscription table; Stripe/billing seat model.

**Future option:** On branch create, copy parent `plan_id` to child subscription for admin UI consistency (migration script).

### Free supplier warehouses

| Scenario                        | Behavior                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **New Free signup**             | No `createDefaultWarehouseForSupplier` at registration                                                                                          |
| **Silver+ first open**          | `GET /api/warehouses` calls `ensureDefaultWarehouseForPaidSupplier` if none active                                                              |
| **Legacy Free with seeded row** | Row may exist from migration `0023`; not deleted; `warehouses` usage in entitlements forced to **0** when plan limit is 0; create still blocked |
| **UI**                          | Supplier settings copy clarifies Free has 0 warehouses                                                                                          |

---

## 18. Safe fixes applied (follow-up)

| File                                       | Change                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `apps/api/src/lib/org-billing-tenant.js`   | **New** — resolve main branch for billing                                         |
| `apps/api/src/lib/subscription.js`         | Org billing in `getTenantSubscription`, `getEntitlements`, `checkLimit` overrides |
| `apps/api/src/lib/feature-flags.js`        | Tenant overrides resolved on billing tenant                                       |
| `apps/api/src/lib/register-account.js`     | Skip default warehouse on signup                                                  |
| `apps/api/src/lib/warehouse-helpers.js`    | `ensureDefaultWarehouseForPaidSupplier`                                           |
| `apps/api/src/routes/warehouses.routes.js` | Auto-provision default warehouse when plan allows                                 |
| `apps/web/src/lib/planLimits.ts`           | `multiBranchEnabled()`                                                            |
| Frontend branch/warehouse pages            | Use `multiBranchEnabled` / clearer Free warehouse copy                            |

---

## 19. Tests (follow-up)

```text
# API
npx vitest run src/lib/plan-enforcement.test.js src/lib/org-billing-tenant.test.js src/lib/org-billing-entitlements.test.js src/lib/register-account.test.js src/routes/branches.routes.test.js src/routes/warehouses.routes.test.js

# Web
npx vitest run src/lib/planLimits.test.ts
```

---

## 14. Manual QA checklist

### Branches

1. [ ] Create restaurant on Free Trial — 1 location (main only).
2. [ ] Try second branch on Free — blocked (limit 1 and/or `multi_branch` off).
3. [ ] Move to Silver — still max 1 location; `multi_branch` off blocks create API.
4. [ ] Move to Gold — create up to 3 org branches; 4th returns `LIMIT_EXCEEDED`.
5. [ ] Move to Platinum — unlimited creates; `multi_branch` string allows API.
6. [ ] Branch appears in switcher and Settings; switch changes orders scope (`restaurant_id`).
7. [ ] Deactivate branch — does not count toward limit; cannot delete main.
8. [ ] Reservations/inventory — note whether `branch_id` (legacy) matches selected org branch.

### Warehouses

1. [ ] Create supplier on Free Trial — warehouse create blocked (`warehouses: 0` / feature off).
2. [ ] Silver — create 1 warehouse; second blocked.
3. [ ] Gold — up to 3; 4th blocked.
4. [ ] Platinum — unlimited.
5. [ ] Warehouse visible in Settings → Warehouses, Inventory, product form.
6. [ ] Assign stock via warehouse inventory; place order — assignment on order detail when fulfillment enabled.
7. [ ] Deactivate warehouse — excluded from limit count.
8. [ ] Restaurant tenant — no warehouse limits in entitlements API.

---

## 15. Tests run

```text
npx vitest run src/lib/plan-enforcement.test.js src/routes/branches.routes.test.js src/routes/warehouses.routes.test.js
# 3 files, 15 tests passed
```

---

## 16. Related documentation

- [docs/features/restaurant-branches.md](features/restaurant-branches.md)
- [docs/features/warehouse-fulfillment.md](features/warehouse-fulfillment.md)
- [docs/architecture/TENANCY.md](architecture/TENANCY.md) — partially outdated on branches; prefer restaurant-branches doc for org model
