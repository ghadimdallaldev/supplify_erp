# Supplier Deals & Paid Promotions

## Overview

Suppliers create **deals** (stored in `promotions`) — percentage/fixed discounts, buy-X-get-Y, free shipping, coupons, and CTAs. Restaurants discover deals from followed suppliers plus **sponsored** deals from boosted suppliers they do not follow.

**Boosts** (paid visibility layer, stored in `deal_promotions`) are separate: suppliers pay to run a boost campaign that surfaces deals to non-followers with analytics (views, clicks, orders, messages, coupon uses).

> **UI labels (June 2026):** User-facing copy uses **Deals** and **Boosts**; internal API/DB names remain `promotions`, `deal_promotions`, etc. See [../ui/DEALS_BOOSTS_WORDING_CLEANUP.md](../ui/DEALS_BOOSTS_WORDING_CLEANUP.md).

## Terminology

| Term                | Meaning                                                     |
| ------------------- | ----------------------------------------------------------- |
| **Deal**            | Supplier-created offer (`promotions` row)                   |
| **Boost**           | Paid visibility campaign (`deal_promotions` row)            |
| **Coupon code**     | Optional code on a deal (`promotions.coupon_code`)          |
| **Deal redemption** | Checkout usage (`promotion_usages` / `usage_count`)         |
| **Sponsored**       | Deal with an active boost campaign visible to non-followers |

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
| GET    | `/api/promotions/new-deals-banner`      | New-deals banner payload (followed suppliers, last 14 days) |
| POST   | `/api/promotions/:id/dismiss-banner`    | Dismiss banner for one deal (per restaurant)                |

## New-deals banner

Restaurants with `supplier_deals` see a dismissible banner in the app shell when followed suppliers publish new active deals.

**Eligibility** (`deal-banner.service.js`):

- Deal `status = active`, payment ok, within `starts_at` / `ends_at`
- Started within the last **14 days**
- Restaurant follows the supplier, is explicitly targeted, or deal has no restaurant targets
- Matches `target_restaurant_types` / `target_areas` when set
- Not previously dismissed (`deal_interactions.interaction_type = 'banner_dismiss'`)

**UI:** `NewDealsBanner` in `Layout.tsx` — links to `/app/deals`; dismiss calls `POST /api/promotions/:id/dismiss-banner`.

Migration: `0151_deal_banner_dismiss.sql` — adds `banner_dismiss` to deal interaction types.

## API — Admin

| Method | Path                                 | Description                                          |
| ------ | ------------------------------------ | ---------------------------------------------------- |
| GET    | `/api/promotions/admin/pending`      | Deals awaiting approval                              |
| POST   | `/api/promotions/admin/:id/approve`  | Approve → active                                     |
| POST   | `/api/promotions/admin/:id/reject`   | Reject → draft                                       |
| GET    | `/api/promotions/admin/pricing`      | All boost + activation pricing rows (incl. inactive) |
| PATCH  | `/api/promotions/admin/pricing/:key` | Update boost package fields                          |

Admin UI: **Admin → Deals & Boosts** tab (`AdminDealsPanel`).

See **[deals-boost-publishing-flow.md](../archive/old/deals-boost-publishing-flow.md)** for the full submit → approve → publish flow.

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

| Role       | Route / nav label                     | Component / notes                                                                   |
| ---------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| Supplier   | `/app/promotions` — **Deals**         | Create, boost, analytics, targeting pickers (`PromotionsPage`, `dealDisplayLabels`) |
| Restaurant | `/app/deals` — **Deals**              | Discovery feed with CTAs (`DealsPage`, `DealCard`)                                  |
| Admin      | `/app/admin` — **Deals & Boosts** tab | Approvals + boost pricing (`AdminDealsPanel`)                                       |

Label maps: [`apps/web/src/lib/dealDisplayLabels.ts`](../../apps/web/src/lib/dealDisplayLabels.ts).

### Legal (deals/boost copy in agreements)

Legal pack **`2026-06-09`** aligns static terms with Deals/Boosts/Coupon terminology. Existing users re-accept on login via `/legal/reaccept`. See [../ui/LEGAL_PACK_REACCEPTANCE.md](../ui/LEGAL_PACK_REACCEPTANCE.md).

## Tests

Automated coverage maps to `docs/qa/regression-checklist.md` IDs below.

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

| File                                             | Covers                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `apps/web/src/lib/planLimits.test.ts`            | `deal_redemptions_per_day`, supplier `promotions` caps (PLN upgrade UX) |
| `apps/web/src/lib/upgradeCopy.test.ts`           | Upgrade copy for active deals / redemptions limits                      |
| `apps/web/src/lib/dealDisplayLabels.test.ts`     | User-facing deal/boost/coupon label maps                                |
| `apps/web/src/lib/legalReacceptanceGate.test.ts` | Legal re-accept redirect when pack stale                                |
| `apps/api/src/lib/legal-acceptance.test.js`      | `legalStatus`, `login_refresh` acceptance recording                     |

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

---

## Boost publishing flow

Suppliers choose a **boost package before** admin approval. Admin **Approve & publish** activates the deal and boost together. Restaurants only see **live** deals inside an active boost window.

### Flow (Facebook Boost–like)

1. Supplier creates deal (draft) or edits rejected/expired deal.
2. Supplier selects boost package (Starter / Weekly / Monthly) **before submit**.
3. Supplier submits → `pending_approval` with boost snapshot on `promotions` (`boost_package_id`, `boost_pricing_key`, `boost_price_snapshot`, `boost_duration_days`).
4. Admin reviews deal + selected boost → **Approve & publish**.
5. On approval: status → `active` (or `approved_pending_payment` if payment required); `boost_start_at` / `boost_end_at` set; `deal_promotions` row created.
6. Restaurants see deal only while `active` + boost window is live.
7. When `boost_end_at` passes, expiry job sets `expired`.

### Visibility rules

- **Supplier / admin:** all own / all deals.
- **Restaurant APIs:** `status = active`, payment ok, date range ok, and `boost_start_at <= now < boost_end_at`.
- No organic follower bypass without boost.

### Boost statuses

| Status                                                              | Restaurant visible |
| ------------------------------------------------------------------- | ------------------ |
| `draft`, `pending_approval`, `rejected`, `approved_pending_payment` | No                 |
| `active` (with live boost window)                                   | Yes                |
| `scheduled`, `paused`, `expired`, `cancelled`                       | No                 |

Historical audit: [deals-boost-publishing-flow.md](../archive/old/deals-boost-publishing-flow.md).
