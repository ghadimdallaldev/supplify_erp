# Large Query & API Load Optimization — July 2026

**Date:** 2026-07-08  
**Scope:** Dashboard consolidation, admin overview, fulfillment dispatch, order creation, auth/me, products inStock, restaurant inventory  
**Constraint:** No new features, no business-logic changes, targeted performance fixes only

---

## Executive summary

Reduced tenant dashboard first-load from **4–5 API calls to 2–3** by introducing `GET /api/admin/dashboard/summary`. Optimized heavy SQL on fulfillment dispatch, restaurant inventory, and multi-supplier order promo preflight. Admin overview cache TTL increased. `pnpm build` passes.

---

## 1. Dashboard API call count (before / after)

### Restaurant `/app/dashboard`

| Metric                   | Before                                                                                                      | After                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **First-load API calls** | 4+ (`/api/admin/dashboard`, `/api/orders?limit=200`, `/api/subscriptions/entitlements`, `/api/quick-lists`) | **3** (`/api/admin/dashboard/summary`, entitlements, quick-lists) |
| **Largest payload**      | `GET /api/orders?limit=200` (~200 order rows)                                                               | Summary bundle (~7 orders + 30-day spend points)                  |
| **Slowest endpoint**     | Orders list p95 ~376ms (dev)                                                                                | Summary (single round-trip, 60s cache)                            |
| **Estimated load time**  | 3 parallel + 200-order payload                                                                              | 1 summary + 2 widgets                                             |

### Supplier `/app/dashboard`

| Metric                   | Before                                                                      | After                                                |
| ------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| **First-load API calls** | 4+ (`dashboard`, `orders?limit=7`, **full** `/api/inventory`, entitlements) | **2** (`/api/admin/dashboard/summary`, entitlements) |
| **Largest payload**      | Full inventory list                                                         | Summary (7 orders + 3 low-stock SKUs)                |
| **Removed calls**        | `GET /api/orders`, `GET /api/inventory`                                     | Replaced by summary                                  |

### Admin overview tab

| Metric               | Before                       | After                                   |
| -------------------- | ---------------------------- | --------------------------------------- |
| **Calls**            | 6–7 parallel (unchanged)     | 6–7 parallel                            |
| **Overview cache**   | 120s                         | **180s**                                |
| **Cold-cache build** | Sequential follow-up queries | **Parallel** tenant limits + AI metrics |

### Supplier command center

Unchanged — already uses single `GET /api/supplier/command-center` aggregate.

---

## 2. Largest payloads found

