# Marketplace categories and supplier ↔ restaurant visibility — design

Date: 2026-11-25 · Status: ready for owner approval (all owner questions resolved)

## 1. Intent

Supplify is a marketplace where restaurants shop from suppliers. Two things are wrong today:

1. **Categories are inconsistent.** Suppliers can create their own categories, so one supplier has "Bread" and another "Breads". Restaurants only ever see the 16 platform categories, so products filed under a supplier-made category, and every product created through the CSV/XLSX import, appear under no category at all.
2. **Visibility leaks.** The owner's rule is: _a restaurant can discover the whole marketplace, but it chooses who it does business with by following. A supplier must not see a restaurant unless that restaurant follows it._ The owner explicitly does not want suppliers to be able to scout restaurants or watch competitors ("I don't want this competitive stuff"). Several features break that rule today (inventory in §6).

## 2. Goals, non-goals, anti-goals

Goals

- One Supplify-owned category tree that every product maps into, searchable in English and Arabic.
- Suppliers keep their own groupings ("shelves") for their storefront only.
- Restaurants can search and view every supplier's products and deals; they order and chat only with suppliers they follow.
- Suppliers see only restaurants that follow them. Past business stays readable (read-only) after an unfollow.

Non-goals

- No change to pricing, the order state machine, receiving, delivery or billing.
- No admin UI beyond what category requests and the tree need (a seeded tree is enough to ship).
- The follow cap per plan (`suppliers_per_restaurant`) stays exactly as it is (owner decision).

Anti-goals (a failure even if it works)

- A supplier can learn that a specific restaurant exists, who it buys from, or how it reviews competitors, without that restaurant following them.
- A restaurant browsing by category misses products because of how a supplier named things.
- Breaking existing orders, invoices or chat history.

## 3. Decisions already made by the owner

