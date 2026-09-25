# Handover — Supplify Final Intelligence / Subscription Pass

Paste everything below into Codex as the task prompt. It is written to be self-contained.

---

You are continuing an in-progress, pre-launch workstream on Supplify. Phase 1 and part of Phase 2 are **done, committed, and green**. Your job is to continue from there. Do not restart, do not redesign what exists, and do not re-litigate decisions recorded here unless the code contradicts them.

## Repos and branches

All three repos are on branch `final-intelligence-change`, all clean, all committed.

| Repo                                | Branch                                           | Head                                  |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `C:/myProjects/supplify_erp`        | `final-intelligence-change`                      | `8b5bf355` (4 commits ahead of `dev`) |
| `C:/myProjects/supplify-mobile`     | `final-intelligence-change` (branched off `dev`) | `2a407bf`                             |
| `C:/myProjects/supplify-mobile-ios` | `final-intelligence-change` (branched off `dev`) | `6126ae8`                             |

Commits on the ERP branch, oldest first:

1. `da01a34b` feat(plans): land Restaurant Intelligence tier and harden entitlement gating
2. `241084d6` feat(intelligence): add restaurant price intelligence and fix assistant gate
3. `8e21bcf1` feat(intelligence): food-cost and menu-margin warnings; stop inventing a 30% target
4. `8b5bf355` fix(plans): align smart_reorder with the matrix and repair the forecast cron

Read those four commit messages first (`git log dev..HEAD`) — they record _why_, not just what.

## Ground rules (from the product owner)

- This is the **final major change before market launch**. Improve and finish what exists; do not turn Supplify into a complicated ERP.
- **Reuse existing services.** Do not create parallel implementations. Several "missing" features turned out to already exist and only needed gating or surfacing.
- **Deterministic calculations, not AI.** Forecasting, stockout, price detection, anomalies, reliability, waste, profitability, churn, overstock, cross-sell are all statistical/deterministic. The LLM only explains, summarises, and converses over already-computed signals. It must never manufacture a business fact.
- **Never invent business facts.** If the data cannot support a statement, omit it and document the data prerequisite. Two features are already deferred on exactly this basis (see "Deferred" below).
- **Do not touch** Stripe, billing implementation, subscription charging, payment processing, or pricing amounts. Entitlements only.
- **Do not introduce central purchasing.** Restaurant Scale gets cross-branch _visibility and insight_, never cross-branch buying. `/api/restaurant-org/central-purchasing/*` returns `410 Gone` deliberately.
- **Do not add arbitrary plan restrictions** (e.g. capping reports to 90 days just to differentiate tiers). Scale wins on multi-branch intelligence, org visibility, advanced forecasting, and the AI Assistant.
- Do not commit to `main` or `prod`. Never edit a committed migration; add a new one.

## Subscription matrix (implemented, authoritative)

Internal plan codes are preserved. Prices were already correct at these codes, so nothing billing-related moved.

| Tenant     | Plan         | Code       | Price         |
| ---------- | ------------ | ---------- | ------------- |
| Restaurant | Growth       | `silver`   | $49 / $490    |
| Restaurant | Intelligence | `gold`     | $149 / $1,490 |
| Restaurant | Scale        | `platinum` | $349 / $3,490 |
| Supplier   | Growth       | `gold`     | $149 / $1,490 |
| Supplier   | Scale        | `platinum` | $349 / $3,490 |

Restaurant `custom` is an inactive compatibility row holding any legacy Platinum subscriptions. The product owner confirmed there are **no live tenants**, so the repurpose was done cleanly with no grandfathering.

**Restaurant AI Assistant is SCALE ONLY.** Intelligence gets deterministic forecasting, recommendations, alerts, and summaries — but no conversational chat. Supplier assistant is Scale only too.

## Entitlement architecture you must use

Three keys, deliberately separate. Do not collapse them.

- `intelligence` — tiered: `basic` / `advanced` / `scale`. Gates deterministic intelligence.
- `ai_assistant` — gates the conversational assistant (`/api/assistant`). Scale only.
- `ai_platform` — gates LLM assistance for Smart Reorder only. Never implies the assistant.

`apps/api/src/lib/intelligence-tier.js` is the single resolver:

- `resolveIntelligenceCapabilities(value)` — pure mapping → `{ basicSignals, advancedSignals, crossLocation }`
- `getIntelligenceTierForTenant(tenantId, tenantType)` — resolves through `resolveAllFeaturesForTenant`, so admin overrides and global kill-switches apply
- `requireIntelligenceTier(minTier)` — Express guard

A bare `true` resolves to `basic`, never `scale`. Absent / `false` / `'false'` / `'disabled'` → `none`.

Web mirror: `getIntelligenceTier`, `meetsIntelligenceTier`, `smartReorderHasForecast` in `apps/web/src/lib/planLimits.ts`.

### Guard ordering — non-negotiable

Every intelligence route layers, in this order:

```
requireAuth → resolveTenantContext → requireRole → requirePermission → requireIntelligenceTier
```

