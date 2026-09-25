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

| Path                      | Description                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `revenue-trend`           | Revenue and order count over time                                                              |
| `top-restaurants`         | Top 20 restaurants by revenue                                                                  |
| `top-products`            | Top 20 products by revenue                                                                     |
| `fulfillment-performance` | Order counts by status, excluding drafts, cancellations, and orders still waiting for approval |
| `order-volume`            | Distinct order count and line revenue over time                                                |
| `invoice-collection`      | Issued invoices grouped by status and currency. Void and draft invoices are left out           |

Money rows include `currency` and are grouped by it. The report table formats a money cell in that currency when the row has one. A summary total does the same, and a cost with no currency (waste) stays a plain number. A period, supplier, or branch that mixes currencies does not get a single summed total. Restaurant and supplier report windows and date buckets use that tenant's timezone, so an order placed after local midnight stays on that calendar day. Organization reports do the same per branch, using each restaurant timezone or supplier last-order timezone. Invoice aging and collection still filter on the invoice calendar date.

## Database

Migration: `0071_reports_analytics_indexes.sql` — supporting indexes only (no new tables).

## Tests

- API: `apps/api/src/services/reports.service.test.js`, `apps/api/src/routes/reports.routes.test.js`
- Web: `apps/web/src/lib/reportResponse.test.ts` (RTK unwrap / envelope parsing), `contractPricingResponse.test.ts` (contract pricing pages)
- Manual: Reports page loads on Silver+; Free → 403 (GATE-R09)

## Web reports page

`/app/reports` lists every endpoint above.

- Restaurant **receiving quality** is shown only with `RECEIVING_VIEW`.
- Restaurant **waste** is shown only when `waste_tracking` is enabled.
- Restaurant **invoice aging** and supplier **collections** are shown only with `INVOICES_VIEW`.
- Top-product quantity uses the API field `total_qty`.
- Supplier fulfillment shows order counts by status. The summary’s completed percent is the share of completed orders across the whole result.
