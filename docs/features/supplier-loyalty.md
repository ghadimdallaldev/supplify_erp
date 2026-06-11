# Supplier Loyalty (B2B)

Suppliers can run a loyalty program for restaurant buyers. Points are **earned when the restaurant receives an order** and may be **redeemed at checkout** on future orders with that supplier.

**Migration:** `0160_loyalty_programs.sql`

## Data model

| Table                        | Purpose                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| `supplier_loyalty_program`   | One program per supplier (earn/redeem rates, caps, `rules_json`) |
| `restaurant_loyalty_balance` | Points balance per `(supplier_id, restaurant_id)`                |
| `loyalty_ledger`             | Immutable EARN / REDEEM / ADJUST entries                         |

## Earn rules

- Triggered in `POST /api/receiving/receive` after a receiving report is accepted.
- Base amount: `total_actual_cost` from receiving (falls back to order `total_amount`).
- Points = `floor(spend × earn_points_per_currency)` when program is enabled.
- Idempotent: one EARN ledger row per order.

## Redeem rules

- Validated via `POST /api/loyalty/restaurant/redeem-preview`.
- Applied during `POST /api/orders` when body includes:

```json
{
  "loyaltyRedeem": [{ "supplierId": "<uuid>", "points": 500 }],
  "items": [ ... ]
}
```

- Checks: program enabled, minimum points, sufficient balance, max % of subtotal (`max_redeem_percent`).
- Discount = `points × redeem_currency_per_point`; order total is reduced in the same transaction.

## API (`/api/loyalty`)

| Method | Path                                      | Role       | Description                  |
| ------ | ----------------------------------------- | ---------- | ---------------------------- |
| GET    | `/supplier/program`                       | Supplier   | Program config               |
| PUT    | `/supplier/program`                       | Supplier   | Upsert program               |
| GET    | `/supplier/balances`                      | Supplier   | Restaurant balances          |
| GET    | `/supplier/balances/:restaurantId/ledger` | Supplier   | Ledger for a restaurant      |
| GET    | `/restaurant/balances`                    | Restaurant | All supplier balances        |
| GET    | `/restaurant/balance/:supplierId`         | Restaurant | Balance + recent ledger      |
| POST   | `/restaurant/redeem-preview`              | Restaurant | Validate checkout redemption |

## Web

- Stub page: `apps/web/src/pages/loyalty/LoyaltyProgramPage.tsx` → `/app/loyalty`

## Service

- `apps/api/src/services/loyalty.service.js` — earn, redeem, validation, balance queries.