The tier guard is **last** because **entitlement is not authorization**. The tier never widens tenant scope, and a Scale tenant still needs the permission. Permissions are applied **per route, not router-wide**, because they differ:

- purchase-price surfaces → `CATALOG_VIEW`
- portion cost / margin surfaces → `RECIPES_VIEW_COSTS` (narrower; Purchaser and Viewer hold `CATALOG_VIEW` but deliberately lack cost visibility)

Always derive the tenant id from the session (`getRestaurantIdForRequest(req)`), never from the query string.

## What is already built

### Migrations added on this branch

- `0212_final_intelligence_subscription_matrix.sql` — the entitlement matrix. Restaurant `platinum` gets a **complete** canonical limits/features set, because it was an inactive Custom row since `0190` and `verify-tier-matrix` only checks active plans — a partial merge would fail the tier guard at deploy. Intelligence drops to `branches: 1` since multi-branch moved to Scale.
- `0213_active_driver_assignment_integrity.sql` — dedupes active driver assignments, then partial unique indexes.
- `0214_recipe_recalc_retry_budget.sql` — retry budget + park for `recipe_recalc_dirty`.
- `0215_smart_reorder_matrix_alignment.sql` — Growth → `suggestions_only`; forecasting starts at Intelligence.

### New API source

- `apps/api/src/lib/intelligence-tier.js` (+ `.test.js`, `.guard.test.js`)
- `apps/api/src/routes/restaurant-intelligence.routes.js` (+ `.test.js`) — mounted at `/api/restaurant-intelligence` in `server.js`
- `apps/api/src/services/restaurant-price-intelligence.service.js` (+ test)
- `apps/api/src/services/restaurant-margin-intelligence.service.js` (+ test)
- `apps/api/src/lib/final-intelligence-migrations.test.js` — static guard over migration SQL

### Endpoints live today

| Endpoint                                                    | Tier     | Permission           |
| ----------------------------------------------------------- | -------- | -------------------- |
| `GET /api/restaurant-intelligence/price-history/:productId` | basic    | `CATALOG_VIEW`       |
| `GET /api/restaurant-intelligence/price-changes`            | advanced | `CATALOG_VIEW`       |
| `GET /api/restaurant-intelligence/cheaper-buys`             | advanced | `CATALOG_VIEW`       |
| `GET /api/restaurant-intelligence/food-cost-warnings`       | advanced | `RECIPES_VIEW_COSTS` |
| `GET /api/restaurant-intelligence/menu-profitability`       | advanced | `RECIPES_VIEW_COSTS` |

### New web source

- `apps/web/src/pages/PriceIntelligencePage.tsx` → route `/app/price-intelligence`, sidebar entry gated on advanced tier
- `apps/web/src/components/recipes/FoodCostWarningsCard.tsx` → rendered on the existing recipe costing dashboard, advanced tier
- `apps/web/src/services/api/endpoints/priceIntelligence.ts` (5 queries)
- `apps/web/src/types/priceIntelligence.ts`, `apps/web/src/types/marginIntelligence.ts`
- `PriceIntelligence` added to RTK `tagTypes` in `services/api/base.ts`

## Bugs already found and fixed — do not reintroduce

1. **Assistant FAB never rendered for any non-admin user.** It read `data.features.ai_assistant`, but `/api/subscriptions/entitlements` returns `{ entitlements: { features } }`. The hook comes from the `services/api` barrel which exports `api as any`, so `tsc` could not catch it; the test mocked the wrong shape _and_ stubbed `featureEnabled` to always return `true`.
2. **Client-side feature-gate bypass.** `resolveEntitlementFeature` used "enabled wins" across `features` and `planFeatures`. `features` is the _resolved_ map (tenant override → global flag → plan JSON), so raw plan JSON could re-enable a feature an admin had switched off. Now `features` is authoritative when the key is present.
3. **Driver RBAC, both directions.** Original `every(isDriverPermission)` meant any extra permission disabled assignment scoping and the status allowlist. An interim fix keyed on `FULFILLMENT_MANAGE`, which misclassified the supplier **Viewer** role (holds `DRIVER_DELIVERIES_VIEW` + `FULFILLMENT_VIEW`) as a driver across ~20 call sites. Now keyed on fulfillment visibility.
4. **Recipe recalc poison-pill.** Failed rows were kept but with no retry cap, so one bad row sat at the head of `ORDER BY created_at ASC LIMIT 50` forever.
5. **Expiry alerts bypassed suppression** — a snoozed expiry alert came straight back.
6. **Inventory adjustment was not atomic.** `query('BEGIN')` on a pool was never a transaction.
7. **Fabricated food-cost benchmark.** `FoodCostBar` defaulted `targetFoodCostPct` to `30` and displayed "Target: 30%", flagging recipes as over target against a number the restaurant never set. The dashboard passed literal `30` and literal `'WARNING'`.
8. **The scheduled forecast refresh had never produced a forecast.** `refreshAllDirtyForecasts` gated on feature truthiness, and `refreshRestaurantForecasts` read `getEffectiveFeaturesForTenant(...).features?.smart_reorder` — but that helper returns an **array of descriptor objects**, so the value was always `undefined` and every run bailed as `feature_disabled`.
9. Arabic i18n gap — 14 `products.categories.*` keys were English-only.
10. N+1 in `listPriceImpacts` — one query per event, and the CSV export calls it with `limit: 500`.

