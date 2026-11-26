# Supplier Follow

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

Restaurants **follow** suppliers to curate their marketplace feed, unlock organic deal discovery, and establish an ongoing buyer–seller relationship. Follow status is stored in `supplier_follow` and enforced by plan limits.

**Plan meter:** `suppliers_per_restaurant` — Free **1**, Silver **5**, Gold **30**, Platinum **unlimited** (see [tier-matrix.md](../archive/product/tier-matrix.md)).

## Rules

- One follow row per `(restaurant_id, supplier_org_id)`: a follow or block covers every branch of the supplier organisation (marketplace visibility release 1, migration `0238`).
- Follow is idempotent (200 with `alreadyFollowing: true`). Following a blocked supplier returns 409 `SUPPLIER_BLOCKED` until the restaurant unblocks it. Manual follow, accepting a supplier invite and referral signup all enforce the plan cap in one transaction.
- Unfollow is idempotent (DELETE with no error if not followed).
- **Block** (`supplier_blocklist`, also per organisation) deletes the follow; blocked suppliers are hidden from supplier list/search.
- **Every new restaurant order needs a current follow and no block.** `POST /api/orders` and placing a draft (`PATCH /api/orders/:id` to `PLACED`) return 403 `FOLLOW_REQUIRED` with `details.suppliers[{ id, name }]`. A past order no longer grants ordering. The check runs inside the order transaction under a shared `rel:<restaurant>:<org>` advisory lock (ascending org id), so it is serialised with follow/unfollow/block.
- **Scheduled quick lists** skip suppliers the restaurant no longer follows (or has blocked); the other suppliers in the same run still get their orders, and the restaurant gets a `SCHEDULED_ORDER_SKIPPED_UNFOLLOWED` notification per skipped supplier (`{ quickListId, supplierId, supplierName }`).
- **Dispute replacement orders** need no follow (they remedy an existing order) but are refused with 409 `SUPPLIER_BLOCKED` when the restaurant has blocked the supplier.
- **Catalog visibility.** A restaurant sees a supplier's products, list prices (incl. tiers), deals and product images when the organisation is not blocked AND (it follows OR `public_catalog_enabled`). Product rows carry `is_followed` and `in_stock`; only followers get `available_qty` and `/api/inventory/product/:id`. Contract prices are only ever the caller's own. A private-catalog supplier appears to non-followers as a supplier card only. Deals: the old "follows or targeted or boosted" condition is gone; boosts only rank and filter the audience, and restaurant-targeted deals still go to their targets only.
- **Chat.** A restaurant can start a conversation, or message from a deal, only while it follows the supplier (403 `FOLLOW_REQUIRED`).
  - Suppliers cannot start a conversation with a restaurant that does not follow them, or that blocked them. Both get 404 `RESTAURANT_NOT_AVAILABLE`, the same answer as an unknown restaurant.
  - In an existing conversation, a general message needs a follow. A message tagged with `orderId` stays sendable while that order is open between the two parties (statuses in `OPEN_ORDER_STATUSES`). Otherwise the conversation is read-only: 403 `CHAT_READ_ONLY` with `details.openOrderIds`.
  - A block closes the conversation. The supplier can no longer open it, its messages or its attachments (404), and it is dropped from the supplier's list. The restaurant keeps read-only history (`is_closed_by_block`).
  - Every send path (REST, socket, deal chat, order fulfilment issues) checks under the shared relationship lock in the insert's transaction. A refused send reserves no daily chat slot and sends no notification.
  - A relationship change removes the supplier branch's sockets from the affected conversation rooms and emits `conversation_access_changed { conversationId }` to both tenants.
  - Attachments are served only via `GET /api/chat/attachments/:id`, which re-checks access and redirects to a 5-minute signed object URL.
- **Supplier intelligence and reports** (at-risk, cadence, cross-sell, loyalty balances and ledger, reminder drafts, top restaurants) name followers only.
  - Others appear as `Other customers` in aggregates.
  - Accounting CSV exports stay order-scoped: the supplier's own invoices and payments, including those of restaurants that later unfollowed or blocked.
  - The Assistant's `get_followed_suppliers` lists followed organisations. Reorder suggestions exclude blocked suppliers and label non-followed ones. See `ai-smart-reorder.md`.
