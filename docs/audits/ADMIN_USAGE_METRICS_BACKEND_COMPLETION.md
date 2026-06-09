# Admin Usage Metrics — Backend Completion

## 1. Summary

Completed a small backend data pass so the Admin Dashboard overview and Usage & Quotas tables can show **real** tenant metrics instead of placeholders. No plan enforcement, subscription logic, or UI layout was changed — only API fields and honest frontend wiring.

## 2. Fields added

| Field                       | Endpoint                                       | Tenant type |
| --------------------------- | ---------------------------------------------- | ----------- |
| `tenantsOverLimit`          | `GET /api/admin-dashboard/overview`            | Platform    |
| `tenantsNearLimit`          | `GET /api/admin-dashboard/overview`            | Platform    |
| `orders_today`              | `GET /api/admin-dashboard/tenants/restaurants` | Restaurant  |
| `connected_suppliers_count` | `GET /api/admin-dashboard/tenants/restaurants` | Restaurant  |
| `inventory_skus_count`      | `GET /api/admin-dashboard/tenants/restaurants` | Restaurant  |
| `storage_mb_used`           | `GET /api/admin-dashboard/tenants/restaurants` | Restaurant  |
| `active_deals_count`        | `GET /api/admin-dashboard/tenants/suppliers`   | Supplier    |
| `storage_mb_used`           | `GET /api/admin-dashboard/tenants/suppliers`   | Supplier    |

## 3. APIs changed

- **`GET /api/admin-dashboard/overview`** — adds `tenantsOverLimit`, `tenantsNearLimit`
- **`GET /api/admin-dashboard/tenants/restaurants`** — adds restaurant usage fields above
- **`GET /api/admin-dashboard/tenants/suppliers`** — adds `active_deals_count`, `storage_mb_used`

Implementation: `apps/api/src/lib/admin-tenant-usage-metrics.js`, `apps/api/src/lib/admin-overview-metrics.js`, `apps/api/src/routes/admin-dashboard.routes.js`

## 4. Data sources used

| Metric                      | Source                 | Notes                                                                                                                  |
| --------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `tenantsOverLimit`          | `usage_meter`          | Distinct tenants where `is_over_limit = true` and `limit_value > 0`                                                    |
| `tenantsNearLimit`          | `usage_meter`          | Distinct tenants where not over limit, `current_value >= 0.8 * limit_value`, `limit_value > 0`                         |
| `orders_today`              | `customer_order`       | `status = 'PLACED'`, `DATE(placed_at) = CURRENT_DATE` — same calendar-day boundary as `orders_per_day` enforcement     |
| `connected_suppliers_count` | `supplier_follow`      | Count per restaurant                                                                                                   |
| `inventory_skus_count`      | `restaurant_inventory` | `COUNT(DISTINCT product_id)` per restaurant                                                                            |
| `active_deals_count`        | `promotions`           | Active eligibility: `status = 'active'`, payment ok, date range, usage limit — aligned with promotions service display |
| `storage_mb_used`           | `usage_meter`          | `meter_type = 'storage_mb'`, `period_start_date = '2000-01-01'` (cumulative storage convention)                        |

Plan limits for UI comparison still come from the admin plan catalog (`resolvePlanLimitFromCatalog`) — not duplicated in tenant list payloads.

## 5. Metrics still unavailable

| Item                                                     | Why                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| Storage when no meter row                                | `storage_mb_used` is `null` — no fake `0`                            |
| Limits not in plan catalog                               | Shown as `—` / status `unknown`                                      |
| Tenants over limit for limits without `usage_meter` rows | Overview count only reflects metered limits with `is_over_limit` set |
| Admin preferences / billing alert toggles                | No API yet (unchanged)                                               |

## 6. Why unavailable metrics are not faked

- Missing usage returns **`null`** from SQL (no `COALESCE` to zero for storage).
- Frontend uses `parseOptionalCount` / `formatOptionalCount` — displays **"Not available"** instead of `0`.
- Progress bars render only when both usage and limit are known; `-1` limits show **Unlimited**.

## 7. Frontend behavior

- **Platform Overview** — `AdminOperationsSnapshot` shows `tenantsOverLimit` and optional `tenantsNearLimit` subtitle.
- **Supplier Usage & Quotas** — Products, Warehouses, Active deals, Storage (nullable), Usage status.
- **Restaurant Usage & Quotas** — Orders today (vs `orders_per_day`), Orders (30d), Connected suppliers, Inventory SKUs, Storage (nullable), Usage status.
- **Status** — `healthy` / `near_limit` / `over_limit` / `unlimited` / `unknown` via `adminUsageStatus.ts`.

## 8. Manual QA checklist

- [ ] Open Admin Dashboard overview — confirm **Tenants over limit** shows a real number (or "Not available" if API omits field)
- [ ] Confirm near-limit subtitle when `tenantsNearLimit` is present
- [ ] Open Supplier Usage & Quotas — products, warehouses, active deals show real values
- [ ] Confirm active deals compare to `promotions` plan limit
- [ ] Open Restaurant Usage & Quotas — **Orders today** shows real value vs daily limit
- [ ] Confirm connected suppliers and inventory SKUs when returned by API
- [ ] Confirm storage shows **Not available** when `storage_mb_used` is null
- [ ] Confirm unlimited limits (`-1`) display as **Unlimited**
- [ ] Confirm no fake zeros for missing metrics

## 9. Risks / follow-up

- **`tenantsOverLimit` coverage** — Only limits tracked in `usage_meter` with `is_over_limit` contribute. Live-only limits may be undercounted until meters are synced.
- **`active_deals_count` vs enforcement** — Admin display uses stricter active definition than `checkLimit` promotions count (`status <> 'expired'`). Enforcement unchanged; document if admins notice discrepancy.
- **Query cost** — Per-tenant subqueries on tenant list endpoints; monitor at scale; consider materialized usage summary if lists grow large.
- **Storage metering** — Requires population of `usage_meter` rows; without a metering job, storage stays null.
