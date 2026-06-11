# Supplier Follow

Restaurants **follow** suppliers to curate their marketplace feed, unlock organic deal discovery, and establish an ongoing buyer–seller relationship. Follow status is stored in `supplier_follow` and enforced by plan limits.

**Plan meter:** `suppliers_per_restaurant` — Free **1**, Silver **5**, Gold **30**, Platinum **unlimited** (see [tier-matrix.md](../product/tier-matrix.md)).

## Rules

- One follow row per `(restaurant_id, supplier_id)` (unique constraint).
- Follow requires restaurant role; blocked suppliers are excluded from search but can still be unfollowed if previously followed.
- Unfollow is idempotent (DELETE with no error if not followed).
- **Block** is separate (`supplier_blocklist`) — blocked suppliers are hidden from supplier list/search and cannot receive new follows while blocked.
- Manual supplier orders (`POST /api/orders/manual`) require the restaurant to **follow** the supplier or have placed an order before.

## Downstream effects

Following a supplier affects:

| Area                        | Behavior                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------- |
| **Deals feed**              | Organic deal visibility for followed suppliers (plus explicit restaurant targets)   |
| **New-deals banner**        | Banner includes deals from followed suppliers started in the last 14 days           |
| **Sponsored deals**         | Boost campaigns can surface deals from non-followed suppliers when audience matches |
| **Deal promotions service** | `supplier_follow` join determines organic vs sponsored eligibility                  |
| **Notifications**           | New-deal fan-out queries followers when suppliers publish deals                     |
| **Usage metering**          | Follow count checked against `suppliers_per_restaurant` on POST follow              |

## API (`/api/suppliers`)

| Method | Path          | Auth                       | Description                                                      |
| ------ | ------------- | -------------------------- | ---------------------------------------------------------------- |
| GET    | `/followed`   | Restaurant, `CATALOG_VIEW` | List followed suppliers (newest first)                           |
| POST   | `/:id/follow` | Restaurant                 | Follow supplier; 403 `SUPPLIER_FOLLOW_LIMIT_REACHED` at plan cap |
| DELETE | `/:id/follow` | Restaurant                 | Unfollow supplier                                                |
| POST   | `/:id/block`  | Restaurant                 | Block supplier (optional `reason`)                               |
| DELETE | `/:id/block`  | Restaurant                 | Unblock supplier                                                 |

## Catalog enrichment

`GET /api/suppliers` and `GET /api/suppliers/:id` include `is_followed` (boolean) when the caller is a restaurant tenant.

## Web UI

| Surface              | Behavior                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| `/app/suppliers`     | Follow/unfollow buttons, **Followed** filter, **Followed** sort, followed count stat |
| `/app/suppliers/:id` | Follow toggle on supplier detail header                                              |

RTK mutations: `useFollowSupplierMutation`, `useUnfollowSupplierMutation`.

## Database

Migration: `0015_restaurant_onboarding.sql` — `supplier_follow`, `supplier_blocklist`, index on `restaurant_id`.

## See also

- [deals-and-promotions.md](./deals-and-promotions.md) — organic vs sponsored deal visibility
- [supplier-reviews.md](./supplier-reviews.md) — post-delivery supplier ratings
- [quote-requests.md](./quote-requests.md) — RFQ to multiple suppliers
