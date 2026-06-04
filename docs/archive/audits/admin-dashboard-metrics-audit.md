# Admin Dashboard metrics audit

**Date:** 2026-05-28  
**Scope:** Overview tab metric cards only (data fetch, SQL, API shape, UI mapping).  
**Out of scope:** Tier limits/pricing, Deals/Promotions business logic, dashboard layout redesign.

---

## 1. Flow

| Layer           | Location                                                         |
| --------------- | ---------------------------------------------------------------- |
| UI              | `apps/web/src/pages/AdminDashboardPage.tsx` (Overview tab)       |
| API client      | `useGetAdminOverviewQuery` → `GET /api/admin-dashboard/overview` |
| Route           | `apps/api/src/routes/admin-dashboard.routes.js`                  |
| Metrics builder | `apps/api/src/lib/admin-overview-metrics.js`                     |

Envelope: `{ ok, data, error }` → RTK `baseQueryWithUnwrap` exposes `data` as the overview object.

---

## 2. Root cause (bugs found)

### Critical: single `Promise.all` failure zeroed entire dashboard

The overview route ran **17 SQL queries in one `Promise.all`**. Any failure rejected the whole handler (HTTP 500).

**Confirmed failure:** `SELECT COUNT(*) FROM product WHERE is_active=true` — column `product.is_active` **does not exist** in this schema (`42703`).

**UI behavior:** On API error, `overview` was `undefined` while `overviewLoading` became `false`, so every card rendered `overview?.field ?? 0` → **silent zeros**.

### Other query issues (fixed)

| Metric           | Issue                                                          | Fix                                                                                       |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Orders Today     | Used rolling 24h on `placed_at` only; included drafts          | Calendar `CURRENT_DATE` on `COALESCE(placed_at, created_at)`; exclude `DRAFT`/`CANCELLED` |
| Active Products  | Invalid `is_active` column                                     | `COUNT(*)` from `product`                                                                 |
| MRR              | Only `ACTIVE`; yearly used `price_per_month*12`; included Free | `ACTIVE`+`TRIALING` paid plans; yearly → `price_per_year/12`; exclude `free`/`enterprise` |
| Active Subs (UI) | Showed all `subscriptionStats.ACTIVE` incl. Free               | Card uses `revenue.paidActiveSubscriptions`                                               |
| Active Staff     | Only `staff_member`                                            | `staff_member` (ACTIVE) + `restaurant_team`                                               |
| Resilience       | One bad query broke all metrics                                | Per-metric `safeOverviewQuery` with fallback + warn log                                   |

---

## 3. API response shape (after fix)

```json
{
  "tenantCounts": { "RESTAURANT": 2, "SUPPLIER": 1 },
  "subscriptionStats": { "ACTIVE": 3, "TRIALING": 1 },
  "revenue": {
    "mrr": 198,
    "arr": 2376,
    "activeSubscriptions": 2,
    "paidActiveSubscriptions": 2,
    "paidActiveOnly": 1
  },
  "orders": { "today": 0, "week": 5, "month": 8, "total": 9 },
  "activeCarts": 1,
  "chatsLast24h": 0,
  "totalActiveStaff": 4,
  "reservations": { "today": 0, "week": 1, "confirmed": 0 },
  "tenants": {
    "totalSuppliers": 1,
    "newSuppliers7d": 0,
    "totalRestaurants": 2,
    "newRestaurants7d": 0
  },
  "totalActiveProducts": 42,
  "totalQuickLists": 1,
  "alerts": { "pastDueSubscriptions": 0, "trialsExpiringSoon": 0, ... },
  "activity": { "ordersLast24h": 0, "chatsLast24h": 0 }
}
```

Debug: set `ADMIN_OVERVIEW_DEBUG=1` to log per-metric rows and final payload (not enabled in production by default).

---

## 4. Metric → DB source

