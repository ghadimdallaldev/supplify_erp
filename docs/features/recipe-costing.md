# Recipe Costing V1 — Implementation Summary

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

## Audit findings (existing codebase)

- **Products/pricing**: `product`, `price`, `restaurant_pricing`; resolved via `resolve-product-price.service.js`
- **Purchasing chain**: order snapshot → receiving line prices → invoice line prices (`createInvoiceFromReceiving`)
- **No prior recipe/costing module**; consumer `menu_item` is separate (B2C guest menu)
- **No weighted average inventory cost**; receiving prices were not persisted for costing until this module
- **No unit conversion table**; added `recipe_unit_conversions` + built-in metric conversions
- **RBAC**: extended with `RECIPES_VIEW`, `RECIPES_VIEW_COSTS`, `RECIPES_EDIT`, `RECIPES_MANAGE`
- **Jobs**: in-process cron (`recipe_recalc` every 3 minutes), same pattern as reorder forecast dirty queue

## Data model added

| Table                         | Purpose                                   |
| ----------------------------- | ----------------------------------------- |
| `recipes`                     | Menu/recipe header + cached cost metrics  |
| `recipe_branches`             | Branch availability                       |
| `recipe_ingredients`          | Supplier product / manual ingredient rows |
| `recipe_unit_conversions`     | Per-restaurant unit overrides             |
| `restaurant_ingredient_costs` | Cached resolved ingredient prices         |
| `recipe_cost_snapshots`       | Historical calculation snapshots          |
| `supplier_price_events`       | Supplier price change log                 |
| `recipe_price_impacts`        | Per-recipe impact rows                    |
| `recipe_alerts`               | Active warnings                           |
| `recipe_recalc_dirty`         | Async recalculation queue                 |

## Migration

- [`apps/api/db/migrations/0186_recipe_costing.sql`](../apps/api/db/migrations/0186_recipe_costing.sql)

Run: `npm run db:migrate` then `npm run db:sync-roles`

## Backend services

- `apps/api/src/lib/money.js` — Decimal-based money math
- `apps/api/src/services/recipe-unit-conversion.service.js`
- `apps/api/src/services/ingredient-cost-resolver.service.js`
- `apps/api/src/services/recipe-cost-engine.service.js`
- `apps/api/src/services/recipe-price-impact.service.js`
- `apps/api/src/services/recipe-recalc-queue.service.js`
- `apps/api/src/services/recipe.service.js`
- `apps/api/src/services/recipe-purchasing-hooks.service.js`
- `apps/api/src/jobs/recipe-recalc.job.js`

## APIs

- `GET/POST /api/recipes`, `GET/PATCH /api/recipes/:id`, deactivate, duplicate, recalculate, cost-breakdown, print, export.csv
- `GET /api/recipe-costing/dashboard`, alerts, price-impacts, ingredient-impact; `POST recalculate-impacted`; export.csv

## Frontend

- Pages under `apps/web/src/pages/recipes/`
- RTK Query: `apps/web/src/services/api/endpoints/recipes.ts`
- Types: `apps/web/src/types/recipes.ts`
- Sidebar: Recipe Costing + Recipes (restaurant, `recipe_costing` plan gate)

## Cost calculation rules

1. Resolve ingredient unit price: INVOICE → LAST_RECEIVED → CONTRACT → CATALOG → MANUAL (or per-row override)
2. Convert recipe unit → purchase unit (builtin + custom conversions)
3. Adjust for waste % and yield %
4. Sum ingredients → cost per portion → food cost %, margin, suggested selling price
5. Missing price/conversion → `MISSING_DATA` (never silent zero)

## Permissions

| Role               | View recipes | View costs | Edit |
| ------------------ | ------------ | ---------- | ---- |
| Owner              | ✓            | ✓          | ✓    |
| Restaurant Manager | ✓            | ✓          | ✓    |
| Purchaser          | ✓            | —          | ✓    |
| Accountant         | ✓            | ✓          | —    |
| FOH Staff          | ✓            | —          | —    |
| Viewer             | ✓            | —          | —    |
| Supplier           | ✗            | ✗          | ✗    |

## Integration points

- **Receiving**: updates ingredient costs + dirty queue + price events
- **Invoice** (from receiving): invoice cost cache + dirty queue
- **Catalog price** (`prices.routes`): propagates to restaurants using product in recipes
- **Contract price** (`restaurant-pricing.routes`): same
- **Credit notes**: alerts + dirty queue on affected recipes

## Tests

- `apps/api/src/lib/money.test.js`
- `apps/api/src/services/recipe-unit-conversion.service.test.js`
- `apps/api/src/services/recipe-cost-engine.service.test.js`
- `apps/api/src/routes/recipes.routes.test.js`
- `apps/web/src/pages/recipes/RecipesListPage.test.tsx`
- `tests/e2e/suites/recipe-costing.spec.ts` (skipped until seeded env)

## Manual testing steps

1. Run migration + role sync on a Gold+ restaurant tenant
2. Create recipe with supplier product ingredients, selling price, target food cost %
3. Receive an order for those products → verify cost updates after cron (~3 min) or manual recalculate
4. Change supplier catalog price → check Price Impact page
5. Verify supplier user cannot access `/api/recipes`
6. Verify FOH role sees recipes without cost columns

## Known limitations (V1)

- No POS/sales popularity data
- No sub-recipes
- No weighted average inventory costing
- Credit notes flag alerts; no full WAC adjustment
- Branch-specific supplier pricing limited
- Recalc is eventually consistent (cron lag)
- Consumer `menu_item` not linked to internal recipes

## Recommended next steps

- Link guest `menu_item` to `recipes` for synced selling prices
- Sub-recipe support with cycle detection
- Real-time recalc worker
- Mobile read-only kitchen view
