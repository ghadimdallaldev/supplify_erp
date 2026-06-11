# Product Favorites

Restaurants can favorite products for quick access from the catalog.

## Database

Migration: `0158_search_favorites.sql` — `product_favorite (restaurant_id, product_id, user_id, created_at)` with composite primary key.

## API (`/api/products/favorites`)

| Method | Path             | Auth       | Description              |
| ------ | ---------------- | ---------- | ------------------------ |
| GET    | `/favorites`     | Restaurant | List favorited products  |
| POST   | `/favorites`     | Restaurant | Favorite `{ productId }` |
| DELETE | `/favorites/:id` | Restaurant | Remove favorite          |

## Product list

- `GET /api/products?favoritesOnly=true` — filter to current user's favorites (restaurant context)
- List rows include `is_favorited` for restaurant users

## Web

- Heart toggle on `ProductCatalogTable` (restaurant view)
- **Favorites** filter button on `ProductsPage`
- RTK: `useGetProductFavoritesQuery`, `useFavoriteProductMutation`, `useUnfavoriteProductMutation`

## Mobile parity

Not yet implemented on mobile.
