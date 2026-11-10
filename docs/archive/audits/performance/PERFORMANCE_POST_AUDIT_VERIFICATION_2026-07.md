# Post-Audit Performance Verification — July 2026

**Date:** 2026-07-08  
**Scope:** Verify audit fixes before Live Pricing Center work  
**Environments:** Dev (`api-dev.supplifyerp.com`), Preprod (`api-preprod.supplifyerp.com`)

---

## Executive summary

Audit fixes are structurally sound and `pnpm build` passes. **Authenticated dev benchmarks are healthy** (24/25 routes within budget; 1 borderline over-budget on invoices). **Authenticated preprod benchmarks could not be completed** — all protected routes returned HTTP 401 without `SUPPLIFY_*_TOKEN` or valid preprod Keycloak password-grant credentials.

**Recommendation:** Safe to begin Live Pricing Center feature work on **dev**, with two pre-merge gates: (1) apply migration `0188` and re-benchmark `/api/invoices`, (2) complete authenticated preprod benchmark run with supplied tokens.

---

## 1. Authenticated benchmark results

### Dev (authenticated via Keycloak password grant — demo users)

**Harness:** `pnpm perf:api` with `API_URL=https://api-dev.supplifyerp.com`, `PERF_SAMPLES=10`  
**Artifacts:** `perf-audit-api-dev-results.json`, `perf-audit-api-dev-results.md`

| Endpoint                                        | Role       | avg   | p50   | p95       | max    | Budget | Within budget |
| ----------------------------------------------- | ---------- | ----- | ----- | --------- | ------ | ------ | ------------- |
| `/health`                                       | —          | 139ms | 135ms | 167ms     | 167ms  | 500ms  | yes           |
| `/ready`                                        | —          | 116ms | 113ms | 132ms     | 132ms  | 500ms  | yes           |
| `/auth/me`                                      | restaurant | 126ms | 121ms | 151ms     | 151ms  | 800ms  | yes           |
| `/api/orders?limit=20`                          | restaurant | 183ms | 169ms | 250ms     | 250ms  | 500ms  | yes           |
| `/api/orders?limit=20&includeItems=false`       | restaurant | 179ms | 158ms | 376ms     | 376ms  | 500ms  | yes           |
| `/api/orders?limit=20&includeItems=true`        | restaurant | 156ms | 156ms | 174ms     | 174ms  | 500ms  | yes           |
| `/api/products?limit=20`                        | supplier   | 234ms | 193ms | 418ms     | 418ms  | 500ms  | yes           |
| `/api/products/categories`                      | supplier   | 175ms | 154ms | 369ms     | 369ms  | 500ms  | yes           |
| `/api/inventory?limit=100`                      | supplier   | 139ms | 142ms | 154ms     | 154ms  | 500ms  | yes           |
| `/api/admin/dashboard`                          | restaurant | 145ms | 124ms | 247ms     | 247ms  | 500ms  | yes           |
| `/api/billing/status`                           | restaurant | 145ms | 137ms | 194ms     | 194ms  | 500ms  | yes           |
| `/api/promotions/active`                        | restaurant | 166ms | 166ms | 183ms     | 183ms  | 500ms  | yes           |
| `/api/quote-requests`                           | restaurant | 171ms | 145ms | 360ms     | 360ms  | 500ms  | yes           |
| `/api/supplier/deliveries/board`                | supplier   | 181ms | 166ms | 231ms     | 231ms  | 1500ms | yes           |
| `/api/supplier/reorder-intelligence`            | supplier   | 172ms | 158ms | 251ms     | 251ms  | 500ms  | yes           |
| `/api/restaurant-inventory?limit=100&offset=0`  | restaurant | 182ms | 158ms | 341ms     | 341ms  | 1500ms | yes           |
| `/api/invoices?limit=50`                        | supplier   | 255ms | 161ms | **714ms** | 714ms  | 500ms  | **no (p95)**  |
| `/api/fulfillment/dispatch`                     | supplier   | 290ms | 178ms | 1143ms    | 1143ms | 1500ms | yes           |
| `/api/fulfillment/board`                        | supplier   | 148ms | 138ms | 171ms     | 171ms  | 1500ms | yes           |
| `/api/notifications/unread-count`               | restaurant | 120ms | 108ms | 199ms     | 199ms  | 500ms  | yes           |
| `/api/subscriptions/entitlements`               | restaurant | 130ms | 127ms | 143ms     | 143ms  | 500ms  | yes           |
| `/api/admin-dashboard/overview`                 | admin      | 128ms | 128ms | 135ms     | 135ms  | 1500ms | yes           |
| `/api/supplier/command-center`                  | supplier   | 141ms | 138ms | 163ms     | 163ms  | 1500ms | yes           |
| `/api/reports/restaurant/spend-by-supplier`     | restaurant | 145ms | 139ms | 167ms     | 167ms  | 1500ms | yes           |
| `/api/restaurant-inventory/reorder-suggestions` | restaurant | 155ms | 150ms | 174ms     | 174ms  | 500ms  | yes           |

