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

`GET /api/products?q=` uses `search_vector @@ plainto_tsquery` when the column exists (falls back to name `LIKE`).

## Web

- `useDebouncedSearch` hook (300ms default)
- `SearchHistoryDropdown` on Products and Suppliers pages
- RTK endpoints in `services/api/endpoints/search.ts`

## Mobile parity

Not yet implemented on mobile — document in `docs/mobile/MOBILE_FEATURE_PARITY.md` when scoped.