| Card               | Response field                    | Table(s)                            | Filter logic                                                                                  |
| ------------------ | --------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Orders Today       | `orders.today`                    | `customer_order`                    | `status NOT IN ('DRAFT','CANCELLED')`, `DATE(COALESCE(placed_at, created_at)) = CURRENT_DATE` |
| Active Carts       | `activeCarts`                     | `customer_order`, `order_item`      | `status = 'DRAFT'`, has line items                                                            |
| Chats (24h)        | `chatsLast24h`                    | `message`                           | `created_at >= NOW() - 24 hours`                                                              |
| Active Staff       | `totalActiveStaff`                | `staff_member`, `restaurant_team`   | ACTIVE staff + all team rows                                                                  |
| Reservations Today | `reservations.today`              | `reservation`                       | `scheduled_at::date = CURRENT_DATE`                                                           |
| Active Products    | `totalActiveProducts`             | `product`                           | All products (no `is_active` column)                                                          |
| Quick Lists        | `totalQuickLists`                 | `quick_list`                        | All rows                                                                                      |
| Orders Total       | `orders.total`                    | `customer_order`                    | `status NOT IN ('DRAFT','CANCELLED')`                                                         |
| Suppliers          | `tenants.totalSuppliers`          | `supplier`                          | `COUNT(*)`                                                                                    |
| Restaurants        | `tenants.totalRestaurants`        | `restaurant`                        | `COUNT(*)`                                                                                    |
| MRR                | `revenue.mrr`                     | `subscription`, `subscription_plan` | `ACTIVE`/`TRIALING`, plan not `free`/`enterprise`, `price_per_month > 0`, normalized monthly  |
| Active Subs        | `revenue.paidActiveSubscriptions` | same                                | Paid catalog subs (excl. Free Trial)                                                          |

Subscription status breakdown still uses `subscriptionStats` (includes Free Trial `ACTIVE`/`TRIALING`).

---

## 5. Frontend mapping

| Card               | Field                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| Orders Today       | `overview.orders.today`                                                        |
| Active Carts       | `overview.activeCarts`                                                         |
| Chats (24h)        | `overview.chatsLast24h`                                                        |
| Active Staff       | `overview.totalActiveStaff`                                                    |
| Reservations Today | `overview.reservations.today`                                                  |
| Active Products    | `overview.totalActiveProducts`                                                 |
| Quick Lists        | `overview.totalQuickLists`                                                     |
| Orders Total       | `overview.orders.total`                                                        |
| Suppliers          | `overview.tenants.totalSuppliers`                                              |
| Restaurants        | `overview.tenants.totalRestaurants`                                            |
| MRR                | `overview.revenue.mrr`                                                         |
| Active Subs        | `getPaidActiveSubscriptionCount(overview)` → `revenue.paidActiveSubscriptions` |

**Error state:** `overviewError` shows red banner + Retry (no fake zeros).

---

## 6. Files changed

| File                                                 | Change                              |
| ---------------------------------------------------- | ----------------------------------- |
| `apps/api/src/lib/admin-overview-metrics.js`         | **New** — resilient metrics builder |
| `apps/api/src/lib/admin-overview-metrics.test.js`    | **New** — unit tests                |
| `apps/api/src/routes/admin-dashboard.routes.js`      | Delegate `/overview` to builder     |
| `apps/api/src/routes/admin-dashboard.routes.test.js` | Overview route shape test           |
| `apps/api/src/config/env.js`                         | `ADMIN_OVERVIEW_DEBUG` flag         |
| `apps/web/src/lib/adminOverview.ts`                  | Types + paid subs helper            |
| `apps/web/src/lib/adminOverview.test.ts`             | Field mapping tests                 |
| `apps/web/src/pages/AdminDashboardPage.tsx`          | Error banner; Active Subs label     |
| `apps/web/src/services/api.ts`                       | Typed overview query                |
| `apps/api/scripts/debug-overview-counts.mjs`         | Dev-only count script               |
| `docs/admin/ADMIN_DASHBOARD_METRICS_AUDIT.md`        | This document                       |

---

## 7. Remaining unknowns

- **Orders Today timezone:** Uses DB session `CURRENT_DATE` (align server TZ with business TZ if counts look off).
- **Active Staff:** Does not include supplier `org_user_roles` / `app_user` — may under-count B2B users vs reservation staff.
- **Active Products:** No soft-delete flag on `product`; counts all SKUs.
- **Chats / reservations:** Zero in dev may reflect no recent messages or today’s bookings (expected).

---

## 8. Manual QA checklist

1. Seed or use existing: restaurant, supplier, subscription (Silver+), product, order (placed), quick list, message, reservation.
2. Open **Admin → Overview**.
3. Confirm **Suppliers**, **Restaurants**, **Orders Total**, **Active Products**, **Quick Lists** are non-zero when data exists.
4. Confirm **MRR** matches paid plans (excludes Free Trial).
5. Confirm **Active Subs** matches `paidActiveSubscriptions`, not raw `ACTIVE` including Free.
6. Place order today → **Orders Today** increments (calendar day).
7. Stop API or break auth → red error banner, not all zeros.
8. Optional: `ADMIN_OVERVIEW_DEBUG=1` on API, reload overview, inspect logs.

### Regression tests

```bash
cd apps/api
npm run test:run -- src/lib/admin-overview-metrics.test.js src/routes/admin-dashboard.routes.test.js

cd apps/web
npm run test:run -- src/lib/adminOverview.test.ts
```
