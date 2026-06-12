# AI Smart Reorder — Phase 1 (Deterministic Forecasting)

Phase 1 adds **cached, deterministic demand forecasts** for restaurant reorder assistance. No LLM or natural-language assistant in this phase.

## Capabilities by tier

Resolved from plan feature `smart_reorder` via `resolveSmartReorderCapabilities()` — not hard-coded plan names.

| `smart_reorder` value     | Tier     | Forecast behavior                                          |
| ------------------------- | -------- | ---------------------------------------------------------- |
| `false` / off             | off      | Reorder assistance heuristics only (Silver and below)      |
| `true` (legacy)           | gold     | 30/90-day usage + lead-time coverage                       |
| `full_90day_trends`       | gold     | 30/90-day usage + lead-time coverage                       |
| `ai_forecast_seasonality` | platinum | Gold model + weekday seasonality + 7d/30d trend adjustment |

## Data sources (priority)

1. **Consumption:** `inventory_movement_log` types `SUBTRACT`, `WASTAGE`, `SPOILAGE`
2. **Inbound (signals only):** `receiving_line_item.received_quantity` normalized to `product.unit`
3. **Fallback:** `order_item` quantities when movement consumption is sparse (< 3 units in window)

Quantities are normalized to the product base unit (`product.unit`). Recommendations are rounded to supplier `moq` and `order_multiple` from `product_inventory_settings`.

## Branch scope

Forecasts are keyed by `(restaurant_id, branch_id, product_id)`. `branch_id` NULL is the restaurant-wide aggregate.

Branch attribution uses `COALESCE(inventory_movement_log.branch_id, customer_order.branch_id)` where available. Inventory remains one row per product per restaurant today; branch-level forecasts activate as branch data is populated.

## API

| Method | Path                                                  | Permission / feature                   |
| ------ | ----------------------------------------------------- | -------------------------------------- |
| GET    | `/api/restaurant-inventory/reorder-assistance`        | `smart_reorder`, optional `?branchId=` |
| GET    | `/api/restaurant-inventory/reorder-forecasts`         | `smart_reorder`                        |
| POST   | `/api/restaurant-inventory/reorder-forecasts/refresh` | `smart_reorder`, `INVENTORY_MANAGE`    |

`reorder-assistance` response adds:

- `smartReorder: { tier, capabilities }`
- `forecasts[]` when tier supports forecasting
- Suggestions enriched with `forecast` when confidence ≥ 0.35 (existing heuristics kept as fallback)

## Database

Migration `0166_reorder_forecast.sql`:

- `reorder_forecast` — cached outputs (`confidence`, `explanation`, `signals`, `backtest`)
- `reorder_forecast_dirty` — invalidation queue

## Background jobs

- Cron `reorder_forecast` — nightly refresh of stale/dirty restaurants (24h TTL)
- Dirty events: receiving completed, inventory adjustments

## Confidence and fallback

- **Low history** (< 3 days with usage): `insufficientHistory: true`, null forecast qty, explanation directs user to existing heuristics
- **Unit mismatch** on receiving lines: quantity kept, confidence penalized
- **Missing tables** (pre-migration): assistance API unchanged

## Tests

```bash
cd apps/api && pnpm test -- smart-reorder-tier reorder-forecast restaurant-reorder-assistance
```

## Railway deploy

```bash
DATABASE_URL="..." pnpm db:migrate
```

Requires migration `0166_reorder_forecast.sql`. No new env vars for Phase 1.

## Phase 2 (not in this release)

- OpenAI explanations and natural-language ask
- `ai_platform` feature flag and `ai_requests_per_day` usage meter
