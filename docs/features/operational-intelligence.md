# Operational intelligence

Migration `0212_final_intelligence_subscription_matrix.sql` separates deterministic operational intelligence from the conversational assistant. It does not change checkout, payment provider, stored prices, fees, or billing calculations.

## Entitlement matrix

| Tenant     | Plan                  | Intelligence                                                                                   | Conversational assistant |
| ---------- | --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| Restaurant | Growth (`silver`)     | Basic, deterministic inventory, receiving, reorder, and supplier signals                       | No                       |
| Restaurant | Intelligence (`gold`) | Advanced deterministic forecasting, recipe-cost/price-impact, waste, and supplier intelligence | No                       |
| Restaurant | Scale (`platinum`)    | Scale-level and multi-branch insight where the underlying data model supports it               | Yes, read-only           |
| Supplier   | Growth (`gold`)       | Deterministic customer reorder, stock, receivables, and command-center signals                 | No                       |
| Supplier   | Scale (`platinum`)    | Advanced customer, inventory, fulfillment, and operational signals                             | Yes, read-only           |

## Enforcing the tier

`apps/api/src/lib/intelligence-tier.js` is the single place that turns the `intelligence` plan value into capability flags:

| Tier     | Plan value                               | `basicSignals` | `advancedSignals` | `crossLocation` |
| -------- | ---------------------------------------- | -------------- | ----------------- | --------------- |
| none     | absent, `false`, `'false'`, `'disabled'` | no             | no                | no              |
| basic    | `'basic'` (or a bare `true`)             | yes            | no                | no              |
| advanced | `'advanced'`                             | yes            | yes               | no              |
| scale    | `'scale'`                                | yes            | yes               | yes             |

- `resolveIntelligenceCapabilities(value)` — pure mapping, used wherever a plan value is already in hand.
- `getIntelligenceTierForTenant(tenantId, tenantType)` — resolves through `resolveAllFeaturesForTenant`, so admin tenant overrides and global kill-switches apply and a plan tier string can never resurrect a key an admin switched off.
- `requireIntelligenceTier(minTier)` — Express guard for deterministic intelligence endpoints.

The guard is **additive**: entitlement is not authorization. Routes keep their own `requirePermission`, tenant-context, and domain feature middleware. A bare `true` resolves to `basic`, never `scale`, so a plan row that enables the key without naming a tier cannot leak cross-location insight.

Existing routes continue to enforce their domain feature and RBAC checks; the tier is not a bypass for inventory, finance, recipe, fulfillment, or reporting permissions.

## Deterministic sources

Restaurant intelligence composes existing, reproducible calculations: `reorder_forecast`, stock/expiry signals, receiving history, recipe cost snapshots, `supplier_price_events`, recipe price impacts, and waste movements. Supplier intelligence composes the command center, reorder cadence and at-risk customers, warehouse/legacy stock display, receivables, delivery state, and fulfillment exceptions. Results must name their source and never fabricate a prediction, price, supplier, or quantity.

## Price intelligence (implemented)

`apps/api/src/services/restaurant-price-intelligence.service.js`, exposed on `/api/restaurant-intelligence`:

| Endpoint                        | Tier     | Returns                                                                                                        |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /price-history/:productId` | basic    | Observed price timeline for one product plus a window summary (current, low, high, average, change, direction) |
| `GET /price-changes`            | advanced | Price movements above a noise threshold (default 5%), largest first, with `medium`/`high` severity             |
| `GET /cheaper-buys`             | advanced | Products whose price rose that have a cheaper **authorised** alternative                                       |

All three read `supplier_price_events`, written by the receiving/catalog/contract hooks in `recipe-purchasing-hooks.service.js`. The window and page size are clamped server-side; `direction` is validated against an allowlist rather than interpolated. `changePct` is recomputed from `old_price`/`new_price` instead of trusting the stored column, which is null on first observation.

Web surface: `/app/price-intelligence` (`PriceIntelligencePage`), sidebar entry gated on the advanced tier. Price history has no standalone page yet; it is consumed per product.

### Cheaper-buy sources, and what is deliberately not inferred

A cheaper option is only ever reported from two explicit sources:

1. **Contract price** — the restaurant's own active `restaurant_pricing` row for that product is below the last observed price.
2. **Supplier substitute** — a `product_substitute` row the supplier itself declared, priced with the same validity rule as `getDefaultCatalogPrice`.

**Deferred: cross-supplier "the same product is cheaper elsewhere".** `product.sku` is unique per `(supplier_id, sku)` and there is no GTIN, barcode, or shared catalog identity column, so equating two suppliers' catalog rows would be a guess about the physical goods. Implementing this needs a shared product-identity model first (a platform-level product key, or verified GTIN on `product`). Until that exists the feature stays out rather than inventing alternatives.

## Food-cost and menu-margin warnings (implemented)

`apps/api/src/services/restaurant-margin-intelligence.service.js`:

| Endpoint                  | Tier     | Permission           | Returns                                                                                                                           |
| ------------------------- | -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `GET /food-cost-warnings` | advanced | `RECIPES_VIEW_COSTS` | Recipes above their **own** target food cost, worst first, attributed to the latest ingredient price change, plus coverage counts |
| `GET /menu-profitability` | advanced | `RECIPES_VIEW_COSTS` | Recipes below a gross-margin threshold (default 60%), weakest first                                                               |

Both read values the recipe cost engine already persists (`cost_per_portion`, `food_cost_pct`, `gross_profit`, `gross_margin_pct`, `calc_status`) and `recipe_price_impacts`. Nothing is recalculated, and `gross_profit` is read rather than recomputed in float so it agrees with the engine to the cent.

**Permissions differ from the price endpoints on purpose.** Portion cost and margin require `RECIPES_VIEW_COSTS`, which the Purchaser and Viewer roles deliberately lack even though they hold `CATALOG_VIEW`. The router therefore applies permissions per route rather than router-wide.

### No invented benchmarks

- `target_food_cost_pct` is nullable and per recipe, and there is no platform default. A recipe without a target is **not** reported as a breach; it is counted in `coverage.withoutTarget` instead, so an empty warning list is never mistaken for "everything is healthy".
- Recipes the engine marked `MISSING_DATA` (no selling price, unpriced ingredient, missing unit conversion) are excluded rather than shown as zero margin.

### Relationship to the recipe costing dashboard

The dashboard's "highest cost" / "lowest margin" cards ship with `recipe_costing` and stay available on Growth. These endpoints are the Intelligence-tier addition on top: threshold-driven rather than a fixed top-5, attributed to the specific price event, and coverage-aware. `FoodCostWarningsCard` renders on the same dashboard, gated on the advanced tier, so there is one cost-and-margin surface rather than two competing pages.

## Waste intelligence (implemented)

`GET /api/restaurant-intelligence/waste-intelligence` is an advanced Restaurant Intelligence surface. It requires `waste_tracking`, `INVENTORY_VIEW`, and the `advanced` intelligence tier; entitlement remains additive to the existing inventory permission and waste domain gate.

It reads only real `inventory_adjustment` rows of type `WASTAGE` and `SPOILAGE`, comparing the requested period (7–365 days; default 30) with the immediately preceding period of equal length. It returns period totals and only lists a product when either:

- it has at least two logged waste incidents in the current window; or
- its recorded waste cost rose against a non-zero recorded cost in the prior window.

There is no platform "high waste" amount or estimated cost. Movements without a recorded cost are retained in coverage counts but excluded from cost comparisons, so the UI cannot treat incomplete cost data as a zero-cost or healthy result. The existing `/api/restaurant-inventory/waste-analytics` report remains the descriptive waste report; the Intelligence card appears on that same Waste & spoilage tab as its comparison/pattern layer.

## Supplier reliability (implemented)

`GET /api/restaurant-intelligence/supplier-reliability` is an advanced Restaurant Intelligence surface. It requires `receiving_quality`, `RECEIVING_VIEW`, and the `advanced` intelligence tier; the tier does not bypass the existing receiving domain gate or permission.

It composes already-recorded facts for each supplier over a 7–730 day window (default 90 days):

- **Order completion** from restaurant orders containing that supplier's items.
- **Fill rate and quality** from `receiving_report`; fill rate is weighted by actual ordered/received quantities, and quality stays null when no report was scored.
- **Delivery timing** from completed `driver_assignments`, compared with their operational scheduled delivery date. Deliveries without a schedule are counted as missing timing coverage, not late.
- **Disputes** from the restaurant's supplier-linked dispute records, including unresolved disputes.

The service returns the source measurements and only emits objective exceptions: a short receipt, a delivery recorded after its schedule, or an unresolved dispute. It intentionally has no composite reliability score, no arbitrary acceptable-quality target, and no claimed timing rate when scheduled delivery data is absent. The `/reports/restaurant/receiving-quality` endpoint remains the descriptive receiving-quality report; the advanced card appears on the existing Receiving page.

## Over-ordering detection (implemented)

`GET /api/restaurant-intelligence/over-ordering` is an advanced Restaurant Intelligence review surface. It requires `waste_tracking`, `receiving_quality`, `INVENTORY_VIEW`, `RECEIVING_VIEW`, and the `advanced` intelligence tier. Both domain gates and both source-read permissions remain in front of entitlement because the calculation reads their underlying records.

The service compares, per product over a 30–365 day window (default 90), already-recorded:

- purchase quantities and repeated order count from `customer_order`/`order_item`;
- received quantities from `receiving_report`/`receiving_line_item`;
- actual usage (`SUBTRACT`) from `inventory_movement_log`;
- logged `WASTAGE`/`SPOILAGE` quantities from `inventory_adjustment`; and
- current restaurant stock from `restaurant_inventory`.

A product is a review signal only with at least two qualifying orders, observed usage, comparable receipt units, at least 45 days of current stock cover, and receipts at least 1.5× its observed usage plus waste. A high waste share (at least 25% of observed depletion) is an additional contextual signal only when that excess-stock condition already holds. This does **not** claim that waste was caused by ordering, set an arbitrary restaurant stock maximum, or create orders.

Receiving lines in a non-matching product unit are counted as coverage gaps and exclude that product from comparison rather than being coerced to zero or guessed at. The advanced card appears on the existing Restaurant Inventory page, next to the existing Smart Reorder panel; it is a review layer and does not duplicate or alter low-stock/reorder assistance.

## Invoice and price anomaly detection (implemented)

`GET /api/restaurant-intelligence/invoice-anomalies` is an advanced, read-only Restaurant Intelligence surface. It requires `finance_invoices`, `INVOICES_VIEW`, and the `advanced` intelligence tier.

It reports only stored, line-level comparisons: billed quantity above the linked order line, billed unit price above the order snapshot, billed unit price above an active contract valid on the invoice date, and invoice-price movement above the existing 5% price-noise threshold. The database already enforces one linked invoice per `(order_id, supplier_id)`; that protection is reported as enforcement rather than turned into a speculative risk score. It does not call a difference fraud, infer missing contract terms, alter an invoice, or create disputes. The web card appears on the existing Restaurant Invoices page.

## Weekly intelligence summary (implemented)

`GET /api/restaurant-intelligence/weekly-summary` is an advanced, read-only review of the existing deterministic services. Because it includes inventory, receiving, invoice, and forecast records, it requires the existing `waste_tracking`, `receiving_quality`, `finance_invoices`, and `smart_reorder` domain features plus `INVENTORY_VIEW`, `RECEIVING_VIEW`, and `INVOICES_VIEW` permissions. The web summary card is shown only under those same gates.

It does not recalculate, score, or automate anything. It aggregates the already-flagged waste hotspots, supplier exceptions, over-ordering products, invoice anomalies, and current non-stale high/urgent stockout forecasts. Its response preserves each source's evidence window: waste and invoice review use the requested weekly period, supplier reliability uses at least 28 days, and over-ordering uses at least 90 days so repeated patterns remain evidence-based.

## Multi-branch comparison (implemented)

Restaurant Scale adds a read-only authorized-branch comparison at GET /api/restaurant-org/reports/comparison. It is gated by multi_branch, Scale intelligence, waste/receiving source features, and ORDERS_VIEW, INVENTORY_VIEW, and RECEIVING_VIEW permissions. It compares stored branch-account purchasing trends, inventory availability, waste, and receiving quality/fill rate. Food-cost comparison is deliberately unavailable: branch accounts do not share a comparable recipe/menu identity model.

## Multi-branch demand forecasting (implemented)

`GET /api/restaurant-org/reports/demand-forecast` is the Scale, read-only Branch-Account view of the existing deterministic `reorder_forecast` cache. It requires `multi_branch`, `smart_reorder` with forecast capability (not Growth’s suggestions-only value), `INVENTORY_VIEW`, and Scale intelligence.

It does not refresh, calculate, aggregate quantities across different product units, suggest a transfer, or create an order. It returns only fresh restaurant-wide cache rows for authorized Branch Accounts, ranked within each account by stored urgency and confidence. Stale rows and the separate legacy intra-tenant `branch` forecasts are excluded, so scope is never presented as cross-account data.

## Cross-branch purchasing insights (implemented)

`GET /api/restaurant-org/reports/purchasing-insights` is a Scale, read-only Branch-Account comparison of the latest stored order-line unit prices. It requires `multi_branch`, `CATALOG_VIEW`, `ORDERS_VIEW`, and Scale intelligence.

A signal exists only where at least two authorized Branch Accounts bought the exact same catalog product from the same supplier at different stored unit prices in the selected reporting window. It reports the observed range and branch count; it does not match different products, infer equivalent packs or contract terms, choose a supplier, recommend a purchase, create a cart/order, or enable central purchasing.

## Stock-transfer suggestions (implemented)

`GET /api/restaurant-org/reports/stock-transfer-suggestions` is a Scale, read-only review surface. It requires `multi_branch`, forecast-capable `smart_reorder`, `INVENTORY_VIEW`, and Scale intelligence. It suggests an exact shared product only when a destination has a fresh high/urgent reorder forecast and an authorized source has a recorded low-stock threshold with stock above it.

It does not reserve, move, adjust, or rebuild inventory; create a transfer/order/cart; infer interchangeable products; or override either Branch Account's policies. The displayed quantity is bounded by the source's recorded surplus and the destination's stored forecast quantity.

## Advanced analytics (implemented)

GET /api/restaurant-org/reports/advanced-analytics provides Scale read-only monthly order/spend trends for authorized Branch Accounts. It requires multi_branch, ORDERS_VIEW, and Scale intelligence. It validates dates but imposes no arbitrary maximum date span; it does not create or change operational data.

## Forecasting tier alignment (migration 0215)

`smart_reorder` now matches the matrix. Growth is "basic reorder suggestions"; demand forecasting, stockout prediction, and smart reorder quantities start at Intelligence.

| Plan                             | `smart_reorder`           | Capability             |
| -------------------------------- | ------------------------- | ---------------------- |
| Restaurant Growth (`silver`)     | `suggestions_only`        | assistance only        |
| Restaurant Intelligence (`gold`) | `ai_forecast_seasonality` | forecast + seasonality |
| Restaurant Scale (`platinum`)    | `ai_forecast_seasonality` | forecast + seasonality |
| Supplier Growth (`gold`)         | `suggestions_only`        | assistance only        |
| Supplier Scale (`platinum`)      | `ai_forecast_seasonality` | forecast + seasonality |

`suggestions_only` falls through `resolveSmartReorderCapabilities()` to the existing `basic` tier, so no resolver change was needed. It is named for the capability rather than a time window deliberately: the legacy `limited_7day_history` label implied a history cap that no code enforces, and arbitrary day-window restrictions are not how these plans are differentiated.

Web reads this through `smartReorderHasForecast()` in `planLimits.ts` rather than re-listing tier strings inline, which is how the UI and API drifted apart before.

### Cron bug fixed alongside

`refreshAllDirtyForecasts` gated on `isFeatureEnabledForTenant('smart_reorder')` — a boolean check that `suggestions_only` also passes — and then `refreshRestaurantForecasts` looked the value up via `getEffectiveFeaturesForTenant(...).features?.smart_reorder`. That helper returns an **array** of descriptor objects, so the value was always `undefined`, `forecastModelTierForFeature(undefined)` returned `null`, and **every scheduled refresh bailed out as `feature_disabled`** — the job had never produced a forecast. Forecasts were only ever computed lazily by `refreshIfStale` on the request path.

Both are fixed: the new `getResolvedFeatureValue(tenantId, tenantType, key)` in `feature-flags.js` returns the resolved tiered value (overrides and global flags applied, tier string preserved), and the cron now judges the forecast **capability** rather than feature truthiness. The job result gained `skippedNoForecastTier` so the skip is observable.

## Supplify AI Assistant

`ai_assistant` gates `/api/assistant`; `ai_platform` separately gates LLM-enhanced Smart Reorder endpoints. Both also require `AI_ENABLED`, configured provider credentials, quota, and the tool's own authorization. The assistant only receives allowlisted read-only tools, resolves every tool call in the active tenant context, and refuses mutations. Platform admins additionally require `ADMIN_ACCESS`; driver users have no assistant navigation.

## Assistant price history tool (implemented)

The existing assistant now exposes get_price_history for an explicit restaurant product ID. It reuses the deterministic price-history service, is bounded to 15 observations, and requires the assistant entitlement/quota, CATALOG_VIEW, and Basic-or-higher effective Intelligence. It cannot issue SQL or escape the active tenant.

## Assistant price-change tool (implemented)

The assistant exposes get_price_changes for meaningful observed restaurant purchase-price changes. It reuses the deterministic price-change alert service, limits the requested window to 365 days, and requires the assistant entitlement/quota, CATALOG_VIEW, and Advanced-or-higher effective Intelligence. Direction and percentage filters are passed to the existing service; the assistant cannot issue SQL, write data, or escape the active tenant.

## Assistant waste-intelligence tool (implemented)

The assistant exposes get_waste_intelligence for deterministic repeat-waste and rising-cost signals. It reuses the waste-intelligence service, limits the requested window to 365 days and returned hotspots to 15, and requires the assistant entitlement/quota, waste_tracking, INVENTORY_VIEW, and Advanced-or-higher effective Intelligence. It is separate from the legacy waste report and cannot issue SQL, write data, or escape the active tenant.

## Assistant supplier-reliability tool (implemented)

The assistant exposes get_supplier_reliability for observed receiving, delivery, and dispute facts by supplier. It reuses the deterministic supplier-reliability service, limits the requested window to 730 days and returned suppliers to 15, and requires the assistant entitlement/quota, receiving_quality, RECEIVING_VIEW, and Advanced-or-higher effective Intelligence. It cannot issue SQL, write data, or escape the active tenant.

## Assistant recipe-profitability tool (implemented)

The assistant exposes get_recipe_profitability for persisted menu-item cost and margin facts below the requested display threshold. It reuses the deterministic margin-intelligence service, caps results at 15, and requires the assistant entitlement/quota, recipe_costing, RECIPES_VIEW_COSTS, and Advanced-or-higher effective Intelligence. Its threshold is the existing filter, not an invented restaurant target; it cannot issue SQL, write data, or escape the active tenant.

## Scope boundaries

Restaurant Scale enables multi-branch insight, not centralized purchasing. `/api/restaurant-org/central-purchasing/*` deliberately returns `410 Gone` until a separately designed, authorized cross-branch workflow exists. Inventory remains restaurant-scoped; cross-branch stock transfers and central buying are not inferred from plan entitlement.

## Integrity guarantees

The food-cost bar no longer invents a target. `FoodCostBar` previously defaulted `targetFoodCostPct` to `30`, displayed "Target: 30%", and coloured recipes as over target against a benchmark the restaurant had never set; the recipe costing dashboard also passed a literal `30` and a literal `WARNING` status for its lowest-margin rows. The dashboard now sends the real per-recipe `targetFoodCostPct` and `calc_status`, and the bar renders "no target set" instead of a fabricated one.

Receiving uses the ordered line's product, unit, and unit price rather than client-supplied values. Recipe receiving hooks capture the prior received cost before upsert so genuine price changes produce a price event. Failed recipe recalculations remain queued for retry. Inventory deductions reject insufficient stock instead of silently clamping quantity.