### The recurring root cause — watch for more of these

Three separate bugs were **entitlement reads against the wrong object shape**, invisible because the code was untyped or the test mocked the wrong shape. When you touch entitlements:

- `/api/subscriptions/entitlements` returns `{ entitlements: Entitlements }` — the nested object, not the bare one.
- `getEffectiveFeaturesForTenant()` returns an **array** of `{featureKey, enabled, source, planValue, tenantOverride}`.
- For a resolved **tiered value**, use `getResolvedFeatureValue(tenantId, tenantType, key)` in `feature-flags.js` (added on this branch).
- `isFeatureEnabledForTenant()` is boolean-only — it returns `true` for `suggestions_only`, which has no forecast capability.
- Never re-list tier strings inline in a component. Use the shared helpers.

## Deferred, with recorded reasons — do not silently implement

- **Cross-supplier "same product cheaper elsewhere".** `product.sku` is unique per `(supplier_id, sku)`; there is no GTIN or barcode column. Equating two suppliers' catalog rows would be a guess about physical goods. Needs a shared product-identity model first. Cheaper-buys therefore reports only from an agreed contract price or a supplier-declared `product_substitute`.
- **Supplier expiry intelligence** — inspect the lot architecture before attempting. If reliable supplier expiry data is absent, implement slow-moving inventory now and document the prerequisite.
- **Supplier margin warnings** — verify reliable supplier cost data exists. Never calculate fake margins. If cost data is absent, add only the smallest sensible data model or defer with a written reason.

## What remains

## Continuation status — 2026-09-23

Waste intelligence, supplier reliability, over-ordering detection, invoice anomaly detection, and the weekly intelligence summary are complete in the commits containing this handover update. The weekly endpoint (`GET /api/restaurant-intelligence/weekly-summary`) composes existing factual waste, supplier, over-ordering, invoice, and current non-stale stockout signals without recalculating, scoring, or automating them. It requires every underlying feature and source-read permission (`waste_tracking`, `receiving_quality`, `finance_invoices`, `smart_reorder`; `INVENTORY_VIEW`, `RECEIVING_VIEW`, `INVOICES_VIEW`) plus advanced intelligence. Stockout prediction and smart reorder quantities were also verified as existing, correctly tier-gated capabilities: `reorder-forecast*` produces deterministic quantities from recorded inventory/usage/lead-time facts, `0215` leaves Growth on `suggestions_only`, and forecast capability begins at Restaurant Intelligence. Invoice anomaly detection adds `GET /api/restaurant-intelligence/invoice-anomalies`, gated by `finance_invoices`, `INVOICES_VIEW`, and the advanced intelligence tier. It compares invoice-line facts with linked order snapshots, active contract prices, and prior invoice prices; duplicate protection remains enforced by the existing unique order/supplier index. It deliberately has no fraud score, automatic dispute, or mutation, and appears on the web Invoices page. Mobile remains intentionally web-only for invoice and weekly intelligence because neither native client has these cross-domain review surfaces.

Full API and web suites, typecheck, and lint pass; lint reports the established 1,713 warnings and no errors. Both mobile repositories pass typecheck and Jest (22 suites / 87 tests each). The full web suite still logs the pre-existing jsdom navigation warning from `AdminShell.test.tsx`, but exits successfully. One initial API run hit an unrelated randomized upload-token assertion when an opaque token happened to contain `s3`; its isolated test and the full-suite rerun pass.

**Resume with:** Phase 3 multi-branch demand forecasting. Reuse existing branch-aware forecasting; do not introduce central purchasing or cross-branch mutations.

### Purchasing budget decision — 2026-09-23

User decision: do not introduce central purchasing or a purchasing budget. The legacy approvals/budgets removal in `0114` stands. Do not add budget schema, defaults/backfills, thresholds, notifications, pooled controls, or automatic procurement.

### Phase 2 — Restaurant Intelligence (advanced tier)

