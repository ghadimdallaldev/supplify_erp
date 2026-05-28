# Deals boost publishing flow

## Summary

Suppliers choose a **boost package before** admin approval. Admin **Approve & publish** activates the deal and boost together. Restaurants only see **live** deals inside an active boost window.

## Old flow

1. Supplier creates deal → submits for approval (no boost).
2. Admin approves → deal becomes `active` (organic visibility for followers).
3. Supplier separately opens **Boost** dialog → pays for `deal_promotions` campaign.
4. Restaurants could see deals from followed suppliers without a boost.

## New flow (Facebook Boost–like)

1. Supplier creates deal (draft) or edits rejected/expired deal.
2. Supplier selects boost package (Starter / Weekly / Monthly) **before submit**.
3. Supplier submits → `pending_approval` with boost snapshot on `promotions`:
   - `boost_package_id`, `boost_pricing_key`, `boost_price_snapshot`, `boost_duration_days`
4. Admin reviews deal + selected boost → **Approve & publish**.
5. On approval (payment waived in dev / $0 path):
   - Status → `active` (or `scheduled` / `approved_pending_payment` if boost payment required).
   - `boost_start_at` / `boost_end_at` set; `deal_promotions` row created.
6. Restaurants see deal only while `active` + boost window is live.
7. When `boost_end_at` passes, expiry job sets `expired`; deal drops from restaurant APIs.

## Statuses (stored on `promotions.status`)

| Status                                        | Meaning                          | Restaurant visible        |
| --------------------------------------------- | -------------------------------- | ------------------------- |
| `draft`                                       | Supplier editing                 | No                        |
| `pending_approval` / `pending_admin_approval` | Awaiting admin                   | No                        |
| `rejected`                                    | Admin rejected (reason on row)   | No                        |
| `approved_pending_payment`                    | Approved, boost payment required | No                        |
| `active`                                      | Live (with boost window)         | Yes, if boost window live |
| `scheduled`                                   | Approved, deal start in future   | No until start + boost    |
| `paused`                                      | Supplier/admin paused            | No                        |
| `expired`                                     | Deal or boost ended              | No                        |
| `cancelled`                                   | Cancelled                        | No                        |

## Visibility rules

- **Supplier / admin:** all own / all deals.
- **Restaurant APIs:** `status = active`, payment ok, deal date range ok, and  
  `boost_start_at <= now < boost_end_at`.
- No organic “follower” bypass without boost.

## Payment / manual confirmation

- Boost price uses `boost_price_snapshot` from submit time (admin package price edits do not change this deal).
- When `ALLOW_WAIVE_DEAL_PROMOTION_PAYMENT=true` or non-production: approval publishes immediately (`payment_status = not_required`).
- When boost amount > 0 and payment not waived: `approved_pending_payment` until `POST /:id/pay-activation` succeeds, then publish runs.

## Migrations

| Migration                          | Purpose                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `0123_deal_boost_packages.sql`     | Package catalog + campaign snapshots                                                                |
| `0124_deal_boost_publish_flow.sql` | Boost columns on `promotions`, backfill from campaigns, **pause** active deals without boost window |

Legacy **active without boost** deals are set to `paused` so they do not suddenly appear to restaurants.

## Manual QA checklist

- [ ] Create draft without boost — not visible to restaurants.
- [ ] Submit without boost package — validation error.
- [ ] Submit with Weekly Boost — pending; restaurant API empty.
- [ ] Admin sees package, price snapshot, duration on pending deal.
- [ ] Approve & publish — supplier sees live + end date; restaurant feed shows deal.
- [ ] Reject — supplier sees reason; restaurant feed empty.
- [ ] After boost end — deal expired / hidden from restaurants.
- [ ] Change admin package price — approved deal keeps original snapshot.
- [ ] Expired deal → Boost again → pending with new package.

## API

| Method | Path                                | Notes                               |
| ------ | ----------------------------------- | ----------------------------------- |
| POST   | `/api/promotions`                   | `submitForReview` + `pricingKey`    |
| POST   | `/api/promotions/:id/submit`        | body `{ pricingKey }`               |
| POST   | `/api/promotions/admin/:id/approve` | publishes boost when payment allows |
| GET    | `/api/promotions/active`            | live boosted deals only             |
