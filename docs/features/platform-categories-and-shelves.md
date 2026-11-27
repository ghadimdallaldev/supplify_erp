# Platform categories and supplier shelves

One Supplify-owned HoReCa category tree that every product maps into, and supplier-owned
**shelves** for organising a storefront. Spec:
[2026-11-25 design](../superpowers/specs/2026-11-25-marketplace-categories-and-visibility-design.md)
§5, D1, D2, D11 and the §11 amendment (§11 wins). Plan:
[platform categories and shelves](../superpowers/plans/2026-11-25-platform-categories-and-shelves.md).

The split: **categories are Supplify's** (what a product is, the same for everyone, searchable in
English, Arabic, Lebanese terms and French); **shelves are the supplier's** (how they lay out
their own page: "Morning bakery", "Ramadan specials").

## Category tree

- `product_category` holds platform rows only (`supplier_id IS NULL`) after the backfill.
  - Level 1, **departments**: 18 rows, slug `dept-*` (Fresh produce, Meat & poultry, …,
    Cleaning & hygiene, Other).
  - Level 2, **categories (leaves)**: 85 rows. The 16 original platform categories keep their id,
    name, slug and broad meaning ("Meat & Poultry", "Beverages") as leaves; narrower leaves sit
    beside them. The `other` leaf is the holding place for products that wait for a category.
  - Columns: `name`, `name_ar`, `name_fr`, `slug`, `icon_key` (a kebab-case Phosphor icon name),
    `aliases text[]` (English, Arabic, Lebanese and French terms), `display_order`, `is_active`.
- Migrations: `0240_platform_category_tree_and_shelves.sql` (columns, shelves, triggers),
  `0241_seed_horeca_category_tree.sql` (the tree; an idempotent upsert on slug that never renames
  an existing row).
- **Leaf-only rule.** Products attach to leaves. Triggers check `product.category_id`,
  `promotion_targets.category_id`, `warehouse_routing_rule.category_id` and
  `restaurant_order_cadence.category_id`: NULL passes; a supplier-owned id passes only until the
  backfill is verified. Release 2 makes `product.category_id` NOT NULL.
- Admins edit the tree (names, aliases, icon, order, active) from **Admin → Catalog**; ids and
  slugs of existing rows never change.

## Matcher and suggestions

`apps/api/src/lib/category-matcher.js` is deterministic: it folds case, diacritics, Arabic letter
variants and Lebanese spellings, then scores exact names, slugs and aliases above partial matches.

- `classifyProduct(text, categories)` returns the top suggestions and an `autoCategoryId` only
  when one leaf wins clearly (no tie between leaves of different departments).
- Product import, the backfill and the supplier product form all use it. The fixtures in
  `category-matcher.fixtures.json` pin the expected answers.

## Shelves

- `supplier_shelf` (branch-owned: `supplier_id`, `name`, `name_ar`, `display_order`,
  `archived_at`) and `product_shelf` (`product_id`, `shelf_id`, `supplier_id`). Composite foreign
  keys keep a product and its shelves on the same supplier branch.
- A product can be on several shelves. Archiving hides the shelf from restaurants; its products
  stay in the catalog.
- Archiving a shelf that a live deal or a warehouse routing rule still uses returns
  `409 SHELF_IN_USE` with `details { deals, rules }`, so the supplier can end or change them first.

## Category requests

A supplier who cannot find the right leaf asks for one. The product is filed under **Other**
(`category_needs_review = true`, `category_request_id`) until an admin resolves the request.

- `POST /api/products/category-requests`
  `{ proposedName, proposedNameAr?, proposedParentId? (a department), productIds[] }`. A
  pending request with the same folded name from the same supplier returns
  `409 CATEGORY_REQUEST_EXISTS`; clients treat that as sent.
- Admins **approve** (creates the leaf and moves the products), **merge** (moves the products to an
  existing leaf) or **reject** (products stay under Other, still flagged).
- The supplier gets a `CATEGORY_REQUEST_RESOLVED` notification (`reference_type
CATEGORY_REQUEST`, `metadata.outcome`, `ctaUrl /app/products?needsReview=1`).

## API