- [x] Waste intelligence — implemented 2026-09-23; tenant-scoped period comparison and repeat/rising-cost signals from real `WASTAGE`/`SPOILAGE` adjustments. Reuses the existing Waste & spoilage surface rather than creating a second dashboard.
- [x] Supplier reliability — implemented 2026-09-23; tenant-scoped supplier facts for fill rate, receiving quality, completed orders, delivery timing, and dispute state. Reuses established receiving, delivery, order, and dispute records, keeps data coverage explicit, and surfaces only factual exceptions.
- [x] Over-ordering detection — implemented 2026-09-23; tenant-scoped, coverage-aware comparison of purchase, receipt, usage, stock, and logged waste facts. Flags only repeated, comparable patterns with excess stock cover; it neither invents a stock policy nor creates orders.
- [x] Invoice / price anomaly detection — implemented 2026-09-23; tenant-scoped, line-level comparison with linked order snapshots, active contract prices, and prior invoice prices. Duplicate protection is explicitly reported from the existing unique index. It surfaces factual review signals only; it does not score fraud or create disputes.
- [x] Purchasing budget — declined by product decision 2026-09-23. Do not revive the removed approvals/budgets product or introduce central purchasing, budget schema, thresholds, notifications, or automatic procurement.
- [x] Stockout prediction + smart reorder quantities — verified 2026-09-23; already implemented in `reorder-forecast*` and the existing Reorder Assistance panel. `0215` correctly keeps Growth on deterministic assistance only and grants forecast/stockout quantities to Intelligence and Scale. No duplicate service, endpoint, UI, or mobile contract was added.
- [x] Weekly intelligence summary — implemented 2026-09-23; advanced read-only aggregation of existing waste, supplier, over-ordering, invoice, and non-stale stockout signals. It preserves evidence windows and source permissions, has no composite score or automatic action, and is surfaced on Restaurant Inventory.

### Phase 3 — Restaurant Scale (`crossLocation`)

- [x] Multi-branch comparison — implemented and gate-corrected 2026-09-23; authorized read-only branch spend/trends, inventory, waste, and receiving facts. Requires multi_branch, Scale intelligence, waste/receiving source features, and ORDERS_VIEW, INVENTORY_VIEW, and RECEIVING_VIEW. Food cost is explicitly unavailable without a shared recipe/menu identity model. Full API/web/typecheck/lint/Android/iOS verification passed; next start at multi-branch demand forecasting.
- [x] Multi-branch demand forecasting — implemented 2026-09-23 by reusing only fresh restaurant-account aggregate rows from the existing deterministic reorder_forecast cache. It is Scale/read-only, requires multi_branch, forecast-capable smart_reorder, and INVENTORY_VIEW, excludes stale and legacy intra-tenant branch rows, and neither refreshes forecasts nor suggests transfers/orders. Full API/web/typecheck/lint/Android/iOS verification passed; next start at cross-branch purchasing insights.
- [x] Cross-branch purchasing insights — implemented 2026-09-23 as a Scale/read-only comparison of exact same-product/same-supplier stored order-line price ranges across authorized Branch Accounts. It requires multi_branch, CATALOG_VIEW, ORDERS_VIEW, and Scale intelligence; it neither matches products/packs, chooses suppliers, recommends or creates purchases, nor enables central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed; next start at stock-transfer suggestions only.
- [x] Stock-transfer **suggestions only** — implemented 2026-09-23 as a Scale/read-only hint from exact shared products, fresh high/urgent destination forecasts, and explicit source surplus above its own low-stock threshold. It never reserves, moves, adjusts, or rebuilds inventory; creates no cart/order/transfer; and does not enable central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed; next start at advanced analytics.
- [x] Advanced analytics — implemented 2026-09-23 as a Scale/read-only monthly order/spend trend across authorized Branch Accounts. It validates dates but has no arbitrary maximum span, requires multi_branch and ORDERS_VIEW, and never changes operational data. Full API/web/typecheck/lint/Android/iOS verification passed; Phase 3 is complete.

### Phase 4 — Restaurant Scale AI Assistant

Reuse the existing assistant infrastructure in `apps/api/src/services/assistant-tools/`. `get_price_history` implemented 2026-09-24; reuses deterministic price history with CATALOG_VIEW, effective Basic Intelligence, assistant quota, and tenant scope. `get_price_changes` implemented 2026-09-24; reuses deterministic price-change alerts with CATALOG_VIEW, effective Advanced Intelligence, assistant quota, tenant scope, and bounded day range. `get_waste_intelligence` implemented 2026-09-24; reuses deterministic waste signals with waste_tracking, INVENTORY_VIEW, effective Advanced Intelligence, assistant quota, tenant scope, and bounded day range. `get_supplier_reliability` implemented 2026-09-24; reuses deterministic receiving, delivery, and dispute facts with receiving_quality, RECEIVING_VIEW, effective Advanced Intelligence, assistant quota, tenant scope, and bounded day range. `get_recipe_profitability` implemented 2026-09-24; reuses persisted recipe cost and margin facts with recipe_costing, RECIPES_VIEW_COSTS, effective Advanced Intelligence, assistant quota, and tenant scope. `get_over_ordering` implemented 2026-09-24; reuses coverage-aware excess-stock signals with waste_tracking, receiving_quality, INVENTORY_VIEW, RECEIVING_VIEW, effective Advanced Intelligence, assistant quota, tenant scope, and bounded day range. `get_invoice_anomalies` implemented 2026-09-24; reuses factual invoice-line comparisons with finance_invoices, INVOICES_VIEW, effective Advanced Intelligence, assistant quota, tenant scope, and bounded day range. `get_branch_comparison` implemented 2026-09-24; reuses authorized org comparison facts with multi_branch, waste_tracking, receiving_quality, ORDERS_VIEW, INVENTORY_VIEW, RECEIVING_VIEW, effective Scale Intelligence, assistant quota, and org scope. `get_transfer_suggestions` implemented 2026-09-24; reuses read-only forecast/surplus hints with multi_branch, forecast-capable smart_reorder, INVENTORY_VIEW, effective Scale Intelligence, assistant quota, and org scope. Phase 4 is complete. Budget is explicitly excluded by product decision. Tools must pass the same tenant/org/branch/RBAC/entitlement/quota checks as normal API calls. No unrestricted DB access for the LLM.

