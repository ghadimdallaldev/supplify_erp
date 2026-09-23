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

Waste intelligence, supplier reliability, over-ordering detection, and invoice anomaly detection are complete in the commits containing this handover update. Invoice anomaly detection adds `GET /api/restaurant-intelligence/invoice-anomalies`, gated by `finance_invoices`, `INVOICES_VIEW`, and the advanced intelligence tier. It compares invoice-line facts with linked order snapshots, active contract prices, and prior invoice prices; duplicate protection remains enforced by the existing unique order/supplier index. It deliberately has no fraud score, automatic dispute, or mutation, and appears on the web Invoices page. Mobile remains intentionally web-only because neither native client has an invoice analytics surface.

Full API and web suites, typecheck, and lint pass; lint reports the established 1,713 warnings and no errors. Both mobile repositories pass typecheck and Jest (22 suites / 87 tests each). The full web suite still logs the pre-existing jsdom navigation warning from `AdminShell.test.tsx`, but exits successfully.

**Resume with:** Phase 2 purchasing budget. Inspect existing order, invoice, budget, notification, and feature-flag services first. A configurable budget needs a new migration; do not assume there are no live tenants or make any migration/data decision that depends on that assumption.

### Phase 2 — Restaurant Intelligence (advanced tier)

- [x] Waste intelligence — implemented 2026-09-23; tenant-scoped period comparison and repeat/rising-cost signals from real `WASTAGE`/`SPOILAGE` adjustments. Reuses the existing Waste & spoilage surface rather than creating a second dashboard.
- [x] Supplier reliability — implemented 2026-09-23; tenant-scoped supplier facts for fill rate, receiving quality, completed orders, delivery timing, and dispute state. Reuses established receiving, delivery, order, and dispute records, keeps data coverage explicit, and surfaces only factual exceptions.
- [x] Over-ordering detection — implemented 2026-09-23; tenant-scoped, coverage-aware comparison of purchase, receipt, usage, stock, and logged waste facts. Flags only repeated, comparable patterns with excess stock cover; it neither invents a stock policy nor creates orders.
- [x] Invoice / price anomaly detection — implemented 2026-09-23; tenant-scoped, line-level comparison with linked order snapshots, active contract prices, and prior invoice prices. Duplicate protection is explicitly reported from the existing unique index. It surfaces factual review signals only; it does not score fraud or create disputes.
- [ ] Purchasing budget — configurable budget, spend, remaining, % used, projected overspend; notify near/over threshold. Needs a migration.
- [ ] Stockout prediction + smart reorder quantities — largely exist in `reorder-forecast*` services; verify they are now correctly tier-gated after `0215`.
- [ ] Weekly intelligence summary — aggregate the deterministic signals. LLM may explain/prioritise; facts must come from the services.

### Phase 3 — Restaurant Scale (`crossLocation`)

- [ ] Multi-branch comparison (spend, food cost, waste, inventory, supplier performance, purchasing trends)
- [ ] Multi-branch demand forecasting — reuse branch-aware forecasting
- [ ] Cross-branch purchasing insights
- [ ] Stock-transfer **suggestions only** — recommendation-only, no inventory rebuild, no central purchasing
- [ ] Advanced analytics — no arbitrary date-window restrictions

### Phase 4 — Restaurant Scale AI Assistant

Reuse the existing assistant infrastructure in `apps/api/src/services/assistant-tools/`. Add read-only tools for price history, price changes, waste, recipe profitability, supplier reliability, over-ordering, invoice anomalies, budget, branch comparison, transfer suggestions. Tools must pass the same tenant/org/branch/RBAC/entitlement/quota checks as normal API calls. No unrestricted DB access for the LLM.

### Phase 5 — Supplier Scale

Customer reorder prediction, churn/inactivity, cross-sell, sales-opportunity alerts, demand forecasting, stockout prediction, overstock/slow-moving, suggested deals (human-approved), margin warnings (only if cost data exists), delivery/fulfillment intelligence, warehouse performance, multi-warehouse forecasting, weekly summary. Reuse `supplier-command-center`, `supplier-reorder-intelligence`, `supplier-receivables`, `supplier-deliveries`.

### Phase 6 — Supplier Scale AI Assistant

Same pattern: deterministic services calculate, assistant reads and explains.

### Final phase — full production audit

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
- **Launch blocker, product decision needed:** the plan-comparison UI advertises "Operational intelligence" on Intelligence and Scale, but most Phase 2–6 features behind it do not exist yet. Either land the phases first or remove that row until they exist. Do not ship a tier that is not built.
- `apps/web/src/pages/CentralPurchasingPage.tsx` is dead code — never imported — and its four RTK endpoints in `endpoints/branches.ts` hit the deliberately-`410` route. Safe to delete as cleanup.

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
