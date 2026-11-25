# Platform Categories and Shelves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supplify owns one two-level category tree that every product maps into (searchable in English and Arabic); suppliers organise their storefront with shelves; existing supplier-made categories, imports, deals, warehouse rules and reports move onto the new model.

**Architecture:** `product_category` becomes platform-only (department → category) with Arabic names, aliases and icon keys. New `supplier_shelf` / `product_shelf` hold supplier groupings, and `category_request` holds supplier requests. A deterministic matcher (`lib/category-matcher.js`) suggests categories on create and import, and drives a one-time, idempotent startup backfill (`lib/category-backfill.js`) that turns supplier categories into shelves.

**Tech Stack:** Node/Express + PostgreSQL (vitest), React/Vite (vitest + RTL), Expo/React Native (jest), both mobile repos file-for-file.

**Spec:** `docs/superpowers/specs/2026-11-25-marketplace-categories-and-visibility-design.md` §5 (decisions D1, D2, D11). It ships **after** `docs/superpowers/plans/2026-11-25-marketplace-visibility.md`, whose `lib/relationship.js` (`catalogVisibleSql`) the category counts reuse.

## Global Constraints

- Products attach only to level-2 (child) platform categories; `category_id` is required on every product create and update from the supplier.
- Platform categories are read-only to suppliers; suppliers manage shelves only.
- Shelves never appear in cross-supplier browse or search; they only group a supplier's own storefront.
- Deals target a platform category (only that supplier's products in it) or one of the supplier's shelves (D11).
- Existing `product_category.id` values of the 16 seeded categories stay valid.
- Matcher thresholds: exact 1.0, token 0.8, prefix 0.6; suggest only when ≥ 0.6. Normalisation: lower-case, strip Latin accents and Arabic diacritics/tatweel, singularise a trailing `es`/`s`.
- Unmatched products get the `other` category and `category_needs_review = true`.
- Migrations: `0239_platform_category_tree_and_shelves.sql` (schema), `0240_seed_platform_category_tree.sql` (content). Do not edit committed migrations.
- The release prune deletes `apps/api/scripts/*` except an allowlist, so the backfill lives in `apps/api/src/lib/` and runs from `runFullStartupMigrations` (`apps/api/src/lib/startup-migrations.js`), like the existing supplier-org backfill.
- Every FK that cascades from `product_category` (`warehouse_routing_rule.category_id`, `restaurant_order_cadence.category_id`, `promotion_targets.category_id`) is migrated **before** any supplier-owned category row is deleted.
- Do not drop `product_category.supplier_id` or `product.category` in this plan; a later release drops them.
- The CLAUDE.md completion rules apply: mobile parity, tsc + jest in both repos, a parity-log entry, `pnpm typecheck`, `pnpm test:api`, `pnpm test:web`.

## Review Focus

1. **Arabic and mixed-language product names** ("خبز عربي", "Pain baguette", "TOMATOES 5KG") must still match the right category. Test in Task 2: `category-matcher.test.js` "matches Arabic, accented and upper-case names with pack-size noise".
2. **A supplier with two categories that normalise to the same name** ("Bread", "Breads") becomes two shelves or a duplicate-name failure. Expect one shelf holding both product sets. Test in Task 3: "merges supplier categories that collide case-insensitively into one shelf".
3. **The backfill runs twice**, on restart or a deploy retry. It must create no duplicate shelves and leave products unchanged. Test in Task 3: "second run is a no-op".
4. **A deal or warehouse rule pointing at a supplier category** must keep working after migration, now pointing at the shelf. Test in Task 3: "rewrites promotion and routing targets to the new shelf before deleting the category".
5. **An import file with an unknown category text** ("Misc stuff") imports the row under Other, flagged for review, without rejecting the file. Test in Task 6: "unknown category imports as other with review flag".

---

### Task 1: Schema migration and tree seed

**Files:**

- Create: `apps/api/db/migrations/0239_platform_category_tree_and_shelves.sql`
- Create: `apps/api/db/migrations/0240_seed_platform_category_tree.sql`
- Test: `apps/api/src/lib/category-schema.migration.test.js` (reads both SQL files and asserts statements; follow any existing `*.migration.test.js` pattern in the repo if present)

**Interfaces:**

- Produces, used by every later task:
  - `product_category` gains `name_ar TEXT`, `aliases TEXT[] NOT NULL DEFAULT '{}'` and `icon_key TEXT`.
  - Unique index on `(COALESCE(parent_category_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(name)) WHERE supplier_id IS NULL`, plus a unique `slug` among platform rows.
  - `product` gains `category_needs_review BOOLEAN NOT NULL DEFAULT false`.
  - `supplier_shelf(id, supplier_id, name, name_ar, display_order, is_active, created_at, updated_at)` with a unique `(supplier_id, lower(name))`.
  - `product_shelf(product_id, shelf_id)`, primary key on both columns.
  - `category_request(id, supplier_id, proposed_name, proposed_name_ar, proposed_parent_id, example_product_id, status CHECK IN ('pending','approved','merged','rejected'), resolved_category_id, admin_note, created_at, resolved_at)`.
  - `promotion_targets.shelf_id` and `warehouse_routing_rule.shelf_id`, both FK to `supplier_shelf ON DELETE CASCADE`.
  - CHECK on `promotion_targets`: at most one of `product_id`, `category_id`, `shelf_id`.
  - Seed: the departments from spec §5.2. Each existing level-1 seeded category is re-parented under its department by `UPDATE ... SET parent_category_id` (the ids are kept). The new categories (Fruits, Herbs, Eggs) get `name_ar`, `aliases` and `icon_key` for every row.

- [ ] **Step 1: Write the failing tests:**
  - "0239 adds aliases, name_ar, icon_key and the shelf tables"
  - "0240 re-parents existing seeded slugs instead of inserting new ones": `vegetables`, `bakery-bread` etc. appear in `UPDATE`, not `INSERT`
  - "bakery-bread aliases include bread, breads and خبز"
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/lib/category-schema.migration.test.js`. Expected: FAIL.
- [ ] **Step 3: Write both migrations.** Use idempotent statements (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- [ ] **Step 4: Run** the test (PASS), then apply locally with `pnpm db:migrate` against the local Docker database (port 5433) and check `SELECT count(*) FROM product_category WHERE supplier_id IS NULL AND parent_category_id IS NULL` returns the department count.
- [ ] **Step 5: Commit** `feat(db): platform category tree, shelves and category requests`.

---

### Task 2: Category matcher

**Files:**

- Create: `apps/api/src/lib/category-matcher.js`
- Test: `apps/api/src/lib/category-matcher.test.js`

**Interfaces:**

- Produces:
  - `normalizeCategoryText(text: string): string`
  - `scoreCategory(text: string, category: { name, name_ar, aliases, slug }): number`, in the range 0–1.
  - `suggestCategories(text: string, categories: Category[], limit = 3): Array<{ categoryId, score }>`. It considers level-2 rows only and keeps scores ≥ 0.6, sorted descending.
  - `loadPlatformCategories(db?): Promise<Category[]>`, cached through `lib/cache.js` under the key `platformCategories:v1`.

- [ ] **Step 1: Write the failing tests:**
  - "bread, breads, Bread Rolls and خبز → bakery-bread"
  - "matches Arabic, accented and upper-case names with pack-size noise": "TOMATOES 5KG" → vegetables; "Crème fraîche" → dairy
  - "no suggestion below 0.6"
  - "never suggests a department": level-1 rows are excluded
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/lib/category-matcher.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Strip units and numbers (`\d+(\.\d+)?\s*(kg|g|l|ml|pcs|pc|x)\b`) before scoring.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): deterministic category matcher`.

---

### Task 3: Startup backfill: supplier categories → shelves

**Files:**

- Create: `apps/api/src/lib/category-backfill.js`
- Modify: `apps/api/src/lib/startup-migrations.js`. Call it after the supplier-org backfill, behind `SKIP_CATEGORY_BACKFILL=1` and an "already complete" check.
- Modify: `apps/api/src/routes/products.routes.js`. Bump `catalogCategoriesCacheKey` to a new version.
- Test: `apps/api/src/lib/category-backfill.test.js`

**Interfaces:**

- Consumes: `suggestCategories` and `loadPlatformCategories` (Task 2).
- Produces:
  - `isCategoryBackfillComplete(db?): Promise<boolean>`. It is true when no active product points at a supplier-owned category and no `promotion_targets` / `warehouse_routing_rule` row does either.
  - `runCategoryBackfill(db?): Promise<{ shelvesCreated, productsMatched, productsFlagged, targetsRewritten, rulesRewritten, cadencesRemapped }>`. It runs in one transaction per supplier.

- [ ] **Step 1: Write the failing tests:**
  - "creates one shelf per supplier category and links its products"
  - "merges supplier categories that collide case-insensitively into one shelf"
  - "sets platform category on high-confidence match, else other + needs_review"
  - "matches products with null category_id from the legacy text field"
  - "rewrites promotion and routing targets to the new shelf before deleting the category"
  - "remaps restaurant_order_cadence to the most common matched platform category, deletes when none"
  - "second run is a no-op"
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/lib/category-backfill.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** in spec §5.3 order:
  1. shelves and links;
  2. product matching;
  3. retarget promotions and routing rules, and remap cadences;
  4. delete the now-unreferenced supplier categories.
- [ ] **Step 4: Run.** Expected: PASS. Then run `pnpm --filter @supplify/api exec vitest run src/lib/startup-migrations` if a test exists.
- [ ] **Step 5: Commit** `feat(api): migrate supplier categories into shelves at startup`.

---

### Task 4: Category tree, suggestions and search API

**Files:**

- Modify: `apps/api/src/routes/products.routes.js:237-277` (`GET /categories`) and the list filter at `:548-558`.
- Modify: `apps/api/src/routes/search.routes.js`.
- Test: `apps/api/src/routes/products.categories.test.js` (new), `apps/api/src/routes/search.routes.test.js`.

**Interfaces:**

- Consumes: `catalogVisibleSql` (visibility plan, Task 1), `suggestCategories` (Task 2).
- Produces:
  - `GET /api/products/categories` returns `{ departments: [{ id, name, name_ar, slug, icon_key, product_count, categories: [{ id, name, name_ar, slug, icon_key, product_count }] }] }`. For restaurants, counts only include visible suppliers' products and empty nodes are omitted. Suppliers get the full tree.
  - `GET /api/products?categoryId=` accepts a department id (it includes the children) or a category id. The free-text `category=` param keeps working only until Task 7 lands; that task removes it.
  - `GET /api/products/category-suggestions?name=` returns `{ suggestions: [{ categoryId, name, name_ar, departmentName, score }] }` and is for suppliers only.
  - `GET /api/search?grouped=true` adds a `categories` group: categories whose name, `name_ar` or alias matches `q`.

- [ ] **Step 1: Write the failing tests:**
  - "tree nests categories under departments"
  - "restaurant counts exclude private-catalog suppliers"
  - "department categoryId includes children"
  - "suggestions endpoint returns top 3"
  - "search returns categories group for خبز"
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/routes/products.categories.test.js src/routes/search.routes.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): category tree, suggestions and category search`.

---

### Task 5: Shelves, required category and category requests (supplier and admin API)

**Files:**

- Modify: `apps/api/src/routes/products.routes.js`:
  - remove the supplier `POST/PATCH/DELETE /categories` at `:304-428`;
  - change product create at `:1256` and update at `:1416`.
- Create: `apps/api/src/routes/products/shelves.js`, mounted in `products.routes.js` at `/shelves`.
- Create: `apps/api/src/routes/products/category-requests.js`, mounted at `/category-requests`.
- Modify: `apps/api/src/routes/admin.routes.js`, adding the admin category-request endpoints.
- Test: `apps/api/src/routes/products.shelves.test.js` and `apps/api/src/routes/category-requests.test.js`.

**Interfaces:**

- Produces:
  - Product body: `category_id` is required and must be a level-2 platform category, otherwise 400 `VALIDATION_ERROR` "Choose a category". `shelfIds?: string[]` must all be the caller's own shelves.
  - Shelves: `GET/POST/PATCH/DELETE /api/products/shelves[/:id]`, with `{ id, name, name_ar, display_order, is_active, product_count }`.
  - Supplier: `POST /api/products/category-requests { proposedName, proposedNameAr?, proposedParentId?, exampleProductId? }`. It returns 201, sets the example product to `other` and sets `category_needs_review = true`.
  - Admin, behind `ADMIN` with the existing admin permission guard:
    - `GET /api/admin/category-requests?status=`
    - `POST /:id/approve { parentId, name, name_ar, aliases }`, which creates the category and moves the example product
    - `POST /:id/merge { categoryId }`, which adds the proposed name to that category's aliases
    - `POST /:id/reject { note }`
- Consumes: `invalidateCatalogMetaCache` (existing). Bust `platformCategories:v1` on approve and merge.

- [ ] **Step 1: Write the failing tests:**
  - "create without category_id is 400"
  - "department id is rejected"
  - "shelfIds of another supplier are rejected"
  - shelves CRUD happy path
  - "duplicate shelf name is 400"
  - category request create, approve, merge and reject
  - "merge adds alias"
  - "old supplier POST /categories is 404"
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/routes/products.shelves.test.js src/routes/category-requests.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `src/routes/products.routes.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): supplier shelves, required category, category requests`.

---

### Task 6: Import, deals, warehouse routing and reports on the new model

**Files:**

- Modify: `apps/api/src/services/product-import.service.js` (`:31` column map, inserts `:315-331`, updates `:346-363`, preview builder).
- Modify:
  - `apps/api/src/routes/promotions/promotions.helpers.js`: add `shelfIds` to the schema and its sync;
  - `apps/api/src/services/deal-promotions.service.js:242-251`, `:350-358`, `:997-1003`;
  - `apps/api/src/services/promotions.service.js:47`, `:142`.
- Modify: `apps/api/src/services/warehouseRouting.js` and `apps/api/src/routes/warehouses.routes.js:441-448` (routing rule may use `shelf_id`).
- Modify: `apps/api/src/services/reports.service.js:229` and `apps/api/src/routes/restaurant-finance.routes.js:893-903` (group by platform category, with a department roll-up field).
- Test: `apps/api/src/services/product-import.service.test.js`, `deal-promotions.service.test.js`, `warehouseRouting.test.js` (create if absent), `reports.service.test.js`.

**Interfaces:**

- Consumes: `suggestCategories` (Task 2) and the shelves tables (Task 1).
- Produces:
  - Each import preview row gains `{ matchedCategoryId, matchedCategoryName, matchScore }`, and the confirm payload accepts per-row `categoryId` overrides.
  - The new import column `shelf` (aliases `shelf`, `section`) creates the shelf if it is missing.
  - The deal body accepts `categoryIds` (platform; it only applies to the supplier's own products) and `shelfIds`.
  - A routing rule matches when `shelf_id` is set and the product is on that shelf.

- [ ] **Step 1: Write the failing tests:**
  - "import matches category text to platform category"
  - "unknown category imports as other with review flag"
  - "import shelf column creates and links shelf"
  - "deal with shelfIds applies to products on that shelf only"
  - "deal with a platform category applies only to that supplier's products"
  - "routing rule by shelf routes the product"
  - "spend report groups by platform category with department"
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/services/product-import.service.test.js src/services/deal-promotions.service.test.js src/services/warehouseRouting.test.js src/services/reports.service.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Stop writing the free-text `product.category` everywhere.
- [ ] **Step 4: Run** the same command, then `pnpm test:api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): import, deals, routing and reports use platform categories and shelves`.

---

### Task 7: Web

**Files (`apps/web/src`):**

- `components/products/ProductFormDialog.tsx`:
  - a searchable department → category picker;
  - pre-fill from `/category-suggestions`, debounced 300 ms, as the name is typed;
  - a shelves multi-select;
  - a "Can't find a category? Request one" dialog.
- `components/products/ProductCategoriesDialog.tsx`: rename it to `ProductShelvesDialog.tsx` and switch it to the shelves API.
- `pages/ProductsPage.tsx` and `components/products/ProductFilters.tsx`: a "Needs a category" filter and banner, and category filtering from the tree.
- Import preview component (find it from `bulk product import` in `pages/ProductsPage.tsx`): an editable matched-category column.
- `components/deals/DealTargetingPickers.tsx`: platform categories plus shelves.
- `pages/PublicSupplierCatalogPage.tsx`: group by shelves; restaurant-side category browse uses the tree.
- Admin: a category-requests page in the admin area (follow the existing admin page pattern).
- `services/api/endpoints/products.ts` and `promotions.ts`, `types/*`.
- i18n en + ar.
- Remove all uses of the free-text `category=` param, then delete it from `productListSchema` in `products.routes.js`.
- Tests: colocated `*.test.tsx`.

- [ ] **Step 1: Write the failing tests:**
  - "product form requires a category"
  - "typing a name pre-selects the suggested category"
  - "shelves dialog creates a shelf"
  - "import preview lets the supplier change the matched category"
  - "deal picker offers shelves"
- [ ] **Step 2: Run** `pnpm test:web`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck`, `pnpm test:web` and `pnpm test:api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): platform category picker, shelves, category requests`.

---

### Task 8: Mobile (Android, then mirror to iOS)

**Files (`C:/myProjects/supplify-mobile/src`, same paths in `supplify-mobile-ios`):**

- `services/api/queries/discovery.ts`: `useProductCategories` reads the tree, and the free-text fallback is removed.
- `features/restaurant/home/CategoryRail.tsx` and `categoryVisuals.ts`: the icon comes from `icon_key`, with the slug map kept as a fallback. Show the departments that have products.
- `features/restaurant/screens/HomeSearchScreen.tsx`:
  - a `categories` search group;
  - a department tap filters by its `categoryId`.
- `features/restaurant/screens/CatalogScreen.tsx`: shelves as sections.
- `features/supplier/screens/SupplierProductEditor.tsx`:
  - a required category picker with suggestion;
  - shelves;
  - request a category.
- `types/supplify.ts`:
  - `ProductCategory` gains `name_ar`, `parent_category_id`, `icon_key` and `categories?`;
  - add `SupplierShelf`, `CategorySuggestion` and `CategoryDepartment`.
- `i18n/en.json` and `ar.json`.
- Tests: `features/**/__tests__`.

- [ ] **Step 1: Write the failing tests:**
  - "CategoryRail renders departments from the tree"
  - "HomeSearch shows matched categories for خبز"
  - "SupplierProductEditor blocks save without a category"
  - "Catalog groups products by shelf"
- [ ] **Step 2: Run** `cd C:/myProjects/supplify-mobile && npx jest`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx tsc --noEmit && npx jest` in Android. Expected: PASS. Then copy the changed files to iOS and run the same there. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): platform categories and supplier shelves` in each mobile repo.

---

### Task 9: Docs

**Files:**

- Modify:
  - `docs/features/search-and-discovery.md` (the tree, aliases, the categories search group);
  - `docs/features/deals-and-promotions.md` (shelf targeting);
  - `docs/features/bulk-product-image-import.md` / the import docs (category matching, the shelf column);
  - `docs/features/warehouse-fulfillment.md` (shelf routing rules);
  - `docs/features/supplier-ops.md` (shelves, category requests);
  - `docs/mobile/MOBILE_FEATURE_PARITY.md` (dated `## 2026-11-25 — Platform categories and shelves` entry);
  - `docs/mobile/MOBILE_PARITY_CHECKLIST.md`;
  - `docs/onboarding/*` (migration count +2, new routes);
  - `docs/operations/environment-variables.md` (`SKIP_CATEGORY_BACKFILL`).

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Run `pnpm test:api` and `pnpm test:web`. Expected: PASS.
- [ ] **Step 3: Commit** `docs: platform categories and shelves`.

---

### Follow-up release (not in this plan)

Drop `product_category.supplier_id`, `product.category`, `promotion_restaurant_targets` and the `category=` compatibility code after one release in production.