### Phase 5 — Supplier Scale

Customer reorder prediction, churn/inactivity, cross-sell, sales-opportunity alerts, demand forecasting, stockout prediction, overstock/slow-moving, suggested deals (human-approved), margin warnings (only if cost data exists), delivery/fulfillment intelligence, warehouse performance, multi-warehouse forecasting, weekly summary. Reuse `supplier-command-center`, `supplier-reorder-intelligence`, `supplier-receivables`, `supplier-deliveries`.

- [x] Supplier slow-moving inventory — implemented 2026-09-24. `GET /api/supplier/slow-moving-inventory` reuses the authoritative warehouse/legacy stock display and completed supplier order history to report only repeatedly sold products whose current recorded stock covers at least the same 30–365 day observation window (default 90 days). It requires `WAREHOUSES_VIEW`, `inventory_management`, and Supplier Scale intelligence; it is surfaced as a read-only Supplier Command Center panel. Coverage is explicit; there is no target stock policy, demand forecast, deal, notification, stock/order mutation, purchasing budget, or central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at supplier demand forecasting only after confirming the existing forecast/reorder services do not already cover it.
- [x] Supplier demand forecast — implemented 2026-09-24. `GET /api/supplier/demand-forecast` is a Supplier Scale/read-only projection of completed supplier order-line demand. It reuses no restaurant-only forecast cache: the new deterministic read model uses observed 30/90-day sales rates only for products with completed sales on at least seven distinct days, keeps coverage explicit, and is surfaced on the Supplier Command Center. It requires ORDERS_VIEW, forecast-capable smart_reorder, and Scale intelligence. It never reads or changes stock, claims a stockout, creates a recommendation/order/deal/notification/budget, or enables central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at supplier stockout prediction only after confirming existing stock/reorder services do not already cover it.
- [x] Supplier projected stockout risks — implemented 2026-09-24. `GET /api/supplier/stockout-risks` combines the new deterministic completed-order demand forecast with the authoritative warehouse/legacy stock display to report only projected shortfalls over a bounded 1–90 day horizon (default 14). It requires `ORDERS_VIEW`, `WAREHOUSES_VIEW`, forecast-capable smart_reorder, and Supplier Scale; the supplier is session-derived and coverage distinguishes forecast history from recorded stock rows. Existing stock semantics treat a missing stock row as zero. The Supplier Command Center surface is read-only: no target/lead-time inference, purchase/order/deal/notification, stock mutation/reservation, budget, or central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at supplier cross-sell only after confirming an existing customer/product intelligence service does not already cover it.
- [x] Supplier cross-sell opportunities — implemented 2026-09-24. `GET /api/supplier/cross-sell-opportunities` is a Supplier Scale/read-only Command Center review of exact same-supplier product pairs in completed orders. It identifies a restaurant that ordered an anchor but not the candidate in a bounded 30–365 day window (default 180), only where other recorded orders paired the exact products at least twice; it returns the evidence count and never claims need, suitability, product equivalence, availability, or customer intent. It requires ORDERS_VIEW and Scale intelligence, is session-scoped, and has no deal/message/price/order/notification/budget/central-purchasing action. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at supplier sales-opportunity alerts only after confirming existing customer/reorder intelligence does not already cover them.

- [x] Supplier sales opportunities / reorder / churn — verified existing 2026-09-24. The established Command Center, `getReorderIntelligence`, `getSupplierReorderAssistance`, and cadence-at-risk flow already surface restaurants past observed reorder cadence, customer-specific frequent products, and a churn-risk label for an extended gap. `/reorder-intelligence` and `/reorder-assistance` are session-scoped and require `smart_reorder` plus `ORDERS_MANAGE` or `PROMOTIONS_MANAGE`; reminder messages are created as human-reviewed drafts, never auto-sent. No duplicate service, endpoint, UI, mobile contract, deal/order/price change, budget, or central purchasing was added. Next start at suggested deals only after confirming existing promotions/deal services do not already cover human-approved supplier offers.

- [x] Supplier suggested deal reviews — implemented 2026-09-24. `GET /api/supplier/suggested-deals` reuses recorded slow-moving inventory and excludes exact products already targeted by active or pending product deals. It requires WAREHOUSES_VIEW, PROMOTIONS_MANAGE, inventory_management, promotions, and Supplier Scale; it is a human review only, never sets a discount or creates/submits/publishes a deal, message, stock change, budget, or central purchasing. Next start at supplier margin warnings only after verifying reliable supplier cost data exists.

