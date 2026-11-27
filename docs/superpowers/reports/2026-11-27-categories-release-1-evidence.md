# Platform categories release 1 — evidence (Plan B)

Date: 2026-11-27. Scope: Plan B (platform categories and shelves) Tasks 1–9, steps 1–4 (docs,
grep gate, rehearsal, regression). **Not yet deployed**: the dev and preprod merges (Task 9 steps
5–6) wait for owner approval, and release 2 (Task 10, legacy drop) runs only after release 1 is
verified on both. Production was not touched.

## Branches

| Repo                | Branch                     | Feature range      |
| ------------------- | -------------------------- | ------------------ |
| supplify_erp        | `feat/platform-categories` | `cc4cdfd2..HEAD`   |
| supplify-mobile     | `feat/platform-categories` | `2aa711d..05b7fd7` |
| supplify-mobile-ios | `feat/platform-categories` | `9700e1c..c1c8b09` |

## Rehearsal (Railway dev copy)

Railway `Development` / `Postgres-dev` dump (`pg_dump -Fc`, PG 18), restored into a local
container `supplify-categories-rehearsal`; full startup pipeline (`node scripts/migrate.js`,
`SUPPLIFY_DATABASE_URL` set and the target checked: 286 products, not the local Docker DB).

| Count                                 | Before     | After                           |
| ------------------------------------- | ---------- | ------------------------------- |
| schema_migrations                     | 240 (0239) | 242 (0241)                      |
| products                              | 286        | 286                             |
| products with legacy category text    | 286        | 286 (kept until release 2)      |
| products with NULL category_id        | 0          | 0                               |
| platform categories                   | 16         | 103 (18 departments, 85 leaves) |
| supplier-owned categories             | 24         | 0                               |
| shelves / product-shelf rows          | 0 / 0      | 24 / 286                        |
| category-level reorder cadences       | 5,083      | 113 active, 4,886 inactive      |
| deal category targets / routing rules | 0 / 0      | 0 / 0                           |

`BackfillStats` (9 suppliers, 8.7 s): shelvesCreated 24, shelvesMerged 0, productsAuto 268,
productsFlagged 18, productsReclassifiedFromBroad 0, targets rewritten/split/extended 0/0/0,
rules rewritten/extended 0/0, cadencesRemapped 5,078, cadencesConverted 0,
cadencesDeactivated 5, verified **true**.

`verifyCategoryBackfill` violations — all **0**: productsNullCategory, productsNonLeafCategory,
productsSupplierOwnedCategory, supplierOwnedCategories, promotionTargetsBadCategory,
routingRulesBadCategory, cadencesBadCategory, productShelfSupplierMismatch,
promotionTargetsNotExactlyOne, productsUnreviewedLossy.

A second start (2.4 s) applied nothing and skipped the verified backfill.

### Products per category (after)

Vegetables 19, Other 18 (all flagged), Fruits 16, Leafy greens & herbs 14, Cheese 13,
Beer, wine & spirits 10, Beef 9, Frozen Foods 9, Cleaning Supplies 8, Shellfish & crustaceans 8,
Yogurt & labneh 8, Dairy 7, Grains & Legumes 7, Meat & Poultry 7, Spices & Seasonings 7,
Legumes & pulses 6, Potatoes & onions 6, Seafood 6, Snacks & Nuts 6, Lamb & mutton 5,
Pickles & olives 5, Eggs 4, Flour & baking 4, Herbs & za'atar 4, and 41 more leaves with 1–3
products each (65 leaves in use).

### Flagged for review (18, filed under Other with `category_needs_review`)

| Supplier                      | Product                                                            | Old category              | Why no automatic match                |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------- | ------------------------------------- |
| Beirut Beverage Distribution  | Black Tea 100 Bags, Herbal Tea Assortment 100 Bags                 | Coffee & Tea              | tie: tea & infusions / bags           |
| Beirut Beverage Distribution  | Cardamom Arabic Coffee 1kg                                         | Coffee & Tea              | tie across departments                |
| Beirut Beverage Distribution  | Lemon-Lime Soda 24x330ml                                           | Water & Soft Drinks       | tie across departments                |
| Cedar Fresh Produce           | Celery, Fennel, Ginger, Leeks, Pears, Pumpkin, Tangerines, Turnips | Roots, Squash & Specialty | the produce names are not aliases yet |
| Coastline Packaging & Hygiene | Aluminium Foil Roll 45cm 3kg, Shawarma Wrap Paper                  | Packaging                 | tie: foil & film / bakery             |
| Levant Dry Goods              | Butter Croissants (pack of 12)                                     | Nuts, Sweets & Bakery     | tie: pastry / butter                  |
| Levant Dry Goods              | Olive Pomace Oil 5L                                                | Oils, Condiments & Canned | tie: olive oil / pickles & olives     |
| Mount Lebanon Meats           | Kibbeh Raw Mix, Lamb Liver                                         | Lamb & Veal               | tie: lamb & mutton / offal            |

Ties are the designed outcome (no automatic pick across departments; the supplier sees the
suggestions). The eight produce names need aliases on Fruits / Vegetables / Leafy greens; an
admin can add them in Admin → Catalog without a migration.

## Performance budgets

Large dataset (60,000 products over 85 leaves), p95 of 50 warm calls, best of 3 — see
[bench-results.md](../../../tests/integrity/marketplace/bench-results.md).

| Query                                                 | Result                            | Budget |
| ----------------------------------------------------- | --------------------------------- | ------ |
| `GET /api/products/categories` (restaurant, uncached) | 44.14 ms (was 841 ms: fixed, JIT) | 50 ms  |
| `GET /api/products?categoryId=<dept>&limit=24`        | 41.85 ms                          | 60 ms  |

## Tests

| Suite                                                                         | Result                                                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                              | 0 errors                                                                                                            |
| `pnpm test:api`                                                               | 2,912 / 2,913: the failure was a unit test pinning the old tree SQL (`COUNT(DISTINCT p.id)`); updated, file 24 / 24 |
| `pnpm test:web` (excl. `sessionIsolation.test.ts`, fails identically at base) | 695 / 695                                                                                                           |
| `pnpm test:marketplace:pg` (real PG)                                          | 136 passed, 9 skipped (benchmarks, opt-in)                                                                          |
| benchmarks (`MARKETPLACE_BENCH=1`)                                            | 9 / 9 within budget                                                                                                 |
| mobile `tsc` + jest (Android, iOS)                                            | clean; 73 suites, 290 / 290 each; `src/` identical                                                                  |
| Playwright critical suites                                                    | not run yet: need this branch on app-dev                                                                            |

## Not yet done

- Dev and preprod deploy, Railway `verified` log lines, smoke tests, Playwright critical suites
  (need this branch on app-dev: the local e2e DB has no Keycloak users), EAS builds.
- Android emulator captures of the new mobile screens (need this branch's API on dev).
- Release 2 (Task 10).
