# AI Smart Reorder

Restaurant reorder assistance combines deterministic forecasting with an optional genuine LLM layer. Forecast and rule-based output stays available for core ordering workflows, but it must be labeled as forecast or heuristic output, not AI.

> **Not the same product as Supplify Assistant.** Reorder `explain` / `ask` / `ai-recommend` stay on inventory reorder flows. The multi-domain conversational chatbot lives under [ai-assistant.md](./ai-assistant.md) (`/api/assistant`). Both share `ai_platform`, OpenAI env vars, and `ai_requests_per_day` metering.

## Commercial Model

The current public plans are tenant-specific Growth and Scale plans. Internal plan codes are preserved for compatibility, so capability resolution must use plan feature values and effective limits rather than public display names.

| Public plan             | Daily genuine LLM allowance | Notes                                                                                     |
| ----------------------- | --------------------------: | ----------------------------------------------------------------------------------------- |
| Restaurant Growth       |                          30 | Forecasting and AI reorder assistance where `smart_reorder` and `ai_platform` are enabled |
| Restaurant Scale        |                         150 | Higher daily AI allowance and advanced forecasting capabilities                           |
| 30-day restaurant trial |                    50 total | Trial pool counts genuine provider/model calls across the trial                           |

Supplier AI allowances are documented in the canonical pricing model, but this page covers restaurant reorder endpoints.

## Capabilities By Feature Value

Resolved from plan feature `smart_reorder` via `resolveSmartReorderCapabilities()`.

| `smart_reorder` value     | Capability tier   | Forecast behavior                                                   |
| ------------------------- | ----------------- | ------------------------------------------------------------------- |
| `false` / off             | off               | Reorder assistance heuristics only                                  |
| `true` (legacy)           | forecast          | 30/90-day usage + lead-time coverage                                |
| `full_90day_trends`       | forecast          | 30/90-day usage + lead-time coverage                                |
| `ai_forecast_seasonality` | advanced_forecast | Forecast model plus weekday seasonality and 7d/30d trend adjustment |

## Data Sources

1. **Consumption:** `inventory_movement_log` types `SUBTRACT`, `WASTAGE`, `SPOILAGE`
2. **Inbound (signals only):** `receiving_line_item.received_quantity` normalized to `product.unit`
3. **Fallback:** `order_item` quantities when movement consumption is sparse (< 3 units in window)

Quantities are normalized to the product base unit (`product.unit`). Recommendations are rounded to supplier `moq` and `order_multiple` from `product_inventory_settings`.

### Web ordering handoff (2026-11-13)

The assistance panel's Cart action carries the suggested quantity into product
details. The guest reviews that quantity; adding to the purchasing cart enforces
the product MOQ, pack multiple, and available stock. When multiple ordering lists
exist, the panel requires a list choice rather than silently adding to the first.
A single list is selected automatically. Invalid/nonpositive recommendation
quantities fall back to one unit before product quantity rules are applied.
Suggestions never place a supplier order automatically.

### Follow rule (marketplace visibility release 1, 2026-11-26)

- **Restaurant suggestions** never include products of a supplier the restaurant has blocked.
  - Every suggestion with a supplier carries `isFollowed` and `canOrder`. For a supplier the restaurant does not follow, they are `false` with `orderBlockedReason: 'FOLLOW_REQUIRED'`, and the UI offers "Follow to order".
- **Supplier intelligence** names current followers only: at-risk customers, cadence at-risk, cross-sell opportunities and the loyalty balances list.
  - Cross-sell pair evidence is still computed over all of the supplier's orders, as an anonymous aggregate.
  - Reminder drafts, sending a draft and opening chat from reorder assistance need a current follow.
  - The supplier's missed-cadence notification is sent only for followers. A block silences cadence reminders for both sides.
- **Reports.** Supplier "top restaurants" names followers and aggregates everyone else into one `Other customers` row per currency (`restaurant_id` null).
- **Order documents.** Packing slips and route stops prefer the order's snapshots (`customer_contact_snapshot`, `delivery_location_snapshot`) over the live restaurant profile.

## Branch Scope

Forecasts are keyed by `(restaurant_id, branch_id, product_id)`. `branch_id` NULL is the restaurant-wide aggregate.

