# Platform Categories and Shelves Implementation Plan (revision 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supplify owns one comprehensive HoReCa category tree that every product maps into, searchable in English, Arabic, Lebanese terms and French. Suppliers organise their storefront with shelves. Existing supplier categories, imports, deals, warehouse rules, reorder cadences and reports move onto the new model. No business record is lost, and the legacy columns are removed afterwards.

**Architecture:**

- **Data model:** `product_category` becomes platform-only (department → category). It gains Arabic names, multilingual aliases and `icon_key`.
- **Shelves:** `supplier_shelf` / `product_shelf` are branch-owned, with ownership enforced by composite foreign keys.
- **Integrity:** leaf-category validity is enforced by triggers.
- **Matcher:** a deterministic matcher (`lib/category-matcher.js`) suggests and auto-classifies.
- **Backfill:** a locked, resumable, verified startup backfill (`lib/category-backfill.js`) converts the existing data.
- **Legacy removal:** a second release drops the legacy columns, but only after a verified completion record exists.

**Tech Stack:** the same stack as the companion plan: API vitest plus the real-Postgres `tests/integrity/marketplace` harness, web vitest/RTL, mobile jest, and Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-marketplace-categories-and-visibility-design.md` §5, D1, D2, D11, §11.1, §11.5, §11.6 and §11.7. §11 wins.

**Depends on:** `docs/superpowers/plans/2026-11-25-marketplace-visibility.md`. This plan needs its Task 0 harness and fixtures, its Task 1 `catalogVisibleSql`, and its Task 3 `bumpCatalogVersion` and per-viewer category cache keys. Run this plan after that one is merged into the shared feature branch.

## Global Constraints

- **Leaf categories only:** products attach only to level-2 platform categories, and `category_id` is required on every supplier write.
  - A trigger enforces leaf validity in the database on `product.category_id`, `promotion_targets.category_id`, `warehouse_routing_rule.category_id` and `restaurant_order_cadence.category_id`.
  - NULL always passes the trigger.
  - All four triggers allow supplier-owned ids while the backfill is not verified. Otherwise the cadence job (`reorder-cadence.service.js:79-88`, `:165-172`) and existing writes would fail before the backfill runs.
  - `product.category_id` becomes NOT NULL in release 2.
- **Existing 16 categories keep their meaning.** They keep their names, slugs and broad meaning, and become level-2 leaves ("Meat & Poultry", "Beverages"…), while narrower leaves are added beside them.
  - The backfill re-classifies products currently on those 16 ids into a narrower leaf only on an automatic match. Deal targets, routing rules and cadences on those ids keep their broad meaning.
  - Department rows get distinct slugs prefixed `dept-`.
  - The re-parent runs before the new unique indexes are created.
- **Readers during an unverified state.** The startup backfill runs before the server listens (`server.js:138-147`). If it ends `failed`, the API still serves: readers treat any non-leaf or supplier-owned `category_id` as "Other" (one SQL helper, `leafCategorySql`). The run is retried on the next start.
- **Supplier permissions:** platform categories are read-only to suppliers. Suppliers manage shelves only.
- **Shelves:**
  - Shelves belong to the **branch supplier row**, because products do (`UNIQUE(supplier_id, sku)`; no product is shared across branches).
  - Ownership is enforced with composite foreign keys: `product_shelf(product_id, supplier_id) → product(id, supplier_id)`, and `product_shelf(shelf_id, supplier_id) → supplier_shelf(id, supplier_id)`.
  - Shelves never appear in cross-supplier browse or search.
- **Promotion targets:** every row has exactly one of `product_id`, `category_id`, `shelf_id` (`CHECK (num_nonnulls(product_id, category_id, shelf_id) = 1)`).
  - The old `CHECK (product_id IS NOT NULL OR category_id IS NOT NULL)` (`0074:35`) is dropped first.
  - Rows that set both ids are **split into two rows, never deleted**.
  - `promotions.applies_to` gains `specific_shelves` (`0074:17-18`), and `warehouse_routing_rule.rule_type` gains `shelf` (`0081:133-135`).
  - A supplier-wide deal is `applies_to = 'all'` with zero target rows, and switching to `all` clears its targets.
  - A platform-category target applies only to that supplier's own products.
  - A product matched by several targets of one deal is discounted once.
- **No silent deletion:**
  - Shelves are soft-deleted (`archived_at`). References from `promotion_targets`, `warehouse_routing_rule` and `restaurant_order_cadence` use `ON DELETE NO ACTION` (checked at statement end, so cascaded supplier deletes in seeds keep working). The API refuses archiving and deletion while they are in use.
  - Archiving a shelf that an active deal or active routing rule uses returns 409 `SHELF_IN_USE` with `{ deals: [{ id, name }], rules: [{ id, name }] }`.
  - Reorder cadences are remapped or converted to a supplier-level cadence, never deleted.
  - Historical reports keep working.
- **Counts:** products on several shelves count once (`COUNT(DISTINCT product_id)`). Products on no shelf show in the storefront's "All products" section.
- **Matcher:**
  - Normalise:
    - lower-case;
    - strip Latin accents and Arabic diacritics, tatweel and alef/yeh/teh-marbuta variants;
    - strip units and numbers with a Unicode-aware pattern: `/\d+([.,]\d+)?\s*(kg|g|gr|l|lt|ml|cl|pcs|pc|pack|x|كغ|كلغ|غ|غرام|لتر|مل)(?=\s|$)/gu`. Do not use `\b`, which never matches after Arabic letters;
    - strip a leading `ال` from Arabic tokens and the French articles `de`, `du`, `des`, `la`, `le`, `les`, `l'`;
    - singularise a trailing `es`/`s` on English and French tokens.
  - Score:

    | Match                  | Score |
    | ---------------------- | ----- |
    | exact alias or name    | 1.0   |
    | whole-phrase contained | 0.9   |
    | all tokens present     | 0.8   |
    | prefix                 | 0.6   |

  - The longest matching phrase wins over shorter ones ("tomato paste" beats "tomato").
  - Suggestions need ≥ 0.6. Automatic classification needs ≥ 0.85 and a lead of ≥ 0.1 over the runner-up. Otherwise the product gets `other` + `category_needs_review = true`.