- [x] Supplier margin warnings — deferred 2026-09-24 after verification. Supplier catalog and order records hold selling prices, while `restaurant_ingredient_costs` and receiving values are each restaurant's purchase costs; neither is supplier cost of goods or a supplier-owned cost history. Deriving margin from either would be false. No schema was added because an owned cost-entry workflow and historical provenance are a product decision. No endpoint, UI, mobile contract, budget, or central purchasing was added. Next start at supplier delivery/fulfillment intelligence only after confirming the existing deliveries, run-sheet, and Command Center services do not already cover it.

- [x] Supplier delivery / fulfillment intelligence — verified existing 2026-09-24. The tenant-resolved delivery board is gated by `FULFILLMENT_VIEW` or `DRIVER_DELIVERIES_VIEW` plus `fulfillment`, the Command Center already exposes daily delivery, GPS, and fulfillment-exception previews, and the run sheet aggregates deliveries, pick queue, shortages, receivables, and factual risks. The web surfaces link to the existing fulfillment board and run sheet. No duplicate service, endpoint, UI, mobile contract, automatic action, budget, or central purchasing was added. Next start at supplier warehouse performance only after confirming existing warehouse, stock, and Command Center coverage.

- [x] Supplier warehouse performance — implemented 2026-09-24. `GET /api/supplier/warehouse-performance` is a Supplier Scale/read-only aggregate of active warehouse inventory thresholds and assignment states over a bounded 1–365 day window (default 30). It requires `WAREHOUSES_VIEW`, `FULFILLMENT_VIEW`, `warehouses`, `fulfillment`, and Scale intelligence, and is surfaced on the Supplier Command Center. It reports recorded quantities and status counts only; it never creates a target, score, routing decision, reservation, transfer, order, notification, budget, or central purchasing action. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at multi-warehouse forecasting only after confirming existing forecast data does not already provide a warehouse-specific view.

- [x] Supplier multi-warehouse demand forecast — implemented 2026-09-24. `GET /api/supplier/warehouse-demand-forecast` projects demand per warehouse/product only from delivered, item-specific warehouse assignments joined to their own supplier order lines; failed, superseded, and whole-order duplicate attribution are excluded. It uses the existing bounded 30/90-day deterministic weighting with at least seven sale days, requires `ORDERS_VIEW`, `WAREHOUSES_VIEW`, `multi_warehouse`, forecast-capable `smart_reorder`, and Supplier Scale, and is read-only on the Command Center. It never sets a stock target, routes/reserves/transfers stock, creates an order/notification/budget, or enables central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at supplier weekly summary only after confirming no existing summary covers these supplier facts.

- [x] Supplier weekly intelligence summary — implemented 2026-09-24. `GET /api/supplier/weekly-intelligence-summary` composes bounded highlights from existing slow-moving, stockout, cross-sell, warehouse-performance, and warehouse-forecast services without recalculating them. It requires every underlying source gate: `ORDERS_VIEW`, `WAREHOUSES_VIEW`, `FULFILLMENT_VIEW`, `inventory_management`, `warehouses`, `fulfillment`, `multi_warehouse`, forecast-capable `smart_reorder`, and Supplier Scale. It is a read-only Command Center review with no score, target, routing/inventory/order/notification/budget action, or central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at Phase 6 Supplier Scale AI Assistant.

### Phase 6 — Supplier Scale AI Assistant

Same pattern: deterministic services calculate, assistant reads and explains.

