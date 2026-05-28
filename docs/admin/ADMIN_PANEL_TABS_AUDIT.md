# Admin Panel Tabs Audit

**Date:** 2026-05-28  
**Scope:** Platform Admin Dashboard (`AdminDashboardPage`) — all primary tabs.

## Summary

| Tab           | Status                   | API                                            | DB / sources                                             |
| ------------- | ------------------------ | ---------------------------------------------- | -------------------------------------------------------- |
| Overview      | Fixed (prior) + verified | `GET /api/admin-dashboard/overview`            | `buildAdminOverviewMetrics()` — resilient per-metric SQL |
| Activity      | **Fixed**                | `GET /api/admin-dashboard/activity`            | Composed feed via `buildAdminActivityFeed()`             |
| Tenants       | OK (data loading)        | `GET .../tenants/suppliers`, `.../restaurants` | `supplier`, `restaurant`, `subscription`                 |
| Subscriptions | **Improved**             | `GET .../subscriptions`                        | `subscription` + `subscription_plan`                     |
| Plans         | OK                       | `GET/POST/PATCH .../plans`                     | `subscription_plan`                                      |
| Finance       | **Fixed**                | `GET .../financial-overview`                   | `invoice`, `subscription`, `subscription_plan`           |
| Usage         | **Fixed** (fetch)        | Tenants endpoints (aggregated)                 | `supplier`, `restaurant`, product/order counts           |
| Features      | **Fixed** (fetch)        | `GET .../feature-flags`, tenant overrides      | Feature flag tables                                      |
| Deals         | OK (separate routes)     | `GET /api/promotions/admin/deals`              | `promotions`                                             |
| Limits        | OK                       | `GET .../limit-overrides`, `limit-keys`        | Override tables                                          |
| Health        | **Fixed**                | `GET .../health` + overview                    | `system_event`, pool stats, overview metrics             |
| Audit         | OK                       | `GET .../audit-logs`                           | `admin_audit_log` (admin actions only)                   |

---

## 1. Overview

- **Component:** `AdminDashboardPage` → `AdminOverviewExtras`
- **API:** `GET /api/admin-dashboard/overview`
- **DB:** Multiple queries in `apps/api/src/lib/admin-overview-metrics.js` (tenants, subscriptions, orders, revenue, alerts, etc.)
- **Issues found:** Previously could show zeros on partial API failure.
- **Fixes:** Error state with retry (no silent zeros). Per-metric `safeOverviewQuery` on backend.
- **Tests:** `admin-overview-metrics` (API), `adminOverview.test.ts` (web)

---

## 2. Activity

- **Component:** `AdminDashboardPage` → Activity tab
- **API:** `GET /api/admin-dashboard/activity`
- **DB sources (composed, no unified table):**
  - `customer_order` — placed, acknowledged, completed, draft carts
  - `supplier`, `restaurant` — new tenant
  - `subscription_change_log` — plan changes
  - `admin_audit_log` — subscription admin actions
  - `staff_member`, `reservation`, `invoice`, `payment`, `quick_list`, `receiving_report`, `conversation`
  - `promotions` — deal/promotion status (non-draft)
- **Root cause:** Single `UNION ALL` failed with `invalid input value for enum order_status: "CONFIRMED"` (legacy status removed in migration 0021).
- **Fixes:**
  - New `apps/api/src/lib/admin-activity-feed.js` — per-branch queries, merge in app layer
  - Replaced `CONFIRMED` with `ACKNOWLEDGED`, `PROCESSING`, `SHIPPED`, `PENDING_APPROVAL`
  - Normalized event shape (`type`, `description`, `createdAt`, `actorName`, `tenantName`, `link`, etc.)
  - Frontend: error vs empty states; partial-source warning
- **Tests:** `admin-activity-feed.test.js`, route test in `admin-dashboard.routes.test.js`, `adminActivity.test.ts`

---

## 3. Tenants

- **Component:** Tenants tab (suppliers + restaurants tables)
- **API:** `GET /api/admin-dashboard/tenants/suppliers`, `.../restaurants`
- **DB:** `supplier`, `restaurant`, `subscription`, aggregates on products/orders
- **Issues:** None blocking; counts should align with overview tenant totals.
- **Fixes:** None required this pass (search/filter already wired).

---

## 4. Subscriptions

- **Component:** Subscriptions tab
- **API:** `GET /api/admin-dashboard/subscriptions`
- **DB:** `subscription`, `subscription_plan`
- **Issues:** Plan labels could show legacy “Bronze” name from DB.
- **Fixes:** `formatPlanDisplayName(plan_code, plan_name)`; API returns `plan_code`. Bronze → Silver via `planComparison` aliases.

---

## 5. Plans

- **Component:** Plans tab + modals
- **API:** `GET/POST/PATCH /api/admin-dashboard/plans`
- **DB:** `subscription_plan`
- **Status:** OK — validation warnings and enterprise confirm handled by existing `plan-admin-validation` + `adminPlanSaveFeedback`.

---

## 6. Finance

- **Component:** Finance tab
- **API:** `GET /api/admin-dashboard/financial-overview`
- **DB:** `invoice`, `subscription`, `subscription_plan`
- **Issues:** MRR included Free Trial; yearly MRR math simplified; no error state on failure.
- **Fixes:**
  - Exclude `free` and `enterprise` plans; require `price_per_month > 0`
  - Yearly billing uses `price_per_year / 12`
  - UI note: “paid plans only”; error card on API failure

---

## 7. Usage

