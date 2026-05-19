# Supplier Promotions & Deals

## Overview

Suppliers create promotions (percentage off, fixed discount, buy-X-get-Y, free shipping, featured listing). Restaurants see eligible active deals at checkout; the best applicable discount is applied automatically when placing orders.

## Promotion types

| Type                  | Order discount                                         |
| --------------------- | ------------------------------------------------------ |
| `percentage_discount` | Subtotal × value%, capped by `max_discount_cap`        |
| `fixed_discount`      | Flat amount, capped by subtotal and `max_discount_cap` |
| `buy_x_get_y`         | Free units based on qualifying line quantities         |
| `free_shipping`       | Fixed amount off (when `discount_value` set)           |
| `featured_listing`    | Catalog visibility only; no order discount             |

## Targeting

- **Products/categories:** `applies_to` + `promotion_targets`
- **Restaurants:** empty `promotion_restaurant_targets` = all restaurants; otherwise restricted list
- **Schedule:** `starts_at` / `ends_at`; `usage_limit` / `usage_count`

## API

### Supplier (`CATALOG_MANAGE`)

| Method | Path                            | Description                            |
| ------ | ------------------------------- | -------------------------------------- |
| GET    | `/api/promotions`               | List promotions (`?status=`)           |
| POST   | `/api/promotions`               | Create draft                           |
| PATCH  | `/api/promotions/:id`           | Edit (not discount value when active)  |
| POST   | `/api/promotions/:id/activate`  | Set active                             |
| POST   | `/api/promotions/:id/pause`     | Pause                                  |
| DELETE | `/api/promotions/:id`           | Delete draft only                      |
| GET    | `/api/promotions/:id/analytics` | Usage, discount total, top restaurants |

### Restaurant

| Method | Path                     | Description                                          |
| ------ | ------------------------ | ---------------------------------------------------- |
| GET    | `/api/promotions/active` | Active promotions visible to tenant (`?supplierId=`) |

## Order integration

On `POST /api/orders` with status `PLACED`, per supplier order the service selects the best eligible promotion, reduces `total_amount`, records `promotion_usages`, and increments `usage_count`. Response includes `appliedPromotion` on the order object.

Expired or over-limit promotions are skipped without error.

## Background job

`deactivateExpiredPromotions` runs every 30 minutes (see `promotions-expiry.job.js`).

## Database

Migration: `0074_promotions.sql` — `promotions`, `promotion_targets`, `promotion_restaurant_targets`, `promotion_usages`.