- [x] Supplier Assistant slow-moving inventory — implemented 2026-09-24. `get_supplier_slow_moving_inventory` reuses the deterministic supplier slow-moving service through the existing Assistant registry. It is Supplier-scoped, requires `WAREHOUSES_VIEW`, `inventory_management`, Assistant quota, and Supplier Scale; days are bounded 30–365 and results capped at 15. It is read-only and never creates a deal/order/notification/budget, changes stock, or enables central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at remaining Supplier Assistant tools.
- [x] Supplier Assistant demand forecast — implemented 2026-09-24. `get_supplier_demand_forecast` reuses the deterministic supplier demand-forecast service through the existing Assistant registry. It is Supplier-scoped, requires `ORDERS_VIEW`, forecast-capable `smart_reorder`, Assistant quota, and Supplier Scale; horizon is bounded 1–90 days and results capped at 15. It is read-only and never creates a deal/order/notification/budget, changes stock, or enables central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at remaining Supplier Assistant tools.
- [x] Supplier Assistant projected stockout risks — implemented 2026-09-24. `get_supplier_stockout_risks` reuses the deterministic supplier stockout-risk service through the existing Assistant registry. It is Supplier-scoped, requires `ORDERS_VIEW`, `WAREHOUSES_VIEW`, forecast-capable `smart_reorder`, Assistant quota, and Supplier Scale; horizon is bounded 1–90 days and results capped at 15. It is read-only and never creates a replenishment/order/deal/notification/budget, changes stock, or enables central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at remaining Supplier Assistant tools.
- [x] Supplier Assistant cross-sell opportunities — implemented 2026-09-24. `get_supplier_cross_sell_opportunities` reuses the deterministic supplier cross-sell service through the existing Assistant registry. It is Supplier-scoped, requires `ORDERS_VIEW`, Assistant quota, and Supplier Scale; days are bounded 30–365 and results capped at 15. It is read-only and never creates a deal/message/order/notification/budget, changes stock, or enables central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at remaining Supplier Assistant tools.
- [x] Supplier Assistant suggested deal reviews — implemented 2026-09-24. `get_supplier_suggested_deals` reuses the deterministic suggested-deal review service through the existing Assistant registry. It is Supplier-scoped, requires `WAREHOUSES_VIEW`, `PROMOTIONS_MANAGE`, `inventory_management`, `promotions`, Assistant quota, and Supplier Scale; days are bounded 30–365 and results capped at 15. It is read-only and never sets a discount or creates/submits/publishes a deal, message, order, notification, budget, or central purchasing. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at remaining Supplier Assistant tools.
- [x] Supplier Assistant warehouse performance — implemented 2026-09-24. `get_supplier_warehouse_performance` reuses the deterministic warehouse-performance service through the existing Assistant registry. It is Supplier-scoped, requires `WAREHOUSES_VIEW`, `FULFILLMENT_VIEW`, `warehouses`, `fulfillment`, Assistant quota, and Supplier Scale; days are bounded 1–365 and results capped at 15. It is read-only and never sets a target or creates routing/reservation/transfer/order/notification/budget/central-purchasing action. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at remaining Supplier Assistant tools.
- [x] Supplier Assistant multi-warehouse demand forecast — implemented 2026-09-24. `get_supplier_warehouse_demand_forecast` reuses the deterministic per-warehouse demand-forecast service through the existing Assistant registry. It is Supplier-scoped, requires `ORDERS_VIEW`, `WAREHOUSES_VIEW`, `multi_warehouse`, forecast-capable `smart_reorder`, Assistant quota, and Supplier Scale; horizon is bounded 1–90 days and results capped at 15. It is read-only and never creates a target/routing/reservation/transfer/order/notification/budget/central-purchasing action. Full API/web/typecheck/lint/Android/iOS verification passed. Next start at remaining Supplier Assistant tools.

- [x] Supplier Assistant weekly intelligence summary — implemented 2026-09-24. `get_supplier_weekly_intelligence_summary` reuses the deterministic composed weekly service through the existing Assistant registry. It is Supplier-scoped, requires every source permission/feature plus forecast capability, Assistant quota, and Supplier Scale; days are bounded 7–31. It is read-only and never scores, sets targets, or creates routing/inventory/order/notification/budget/central-purchasing action. Full API/web/typecheck/lint/Android/iOS verification passed. Phase 6 Supplier Assistant wrappers are complete; next start at final production audit.

### Final phase — full production audit

- [x] Atomic supplier product creation — audit remediation 2026-09-24. Replaced pooled BEGIN/COMMIT calls with a pinned withTransaction client for product, optional price, and optional initial inventory writes; the route test asserts the transaction helper. Full API/web/typecheck/lint/Android/iOS verification passed.

- [x] Central purchasing dead-code removal — audit remediation 2026-09-24. Removed the un-routed web page, unused client endpoints/hooks, and dormant server draft workflow; the explicit /api/restaurant-org/central-purchasing/\* 410 guard remains and is route-tested. Historical migrations and deactivation safeguards remain because removing legacy data guards would depend on a live-tenant/data-retention decision. Full API/web/typecheck/lint/Android/iOS verification passed.

- [x] Final production audit — concluded 2026-09-25. Restaurant, supplier, and driver contract/state paths were checked against focused tests and the full verification suite. Intelligence routes remain session-scoped with source permissions/features ahead of tier gates; Assistant tools retain those source gates. Driver transitions lock the assignment and order rows and detect concurrent status changes; inventory deductions use a conditional update; the only raw BEGIN/COMMIT calls are in the pinned shared transaction helper. Notification categories are enforced by preferences and have a regression test. Legacy central-purchasing migrations and deactivation safeguards remain deliberately deferred because deleting data guards requires a live-tenant/data-retention decision.

- [x] Final pre-merge tier/flag/migration remediation — verified 2026-09-25. Removed stale Restaurant `gold = Scale` labels/fixtures, made monetization labels tenant-aware, disabled new Restaurant extra-branch add-ons because Scale already has an unlimited catalog branch allowance, and corrected `verify:tier-matrix` to use the Restaurant free/silver/gold/platinum and Supplier free/gold/platinum ladders while asserting exact `intelligence`, `ai_assistant`, and `ai_platform` values. Runtime feature-flag checks proved persisted global/tenant overrides, tenant > global > plan enforcement, and clear/inherit fallback. A disposable PostgreSQL 17 clean database applied all 216 migrations; a separate through-0211 upgrade fixture preserved and remapped a synthetic legacy Restaurant Custom subscription and retained global/tenant flag canaries while applying 0212–0215. No existing database or tenant data was touched. Focused tier/flag/web/mobile and 147 workflow/routing/notification/AI-isolation tests pass. The final full verification block is the remaining step before commit.

