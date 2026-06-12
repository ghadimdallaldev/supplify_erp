# AI Smart Reorder

Restaurant reorder assistance with **deterministic forecasting** (Phase 1) and an optional **LLM layer** (Phase 2) gated by env, plan, and feature flags.

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

| Method | Path                                                   | Permission / feature                   |
| ------ | ------------------------------------------------------ | -------------------------------------- |
| GET    | `/api/restaurant-inventory/reorder-assistance`         | `smart_reorder`, optional `?branchId=` |
| GET    | `/api/restaurant-inventory/reorder-forecasts`          | `smart_reorder`                        |
| POST   | `/api/restaurant-inventory/reorder-forecasts/refresh`  | `smart_reorder`, `INVENTORY_MANAGE`    |
| POST   | `/api/restaurant-inventory/reorder-assistance/explain` | `smart_reorder` (Gold+ forecast tier)  |
| POST   | `/api/restaurant-inventory/reorder-assistance/ask`     | `smart_reorder` (Platinum seasonality) |

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

## Railway deploy

```bash
DATABASE_URL="..." pnpm db:migrate
```

Requires migrations `0166_reorder_forecast.sql` and `0167_ai_platform_and_usage.sql`.

## Phase 2 — LLM assistant (hybrid)

Gating layers (all must pass for LLM; heuristics still work when LLM is off):

1. **Plan** — `smart_reorder` tier (`full_90day_trends` for explain; `ai_forecast_seasonality` for ask)
2. **Feature flag** — `ai_platform` (plan default on Gold/Platinum; global + per-tenant overrides via admin)
3. **Env** — `AI_ENABLED=true` and `OPENAI_API_KEY` when `AI_PROVIDER=openai`

Usage metering: `ai_requests_per_day` (Gold 20, Platinum 100). LLM calls increment usage; heuristic fallbacks do not.

| Endpoint  | LLM behavior                                | Heuristic fallback                    |
| --------- | ------------------------------------------- | ------------------------------------- |
| `explain` | Natural-language summary of suggestions     | Forecast explanations + reason labels |
| `ask`     | Map NL query to allowed suggestion products | Keyword match on product names        |

Audit: `reorder_ai_request_log` stores tokens, latency, and success per request.

### Env vars

| Variable                             | Default       | Notes                                 |
| ------------------------------------ | ------------- | ------------------------------------- |
| `AI_ENABLED`                         | `false`       | Platform kill switch                  |
| `AI_PROVIDER`                        | `openai`      | Provider id                           |
| `OPENAI_API_KEY`                     | —             | Required when provider is openai      |
| `AI_MODEL`                           | `gpt-4o-mini` | Chat model                            |
| `AI_MAX_REQUESTS_PER_TENANT_PER_DAY` | `50`          | Hard ceiling (plan limits also apply) |

See [../operations/environment-variables.md](../operations/environment-variables.md) and `apps/api/.env.example`.

### Admin

- Global / per-tenant toggle: `ai_platform` in Admin → Features ([feature-flags.md](../admin/feature-flags.md))
- Disable globally without redeploy: set `AI_ENABLED=false` on API service

## Tests

```bash
cd apps/api && pnpm test -- smart-reorder-tier reorder-forecast reorder-ai ai-platform restaurant-reorder-assistance
```