- **Component:** Usage tab (platform / supplier / restaurant variants)
- **API:** Tenant list endpoints (not per-tenant `usage_meter` on main dashboard)
- **DB:** Aggregates from `product`, `customer_order`, tenant tables
- **Issues:** `suppliers`/`restaurants` queries skipped when tab not `tenants` → Usage showed zeros.
- **Fixes:** Load tenant data when `selectedTab` is `usage` or `features`.
- **Gap:** Per-tenant `usage_meter` detail not on main Usage tab — message in UI that Supplier/Restaurant Admin has detail.

---

## 8. Features

- **Component:** `AdminFeatureFlagsPanel`
- **API:** `GET/PATCH .../feature-flags`, tenant override routes
- **DB:** Global + tenant feature override tables
- **Issues:** Empty tenant dropdown when Features tab opened (tenants not fetched).
- **Fixes:** Fetch tenants on Features tab. `isRemovedFeatureKey` filters deprecated keys (e.g. `approvals_budgets`).

---

## 9. Deals

- **Component:** `AdminDealsPanel`
- **API:** `GET /api/promotions/admin/deals`, insights, pricing
- **DB:** `promotions`
- **Status:** OK — no business-logic changes. Activity feed includes promotion events separately.

---

## 10. Limits

- **Component:** `AdminLimitsTab` (unified limits tab: tenant picker, add-ons, overrides)
- **API:**
  - `GET /api/admin-dashboard/tenants/suppliers` & `.../restaurants` — tenant directory for search
  - `GET /api/admin-dashboard/tenants/search?q=&type=&orgMainOnly=` — optional server-side filter
  - `GET .../tenants/:type/:id/subscription-addons` — usage, add-ons, billing tenant resolution
  - `PUT .../subscription-addons/:addonKey` — grant/update/remove add-on (qty `0` = remove)
  - `GET .../limit-keys`, `GET .../limit-overrides`, `GET .../plans`
  - `POST .../plans/:planId/override-limit` — plan-tier override
  - `POST .../tenants/:type/:id/override-limit` — tenant override
  - `GET .../effective-limit/:limitKey` — preview base/effective before save
  - `PATCH .../tenant-overrides/:id` & `.../plan-overrides/:id` — disable (`is_active: false`)
- **DB:** `tenant_subscription_addon`, `plan_limit_override`, `tenant_limit_override`, `subscription_plan`
- **UX (2026-05-28):**
  - Searchable tenant picker (name, slug, email, plan, type) — no primary UUID field
  - Summary cards: included / add-ons / effective / current usage for branches (& warehouses for suppliers)
  - Plan dropdown (Free Trial, Silver, Gold, Platinum, Enterprise) instead of plan UUID
  - Limit key dropdown filtered by tenant type; hidden internal keys excluded
  - Override preview: plan default → new value; effective limit → tenant override
  - Reason required for add-ons and overrides
  - Tables for active add-ons and overrides with disable + confirm
  - Org billing banner when selected branch ≠ main branch (add-ons apply to main)
- **Manual / limitations:** Custom `unit_price_monthly` not exposed in UI (uses plan-tier default). No hard-delete of overrides (disable only). Large tenant lists (>50 matches) require refining search in the picker dropdown.

---

## 11. Health

- **Component:** Health tab
- **API:** `GET /api/admin-dashboard/health`, overview for subscription stats
- **DB:** `system_event` (errors), connection pool; job/webhook arrays null (not implemented)
- **Issues:** Overview skipped on Health tab → subscription cards always 0.
- **Fixes:** Fetch overview on Health tab; honest copy when `system_event` empty / pool unavailable; infrastructure section shown even if overview fails.

---

## 12. Audit

- **Component:** Audit tab
- **API:** `GET /api/admin-dashboard/audit-logs`
- **DB:** `admin_audit_log` only (platform admin actions: plans, subscriptions, impersonation start/end, overrides). Impersonation: [admin-impersonation.md](../features/admin-impersonation.md).
- **Scope:** Not tenant-scoped `audit_logs` — empty state message when no admin actions match filters.
- **Status:** OK

---

## Honest empty states

| Tab      | Empty message behavior                                |
| -------- | ----------------------------------------------------- |
| Activity | Distinguishes API error vs no data vs filter mismatch |
| Overview | API error — no fake zeros                             |
| Finance  | API error — no fake zeros                             |
| Health   | Explains unconfigured job/webhook tracking            |
| Audit    | “No audit logs match your filters”                    |

---

## Tests added/updated

- `apps/api/src/lib/admin-activity-feed.test.js`
- `apps/api/src/routes/admin-dashboard.routes.test.js` — `GET /activity`
- `apps/web/src/lib/adminActivity.test.ts`
- Existing: `adminOverview.test.ts`, overview route tests

---

## Remaining gaps

1. **Activity pagination:** Total count is length of merged in-memory window (not global DB count) — acceptable for admin feed; document if full pagination needed.
2. **Usage tab:** Main dashboard uses tenant aggregates, not live `usage_meter` — link to per-tenant admin views for quota detail.
3. **Health:** Job/webhook/email failure arrays always null until collectors exist.
4. **Audit:** Tenant `audit_logs` table not surfaced in Admin Audit tab (by design — admin actions only).

---

## Manual QA checklist

1. Create restaurant + supplier tenants
2. Place an order
3. Change a subscription plan
4. Open each admin tab
5. Confirm Activity shows recent events (not “No activity yet” when data exists)
6. Confirm failed API tabs show error cards, not zeros
