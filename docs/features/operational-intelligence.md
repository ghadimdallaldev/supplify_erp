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

## Supplify AI Assistant

`ai_assistant` gates `/api/assistant`; `ai_platform` separately gates LLM-enhanced Smart Reorder endpoints. Both also require `AI_ENABLED`, configured provider credentials, quota, and the tool's own authorization. The assistant only receives allowlisted read-only tools, resolves every tool call in the active tenant context, and refuses mutations. Platform admins additionally require `ADMIN_ACCESS`; driver users have no assistant navigation.

## Scope boundaries

Restaurant Scale enables multi-branch insight, not centralized purchasing. `/api/restaurant-org/central-purchasing/*` deliberately returns `410 Gone` until a separately designed, authorized cross-branch workflow exists. Inventory remains restaurant-scoped; cross-branch stock transfers and central buying are not inferred from plan entitlement.

## Integrity guarantees

The food-cost bar no longer invents a target. `FoodCostBar` previously defaulted `targetFoodCostPct` to `30`, displayed "Target: 30%", and coloured recipes as over target against a benchmark the restaurant had never set; the recipe costing dashboard also passed a literal `30` and a literal `WARNING` status for its lowest-margin rows. The dashboard now sends the real per-recipe `targetFoodCostPct` and `calc_status`, and the bar renders "no target set" instead of a fabricated one.

Receiving uses the ordered line's product, unit, and unit price rather than client-supplied values. Recipe receiving hooks capture the prior received cost before upsert so genuine price changes produce a price event. Failed recipe recalculations remain queued for retry. Inventory deductions reject insufficient stock instead of silently clamping quantity.