- **Taxonomy:** comprehensive HoReCa coverage (Task 1 table). The 16 existing ids keep their ids and slugs.
- **Backfill:**
  - Runs under a session-level `pg_advisory_lock(hashtextextended('category-backfill', 0))`, held on **one dedicated client** checked out from the pool for the whole run (not `query()` from the pool). Per-supplier transactions run on that same client.
  - Records progress in `data_migration_run(name TEXT PRIMARY KEY, status TEXT CHECK IN ('running', 'done', 'verified', 'failed'), cursor JSONB, stats JSONB, started_at, finished_at, verified_at, error TEXT)`.
  - Resumes from `cursor`.
  - Sets `verified` only after the integrity checks pass (Task 3).
  - It runs from `runFullStartupMigrations` after the SQL migrations. Railway sets `RUN_MIGRATIONS_ON_START=true` in every environment; locally, use `pnpm db:migrate`.
- **Release 2 only:** legacy columns and tables are dropped in **Task 10**. The gate evaluates the completion predicate **in SQL** (zero supplier-owned categories, zero non-null `product.category`, zero non-leaf references, and so on), rather than only the run record, so a fresh database (CI, a new environment, the Task 0 harness) passes trivially and does not crash-loop the server. The legacy items are `product.category`, `product_category.supplier_id`, `idx_product_supplier_category`, the `category=` param and the old supplier category endpoints.
- **Caches:** every product write path bumps the catalog version: create, update, bulk import, image import, backfill, request approval or merge.
- **Precedence (§11.1):** there is no backward compatibility with installed mobile builds. Old endpoints are removed once their replacement is verified.
- **Inherited from the companion plan:** the isolation rules (worktrees `C:/w/erp-mv`, `C:/w/smv`, `C:/w/smiv`; never run promote/prune outside a throwaway worktree; never touch another session's uncommitted work), the progress ledger, i18n/RTL, the `supplify-mobile-design` workflow and the CLAUDE.md completion rules.

## Review Focus

1. **Real product names in three languages.** Each of these must match the intended category:
   - Arabic: "خبز عربي", "لبنة", "دبس رمان"
   - French: "Pain baguette", "Crème fraîche"
   - English with pack-size noise: "TOMATOES 5KG"
   - Phrase precedence: "Tomato paste 400g" goes to canned/sauces, not vegetables.

   Test: Task 2, the curated fixture of 150 real product names with expected categories. At least 90% must auto-classify correctly, and none may auto-classify wrongly.

2. **Supplier categories that collide after normalisation** ("Bread", "Breads", "bread "). They must become one shelf holding both product sets. Test: Task 3, "merges colliding supplier categories into one shelf".
3. **The backfill is killed mid-run and restarted, or two API instances start at once.** There must be no duplicate shelves, no product changed twice, and the run must finish verified. Tests: Task 3, real-PG "concurrent startup runs once" and "resume after crash".
4. **A shelf used by an active deal or routing rule is archived.** It must be refused with the list of users, and the deal keeps working. Test: Task 5, "archive in-use shelf is SHELF_IN_USE".
5. **A category request is approved twice concurrently, or approved after rejection.** Exactly one category must be created, no state may change after resolution, and all flagged products must move. Test: Task 5, real-PG "concurrent approvals create one category".

---

### Task 1: Schema, integrity triggers and taxonomy seed

**Files:**

- Create: `apps/api/db/migrations/<next>_platform_category_tree_and_shelves.sql`
- Create: `apps/api/db/migrations/<next+1>_seed_horeca_category_tree.sql`
- Test: `tests/integrity/marketplace/category-schema.pg.test.js`

**Schema:**

- `product_category`: add `name_ar TEXT`, `name_fr TEXT`, `aliases TEXT[] NOT NULL DEFAULT '{}'` and `icon_key TEXT`. Add unique `(COALESCE(parent_category_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) WHERE supplier_id IS NULL` and unique `(slug) WHERE supplier_id IS NULL`. Add a GIN index on `aliases`.
- `product`: add `category_needs_review BOOLEAN NOT NULL DEFAULT false`, `category_request_id UUID` and unique `(id, supplier_id)` (for the composite FKs).
- `supplier_shelf(id, supplier_id REFERENCES supplier ON DELETE CASCADE, name, name_ar, display_order, archived_at, created_at, updated_at)`:
  - unique `(supplier_id, lower(name)) WHERE archived_at IS NULL`;
  - unique `(id, supplier_id)`.
- `product_shelf(product_id, shelf_id, supplier_id)`:
  - PK `(product_id, shelf_id)`;
  - FKs `(product_id, supplier_id) → product(id, supplier_id) ON DELETE CASCADE` and `(shelf_id, supplier_id) → supplier_shelf(id, supplier_id) ON DELETE NO ACTION`.
- `category_request(id, supplier_id, proposed_name, proposed_name_ar, normalized_name, proposed_parent_id, example_product_id, status CHECK IN ('pending', 'approved', 'merged', 'rejected'), resolved_category_id, resolved_by, admin_note, created_at, resolved_at)`:
  - unique `(supplier_id, normalized_name) WHERE status = 'pending'`;
  - FK `(example_product_id, supplier_id) → product(id, supplier_id)`.
- `promotion_targets` and `warehouse_routing_rule`:
  - add `shelf_id` (FK NO ACTION);
  - `promotion_targets.category_id`, `warehouse_routing_rule.category_id` and `restaurant_order_cadence.category_id` change from CASCADE to NO ACTION;
  - drop the `0074:35` check, split any row that has both ids into two rows (record the count), then add `CHECK num_nonnulls(product_id, category_id, shelf_id) = 1`;
  - extend the `promotions.applies_to` check with `specific_shelves`, and the `warehouse_routing_rule.rule_type` check with `shelf`.
- Order inside the single `DO` block: columns, then re-parenting of the 16 existing rows, then the new unique indexes, then the triggers.
- `data_migration_run` table, as in Global Constraints.
- Trigger function `assert_platform_leaf_category(category_id)`.
  - It passes when the value is NULL.
  - It raises unless the row has `supplier_id IS NULL`, `parent_category_id IS NOT NULL` and `is_active`.
  - Exception: while `data_migration_run('category-backfill')` is not `verified`, it also accepts supplier-owned or legacy ids, so existing writes and the cadence job keep working until the backfill finishes.
  - Attach it to all four referencing columns (insert, and update of the column). Release 2 removes the exception.

**Seed (taxonomy):**

- Departments (level 1) are new rows with `dept-` slugs.
  - Their categories (level 2) re-parent the 16 existing rows by slug (`UPDATE ... SET parent_category_id`, id kept). **Their name and broad meaning stay as they are.**
  - The narrower leaves are inserted beside them.
- Every row needs `name`, `name_ar`, `name_fr`, `aliases` (English, Arabic, Lebanese, French; at least 4 per category) and `icon_key` (a Phosphor icon name).

| Department (`icon_key`)                        | Categories (existing slugs in bold)                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh produce (`carrot`)                       | **vegetables**, fruits, leafy greens & herbs, mushrooms, potatoes & onions, fresh-cut & prepped                                                     |
| Meat & poultry (`cow`)                         | **meat-poultry** (kept as the broad leaf), beef, lamb & mutton, veal, processed & deli meats, offal                                                 |
| Seafood (`fish`)                               | **seafood** (kept as the broad leaf), shellfish & crustaceans, frozen seafood, smoked & cured fish                                                  |
| Dairy, eggs & cheese (`cheese`)                | **dairy** (kept as the broad leaf), cheese, yogurt & labneh, butter & ghee, eggs                                                                    |
| Bakery & pastry (`bread`)                      | **bakery-bread** (kept as the broad leaf), Arabic & flatbread (kaak, markouk, pita), pastry & viennoiserie, cakes & desserts, dough & frozen bakery |
| Pantry & dry goods (`grains`)                  | **grains-legumes** (kept as the broad leaf), legumes & pulses, pasta & noodles, flour & baking, sugar & sweeteners, breakfast & cereals             |
| Oils, fats & vinegar (`drop`)                  | **oils-fats** (kept as the broad leaf), olive oil, vinegar, frying fats & shortening                                                                |
| Spices & seasonings (`pepper`)                 | **spices-seasonings** (kept as the broad leaf), herbs & za'atar, salt & pepper, stocks & bouillon                                                   |
| Sauces & condiments (`jar`)                    | **condiments-sauces** (kept as the broad leaf), dressings & mayonnaise, tahini & pastes, molasses & syrups (debs)                                   |
| Canned & preserved (`package`)                 | **canned-preserved** (kept as the broad leaf), canned fish & meat, pickles & olives, tomato products, jams & preserves                              |
| Frozen (`snowflake`)                           | **frozen-foods** (kept as the broad leaf), frozen meat & poultry, frozen ready meals, ice cream                                                     |
| Snacks, nuts & sweets (`cookie`)               | **snacks-nuts** (kept as the broad leaf), dried fruit, chips & snacks, chocolate & confectionery                                                    |
| Beverages (`coffee`)                           | **beverages** (kept as the broad leaf), water, juices, coffee, tea & infusions, syrups & mixers, beer, wine & spirits, dairy & plant drinks         |
| Cleaning & hygiene (`spray-bottle`)            | **cleaning-supplies** (kept as the broad leaf), dishwashing, hand hygiene, pest control, laundry                                                    |
| Packaging & disposables (`package`)            | **paper-disposables** (kept as the broad leaf), takeaway containers, cups & lids, cutlery & straws, bags, foil & film, gloves & aprons              |
| Kitchen equipment & smallwares (`cooking-pot`) | cookware, utensils & knives, storage & gastronorm, small appliances, tableware & glassware                                                          |
| Uniforms & textiles (`t-shirt`)                | chef wear, linens & towels                                                                                                                          |
| Other (`dots-three`)                           | **other**                                                                                                                                           |

- [ ] **Step 1: Write the failing real-PG tests.**
  - "existing 16 ids survive, now level 2"
  - "every leaf has name_ar, name_fr, ≥4 aliases, icon_key"
  - "product with a department id is rejected by trigger"
  - "product_shelf rejects a shelf of another supplier"
  - "promotion target with two ids rejected"
  - "deleting a shelf referenced by a deal is restricted"
  - "duplicate pending category request rejected"
- [ ] **Step 2: Run** `pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Write both migrations.** Use idempotent statements.
- [ ] **Step 4: Run** the suite (PASS), then apply locally with `pnpm db:migrate` (Docker on 5433) and count the leaves.
- [ ] **Step 5: Commit** `feat(db): HoReCa category tree, shelves, integrity triggers` and update the ledger.

---

### Task 2: Category matcher

**Files:**

- Create: `apps/api/src/lib/category-matcher.js`
- Create: `apps/api/src/lib/category-matcher.fixtures.json` (150 real HoReCa product names, mixed English/Arabic/French/Lebanese, each with an expected slug or `null` for ambiguous)
- Test: `apps/api/src/lib/category-matcher.test.js`

**Interfaces:**

- `normalizeCategoryText(text: string): { normalized: string, tokens: string[] }`
- `scoreCategory(normalizedInput, category): { score: number, matchedPhraseLength: number }`
- `classifyProduct(text: string, categories: Category[]): { suggestions: Array<{ categoryId, score }>, autoCategoryId: string | null }`
  - Leaves only.
  - `suggestions` are scores ≥ 0.6, top 3.
  - `autoCategoryId` is set only when the top score is ≥ 0.85 and leads the runner-up by ≥ 0.1.
  - Ties broken by `matchedPhraseLength`.
- `loadPlatformCategories(db?): Promise<Category[]>`, cached under `platformCategories:<catalogVersion>`.

- [ ] **Step 1: Write the failing tests.**
  - "fixture: ≥ 90% auto-classified correctly, 0 auto-classified wrongly"
  - "tomato paste beats tomato"
  - "ambiguous names suggest but do not auto-classify"
  - "departments never returned"
  - "Arabic variants normalise (أ/إ/آ→ا, ة→ه, ى→ي)"
  - "Arabic units and the article are stripped ('لبنة 2 كغ' → labneh leaf)"
  - "French articles are stripped ('crème de la crème' does not break the cream match)"
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/lib/category-matcher.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Tune aliases in the Task 1 seed until the fixture passes. Alias content lives in the migration; the matcher has no hard-coded words.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): multilingual category matcher with precedence and ambiguity handling` and update the ledger.

---

### Task 3: Locked, resumable, verified backfill

**Files:**

- Create: `apps/api/src/lib/category-backfill.js`
- Modify: `apps/api/src/lib/startup-migrations.js` (call it after the supplier-org backfill, behind `SKIP_CATEGORY_BACKFILL=1`)
- Modify: `scripts/seed-horeca-demo.mjs:578-597,664` (create shelves and platform categories instead of supplier categories), and the text-writing seeds: `db/seed/seed.sql:25`, `seed-business-engineer-demo.js:183,460`, `seed-preprod-supplier-products.mjs:140`, `seed-tier-catalog.js:172`, `prodlike.seed.js:333`, `seed-plan-tier-demos.js:137` (set `category_id`)
- Test: `apps/api/src/lib/category-backfill.test.js` (unit)
- Test: `tests/integrity/marketplace/category-backfill.pg.test.js`

**Interfaces:**

- Consumes: `classifyProduct` and `loadPlatformCategories` (Task 2), `bumpCatalogVersion` (companion plan Task 3).
- Produces:
  - `runCategoryBackfill(db?): Promise<BackfillStats>`
  - `verifyCategoryBackfill(db?): Promise<{ ok: boolean, violations: Record<string, number> }>`
  - `BackfillStats = { suppliers, shelvesCreated, shelvesMerged, productsAuto, productsFlagged, productsReclassifiedFromBroad, targetsRewritten, targetsSplit, rulesRewritten, cadencesRemapped, cadencesConverted, cadencesDeactivated }`

**Order of operations** (one transaction per supplier; advance `cursor` after each commit):

1. Create shelves from the supplier categories, merging names that collide after normalisation. Link products through `product_shelf`.
2. Rewrite `promotion_targets` and `warehouse_routing_rule` rows that point at the supplier category to the new `shelf_id`.
3. Remap `restaurant_order_cadence`:
   - Category level → the most common matched platform category of that category's products. If there is no auto match, convert to `cadence_level = 'supplier'` and clear `category_id`.
   - **Product level** rows → set `category_id` to the product's new category (done after step 4 for those rows).
   - If a remap would collide with the partial unique indexes in `0135:24-31`, keep the row but set `is_active = false`, and count it as `cadencesDeactivated` in the stats. Rows are never deleted.
   - Keep `label`, `confidence_score` and the history.
4. Classify every product of the supplier, **including inactive ones**, whose `category_id` is null, non-leaf or supplier-owned. Use the product name, then the old category name, then the legacy `product.category` text. Auto → set it. Otherwise `other` + `category_needs_review`.
5. Delete the now-unreferenced supplier categories.
6. After all suppliers: run `verifyCategoryBackfill`. If `ok`, set `verified`. Otherwise set `failed` with the violation counts, log at error level, and let the API serve through `leafCategorySql` (non-leaf ids read as "Other"). The next start resumes from `cursor`.

**Verification predicate** (every count must be 0):

- products (any `is_active`) with null `category_id`;
- products with a non-leaf `category_id`;
- products with a supplier-owned `category_id`;
- supplier-owned `product_category` rows;
- `promotion_targets` / `warehouse_routing_rule` / `restaurant_order_cadence` rows pointing at a non-leaf or supplier-owned category;
- `product_shelf` rows whose supplier differs from the product's;
- `promotion_targets` rows violating exactly-one;
- products whose legacy `category` text is not null and whose `category_needs_review` is false while `category_id` = `other` (unreviewed lossy cases).

- [ ] **Step 1: Write the failing tests.**
  - Real-PG:
    - "cadence job keeps inserting with supplier-owned ids before the backfill (trigger allowance)"
    - "product-level cadence rows follow their product's new category; unique conflicts deactivate, never delete"
    - "products on the 16 broad categories move to a narrower leaf only on an auto match"
    - "promotion target with both ids is split into two rows"
    - "merges colliding supplier categories into one shelf"
    - "rewrites deal and routing targets before deleting the category; deal still discounts the same products"
    - "cadence remapped or converted, row count unchanged"
    - "inactive and legacy-text products classified"
    - "concurrent startup runs once" (two `runCategoryBackfill` calls in parallel: one waits, no duplicates)
    - "resume after crash" (inject a throw after the second supplier; rerun finishes with identical final state)
    - "second run is a no-op"
    - "verify fails and records violations when a bad row is injected"
  - Unit: the seeds produce leaf categories.
- [ ] **Step 2: Run** `pnpm test:marketplace:pg && pnpm --filter @supplify/api exec vitest run src/lib/category-backfill.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): locked, resumable, verified category backfill` and update the ledger.

---

### Task 4: Category tree, suggestions and search API

**Files:**

- Modify: `apps/api/src/routes/products.routes.js`
  - `:46` list columns: add `category_id`, `category_name`, `category_name_ar`, `department_id`.
  - `:237-277` `GET /categories`.
  - `:548-558` filter.
- Modify: `apps/api/src/routes/search.routes.js:87`
- Modify: `apps/api/src/services/public-supplier-catalog.service.js:217-320` and `apps/api/src/routes/public.routes.js:304`
- Modify: `apps/api/src/services/public-sales.service.js:635,705`
- Modify: `apps/api/src/routes/orders.calendar.routes.js:51,237,289-296,465`
- Modify: `apps/api/src/routes/restaurant-finance.routes.js:893-903` and `apps/api/src/services/reports.service.js:222-235`. Group by platform category with a department roll-up. Historical orders use the product's current platform category, and orders whose product was deleted are grouped as "Uncategorized".
- Modify: `apps/api/src/routes/restaurant-inventory.routes.js:143-280,1323` and `apps/api/src/services/inventory-expiry.service.js:53-71` (platform category only)
- Test: `apps/api/src/routes/products.categories.test.js`
- Test: `tests/integrity/marketplace/category-api.pg.test.js`

**Interfaces:**

- Consumes: `catalogVisibleSql` and the per-viewer cache key (companion plan, Tasks 1 and 3), plus `classifyProduct` (Task 2).
- Produces:
  - `GET /api/products/categories` → `{ departments: [{ id, slug, name, name_ar, name_fr, icon_key, product_count, categories: [{ id, slug, name, name_ar, name_fr, icon_key, product_count }] }] }`.
    - For restaurants, counts are `COUNT(DISTINCT p.id)` over catalog-visible suppliers, and empty nodes are omitted.
    - Suppliers get the full tree with their own counts.
  - `GET /api/products?categoryId=<department or leaf id>`. The `category=` text param is removed.
  - `GET /api/products/category-suggestions?name=` (supplier) → `{ suggestions: [{ categoryId, name, name_ar, departmentName, score }], autoCategoryId }`.
  - `GET /api/search?grouped=true` adds a `categories` group (name, `name_ar`, `name_fr` and alias matches).

- [ ] **Step 1: Write the failing tests.**
  - "tree nests leaves under departments"
  - "restaurant counts are per-viewer and exclude private and blocked suppliers"
  - "department filter includes leaves"
  - "counts distinct products"
  - "search finds category for خبز and pain"
  - "spend report groups by platform category with department"
  - "inventory category filter uses platform category"
- [ ] **Step 2: Run** the unit tests and `pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): category tree, suggestions, category search; readers on platform categories` and update the ledger.

---

### Task 5: Product writes, shelves and category requests

**Files:**

- Modify: `apps/api/src/routes/products.routes.js`
  - Remove the supplier category CRUD at `:290-428`.
  - Product create at `:1256-1293`: `category_id` is required and must be a leaf. Optional `shelfIds`. Stop writing `product.category`.
  - Product update at `:1416-1543`: the same rules.
- Create: `apps/api/src/routes/products/shelves.js`, mounted at `/api/products/shelves`.
- Create: `apps/api/src/routes/products/category-requests.js`, mounted at `/api/products/category-requests`.
- Modify: `apps/api/src/routes/admin.routes.js` (admin category-request endpoints, plus category tree edit: rename, aliases, reorder, add leaf)
- Test: `apps/api/src/routes/products.shelves.test.js`
- Test: `apps/api/src/routes/category-requests.test.js`
- Test: `tests/integrity/marketplace/category-requests.pg.test.js`

**Interfaces:**

- **Product body:** `category_id` (leaf) is required, otherwise 400 `VALIDATION_ERROR` with message key `chooseCategory`. `shelfIds?: string[]` must be the caller branch's own, non-archived shelves. Every write bumps the catalog version.
- **Shelves:**
  - `GET` → `{ shelves: [{ id, name, name_ar, display_order, product_count, archived_at }] }`.
  - `POST`, `PATCH /:id` and `PUT /:id/products { productIds }`.
  - `DELETE /:id` archives the shelf, or returns 409 `SHELF_IN_USE`.
- **Supplier category requests:**
  - `POST { proposedName, proposedNameAr?, proposedParentId?, productIds: string[] }` (the products must be the caller's own).
  - It sets those products to `other` with `category_needs_review` and `category_request_id`.
  - A duplicate pending request returns 409 `CATEGORY_REQUEST_EXISTS` with the existing id.
- **Admin endpoints**, all in one transaction with `SELECT ... FOR UPDATE` on the request, and only from `pending` (otherwise 409 `CATEGORY_REQUEST_RESOLVED`):
  - `GET /api/admin/category-requests?status=`
  - `POST /:id/approve { parentId, name, name_ar, name_fr, aliases, icon_key }`
  - `POST /:id/merge { categoryId }`, which also appends the proposed name to `aliases`
  - `POST /:id/reject { note }`

  Approve and merge move every product with that `category_request_id`, clear the review flag, notify the supplier (`CATEGORY_REQUEST_RESOLVED`, en + ar) and bump the catalog version.

- [ ] **Step 1: Write the failing tests.**
  - "create without category is 400"
  - "department id rejected"
  - "foreign shelf rejected"
  - "archive in-use shelf is SHELF_IN_USE with names"
  - "shelf product_count distinct"
  - "duplicate pending request is 409"
  - "foreign productIds rejected"
  - Real-PG:
    - "concurrent approvals create one category"
    - "approve after reject is 409"
    - "approve moves all flagged products"
  - "old supplier /categories CRUD is 404"
- [ ] **Step 2: Run** the unit tests and `pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same tests plus `src/routes/products.routes.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): required leaf category, shelves, safe category requests` and update the ledger.

---

### Task 6: Import, deals, warehouse routing and reorder cadence on the new model

**Files:**

- Modify: `apps/api/src/services/product-import.service.js:31,315-363` and the preview builder.
- Modify: `apps/api/src/services/product-image-import.service.js` (bump the catalog version).
- Modify:
  - `apps/api/src/routes/promotions/promotions.helpers.js:77,170-186` (`shelfIds`; ownership check for `productIds`, `categoryIds` leaf-only, and `shelfIds`)
  - `apps/api/src/routes/promotions/supplier.js:144,225-231,355-361`
  - `apps/api/src/routes/promotions/restaurant.js:845-848`
  - `apps/api/src/services/deal-promotions.service.js:242-250,350-358,773-838,986-1003`
  - `apps/api/src/services/promotions.service.js:37-49,142`
  - `apps/api/src/routes/orders/create.js:160` and `apps/api/src/services/restaurant-order-create.service.js:188` (deal eligibility per line: product matched via product, category or shelf target, discounted once)
- Modify: `apps/api/src/services/warehouseRouting.js:212-236,337-345,497,522,666,715` and `apps/api/src/routes/warehouses.routes.js:208-284,437-448` (`shelf_id` rules; ownership-checked ids)
- Modify: `apps/api/src/services/reorder-cadence.service.js:41-214` (labels from the platform category name, localised)
- Test: `product-import.service.test.js`, `deal-promotions.service.test.js`, `promotions.service.test.js`, `restaurant-order-create.service.test.js`, `warehouseRouting.test.js`, `warehouses.routes.test.js`, `reorder-cadence.service.test.js`
- Test: `tests/integrity/marketplace/category-consumers.pg.test.js`

**Interfaces:**

- **Import preview rows:** `{ matchedCategoryId, matchedCategoryName, score, needsReview }`. The confirm payload accepts per-row `categoryId`.
- **Import columns:** `category` (matched) and the new `shelf` (aliases `shelf`, `section`; created if missing on the caller branch).
- **Import outcome:** an unknown category imports as `other` with the review flag, and the file is never rejected for it.

- [ ] **Step 1: Write the failing tests.**
  - "import matches category text"
  - "unknown category imports as other with review flag"
  - "shelf column creates and links shelf"
  - "deal by shelf discounts shelf products once even if also matched by category"
  - "deal category target only own products"
  - "foreign shelf/category/product ids rejected in deals and routing"
  - "routing rule by shelf routes"
  - "cadence label localised from platform category"
- [ ] **Step 2: Run** the listed tests and `pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove every remaining reader of `product.category` text, verified by grep in Task 9.
- [ ] **Step 4: Run** the tests, then `pnpm test:api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): import, deals, routing, cadence on platform categories and shelves` and update the ledger.

---

### Task 7: Web: premium category discovery and supplier tools

**Files (`apps/web/src`):**

- **Restaurant side:**
  - Create `components/marketplace/CategoryBrowse.tsx`: department tiles with tinted squircle Phosphor icons and a category rail.
  - Create `pages/CategoryPage.tsx` (route `/shop/category/:slug`): results with filters, skeletons, and an empty state ("No suppliers sell this yet — request a quote").
  - Add a categories group to search results.
  - Add `@phosphor-icons/react` (exact version pinned) and an `icon_key` → component map in `components/marketplace/categoryIcons.ts`.
  - Supplier storefront (`pages/PublicSupplierCatalogPage.tsx:95,278,342`, `pages/SupplierDetailPage.tsx:675`): shelves as sections plus "All products".
  - Readers moved off the text field: `ProductCatalogRow.tsx:114`, `ProductDetailPage.tsx:140`, `inventoryShared.tsx:79-82`, `InventoryTab.tsx:134`, `CalendarView.tsx:110`, `hooks/useOrdersCalendar.ts:37`.
- **Supplier side:**
  - `components/products/ProductFormDialog.tsx:108-115`:
    - a searchable department → category combobox, pre-selected by `autoCategoryId` and showing suggestions (debounce 300 ms);
    - a shelves multi-select;
    - a "Can't find it? Request a category" sheet.
  - Replace `ProductCategoriesDialog.tsx` with `ProductShelvesDialog.tsx`, opened at `ProductsPage.tsx:557`. It covers reorder, archive (with the `SHELF_IN_USE` list) and assigning products.
  - `ProductsPage.tsx`: a "Needs a category" filter and banner.
  - `ProductBulkUploadDialog.tsx`: an editable matched-category column.
  - `DealTargetingPickers.tsx:34`: categories and shelves.
  - Warehouse routing UI: shelf rules.
- **Admin:** a category requests page and a category tree editor, following the existing admin page patterns.
- **Shared:** `services/api/endpoints/products.ts` and `promotions.ts`; `types/products.ts` and `types/admin.ts:298`; i18n en + ar.
- **Tests:** colocated `*.test.tsx`.
- **E2E:** `tests/e2e/suites/critical_e2e/categories.spec.ts`.

- [ ] **Step 1: Write the failing tests.**
  - "category browse renders departments with icons and counts"
  - "category page empty state"
  - "product form requires a category and pre-selects suggestion"
  - "shelves dialog archive in-use shows deals"
  - "import preview override"
  - "deal picker offers shelves"
  - "Arabic RTL category tiles mirror"
  - E2E: "restaurant browses Bakery → Bread across suppliers"; "supplier adds product, accepts suggested category, puts it on a shelf".
- [ ] **Step 2: Run** `pnpm test:web`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm test:web`, then the Playwright suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): category discovery, shelves, category picker and requests` and update the ledger.

---

### Task 8: Mobile: category discovery and supplier editor (Android, mirrored to iOS)

Use the `supplify-mobile-design` workflow. Keep Restaurant Home V4.

**Files (`src/` in `C:/w/smv`, copied to `C:/w/smiv`):**

- `services/api/queries/discovery.ts:22-70` reads the tree. The free-text fallback is removed.
- `features/restaurant/home/HomeSections.tsx:234` (CategoryRail) and `home/visuals.ts:23-67`: icons from `icon_key` through the Phosphor map in `features/restaurant/ui/icons.ts`, with the slug map removed. The rail shows departments that have products. A department tap opens a category sheet.
- `features/restaurant/screens/HomeSearchScreen.tsx:51-59`: a categories group, filtered by `categoryId`.
- `CatalogScreen.tsx:93-113,460`: shelves as sections plus "All products", and the platform category filter.
- `features/publicShop/BrowseScreens.tsx:162`.
- `RestaurantDashboardScreen.tsx:167,383,446`.
- `services/api/queries/inventory.ts:50-56`.
- `features/supplier/screens/SupplierProductEditor.tsx:39-77,165,199`:
  - a required, searchable category picker with suggestion;
  - shelves;
  - request a category.
- `services/api/queries/supplier.ts:42-91`: shelves queries replace category CRUD.
- New `features/supplier/screens/ShelvesScreen.tsx`.
- `types/supplify.ts:142-143` and `types/promotions.ts:45`.
- `i18n/en.json` and `ar.json`.
- Tests: `features/**/__tests__/`.

- [ ] **Step 1: Write the failing tests.**
  - "CategoryRail renders departments from the tree with icons"
  - "HomeSearch shows categories for خبز"
  - "SupplierProductEditor blocks save without category and pre-selects suggestion"
  - "Catalog groups by shelf with All products"
  - "Shelves archive in-use shows deals"
- [ ] **Step 2: Run** `npx jest` in `C:/w/smv`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx tsc --noEmit && npx jest` in Android. Then mirror the files to iOS and run the same there. Expected: PASS.
- [ ] **Step 5: Build and capture.** Build the Android app locally and on the emulator, then capture the design set into `design-audit/mobile/categories/`:
  - 390×844
  - scrolled
  - Arabic
  - 360×800
  - 1.3× font

  Fix any defects found.

- [ ] **Step 6: Commit** `feat(mobile): category discovery, shelves, category picker` in each repo and update the ledger.

---

### Task 9: Docs, rehearsal and release 1 (dev → preprod)

- [ ] **Step 1: Write the docs.**
  - `docs/features/search-and-discovery.md`
  - `deals-and-promotions.md`
  - `bulk-product-image-import.md` and the import docs
  - `warehouse-fulfillment.md`
  - `supplier-ops.md`
  - `docs/operations/environment-variables.md` (`SKIP_CATEGORY_BACKFILL`)
  - `docs/mobile/MOBILE_FEATURE_PARITY.md` (a dated entry; leave foreign uncommitted entries intact)
  - `MOBILE_PARITY_CHECKLIST.md`
  - `docs/onboarding/*` (migration counts)
- [ ] **Step 2: Grep gate.**
  - Run `grep -rnE "\b[a-z_]+\.category\b|product\.category\b|[?&]category=|supplier_id IS NULL OR|'category'" apps/api/src apps/api/scripts apps/web/src C:/w/smv/src`.
  - Review every hit by hand: aliases other than `p.` exist, for example `admin-dashboard/tenants.js:187`.
  - Expected: none refer to the free-text product column, outside the release-2 migration and its tests.
  - Also update the product insert at `apps/api/src/routes/e2e.routes.js:218` to set a leaf `category_id`.
- [ ] **Step 3: Rehearsal.**
  - Run the migrations and the backfill on a fresh local copy of the dev database (as in the companion plan, Task 15).
  - Record in the ledger:
    - `BackfillStats`;
    - the `verifyCategoryBackfill` violation counts (must be all 0);
    - per-category product counts;
    - the flagged products for review.
  - Benchmark `GET /categories` (restaurant, budget ≤ 50 ms p95) and the category page product list (≤ 60 ms).
- [ ] **Step 4: Regression.** Run `pnpm typecheck && pnpm test:api && pnpm test:web && pnpm test:marketplace:pg`, plus tsc and jest in both mobile worktrees. Run the Playwright critical suites. Expected: all PASS.
- [ ] **Step 5: Deploy to dev.**
  - Merge into `dev` in all three repos and push.
  - Confirm in the Railway logs that the backfill reached `verified`, with the stats matching the rehearsal.
  - Smoke-test on dev.
  - Build the Android EAS `demo` profile and the iOS EAS `ios-simulator` profile.
- [ ] **Step 6: Deploy to preprod** with the throwaway-worktree release procedure. Confirm `verified` there, and add the evidence to the ledger.
- [ ] **Step 7: Commit** the docs and ledger.

---

### Task 10: Release 2: remove legacy (after release 1 is verified on dev and preprod)

**Files:**

- Create: `apps/api/db/migrations/<next>_drop_legacy_category_columns.sql`.
  - A `DO` block first evaluates the completion predicate in SQL, and raises if it finds any of: supplier-owned `product_category` rows, non-leaf or NULL `product.category_id`, non-leaf references in the three referencing tables, or `promotion_restaurant_targets` rows (unless the ledger-recorded owner acknowledgement is passed in as the `supplify.ack_restaurant_targets` GUC).
  - A fresh database passes.
  - Then it drops `idx_product_supplier_category`, `product.category`, `product_category.supplier_id` and `promotion_restaurant_targets`, sets `product.category_id NOT NULL`, and removes the trigger's pre-backfill exception.
- Run together with companion Plan Task 16 (drop `supplier_id` from the relationship tables).
- Remove: `apps/api/src/lib/category-backfill.js` (keep `verifyCategoryBackfill` as `apps/api/src/lib/category-integrity.js`, used by an admin health check) and its startup hook. Also remove `SKIP_CATEGORY_BACKFILL` and every leftover compatibility branch.
- Test: `tests/integrity/marketplace/legacy-drop.pg.test.js`

- [ ] **Step 1: Write the failing tests.**
  - "drop migration raises when a supplier-owned category remains"
  - "drop migration passes on a fresh database"
  - "drop migration raises when promotion_restaurant_targets has rows and no acknowledgement"
  - "drop migration succeeds after verified backfill"
  - "category integrity health check reports 0 violations"
- [ ] **Step 2: Run** `pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full regression from Task 9, Step 4. Expected: PASS.
- [ ] **Step 5: Deploy.** Deploy to dev, then preprod. Confirm the drop migration applied, and update the evidence package.
- [ ] **Step 6: Stop.** Report the evidence to the owner. Production promotion only with owner approval.