| #   | Decision                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Categories: **approach A** — Supplify owns a 2-level tree (department → category); suppliers organise their own page with **shelves**. Every product must have a platform category. |
| D2  | Search aliases (en + ar) per category; product name suggests a category on create/import; suppliers can request a new category, admin approves.                                     |
| D3  | Restaurants can search everything and **open any product detail**; the cart button becomes **"Follow to order"** when they don't follow. Blocked suppliers stay hidden.             |
| D4  | Keep the follow cap per plan as is.                                                                                                                                                 |
| D5  | Chat: only between a restaurant and a supplier it follows. Existing conversations with a non-follower become **read-only**. Blocked = no chat.                                      |
| D6  | After an unfollow, the supplier keeps **read-only** access to past orders, invoices and chat.                                                                                       |
| D7  | **Deals are app-wide**: every (non-blocked) restaurant sees every active deal. No targeting of deals at specific restaurants.                                                       |
| D8  | Reviews show **"Verified restaurant"** instead of the restaurant's name.                                                                                                            |
| D9  | Contract pricing re-checks the relationship on every edit.                                                                                                                          |
| D10 | The blocklist applies everywhere, including the restaurant detail page for past customers.                                                                                          |
| D11 | Deals can target a platform category (that supplier's products in it) **or** one of the supplier's shelves.                                                                         |
| D12 | Customer import (growth): never reveal whether an imported contact is a Supplify restaurant (details §6.2).                                                                         |

## 4. Approaches considered (categories)

- **A — Platform tree + separate shelves (chosen).** `product_category` holds only Supplify's tree; a new `supplier_shelf` table holds supplier groupings. Largest migration, but restaurant browse can never accidentally include a private grouping.
- **B — One table with a `kind` column.** Smallest change, but every query must remember to filter `kind`; forgetting that filter is exactly today's bug (supplier categories silently invisible). Rejected.
- **C — Suppliers type free text, admin maps it to the tree.** Least supplier friction, but mapping work grows with every supplier and unmapped products are missing from browse. Rejected.

## 5. Categories — design

### 5.1 Data model (migration `0238_platform_category_tree_and_shelves.sql`)

`product_category` (platform only after migration)

- Keep `id, name, slug, description, display_order, is_active, parent_category_id`.
- Add `name_ar TEXT`, `aliases TEXT[] NOT NULL DEFAULT '{}'` (lower-cased English and Arabic synonyms), `icon_key TEXT` (mobile/web icon lookup), `level SMALLINT` (1 = department, 2 = category) or derive from `parent_category_id IS NULL`.
- Products attach to **level-2 categories only** (enforced in the API, not a DB trigger).
- Unique `(parent_category_id, lower(name))` and global unique `slug`.
- `supplier_id` column: after data is moved to shelves, rows with a non-null `supplier_id` are deleted and the column dropped in a later migration (keep it one release for rollback safety; all queries already filter `supplier_id IS NULL`).

`supplier_shelf` (new)

- `id, supplier_id → supplier(id) ON DELETE CASCADE, name, name_ar, display_order, is_active, created_at, updated_at`; unique `(supplier_id, lower(name))`.
- Shelves belong to the supplier **organisation's** main supplier row? → builder's call, see §9 (follow how products are scoped today: `product.supplier_id`).

`product_shelf` (new, many-to-many)

- `product_id, shelf_id`, PK both; index on `shelf_id`.

`category_request` (new)

- `id, supplier_id, proposed_name, proposed_name_ar, proposed_parent_id, example_product_id, status (pending|approved|merged|rejected), resolved_category_id, admin_note, created_at, resolved_at`.

`promotion_targets`

- Add nullable `shelf_id → supplier_shelf(id) ON DELETE CASCADE`. A row has exactly one of `product_id`, `category_id`, `shelf_id` (CHECK). `category_id` must reference a platform category.

### 5.2 Seed tree

Departments (level 1) with categories (level 2), en + ar + aliases. Starting point maps the 16 existing categories so existing `category_id`s stay valid (each existing row becomes a level-2 category under a new department). Example:

| Department              | Categories (existing slug kept where it exists)                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fresh produce           | Vegetables (`vegetables`), Fruits, Herbs                                                                   |
| Meat, poultry & seafood | Meat & Poultry (`meat-poultry`), Seafood (`seafood`)                                                       |
| Dairy & eggs            | Dairy (`dairy`), Eggs                                                                                      |
| Bakery                  | Bakery & Bread (`bakery-bread`) → aliases: bread, breads, buns, خبز, معجنات                                |
| Dry goods               | Grains & Legumes, Oils & Fats, Spices & Seasonings, Canned & Preserved, Snacks & Nuts, Condiments & Sauces |
| Frozen                  | Frozen Foods                                                                                               |
| Beverages               | Beverages                                                                                                  |
| Non-food                | Cleaning Supplies, Paper & Disposables                                                                     |
| Other                   | Other (`other`)                                                                                            |

The full list is content work for the builder (§9); the structure above is the contract.

### 5.3 Migrating existing data

1. For every supplier-owned `product_category` row: create a `supplier_shelf` with the same name for that supplier; insert `product_shelf` for each product in it.
2. Suggest a platform category for those products (§5.5 matcher on product name, then the old category name). High-confidence match → set `product.category_id`. Otherwise set it to `other` and set `product.category_needs_review = true` (new boolean column).
3. Products with `category_id IS NULL` but a free-text `product.category`: run the same matcher.
4. Promotions targeting a supplier-owned category: rewrite the target row to `shelf_id` of the shelf created in step 1.
5. Other tables referencing supplier-owned categories (designer's call), migrated **before** any supplier-owned row is deleted, because their FKs cascade:
   - warehouse routing rules (`0081_warehouse_fulfillment.sql`, `warehouseRouting.js`): add `shelf_id`; rewrite each rule to the shelf created in step 1. Routing rules accept a platform category or a shelf.
   - restaurant reorder cadence (`0135_reorder_cadence_and_quick_list_branch.sql`): remap to the platform category matched for that category's products (most common match); drop the row if none.
   - reports (`reports.service.js`, restaurant finance spend by category): group by platform category (department available as a roll-up).
   - builder greps every `REFERENCES product_category` and `category_id` before writing the migration; anything else found follows the same rule (supplier-facing → shelf, restaurant/platform-facing → platform category).
6. Keep `product.category` (free text) read-only for one release; stop writing it; drop later.
7. Bump category cache keys (`catalogCategoriesCacheKey`) so no stale lists survive.

The migration is a SQL file plus a one-off Node script for the matcher (steps 2–3), run by `db:migrate` hooks or documented as a post-deploy step — builder's call (§9). The app is pre-launch with no legacy customers, so a best-effort match with a review flag is acceptable.

### 5.4 API

Restaurant / public

- `GET /api/products/categories` → the tree: departments with their categories, each with `product_count` of products **visible to the caller** (non-blocked suppliers), `name_ar`, `icon_key`. Empty categories hidden for restaurants; full tree for suppliers.
- `GET /api/products?categoryId=` accepts a department id (all its children) or a category id. The `category=` free-text filter is removed after mobile/web stop sending it.
- `GET /api/search` and `GET /api/products?q=`: also match when `q` hits a category name or alias (en/ar) → products in that category; grouped search returns a `categories` group.
- `GET /api/suppliers/:id/catalog` (or the existing catalog route): returns the supplier's shelves with their products for the storefront.

Supplier

- Product create/update: `category_id` **required** (level-2 platform category); optional `shelfIds[]`. Validation error if missing or not level 2.
- `GET /api/products/category-suggestions?name=` → top 3 platform categories with a confidence score (§5.5).
- Shelves CRUD: `GET/POST/PATCH/DELETE /api/products/shelves` (replaces today's supplier `POST/PATCH/DELETE /api/products/categories`, which are removed).
- `POST /api/products/category-requests` → creates a `category_request`; product saves under `other` with `category_needs_review = true` meanwhile.
- Import (`product-import.service.js`): the `category` column is matched to a platform category (exact name/slug/alias first, then the matcher). The import preview shows the matched category per row and lets the supplier fix it; unmatched rows import as `other` + review flag. A new optional `shelf` column assigns a shelf (created if missing).

Admin

- `GET /api/admin/category-requests`, `POST .../:id/approve` (creates the category, optionally under a chosen parent, and moves the example product), `POST .../:id/merge` (maps to an existing category, adds the proposed name as an alias), `POST .../:id/reject`.
- Category tree edit (add/rename/alias/reorder) can be admin API only at first.

### 5.5 Category matcher

Deterministic, no ML: normalise (lower-case, strip accents and Arabic diacritics, singularise trailing `s`/`es`), then score against category name, `name_ar` and `aliases` (exact → 1.0, token match → 0.8, prefix → 0.6). Return the best ≥ 0.6. Lives in `apps/api/src/lib/category-matcher.js` with unit tests (bread/breads/خبز → Bakery & Bread).

### 5.6 Web (supplier)

- `ProductFormDialog`: platform category picker (searchable, department → category) pre-filled from the suggestion endpoint as the supplier types the name; shelves multi-select; "Can't find a category? Request one".
- `ProductCategoriesDialog` becomes "Shelves" management.
- Products list: a "Needs a category" filter and banner when `category_needs_review` products exist.
- Import preview: matched category column, editable.
- Promotions target picker (`DealTargetingPickers`): platform categories (scoped to this supplier's products) and shelves.
- Restaurant web shop / `PublicSupplierCatalogPage`: category browse uses the tree; supplier page groups by shelves.

### 5.7 Mobile (both repos, file-for-file)

- `discovery.ts` `useProductCategories`: consume the tree; drop the free-text fallback; Home category rail shows departments or top categories (builder's call), tapping filters by `categoryId`.
- `CategoryRail` icons from `icon_key` (keep slug map as fallback).
- `HomeSearchScreen`: show the `categories` search group.
- `CatalogScreen` (supplier page): shelves as sections.
- `SupplierProductEditor`: required platform category picker with suggestion, shelves, request-a-category.
- Types: `ProductCategory` gains `name_ar`, `parent_category_id`, `children`, `icon_key`; new `SupplierShelf`.

## 6. Visibility — design

### 6.1 The rule, precisely

- **Relationship** = a `supplier_follow` row matched at **supplier-organisation level**: `COALESCE(followed.organization_id, followed.id) = COALESCE(s.organization_id, s.id)`. One shared SQL helper (`lib/relationship.js`) replaces the four exact-`supplier_id` checks so every path agrees.
- **Past business** = the restaurant has an order containing that supplier organisation's lines.
- **Blocked** = `supplier_blocklist` row (organisation-level match), always wins.

| Capability                                                                          | Needs                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Restaurant searches / views suppliers, products, product detail, deals              | not blocked                                                  |
| Restaurant places an order                                                          | follow (see open question Q1 for the past-order exception)   |
| Start or send in a chat (either side)                                               | follow, not blocked                                          |
| Read an existing chat                                                               | participant (read-only when no follow)                       |
| Supplier sees a restaurant in its customer list / detail page                       | follow, not blocked                                          |
| Supplier creates a manual order, contract price, sponsorship offer for a restaurant | follow, not blocked                                          |
| Supplier reads past orders, invoices, deliveries, reports that include a restaurant | past business (order-scoped, read-only), even after unfollow |

### 6.2 Fixes, by finding

1. **Customer import / prospect matching** (`supplier-customer-matching.service.js`, `supplier-growth.routes.js`, `SupplierCustomerGrowthPage.tsx`, mobile `CustomerGrowthScreen.tsx`)
   - Matching still runs server-side, but its result is **never returned** to the supplier: no `matched_restaurant_id`, name, or match field in any response.
   - Remove `LIKE '%name%'` matching entirely; match only on exact normalised email or phone.
   - "Invite" works the same for everyone from the supplier's point of view. Matched → in-app notification to that restaurant: "{Supplier} invited you to follow them", with Follow / Dismiss. Not matched → today's email/SMS invite.
   - Prospect statuses shown to the supplier: `imported`, `invited`, `following` (only once the restaurant follows). Remove `connect` and `rematch` endpoints and the "already on Supplify" error.
   - The existing connection-request accept flow becomes the in-app invite's Follow action; it also checks the blocklist (a blocked supplier's invite is silently dropped).
2. **Chat** (`chat/conversations.js`, `chat.helpers.js`, socket `send_message`)
   - Create conversation: supplier branch and restaurant branch both require follow + not blocked; same 404 for "doesn't exist" and "not allowed".
   - Send message (HTTP and socket): require follow + not blocked; otherwise 403 `CHAT_READ_ONLY`.
   - Conversation list: include `is_read_only`; clients hide the composer and show "Follow {supplier} to message" (restaurant) / "This restaurant no longer follows you" (supplier).
   - The supplier "new conversation" picker lists followers only (it uses the customer list, fixed in item 6).
3. **Sponsorships** (`supplier-sponsorship.service.js`, routes `:251-307`)
   - A sponsorship pays one specific restaurant's plan, so it cannot be app-wide. Eligibility and create require follow + not blocked.
   - Remove the cross-supplier `already_sponsored` disclosure: report only "not eligible" without the reason when another supplier holds the sponsorship.
4. **Deals** (`promotions/supplier.js`, `promotions.helpers.js`, `deal-promotions.service.js`)
   - Remove `restaurantIds` from the schema; stop writing `promotion_restaurant_targets`; delete existing rows in the migration and drop the table in a later one.
   - Restaurant deal list and detail: every active, paid deal from a non-blocked supplier — remove the "follows or targeted or boosted" condition. Area/business-type audience filters stay (they never reveal a restaurant to the supplier). Boosts now only affect ranking and the audience filter.
   - Deal detail for a non-follower shows "Follow to order".
   - Supplier analytics stay aggregate; per-restaurant redemption names only for restaurants that follow (otherwise "Verified restaurant").
5. **Reviews** (`reviews.service.js`, `reviews.routes.js`, `suppliers.helpers.js`, `profile.js`)
   - Public and supplier responses return `reviewer_label: "Verified restaurant"` and no restaurant id/name. The reviewing restaurant still sees its own review as its own.
6. **Customer list and detail** (`restaurants.routes.js:98-148`, `:603-622`)
   - List: followers only, not blocked. Detail: follower, not blocked; else 404.
   - Past customers who unfollowed are not listed; their name still appears on the supplier's own historical orders/invoices (order-scoped, read-only).
7. **Manual orders** (`orders/create.js:902-957`) — run the follow + blocklist check **first**, before any restaurant or branch lookup; any failure returns the same 404 `RESTAURANT_NOT_AVAILABLE`, so the endpoint can't be used to probe whether a restaurant or branch exists.
8. **Contract pricing** (`restaurant-pricing.routes.js`) — create, bulk create and PATCH all check follow + not blocked first; same 404 for not-found and not-allowed. Listing hides contracts for non-followers (kept in DB, reactivated if they follow again).
9. **Boosted deals, public restaurant pages, consumer menus, quote requests (restaurant-initiated)** — unchanged; they don't let a supplier pick out a restaurant without that restaurant acting.

### 6.3 What happens on unfollow (after this change)

- Supplier: restaurant leaves the customer list; chat becomes read-only; no new manual orders, contracts or sponsorship offers; past orders, invoices, deliveries and reports remain readable.
- Restaurant: chat read-only; ordering per Q1; deals and catalog still visible.
- Nothing is deleted; following again restores everything.
- **Open orders finish normally** (designer's call): an order placed while following keeps its full lifecycle after an unfollow — the supplier can still confirm, fulfil, deliver, invoice and handle disputes/credit notes, and order-linked chat messages (`chat_message.order_id`) stay writable for both sides until the order is closed (delivered + received, or cancelled). "Read-only" applies to closed orders and to general chat. Order state transitions therefore check order ownership, never the follow.

### 6.4 Blocking vs past records (designer's call)

A block is stronger than an unfollow: the supplier loses the restaurant from every list, detail page, chat (including order chat), manual order, contract and sponsorship, and the restaurant no longer sees that supplier anywhere. **Financial records stay**: the supplier keeps read-only access to its own past orders, invoices, credit notes and payments with that restaurant (accounting and legal need), shown with the restaurant name as on the invoice. Open orders at the moment of blocking stay fulfillable but order chat closes. `lib/relationship.js` exposes separate predicates: `canTransact` (follow ∧ ¬blocked), `canSeeRestaurant` (follow ∧ ¬blocked), `canReadOrderRecord` (order participant, regardless of follow/block).

### 6.5 Quote requests (designer's call)

A quote request is restaurant-initiated, so a supplier may read it and reply inside the quote thread even without a follow. Turning a quote into an order requires a follow ("Follow to order"). The quote does not grant the supplier the restaurant's customer-detail page or general chat.

## 7. Docs and parity (required by CLAUDE.md)

- `docs/mobile/MOBILE_FEATURE_PARITY.md` dated entry; both mobile repos updated (categories tree, product editor, chat read-only, growth screen, deal detail "Follow to order").
- `docs/features/search-and-discovery.md` (tree, aliases), supplier ops / deals docs, a new `docs/features/marketplace-visibility.md` with the §6.1 table.
- Onboarding counts (migrations, routes) updated.

## 8. Testing

- API unit/route tests: matcher; categories tree endpoint; product create without category → 400; import category matching; shelves CRUD; promotion shelf targeting; every §6.2 fix including "same 404" probes and blocked cases; chat read-only over HTTP and socket.
- Web: product form category picker; shelves dialog; import preview.
- Mobile: tsc + jest both repos; tests for read-only chat composer and "Follow to order".
- Migration rehearsal on a copy of the dev database: counts of shelves created, products matched vs flagged.

## 9. Left to the builder

- Final seed content of the tree (names, Arabic, aliases, icon keys) beyond the §5.2 structure.
- Whether shelves hang off the supplier branch row or the organisation (follow how `product.supplier_id` scopes products).
- How the matcher script runs during deploy (migration hook vs documented post-deploy step).
- Whether the mobile Home rail shows departments or the busiest categories.
- Ship order: suggested (1) visibility fixes, (2) category tree + shelves + migration, (3) clients, (4) drop legacy columns/tables one release later.

## 10. Resolved questions

- **Q2. What non-followers see (owner, 2026-11-25).** Every non-blocked restaurant sees list prices (including tiered list prices) and an in-stock / out-of-stock flag, never stock quantities. Restaurant-specific contract prices are returned only to that restaurant. A supplier with `public_catalog_enabled = false` is visible to non-followers as a supplier card only ("Follow to see the catalog"): its products, prices and deals are excluded from their search, category browse, product detail and deal lists. Followers always see the full catalog. Applies to `/api/products`, `/api/search`, product detail, deal list/detail, category product counts, and image download auth (`object-download-auth.js`).

- **Q1. Ordering after an unfollow (owner, 2026-11-25): follow is required for every new order.** The earlier "a past order also lets you order" exception is removed from `orders/create.js` (restaurant order path) and from product-detail access (`lib/product-supplier-access.js`, which becomes not-blocked only per D3). Reorder from order history, Quick Lists and favourites for a supplier the restaurant no longer follows shows "Follow to reorder" and does not add to the cart. Applies to recurring/scheduled orders too: a scheduled order for an unfollowed supplier is skipped and the restaurant is notified (builder confirms where scheduled orders are created).
