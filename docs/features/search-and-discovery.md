# Search and Discovery

Full-text product search, unified search API, and per-user search history for catalog discovery.

## Database

Migration: `0158_search_favorites.sql`

- `product.search_vector` — generated `tsvector` from name, name_ar, sku, description, brand, tags
- GIN index `idx_product_search_vector`
- `search_history` — `(user_id, tenant_id, tenant_type, entity_type, query)` with upsert on repeat

## API (`/api/search`)

| Method | Path       | Auth | Description                                                             |
| ------ | ---------- | ---- | ----------------------------------------------------------------------- |
| GET    | `/`        | Yes  | Search products (FTS) and suppliers; `grouped=true` for grouped payload |
| GET    | `/history` | Yes  | Recent searches (`entityType`, `limit`)                                 |
| POST   | `/history` | Yes  | Upsert search entry (`entityType`, `query`)                             |
| DELETE | `/history` | Yes  | Clear history (`entityType`, optional `query`)                          |

## Product list FTS

Search-as-you-type (2026-11-25): `GET /api/search` products and `GET /api/products?q=` match **partial words**.
`lib/search-query.js` turns the text into a sanitised prefix tsquery (`"cherry tom"` → `cherry:* & tom:*`, Unicode letters/digits only, max 6 terms) used with `to_tsquery('simple', …)`, OR'd with a `LOWER(p.name) LIKE '%…%'` substring match (LIKE wildcards escaped), ranked by `ts_rank`.
Without the `search_vector` column, `/api/products` still falls back to name/SKU `LIKE`. Supplier search was already a substring match.

## Visibility (marketplace release 1)

- Suppliers are searchable by every restaurant that has not blocked them.
- Products, prices, deals and category counts follow `catalogVisibleSql`: not blocked and (follows
  or `public_catalog_enabled`). A private-catalog supplier appears to non-followers as a supplier
  card only ("Follow to see the catalog").
- Non-followers see list prices and an in-stock flag, never stock quantities. Results carry
  `is_followed` and `can_order` so clients show **Follow & add**.
- Category and tag counts are cached per viewer under the `catalog:version` key.

Full rules: [marketplace-visibility.md](./marketplace-visibility.md).

## Web

- `useDebouncedSearch` hook (300ms default)
- `SearchHistoryDropdown` on Products and Suppliers pages
- RTK endpoints in `services/api/endpoints/search.ts`

## Mobile parity

Restaurant Suppliers searches supplier names, descriptions, and cities across
the accessible directory. The Following filter uses the restaurant's supplier
relationships.

Supplier Catalog sends product and SKU searches to the existing supplier-scoped
`/api/products` endpoint. The category and in-stock filters can be combined.
Category choices come from loaded products, and the filter sheet can load more
choices. See [mobile feature parity](../mobile/MOBILE_FEATURE_PARITY.md) for the
paired app worktrees.