**Note:** Order detail (`GET /api/orders/:id`) is auto-benchmarked when the tenant has orders; dev demo data returned empty order lists (115-byte payloads), so order-detail was not included in this run.

**Infrastructure (dev health):** Redis `connected: true`, DB pool max 20, 19 idle connections.

### Preprod (unauthenticated — tokens missing)

**Artifacts:** `perf-audit-api-preprod-results.json`, `perf-audit-api-preprod-results.md`

| Endpoint                 | Outcome           | Notes                                                                                                                                                             |
| ------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`, `/ready`      | OK (latency only) | p95 561ms / 376ms; health over 500ms budget on cold preprod                                                                                                       |
| All authenticated routes | **FAIL (401)**    | No `SUPPLIFY_RESTAURANT_TOKEN`, `SUPPLIFY_SUPPLIER_TOKEN`, or `SUPPLIFY_ADMIN_TOKEN`; Keycloak password grant returns `401 unauthorized_client` for preprod realm |

**To complete preprod benchmarks:**

```powershell
$env:API_URL="https://api-preprod.supplifyerp.com"
$env:SUPPLIFY_RESTAURANT_TOKEN="<token>"
$env:SUPPLIFY_SUPPLIER_TOKEN="<token>"
$env:SUPPLIFY_ADMIN_TOKEN="<token>"
pnpm perf:api
```

---

## 2. Routes still above performance budget

| Environment | Route                                           | p95          | Budget | Status                                                 |
| ----------- | ----------------------------------------------- | ------------ | ------ | ------------------------------------------------------ |
| **Dev**     | `/api/invoices?limit=50`                        | 714ms        | 500ms  | Over budget (p95); p50 healthy at 161ms                |
| **Preprod** | `/health`                                       | 561ms        | 500ms  | Over budget (unauthenticated infra check only)         |
| **Preprod** | `/api/promotions/active`, `/api/quote-requests` | 534ms, 641ms | 500ms  | Latency measured on **401 responses** — not meaningful |

**Action:** After applying migration `0188` on dev/preprod, re-run `pnpm perf:api` and confirm invoice list p95 drops below 500ms. If still over budget with production-like invoice volume, consider raising invoice list budget to `heavy` (1500ms) or adding query caching.

---

## 3. Redis verification

### Verified (CLI + runtime)

| Check                                        | Dev                                     | Preprod                                                      |
| -------------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| `REDIS_URL` set on API service               | yes (Railway variables)                 | yes (Railway variables)                                      |
| `DATABASE_POOL_MAX=20`                       | yes                                     | yes                                                          |
| `DB_KEEPALIVE_ENABLED=true`                  | yes                                     | yes                                                          |
| Health exposes `redis.connected`             | **yes** (`true`)                        | **no** (`MEMORY_HEALTH_EXPOSE` off — minimal health payload) |
| `/ready` returns 200                         | yes                                     | yes                                                          |
| Auth cache warmth (`pnpm perf:verify-redis`) | `/auth/me` 5×: 154→128ms (stable, warm) | not run (needs tokens)                                       |

**Artifact:** `perf-redis-verification.json`

### Not verified (needs manual Railway check)

- Startup logs on each preprod API replica showing `Redis cache connection established`
- Per-replica env parity if multiple API services exist in preprod
- Explicit cache hit/miss ratios (`IDLE_PERF_LOG_MS` sampling on preprod)
- Whether any replica is missing `REDIS_URL` (only `supplify-api-preprod` checked)

**Fallback risk:** `deploy/railway/README.md` documents that without `REDIS_URL`, API falls back to in-process memory cache only. Preprod has `REDIS_URL` configured; runtime confirmation requires Railway logs or enabling health expose temporarily.

---

## 4. `includeItems=false` smoke test (code review)

**API default:** `includeItems` defaults to `false` in `orders.helpers.js` (unit tested).

### Pages fixed to explicitly request items

| Component                     | Change                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| `FulfillmentPickListsTab.tsx` | `includeItems: true` (needs `order.items` for pick counts) |
| `RestaurantDetailPage.tsx`    | `includeItems: true` (product stats from line items)       |
| `RestaurantsPage.tsx`         | `includeItems: true` (supplier revenue filtering)          |

### Already correct

| Flow                                        | Mechanism                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Restaurant/supplier orders list             | `OrdersPage.tsx` passes `includeItems: true`                            |
| Dashboard recent orders                     | `DashboardPage.tsx` explicit `includeItems: false` (status/totals only) |
| Order detail, picking, packing, invoice tab | `useGetOrderQuery(id)` — separate endpoint, unaffected                  |
| Receiving flow                              | `/api/receiving/pending-orders` batch-fetches items server-side         |
| Invoice generation/export                   | Uses order detail or invoice APIs, not orders list                      |
| Fulfillment dispatch board                  | `FulfillmentDispatchPanel` uses fulfillment APIs                        |
| Disputes create flow                        | List for dropdown (no items); detail via `useGetOrderQuery`             |

### Safe without items (no `.items` usage on list data)

`ChatPage`, `SupplierReviewModal`, `SupplierSettingsPage`, `RestaurantOnboardingPage`

**No additional code changes required** for includeItems based on this audit.

---

## 5. Restaurant inventory pagination

### API (`restaurant-inventory.routes.js`)

- Default `limit`: 100 (max 500)
- `offset` supported
- Response includes `{ inventory, total, limit, offset }`

### Frontend

- `restaurantInventory.ts` defaults `{ limit: 500 }` when no params passed
- `InventoryTab`, `TotalsTab`, `WasteTab` pass `{ limit: 500 }`
- Client-side search/filter operates on loaded rows

### Verification

- Unit tests added: `restaurant-inventory.pagination.test.js` (default limit 100, max 500 cap) — **passing**
- Dev benchmark: p95 341ms at `limit=100` — within heavy budget

### Tenant scale note

**Server-side search is not implemented.** Tenants with **>500 SKUs** will not see SKUs beyond the first page unless pagination UI is added. Current UX loads up to 500 rows intentionally. Recommend server-side search/filter before large tenants go live; no bug fix needed now.

---

## 6. Migration 0188 verification

**File:** `apps/api/db/migrations/0188_perf_audit_indexes.sql`

```sql
idx_invoice_supplier_issue_date  ON (supplier_id, issue_date DESC, invoice_number DESC)
idx_invoice_restaurant_issue_date ON (restaurant_id, issue_date DESC, invoice_number DESC)
```

### Code alignment

- Invoice list sorts by `issue_date DESC, invoice_number DESC` (`invoices.routes.js`)
- Complements `0071` indexes on `invoice_date` — **no duplicate/conflict** (different column)

### Live database check (dev Postgres via `DATABASE_PUBLIC_URL`)

| Check                               | Result                                                    |
| ----------------------------------- | --------------------------------------------------------- |
| `schema_migrations` row for `0188`  | **Not present** — migration not yet applied on dev        |
| `idx_invoice_supplier_issue_date`   | **Missing**                                               |
| `idx_invoice_restaurant_issue_date` | **Missing**                                               |
| `idx_invoice_supplier_date` (0071)  | Present                                                   |
| EXPLAIN invoice list                | Seq scan (expected with tiny dev dataset + missing index) |

**Artifact:** `migration-0188-verification.json`  
**Script:** `node scripts/verify-migration-0188.mjs` (with `DATABASE_PUBLIC_URL` + `DATABASE_SSL=true`)

### Apply before relying on invoice perf fix

```powershell
# From Railway-connected shell or with public DATABASE_URL:
$env:DATABASE_SSL="true"
pnpm db:migrate
node scripts/verify-migration-0188.mjs
```

`pnpm db:migrate` from local machine requires `DATABASE_URL` pointing to `DATABASE_PUBLIC_URL` (internal `postgres.railway.internal` is not reachable locally).

---

## 7. Urgent fixes implemented during verification

1. **`includeItems: true`** on `FulfillmentPickListsTab`, `RestaurantDetailPage`, `RestaurantsPage`
2. **`restaurant-inventory.pagination.test.js`** — fixed router import (`restaurantInventoryRoutes`)
3. **`orders.helpers.test.js`** — confirms `includeItems` default `false`
4. **Tooling:** `pnpm perf:verify-redis`, `scripts/verify-migration-0188.mjs`
5. **Benchmark artifacts** split: `perf-audit-api-dev-results.*`, `perf-audit-api-preprod-results.*`

No business-logic rewrites. No new features.

---

## 8. Risks still deferred

| Risk                                                                      | Severity     | Mitigation                                       |
| ------------------------------------------------------------------------- | ------------ | ------------------------------------------------ |
| Preprod authenticated benchmarks not run                                  | Medium       | Supply tokens; re-run `pnpm perf:api`            |
| Migration 0188 not applied on dev/preprod                                 | Medium       | Run `pnpm db:migrate` per environment            |
| Invoice list p95 over 500ms budget                                        | Low–Medium   | Apply 0188; re-benchmark                         |
| Preprod Redis runtime not observable via health                           | Low          | Check Railway startup logs                       |
| Inventory >500 SKUs hidden without pagination UI                          | Low (future) | Server-side search when tenants scale            |
| Order-detail benchmark skipped (empty dev orders)                         | Low          | Re-run after seed data or with explicit order ID |
| Pre-existing unrelated test failures (tenant-roles, cron count, web i18n) | Low          | Out of audit scope                               |

---

## 9. Build confirmation

```
pnpm build  — PASSED (2026-07-08)
```

Web and API production builds complete successfully after all verification changes.

---

## 10. Recommendation: proceed with Live Pricing Center?

| Gate                                 | Status                                                    |
| ------------------------------------ | --------------------------------------------------------- |
| Architectural regressions from audit | None found                                                |
| Dev authenticated API performance    | **Pass** (1 invoice p95 exception, fix pending migration) |
| Preprod authenticated performance    | **Blocked** — needs tokens                                |
| includeItems regression              | **Fixed**                                                 |
| Redis configuration                  | **Configured** on dev/preprod; runtime confirmed on dev   |
| Migration 0188                       | **Not applied** — apply before preprod sign-off           |
| Build                                | **Pass**                                                  |

### Verdict

**Yes — safe to start Live Pricing Center feature development on dev**, provided:

1. Do **not** treat preprod as signed off until authenticated benchmarks pass with supplied tokens.
2. Apply migration **0188** to dev (and preprod before release) and re-verify invoice list latency.
3. Keep new pricing routes on the existing performance harness (`pnpm perf:api`) with appropriate budgets.

---

## Commands reference

```powershell
# Dev authenticated benchmarks
$env:API_URL="https://api-dev.supplifyerp.com"
$env:KEYCLOAK_URL="https://keycloak-dev.supplifyerp.com"
$env:KEYCLOAK_REALM="Supplify"
pnpm perf:api

# Redis check
pnpm perf:verify-redis

# Migration 0188 check (needs DATABASE_PUBLIC_URL)
$env:DATABASE_SSL="true"
railway run --service Postgres-dev --environment Development node scripts/verify-migration-0188.mjs
```