- **Supplier side: followers only.** The customer list (`GET /api/restaurants`) shows only restaurants that follow the supplier's organisation and have not blocked it. Past customers who unfollowed drop off the list; their names stay on the supplier's own orders and invoices.
  - Customer detail, manual orders (`POST /api/orders/manual`) and contract pricing (create, bulk, PATCH) need a current follow and no block. A past order no longer qualifies.
  - The check runs before any restaurant, branch or contract lookup. Unknown, never-followed and blocked restaurants (and foreign branch ids, and unknown contract ids) all get the same 404 `RESTAURANT_NOT_AVAILABLE`.
  - Manual orders and contract writes re-check under the shared relationship lock inside the write's transaction.
  - Contracts of restaurants that unfollow stay in the database but are hidden from the supplier's list. They reappear if the restaurant follows again.

## Downstream effects

Following a supplier affects:

| Area                        | Behavior                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------- |
| **Deals feed**              | Organic deal visibility for followed suppliers (plus explicit restaurant targets)     |
| **New-deals banner**        | Banner includes deals from followed suppliers started in the last 14 days             |
| **Sponsored deals**         | Boost campaigns can surface deals from non-followed suppliers when audience matches   |
| **Deal promotions service** | `supplier_follow` join determines organic vs sponsored eligibility                    |
| **Notifications**           | New-deal fan-out queries followers when suppliers publish deals                       |
| **Usage metering**          | Follow count checked against `suppliers_per_restaurant` on POST follow                |
| **Best-price comparison**   | Like-for-like current offers are compared across followed supplier organizations      |
| **AI Assistant**            | Exact follow count/list and common-product comparisons are exposed as read-only tools |

## API (`/api/suppliers`)

| Method | Path                | Auth                       | Description                                                                |
| ------ | ------------------- | -------------------------- | -------------------------------------------------------------------------- |
| GET    | `/followed`         | Restaurant, `CATALOG_VIEW` | List followed suppliers (newest first)                                     |
| GET    | `/price-comparison` | Restaurant, `CATALOG_VIEW` | Best current prices for products common to at least two followed suppliers |
| POST   | `/:id/follow`       | Restaurant                 | Follow supplier; 403 `SUPPLIER_FOLLOW_LIMIT_REACHED` at plan cap           |
| DELETE | `/:id/follow`       | Restaurant                 | Unfollow supplier                                                          |
| POST   | `/:id/block`        | Restaurant                 | Block supplier (optional `reason`)                                         |
| DELETE | `/:id/block`        | Restaurant                 | Unblock supplier                                                           |

## Catalog enrichment

`GET /api/suppliers` and `GET /api/suppliers/:id` include `is_followed` (boolean) when the caller is a restaurant tenant.

## Web UI

| Surface              | Behavior                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| `/app/suppliers`     | Follow/unfollow buttons, **Followed** filter, **Followed** sort, followed count stat |
| `/app/suppliers/:id` | Follow toggle on supplier detail header                                              |

RTK mutations: `useFollowSupplierMutation`, `useUnfollowSupplierMutation`.

### Best prices for common products (2026-09-25)

The supplier directory on web, Android, and iOS shows a best-price panel backed by `GET /api/suppliers/price-comparison`. The service only considers active, currently effective catalog prices from suppliers the active restaurant organization follows. It groups offers only when normalized product name, unit, brand, and currency match, requires at least two distinct supplier organizations, and returns the cheapest offer plus the alternative offers and savings. This avoids claiming two merely similar products are interchangeable.

The assistant uses the same service for price-comparison questions and reads `supplier_follow` directly for followed-supplier questions, so its count matches the directory rather than catalog visibility.

## Database

Migration: `0015_restaurant_onboarding.sql` — `supplier_follow`, `supplier_blocklist`, index on `restaurant_id`.

## See also

- [supplier-customer-growth.md](./supplier-customer-growth.md) — connection requests create `supplier_follow` after restaurant accepts
- [deals-and-promotions.md](./deals-and-promotions.md) — organic vs sponsored deal visibility
- [supplier-reviews.md](./supplier-reviews.md) — post-delivery supplier ratings
- [quote-requests.md](./quote-requests.md) — RFQ to multiple suppliers
