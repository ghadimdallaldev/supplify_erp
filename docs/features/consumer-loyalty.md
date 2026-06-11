# Consumer Loyalty (B2C)

Restaurants configure a **diner-facing rewards program**. Only **signed-up members** (username + password per restaurant) earn and redeem points. Guests order without an account and see no points UI.

**Migrations:** `0160_loyalty_programs.sql`, `0162_search_b2c_loyalty.sql`, `0163_consumer_b2c_complete.sql`

## Auth model

- Lightweight diner account per restaurant — **not** Keycloak
- Signup: username + password (optional display name, email, phone)
- Session: httpOnly JWT cookie `consumer_auth_token`, scoped to `restaurant_id` + `member_id`
- Orders link via `consumer_member_id` when session present at checkout

## Data model

| Table                      | Purpose                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `consumer_member`          | Diner profile, `username`, `password_hash`, `loyalty_points`, `welcome_bonus_awarded` |
| `consumer_order`           | `loyalty_points_redeemed`, `loyalty_discount_amount`                                  |
| `consumer_loyalty_program` | One program per restaurant; `welcome_bonus_points`, `max_redeem_percent`              |
| `consumer_loyalty_ledger`  | Point movements tied to members and orders                                            |

## Earn rules (members only)

| Rule         | Value                                                                          |
| ------------ | ------------------------------------------------------------------------------ |
| Eligibility  | Order has `consumer_member_id` from valid session                              |
| Basis        | **Subtotal** (excl. delivery fee), after redeem discount                       |
| Multipliers  | `TAKEAWAY` 1×, `DELIVERY` 1.25×, `DINE_IN` 1.5× (configurable in `rules_json`) |
| Signup bonus | `welcome_bonus_points` on program (awarded once on signup)                     |
| Trigger      | Order status → `DELIVERED`                                                     |
| Receipt      | Tracker shows points earned banner when complete                               |

## Redeem at checkout

- `GET /api/public/consumer/:slug/loyalty/preview` — balance + max redeem for cart subtotal
- `POST .../orders` accepts `pointsToRedeem`; validated in `redeemConsumerLoyaltyAtCheckout`
- Capped by `max_redeem_percent` and member balance

## Admin API (`/api/loyalty`)

| Method | Path                                  | Description                                                    |
| ------ | ------------------------------------- | -------------------------------------------------------------- |
| GET    | `/consumer/program`                   | Program config                                                 |
| PUT    | `/consumer/program`                   | Upsert (earn rate, multipliers, welcome bonus, min/max redeem) |
| GET    | `/consumer/members/:memberId/balance` | Member balance + ledger                                        |

## Web

- Storefront CTAs: Log in, Sign up for rewards, My rewards
- `ConsumerAccountPage`, `ConsumerRewardsPage`, `ConsumerAuthProvider`
- Checkout: redeem slider when logged in; signup CTA for guests
- Admin: `ConsumerLoyaltyPage` → `/app/consumer-loyalty`

## Service helpers

- `earnConsumerLoyaltyOnOrderComplete()` — called on `DELIVERED`
- `getConsumerLoyaltyPreview()`, `validateConsumerLoyaltyRedeem()`, `redeemConsumerLoyaltyAtCheckout()` in `loyalty.service.js`
