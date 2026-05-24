# Supplier Deals & Paid Promotions

## Overview

Suppliers create **deals** (stored in `promotions`) — percentage/fixed discounts, buy-X-get-Y, free shipping, coupons, and CTAs. Restaurants discover deals from followed suppliers plus **sponsored** deals from boosted suppliers they do not follow.

**Promotions** (paid boost layer) are separate: suppliers pay to run a `deal_promotions` campaign that surfaces deals to non-followers with analytics (views, clicks, orders, messages, coupon uses).

## Terminology

| Term                  | Meaning                                                     |
| --------------------- | ----------------------------------------------------------- |
| **Deal**              | Supplier-created offer (`promotions` row)                   |
| **Promotion / Boost** | Paid visibility campaign (`deal_promotions` row)            |
| **Sponsored**         | Deal with an active boost campaign visible to non-followers |

## Promotion / deal types

| Type                  | Order discount                                         |
| --------------------- | ------------------------------------------------------ |
| `percentage_discount` | Subtotal × value%, capped by `max_discount_cap`        |
| `fixed_discount`      | Flat amount, capped by subtotal and `max_discount_cap` |
| `buy_x_get_y`         | Free units based on qualifying line quantities         |
| `free_shipping`       | Fixed amount off (when `discount_value` set)           |
| `featured_listing`    | Catalog visibility only; no order discount             |

## Deal fields (0095 migration)

- `image_url`, `coupon_code`, `min_order_quantity`, `cta_type` (`order_now`, `use_coupon`, `message_supplier`, `view_products`)
- `target_restaurant_types`, `target_areas` (JSON targeting)
- `stock_quantity`, `requires_admin_approval`, status `pending_approval`

## Targeting

- **Products/categories:** `applies_to` + `promotion_targets` (supplier UI: DealTargetingPickers)
- **Restaurants:** empty `promotion_restaurant_targets` = all eligible; otherwise restricted list
- **Boost audience:** `deal_promotions.target_audience` JSON (`all`, `restaurantTypes`, `areas`)
- **Schedule:** `starts_at` / `ends_at`; `usage_limit` / `usage_count`; optional `stock_quantity`

## Visibility

- **Organic:** restaurants that **follow** the supplier (or explicit restaurant targets)
- **Sponsored:** active `deal_promotions` campaign + audience match, even without follow
- Expired, paused, draft, or over-limit deals are hidden from restaurant discovery

## API — Supplier (`CATALOG_MANAGE`, feature `promotions`)

| Method | Path                            | Description                                                      |
| ------ | ------------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/promotions`               | List deals (`?status=`)                                          |
| POST   | `/api/promotions`               | Create draft (supports `productIds`, `categoryIds`, CTA, coupon) |
| PATCH  | `/api/promotions/:id`           | Edit (not discount value when active)                            |
| POST   | `/api/promotions/:id/activate`  | Active or `pending_approval` if admin approval required          |
| POST   | `/api/promotions/:id/pause`     | Pause                                                            |
| POST   | `/api/promotions/:id/resume`    | Resume paused deal                                               |
| POST   | `/api/promotions/:id/promote`   | Create paid boost campaign                                       |
| DELETE | `/api/promotions/:id`           | Delete draft only                                                |
| GET    | `/api/promotions/:id/analytics` | Views, clicks, orders, messages, coupon uses, conversion         |
| GET    | `/api/promotions/:id/preview`   | Supplier preview with targets                                    |
| GET    | `/api/promotions/pricing`       | Boost pricing tiers                                              |

## API — Restaurant (feature `supplier_deals`)

| Method | Path                                    | Description                                                 |
| ------ | --------------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/promotions/active`                | Discover deals (`?sort=`, `?supplierId=`, `?expiringSoon=`) |
| GET    | `/api/promotions/:id/detail`            | Deal detail + view tracking                                 |
| POST   | `/api/promotions/:id/interact`          | Track click/order/message/coupon                            |
| GET    | `/api/promotions/:id/eligible-products` | Products for order CTA                                      |
| POST   | `/api/promotions/:id/use-coupon`        | Reveal/copy coupon + track usage                            |
| POST   | `/api/promotions/:id/message`           | Open chat with prefilled deal message                       |

## API — Admin

| Method | Path                                 | Description               |
| ------ | ------------------------------------ | ------------------------- |
| GET    | `/api/promotions/admin/pending`      | Deals awaiting approval   |
| POST   | `/api/promotions/admin/:id/approve`  | Approve → active          |
| POST   | `/api/promotions/admin/:id/reject`   | Reject → draft            |
| PATCH  | `/api/promotions/admin/pricing/:key` | Update boost pricing tier |

Admin UI: **Admin → Deals** tab (`AdminDealsPanel`).

## Order integration

**Create:** `POST /api/orders` with status `PLACED` accepts optional `promotionId` and `couponCode`. Applies specific deal or coupon, else best eligible promotion per supplier order. Records `promotion_usages`, reduces `total_amount`, returns `appliedPromotion`.

**Read:** `GET /api/orders/:id` joins `promotion_usages` + `promotions` and returns `appliedPromotion` / `promotion` on the order object for order detail display.

## Monetization

- `promotion_pricing_config` — admin-configurable boost tiers (flat fee, per-day)
- `deal_promotions.billing_status` — `pending`, `paid`, `waived`, etc. (payment stub: boosts activate with `waivePayment` until billing wired)
- Feature gates: supplier `promotions`, restaurant `supplier_deals` (Bronze+ on paid tiers)

## Background job

`deactivateExpiredPromotions` runs every 30 minutes (`promotions-expiry.job.js`).

## Database

| Migration                         | Tables                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `0074_promotions.sql`             | `promotions`, `promotion_targets`, `promotion_restaurant_targets`, `promotion_usages`          |
| `0095_deal_promotions_system.sql` | Extended promotion columns, `deal_promotions`, `deal_interactions`, `promotion_pricing_config` |

## Frontend

| Role       | Page / component                                                                     |
| ---------- | ------------------------------------------------------------------------------------ |
| Supplier   | `/app/promotions` — Deals & Promotions (create, boost, analytics, targeting pickers) |
| Restaurant | `/app/deals` — discovery feed with CTAs (`DealCard`)                                 |
| Admin      | `/app/admin` → Deals tab — approvals + pricing                                       |

## Tests

- `apps/api/src/services/promotions.service.test.js` — discount math
- `apps/api/src/routes/promotions.routes.test.js` — admin approve/reject/pricing
- `apps/api/src/routes/orders.routes.test.js` — GET order includes `appliedPromotion`
