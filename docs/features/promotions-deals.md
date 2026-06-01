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

## Plan limits (not boost pricing)

| Tenant         | Meter                      | Silver (0117)                                                         | Notes                                                                                 |
| -------------- | -------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Supplier**   | `promotions`               | 3 active deals                                                        | `requireFeature('promotions')` on supplier routes                                     |
| **Restaurant** | `deal_redemptions_per_day` | **1/day** Free (migration `0131`), **10/day** Silver, **50/day** Gold | `supplier_deals` feature; **`promotions` limit key is n/a** on restaurant plans       |
| **Free Trial** | `deal_redemptions_per_day` | **1/day** on Free restaurant plans (evaluation cap)                   | Migration `0131_free_trial_deal_redemptions.sql`; `fillMissingFreeTierLimits` default |

Deal **boost** checkout uses separate `promotion_pricing_config` — not counted against the plan `promotions` cap unless product rules say otherwise.

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
| GET    | `/api/promotions/pricing`       | Active boost packages (supplier boost picker)                    |

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

| Method | Path                                 | Description                                          |
| ------ | ------------------------------------ | ---------------------------------------------------- |
| GET    | `/api/promotions/admin/pending`      | Deals awaiting approval                              |
| POST   | `/api/promotions/admin/:id/approve`  | Approve → active                                     |
| POST   | `/api/promotions/admin/:id/reject`   | Reject → draft                                       |
| GET    | `/api/promotions/admin/pricing`      | All boost + activation pricing rows (incl. inactive) |
| PATCH  | `/api/promotions/admin/pricing/:key` | Update boost package fields                          |

Admin UI: **Admin → Deals** tab (`AdminDealsPanel`).

See **[DEALS_BOOST_PUBLISHING_FLOW.md](../DEALS_BOOST_PUBLISHING_FLOW.md)** for the full submit → approve → publish flow.

## Boost packages (Facebook-style visibility)

Suppliers pick a **boost package** when promoting an active deal. Packages are rows in `promotion_pricing_config` with `package_type = 'boost'`. Default tiers (migration `0123_deal_boost_packages.sql`):

| `pricing_key`  | Display name  | Price | Duration | Badge / reach (qualitative)        |
| -------------- | ------------- | ----- | -------- | ---------------------------------- |
| `boost_flat`   | Starter Boost | $9    | 1 day    | Test visibility · Basic visibility |
| `boost_7_day`  | Weekly Boost  | $39   | 7 days   | Most popular · Higher placement    |
| `boost_30_day` | Monthly Boost | $99   | 30 days  | Best value · Maximum visibility    |

**Activation** (`deal_activation`, `package_type = 'activation'`) remains **$0** — labeled “Free after admin approval” in admin UI; not shown as a paid boost option.

On purchase (`POST /api/promotions/:id/promote`), `deal_promotions` stores snapshots: `pricing_package_id`, `pricing_key`, `price_paid`, `duration_days`, `package_display_name`. Admin price edits affect **new** purchases only.

Supplier list responses include `boost_status`: `active` (days remaining, ends at), `expired`, `scheduled`, or `none`.

**UX copy:** “Boost visibility” / “Boost deal” — not “promotion fee”. Reach labels describe feed placement priority; no fake impression numbers until real analytics exist.

## Order integration

**Create:** `POST /api/orders` with status `PLACED` accepts optional `promotionId` and `couponCode`. Applies specific deal or coupon, else best eligible promotion per supplier order. Records `promotion_usages`, reduces `total_amount`, returns `appliedPromotion`.

**Read:** `GET /api/orders/:id` joins `promotion_usages` + `promotions` and returns `appliedPromotion` / `promotion` on the order object for order detail display.

## Monetization

- `promotion_pricing_config` — admin-configurable boost packages (`amount`, `duration_days`, `badge_label`, `estimated_reach_label`, `is_recommended`, `is_active`, `sort_order`)
- `deal_promotions` — campaign row + purchase snapshots (`price_paid`, etc.)
- `deal_promotions.billing_status` — `pending`, `paid`, `waived`, etc. (payment stub: boosts activate with `waivePayment` until billing wired)
- Feature gates: supplier `promotions`, restaurant `supplier_deals` (Silver+ on paid tiers)