- [x] Admin UI addon-editor gate complete — 2026-09-25. Completed the partially-applied JSX change in `AdminLimitsTab.tsx`: the addon grant/update editor is now wrapped in `{showAddonEditor && (...)}`, quantity controls are disabled when `tenantType === 'RESTAURANT'`, and the addon-type selector is also disabled for restaurants so a historical row can only be removed (qty forced to zero). Added `AdminLimitsTab.test.tsx` unit tests for `getAdminAddonOptionKeys` covering all three cases (no historical row → empty; historical row → `[restaurant_extra_branch]`; supplier → `[supplier_extra_branch, supplier_extra_warehouse]`) plus component-level assertions that the "Grant / Update Add-on" button is never rendered for a Restaurant. Added two API route tests to `admin-dashboard.routes.test.js` proving Restaurant Scale cannot provision a positive `restaurant_extra_branch` quantity and that quantity zero is accepted for historical cleanup. Full verification block: API 334 files / 1977 tests ✓; web 137 files / 537 tests ✓; typecheck ✓; lint 0 errors / 1713 pre-existing warnings ✓; build ✓; Android 22 suites / 87 tests ✓; iOS 22 suites / 87 tests ✓. Disposable synthetic database data files removed (only a locked Windows log file remains, no data). Mobile repos remain clean. Nothing pushed.

Required before the work is complete. Restaurant, supplier, and driver journeys end to end; web/mobile/API contract parity; impossible state transitions; race conditions and transaction boundaries; N+1 and unbounded queries; notification toggles that actually control behaviour; migrations vs live schema; no fake/non-functional UI controls.

## Mobile parity — hard requirement

`CLAUDE.md` mandates that every API/auth/RBAC/type/feature change is propagated to **both** mobile repos, or documented as skipped with a reason and a dated entry in `docs/mobile/MOBILE_FEATURE_PARITY.md`. Three reasoned skip entries already exist (price intelligence, margin warnings, smart-reorder alignment) — follow their format. Verify with `npx tsc --noEmit` in each mobile repo.

## Verification — run all of these before claiming done

```bash
cd C:/myProjects/supplify_erp
pnpm test:api       # expect 318 files / 1876 tests passing
pnpm test:web       # expect 134 files / 519 tests passing
pnpm typecheck      # clean
pnpm lint           # 0 errors (≈1713 pre-existing warnings are expected)

cd C:/myProjects/supplify-mobile      && npx tsc --noEmit && npx jest --runInBand   # 22 suites / 87 tests
cd C:/myProjects/supplify-mobile-ios  && npx tsc --noEmit && npx jest --runInBand   # 22 suites / 87 tests
```

`pnpm verify:tier-matrix` needs a live database; it skips cleanly when PostgreSQL is unreachable. Run it after `pnpm db:migrate` if you have one.

## Known issues carried forward

- **Low / CI hygiene:** `apps/api/src/services/supplier-pain-killer.test.js > previewProductImport` fails intermittently in the _full_ suite but passes in isolation. Pre-existing test-isolation flake, not a product bug. Do not chase it mid-feature; fix it as its own task if you want CI green deterministically.
- **Plan-comparison copy — product decision retained:** the Phase 2–6 intelligence features recorded in this handover now exist. The "Operational intelligence" row was deliberately not changed; alter or remove it only with product-owner direction.

## Testing conventions in this codebase (learned the hard way)

- `vi.mock` factories must return **stable references**; returning a fresh `vi.fn()` per call re-runs effects and hangs page tests silently.
- A partial mock via `importOriginal()` does **not** affect a function that closes over a module-internal binding. `requireIntelligenceTier` closes over `getIntelligenceTierForTenant`, so mocking the exported resolver does nothing — mock the guard itself, or test the real path with the underlying modules mocked (see `intelligence-tier.guard.test.js`).
- Do not stub a gate to always return `true` in a component test. That is what hid the assistant FAB bug for the entire life of the feature.
- Mock payloads must mirror the real response shape exactly.
- Every EN i18n key needs its AR counterpart; `src/i18n/i18n.test.ts` enforces parity including interpolation placeholders.
- Commit messages must end with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (adjust attribution for your own agent).
- `lint-staged` reformats with prettier on commit; expect files to change during the commit.

## How to work

Continue phase by phase. For each unit: read the existing code first and confirm it does not already exist, write the deterministic service with tests, gate it correctly, surface it, update `docs/features/operational-intelligence.md` and `docs/mobile/MOBILE_FEATURE_PARITY.md`, run the full verification above, then commit. Report what you changed, what you found, and what you deliberately did not do — with reasons.

Do not claim the application is bug-free. Give evidence from tests and code inspection.
