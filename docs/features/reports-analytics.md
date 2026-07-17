# Reports & Analytics

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

Plan feature key: `reports`

- **Silver:** `basic_kpis` — report routes return data (same boolean gate as Gold; tier-specific report depth not split in API yet).
- **Gold+:** full report set / analytics strings per plan seeds.
- **Waste report** (`/api/reports/restaurant/waste`): requires `waste_tracking` + `reports` (Gold+ analytics on waste for full dashboard).

## Query parameters

All report endpoints accept:

| Param         | Description                                     |
| ------------- | ----------------------------------------------- |
| `from`        | Start date (ISO date); default ~30 days ago     |
| `to`          | End date; default today                         |
| `branch_id`   | Optional branch filter (restaurant reports)     |
| `granularity` | `day`, `week`, or `month` (time-series reports) |

## Response shape

```json
{
  "ok": true,
  "data": [ ... ],
  "meta": {
    "from": "2026-01-01",
    "to": "2026-01-31",
    "branchId": null,
    "granularity": "day",
    "rowCount": 12
  }
}
```

## Restaurant endpoints (`/api/reports/restaurant/...`)

| Path                | Description                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| `spend-by-supplier` | Spend and order count by supplier                                      |
| `spend-by-category` | Spend by product category                                              |
| `order-volume`      | Orders and totals over time                                            |
| `cogs-trend`        | Cost of goods (order line totals) over time                            |
| `top-products`      | Top 20 products by spend                                               |
| `receiving-quality` | Avg quality score and fill rate from `receiving_report`                |
| `waste`             | Waste/spoilage from `inventory_adjustment` (requires `waste_tracking`) |
| `invoice-aging`     | Open invoice balances by aging bucket                                  |

## Supplier endpoints (`/api/reports/supplier/...`)

| Path                      | Description                       |
| ------------------------- | --------------------------------- |
| `revenue-trend`           | Revenue and order count over time |
| `top-restaurants`         | Top 20 restaurants by revenue     |
| `top-products`            | Top 20 products by revenue        |
| `fulfillment-performance` | Order counts by status            |
| `order-volume`            | Distinct order count over time    |
| `invoice-collection`      | Invoices grouped by status        |

## Database

Migration: `0071_reports_analytics_indexes.sql` — supporting indexes only (no new tables).

## Tests

- API: `apps/api/src/services/reports.service.test.js`, `apps/api/src/routes/reports.routes.test.js`
- Web: `apps/web/src/lib/reportResponse.test.ts` (RTK unwrap / envelope parsing), `contractPricingResponse.test.ts` (contract pricing pages)
- Manual: Reports page loads on Silver+; Free → 403 (GATE-R09)