| Route                           | Issue                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/orders?limit=200`     | Restaurant dashboard fetched 200 orders for 7-row widget + client-side spend trend |
| `GET /api/inventory`            | Supplier dashboard loaded full inventory for 3 low-stock cards                     |
| `GET /api/fulfillment/dispatch` | Up to 4 × 500 rows with per-row correlated subqueries                              |
| `GET /api/restaurant-inventory` | 30-day usage CTE scanned all SKUs before pagination                                |

---

## 3. Slowest API routes (dev benchmarks, prior audit)

| Route                           | p95    | Notes                                      |
| ------------------------------- | ------ | ------------------------------------------ |
| `/api/fulfillment/dispatch`     | 1143ms | Heavy buckets + correlated SQL (addressed) |
| `/api/invoices?limit=50`        | 714ms  | Pending migration 0188                     |
| `/api/admin-dashboard/overview` | 135ms  | Cached; cold miss ~20 queries              |

---

## 4. Large SQL queries identified

| Route                | Pattern                                                        | Risk                                         |
| -------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| Admin overview       | 17+ parallel aggregates on cache miss                          | Mitigated by 180s cache                      |
| Fulfillment dispatch | 4× `DISTINCT ON` + correlated `COUNT`/`EXISTS`                 | **Fixed** — pre-aggregated joins + 45s cache |
| Restaurant inventory | Full-restaurant 30-day movement CTE                            | **Fixed** — scoped to page SKUs              |
| Products `inStock`   | Global `inventory` aggregation for unscoped restaurant catalog | Documented; supplier-scoped path OK          |
| Order create         | N× promo EXISTS per supplier                                   | **Fixed** — single batch query               |

---

## 5. Query plan / explanation summary

### Fulfillment dispatch (after)

- `item_count`: `LEFT JOIN (SELECT order_id, COUNT(*) … GROUP BY order_id)` instead of per-row subquery
- `has_pod`: `LEFT JOIN (SELECT DISTINCT order_id FROM proof_of_delivery)` instead of `EXISTS`
- Response cached 45s per `supplierId:days:warehouseId`

### Restaurant inventory (after)

- `page_skus` CTE applies `LIMIT/OFFSET` first
- `usage` CTE joins only `page_skus.product_id` with `type = 'SUBTRACT'` filter (index-friendly)

### Products inStock count (after)

- `COUNT(DISTINCT p.id)` → `COUNT(*)` when inventory subquery is 1:1 per product

### Order create promo preflight (after)

- `hasActiveSupplierOrderPromotionsBatch(supplierIds, restaurantId)` — one `WHERE supplier_id = ANY($1)` query

---

## 6. Fixes implemented

| Area                     | Change                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard summary**    | New `GET /api/admin/dashboard/summary` + `dashboard-summary.service.js` (stats, 7 recent orders, SQL spend trend, 3 low-stock preview); 60s Redis cache |
| **Dashboard frontend**   | `DashboardPage.tsx` uses `useGetDashboardSummaryQuery`; removed `orders?limit=200` and full inventory fetch                                             |
| **Admin overview**       | Parallelized post-batch metrics; cache TTL 120s → **180s**                                                                                              |
| **Fulfillment dispatch** | Pre-aggregated joins; **45s cache**; fixed warehouse cache key                                                                                          |
| **Order create**         | Batch promo preflight via `hasActiveSupplierOrderPromotionsBatch`                                                                                       |
| **Auth /me**             | Legal acceptance + admin preferences fetched in **parallel**                                                                                            |
| **Products inStock**     | Simpler count query (`COUNT(*)` vs `COUNT(DISTINCT)`)                                                                                                   |
| **Restaurant inventory** | Usage CTE scoped to paginated SKUs only                                                                                                                 |
| **Tests**                | Batch promo test added; pagination tests still pass                                                                                                     |

**Files touched:**

- `apps/api/src/services/dashboard-summary.service.js` (new)
- `apps/api/src/routes/admin.routes.js`
- `apps/api/src/lib/admin-overview-metrics.js`
- `apps/api/src/routes/admin-dashboard/overview.js`
- `apps/api/src/routes/fulfillment/board.js`
- `apps/api/src/routes/orders/create.js`
- `apps/api/src/services/promotions.service.js`
- `apps/api/src/routes/auth.routes.js`
- `apps/api/src/routes/restaurant-inventory.routes.js`
- `apps/api/src/routes/products.routes.js`
- `apps/web/src/pages/DashboardPage.tsx`
- `apps/web/src/services/api/endpoints/dashboard.ts`

---

## 7. Risks deferred

| Risk                                                           | Reason                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Admin overview endpoint consolidation                          | 6–7 calls acceptable with caching; merging risks large breaking change   |
| Fulfillment dispatch summary-only endpoint                     | Full board still needed on load; cache + SQL fix preferred               |
| Dispatch cache invalidation on assignment                      | 45s TTL acceptable; explicit invalidation deferred                       |
| Products `inStock` global inventory scan (unscoped restaurant) | Needs supplier filter or per-supplier cache — behavior change            |
| Restaurant inventory server-side search                        | Deferred until tenants exceed 500 SKUs                                   |
| `/auth/me` response caching                                    | RBAC layer already cached; full response cache needs invalidation wiring |
| Migration 0188 (invoice indexes)                               | From prior audit — still not applied on dev DB                           |
| Dashboard summary cache invalidation on order/inventory change | 60s TTL acceptable for widgets                                           |

---

## 8. Indexes added

**None in this pass.** Existing indexes used:

- `idx_inventory_movement_restaurant_product_type_created` (restaurant inventory usage)
- `idx_order_item_supplier_order`, `idx_driver_assignments_order` (fulfillment)

Migration **0188** (`issue_date` invoice indexes) remains pending from prior audit.

---

## 9. Build confirmation

```
pnpm build — PASSED (2026-07-08)
```

API unit tests: `promotions.service.test.js`, `restaurant-inventory.pagination.test.js` — **pass**

---

## 10. Flow verification

| Flow                 | Status                                                              |
| -------------------- | ------------------------------------------------------------------- |
| Order creation       | Promo batch preserves same EXISTS logic; transaction path unchanged |
| Restaurant dashboard | KPIs + recent orders + spend trend from summary                     |
| Supplier dashboard   | KPIs + recent orders + low-stock preview from summary               |
| Auth bootstrap       | `/auth/me` same payload; legal + admin prefs parallel               |
| Fulfillment dispatch | Same response shape; faster SQL + cache                             |
| Products catalog     | inStock count semantics unchanged                                   |
| Restaurant inventory | Same fields; usage computed for visible page only                   |

**Manual smoke recommended:** Dashboard widgets, fulfillment dispatch board, multi-supplier checkout, restaurant inventory list.

---

## API reference

```http
GET /api/admin/dashboard/summary
Authorization: Bearer <token>
```

Response:

```json
{
  "ok": true,
  "data": {
    "stats": { "totalOrders": 42, "pendingOrders": 3, ... },
    "recentOrders": [{ "id": "...", "status": "PLACED", "total_amount": 120, "created_at": "...", "supplier_name": "..." }],
    "spendTrend": [{ "name": "07-01", "value": 450.5 }],
    "lowStockPreview": [{ "id": "...", "product_name": "...", "available_qty": 2, "isLowStock": true }]
  }
}
```

Legacy `GET /api/admin/dashboard` retained for drill-down and other consumers.