## Background job

`deactivateExpiredPromotions` runs every 30 minutes (`promotions-expiry.job.js`).

## Database

| Migration                         | Tables                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `0074_promotions.sql`             | `promotions`, `promotion_targets`, `promotion_restaurant_targets`, `promotion_usages`          |
| `0095_deal_promotions_system.sql` | Extended promotion columns, `deal_promotions`, `deal_interactions`, `promotion_pricing_config` |
| `0123_deal_boost_packages.sql`    | Boost package fields, purchase snapshots, default Starter/Weekly/Monthly pricing               |

## Frontend

| Role       | Page / component                                                                     |
| ---------- | ------------------------------------------------------------------------------------ |
| Supplier   | `/app/promotions` — Deals & Promotions (create, boost, analytics, targeting pickers) |
| Restaurant | `/app/deals` — discovery feed with CTAs (`DealCard`)                                 |
| Admin      | `/app/admin` → Deals tab — approvals + pricing                                       |

## Tests

Automated coverage maps to `docs/qa/MANUAL_TEST_CHECKLIST.md` IDs below.

### API unit (Vitest)

| File                                                       | Covers                                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/services/promotions.service.test.js`         | Discount math, eligibility (RST-77, RST-78 order flows)                                                        |
| `apps/api/src/services/deal-lifecycle.service.test.js`     | Approval, visibility, ineligibility messages                                                                   |
| `apps/api/src/services/deal-promotions.service.test.js`    | Restaurant/audience targeting for sponsored deals (RST-76)                                                     |
| `apps/api/src/services/deal-boost.helpers.test.js`         | Boost status builder (active / expired / days remaining)                                                       |
| `apps/api/src/services/deal-promotions.boost.test.js`      | Package purchase snapshots, inactive package rejection                                                         |
| `apps/api/src/routes/promotions.routes.test.js`            | Admin pending/approve/reject/pricing (ADM Deals tab, API-22)                                                   |
| `apps/api/src/routes/promotions.supplier-security.test.js` | Supplier cannot access other tenants' deals                                                                    |
| `apps/api/src/routes/feature-gates.routes.test.js`         | `promotions` / `supplier_deals` — Free 403; Silver supplier 200 (GATE-S13); Silver restaurant deals (GATE-R19) |
| `apps/api/src/routes/orders.routes.test.js`                | `appliedPromotion` on order detail (RST-81, API-23)                                                            |
| `apps/api/src/lib/limit-resolution.test.js`                | Free-tier `deal_redemptions_per_day` = 1 (migration `0131`); supplier `promotions` default                     |

### Web unit (Vitest)

| File                                   | Covers                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `apps/web/src/lib/planLimits.test.ts`  | `deal_redemptions_per_day`, supplier `promotions` caps (PLN upgrade UX) |
| `apps/web/src/lib/upgradeCopy.test.ts` | Upgrade copy for deals/promotions limits                                |

### Playwright API / E2E

| File                                           | Covers                                                    |
| ---------------------------------------------- | --------------------------------------------------------- |
| `tests/api/promotions-deals-gates.spec.ts`     | Unauthenticated promotions endpoints (API-20/21/22 smoke) |
| `tests/e2e/suites/critical_e2e/orders.spec.ts` | Place order; promotion on order when seeded               |
| `tests/feature-inventory.yml`                  | Feature `promotions_deals` inventory entry                |

### Manual-only (no automated parity yet)

- RST-74–RST-80: Full deals feed CTAs and sponsored UI (E2E not implemented)
- RST-82–RST-83: Free Trial **1/day** deal redemption cap (manual + `limit-resolution.test.js`)
- SUP-52–SUP-58: Supplier create/boost/analytics UI (E2E not implemented)
- API-24: `POST /api/orders` with `promotionId` + `couponCode` (integration)