| Method             | Path                                                      | Who                | Notes                                                                                                                                                                                                                                                |
| ------------------ | --------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                | `/api/products/categories`                                | everyone signed in | `{ departments: [{ …, categories: [] }] }` with per-viewer `product_count`. Restaurants count catalog-visible products only and never get empty nodes; suppliers get the full tree with their own counts. Cached per viewer under `catalog:version`. |
| GET                | `/api/products/category-suggestions?name=`                | supplier, admin    | `{ suggestions (top 3, score ≥ 0.6), autoCategoryId }`                                                                                                                                                                                               |
| GET                | `/api/products?categoryId=`                               | everyone           | A department id matches all its leaves. Also `shelfId=` and, for suppliers, `needsReview=true`.                                                                                                                                                      |
| POST / PATCH       | `/api/products`, `/api/products/:id`                      | `CATALOG_EDIT`     | `category_id` must be an active leaf (`chooseCategory`, `categoryNotFound`, `categoryNotLeaf`). `shelfIds[]` replaces membership (own, active shelves only). Choosing a category clears `category_needs_review`.                                     |
| GET / POST         | `/api/products/shelves`                                   | supplier           | List (with product counts) / create                                                                                                                                                                                                                  |
| PUT                | `/api/products/shelves/order`                             | supplier           | `{ shelfIds[] }`                                                                                                                                                                                                                                     |
| PATCH / DELETE     | `/api/products/shelves/:id`                               | supplier           | Rename / archive (`409 SHELF_IN_USE`)                                                                                                                                                                                                                |
| PUT                | `/api/products/shelves/:id/products`                      | supplier           | Replace a shelf's products                                                                                                                                                                                                                           |
| GET / POST         | `/api/products/category-requests`                         | supplier           | Own requests / new request                                                                                                                                                                                                                           |
| GET                | `/api/admin/category-requests`                            | admin              | Pending queue                                                                                                                                                                                                                                        |
| POST               | `/api/admin/category-requests/:id/{approve,merge,reject}` | admin              | Resolve                                                                                                                                                                                                                                              |
| POST / PATCH / PUT | `/api/admin/categories`, `/:id`, `/order`                 | admin              | Edit the tree                                                                                                                                                                                                                                        |
| GET                | `/api/search?q=`                                          | everyone           | Adds `categories` (leaves whose name or alias matches, with visible counts)                                                                                                                                                                          |
| GET                | `/api/suppliers/:id`                                      | restaurant         | Adds `shelves` (active, non-empty, in order) and `categories` (leaves), both counting what this restaurant can see                                                                                                                                   |

Catalog errors use `error { name, code, message, details }`; messages are localised from
`Accept-Language` / `x-locale` (`apps/api/src/i18n/locales/*/catalog.json`).

## Where categories and shelves are used

- **Search and discovery:** department rail and category pages; search shows matching categories
  first (see [search-and-discovery.md](./search-and-discovery.md)).
- **Deals:** `applies_to` gains `specific_shelves`; category targets must be leaves (see
  [deals-and-promotions.md](./deals-and-promotions.md)).
- **Warehouse routing:** a `shelf` rule sits between `product` and `category` (see
  [warehouse-fulfillment.md](./warehouse-fulfillment.md)).
- **Imports:** the `category` column is matched to a leaf; an optional `shelf` column creates or
  reuses a shelf (see [supplier-ops.md](./supplier-ops.md)).
- **Reorder cadences, inventory, reports:** read the leaf platform category; spend-by-category
  rows carry `category_id`, `category_name_ar` and the department.

## Backfill (release 1)

`apps/api/src/lib/category-backfill.js`, run at API start from `lib/startup-migrations.js`.

- Locked (`pg_advisory_lock`), resumable per supplier (cursor in `data_migration_run`), and
  verified: a run is `verified` only when `verifyCategoryBackfill` reports 0 for every check
  (products with a NULL, department or supplier-owned category, supplier-owned categories left,
  deal targets / routing rules / cadences on non-leaves, product-shelf supplier mismatches).
- Per supplier it turns each supplier-owned category into a shelf of the same name, classifies its
  products onto leaves (unmatched → Other with `category_needs_review`), and remaps deal targets,
  routing rules and cadences.
- A failure is logged and recorded; the API keeps serving and the backfill resumes on the next
  start. `SKIP_CATEGORY_BACKFILL=1` skips it (see
  [environment-variables.md](../operations/environment-variables.md)).

## Release 2

Removes the legacy free-text `product.category` column and the supplier-owned category path, and
makes `product.category_id` NOT NULL. It refuses to run unless a `verified` backfill record exists.

## Clients

- **Web:** `CategoryBrowse`, `CategoryPage`, `CategoryCombobox`, `CategoryRequestSheet`,
  `ProductShelvesDialog`, `ProductCategoryFixer`, `AdminCatalogTab`; icons in
  `components/marketplace/categoryIcons.ts`.
- **Mobile** (both apps): Home department rail and category sheet, search categories, supplier
  page shelves, supplier category picker with suggestions and requests, Shelves screen,
  needs-a-category banner. See [mobile feature parity](../mobile/MOBILE_FEATURE_PARITY.md).