Branch attribution uses `COALESCE(inventory_movement_log.branch_id, customer_order.branch_id)` where available. Inventory remains one row per product per restaurant today; branch-level forecasts activate as branch data is populated.

## API

| Method | Path                                                        | Permission / feature                                                                     |
| ------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/restaurant-inventory/reorder-assistance`              | `smart_reorder`, optional `?branchId=`                                                   |
| GET    | `/api/restaurant-inventory/reorder-forecasts`               | `smart_reorder`                                                                          |
| POST   | `/api/restaurant-inventory/reorder-forecasts/refresh`       | `smart_reorder`, `INVENTORY_MANAGE`                                                      |
| POST   | `/api/restaurant-inventory/reorder-assistance/explain`      | `smart_reorder`, optional genuine LLM when `ai_platform` and quota allow                 |
| POST   | `/api/restaurant-inventory/reorder-assistance/ask`          | `smart_reorder`, optional genuine LLM when advanced capability and quota allow           |
| POST   | `/api/restaurant-inventory/reorder-assistance/ai-recommend` | `smart_reorder`, `INVENTORY_VIEW`; returns AI only when a genuine model decision is used |
| POST   | `/api/restaurant-inventory/reorder-assistance/feedback`     | `smart_reorder`, `INVENTORY_MANAGE`                                                      |

`reorder-assistance` response adds:

- `smartReorder: { tier, capabilities }`
- `forecasts[]` when tier supports forecasting
- Suggestions enriched with `forecast` when confidence >= 0.35, with existing heuristics kept as fallback

## Database

Migration `0166_reorder_forecast.sql`:

- `reorder_forecast` - cached outputs (`confidence`, `explanation`, `signals`, `backtest`)
- `reorder_forecast_dirty` - invalidation queue

AI request logs and feedback use the later reorder AI migrations noted in the implementation docs and tests.

## Background Jobs

- Cron `reorder_forecast` - nightly refresh of stale/dirty restaurants (24h TTL)
- Dirty events: receiving completed, inventory adjustments
- Locked or expired tenants must not receive operational write-side refreshes that bypass billing/account locks

## Confidence And Fallback

- **Low history** (fewer than 7 complete observed days of measured consumption): `insufficientHistory: true`, null forecast qty, manual review
- **Unit mismatch** on receiving lines: incoming supply is unknown for the affected product; manual review is required
- **Missing tables** (pre-migration): assistance API unchanged
- **AI quota exhausted:** return a structured quota response or a clearly labeled forecast/rule-based fallback with next reset; do not label fallback output as AI

## Genuine LLM Layer

Gating layers all must pass for a genuine model call. Forecasts and heuristics still work when the LLM path is unavailable.

1. **Plan feature** - `smart_reorder` capability for the endpoint
2. **Feature flag** - `ai_platform` from plan/global/tenant override resolution
3. **Quota** - effective daily plan allowance or trial pool has remaining genuine LLM calls
4. **Env** - `AI_ENABLED=true` and provider credentials, such as `OPENAI_API_KEY` when `AI_PROVIDER=openai`

Usage metering uses `ai_requests_per_day` for paid plans and the trial AI pool for trial tenants. Each authenticated user has their own allowance equal to the plan limit; usage is stored in `user_ai_request_usage` (migration `0217_ai_usage_per_user.sql`) and is not shared across logins on the same tenant. Only genuine provider/model calls consume allowance. Heuristic forecasts, deterministic calculations, cached AI responses, and validation retries caused solely by internal provider errors do not consume quota unless the cost policy changes.

| Endpoint       | Genuine LLM behavior                                                    | Forecast / rule fallback                                                         |
| -------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `explain`      | Natural-language summary of suggestions, `source: ai`                   | Forecast explanations + reason labels, `source: heuristic` or `source: forecast` |
| `ask`          | Map natural-language query to allowed suggestion products, `source: ai` | Keyword/product matching, `source: heuristic`                                    |
| `ai-recommend` | Batch reorder decisions (qty/supplier/action/priority), `source: ai`    | Deterministic forecast baseline, `source: forecast` or `source: rule_based`      |

`GET /reorder-assistance` never calls the LLM. Recommendations from `ai-recommend` use `source: "ai"` only when a validated model decision was used. Forecast/heuristic fallbacks must be labeled **Forecast Reorder Recommendation** in the UI, never claimed as AI.

`ai-recommend` defaults to the top **8** eligible suggestions (`URGENT`/`HIGH`/`MEDIUM`, max 15). Optional body: `{ branchId?, productIds?, limit? }`. Responses are cached 15 minutes (`reorder-ai-rec:{restaurantId}:...`) and invalidated when forecasts are marked dirty.

Quantity validation clamps model qty to 70-130% of the forecast baseline, then applies MOQ/pack rounding. Supplier must be in `supplierOptions` (catalog default today).

Feedback: `POST .../feedback` stores light rows in `reorder_recommendation_feedback` (migration `0189_reorder_recommendation_feedback.sql`) without replacing snooze/not-needed suppressions.

Audit: `reorder_ai_request_log` stores tokens, latency, and success per request (`endpoint: explain|ask|recommend`).

## Env Vars

| Variable                             | Default       | Notes                                                           |
| ------------------------------------ | ------------- | --------------------------------------------------------------- |
| `AI_ENABLED`                         | `false`       | Platform kill switch                                            |
| `AI_PROVIDER`                        | `openai`      | Provider id                                                     |
| `OPENAI_API_KEY`                     | -             | Required when provider is openai                                |
| `AI_MODEL`                           | `gpt-4o-mini` | Chat model                                                      |
| `AI_MAX_REQUESTS_PER_TENANT_PER_DAY` | `50`          | Platform hard ceiling layered with plan limits where configured |

See [../operations/environment-variables.md](../operations/environment-variables.md) and `apps/api/.env.example`.

## Admin

- Global / per-tenant toggle: `ai_platform` in Admin -> Features ([feature-flags.md](../admin/feature-flags.md))
- Disable globally without redeploy: set `AI_ENABLED=false` on API service

## Tests

```bash
cd apps/api && pnpm test -- smart-reorder-tier reorder-forecast reorder-ai reorder-ai-normalize ai-platform restaurant-reorder-assistance restaurant-reorder-ai-recommend
```

## 2026-11-14 corrected guidance (model v2)

- Receipts are supply evidence, not consumption. Purchase-history fallback never
  adds to measured movements and is not presented as a measured forecast.
- Complete restaurant-local calendar days, observed zero days, proper holdout
  cutoffs, and all future weekdays drive the forecast. Measured history requires
  seven observed days. The existing lead-time-plus-14-day buffer remains.
- Restaurant-wide history aggregates branches once. Branch quantities need a branch
  balance; shared stock is explicit. Branch-unknown cadence/expiry hints are omitted
  from branch-scoped results instead of being silently attributed to that branch.
- Outstanding inbound quantities deduct physical receipts per order line. Overdue,
  unconfirmed/undated, and incompatible-unit supply is not counted as dependable.
  Failed lookups mean unknown, not zero. Late deliveries expose bridging needs.
- Net need precedes MOQ/pack rounding. Reliable zero forecasts replace positive
  heuristics. Wait results never become a one-unit purchase. Expiry/cadence-only
  reminders require review rather than inventing a purchase quantity.
- Suggestions add action (order/wait/manual_review), incomingQty,
  uncertainIncomingQty, overdueIncomingQty, expectedUsage, netNeed, coverageDays,
  dataQuality, stockScope, orderBy, asOf, and warnings. Responses add hasMore,
  fetchedAt, timeZone, and incomingKnown. Contracts are additive across all clients.
- Web adds search, next-step/supplier filters, supply/usage/need metrics, and refresh.
  AI review is requested explicitly, not run on mount. Android/iOS show the same
  guidance in Inventory with manual cart/list handoffs. Wait/review cards cannot
  submit quantities. Checkout still validates current price, stock, quote locks,
  currencies, minimums, and packs.
- AI cache keys include the current suggestion/supply snapshot. The model cannot
  override deterministic wait/review decisions. Old model versions refresh on access.
- Supplier follow-up cadence uses distinct orders, so additional product lines do
  not distort timing. Suggestions include order counts, lookback, timing, cadence
  evidence, retrieval time, and data strength. Repeated cadence rows consolidate by
  customer. A longer ordering gap is a follow-up cue, not a churn prediction.
  Existing reminder drafts and sending controls remain manual.

Data strength describes evidence coverage, not a calibrated probability. Physical
device checks, live provider checks, and production-size latency remain release gates.
