# Consumer ordering (B2C)

Guest-facing online ordering for restaurants: menu with modifiers, cart, fulfillment picker (delivery / takeaway / dine-in), COD checkout, and **universal live order tracking** via receipt link (no login required).

## Web routes

| Route                                          | Purpose                                         |
| ---------------------------------------------- | ----------------------------------------------- |
| `/order/:restaurantSlug`                       | Public storefront home                          |
| `/order/:restaurantSlug/menu`                  | Browse menu, modifiers, cart drawer             |
| `/order/:restaurantSlug/checkout`              | Fulfillment picker + place order (COD)          |
| `/order/:restaurantSlug/receipt/:receiptToken` | Live 4-step tracker + receipt (polls every 5s)  |
| `/order/:restaurantSlug/track`                 | Lookup order by order number + phone/email      |
| `/order/:restaurantSlug/account`               | Diner login / signup (username + password)      |
| `/order/:restaurantSlug/rewards`               | Member balance + ledger                         |
| `/app/consumer-menu`                           | Restaurant workspace — menu + fulfillment admin |
| `/app/consumer-orders`                         | Kitchen board — kanban by status, advance chain |
| `/app/consumer-loyalty`                        | Rewards program configuration                   |

## Order status (v1)

Single linear lifecycle for all fulfillment types:

| Status      | Diner label | Kitchen action                               |
| ----------- | ----------- | -------------------------------------------- |
| `RECEIVED`  | Received    | Order placed (default)                       |
| `PREPARING` | Preparing   | Kitchen started                              |
| `SHIPPED`   | Shipped     | Out for delivery / ready for pickup          |
| `DELIVERED` | Delivered   | Complete (triggers loyalty earn for members) |
| `CANCELLED` | —           | Terminal; tracker shows message only         |

## API

| Area               | Endpoints                                                                          |
| ------------------ | ---------------------------------------------------------------------------------- |
| Public auth        | `POST .../auth/signup`, `login`, `logout`, `GET .../auth/me`                       |
| Public menu        | `GET /api/public/consumer/:restaurantSlug/menu?branchId=`                          |
| Public fulfillment | `GET /api/public/consumer/:restaurantSlug/fulfillment-options?branchId=`           |
| Public orders      | `POST .../orders`, `GET .../orders/:receiptToken/receipt`, `POST .../orders/track` |
| Public loyalty     | `GET .../loyalty/preview` (member session)                                         |
| Admin menu         | `GET/POST/PATCH/DELETE /api/consumer/menu/*` (incl. modifiers)                     |
| Admin orders       | `GET /api/consumer/orders`, `PATCH /api/consumer/orders/:id/status`                |
| Admin fulfillment  | `GET/PATCH /api/consumer/fulfillment/:branchId`, zone CRUD                         |

Migrations: `0161_consumer_ordering.sql`, `0163_consumer_b2c_complete.sql`

## Related

- [consumer-loyalty.md](./consumer-loyalty.md) — earn/redeem for signed-up diners only
- [reservations-foh.md](./reservations-foh.md) — public portal pattern
- [restaurant-branches.md](./restaurant-branches.md) — branch scoping

## Deferred

- Per-fulfillment step labels on tracker
- ETA, driver map, push notifications
- Mobile parity (`docs/mobile/MOBILE_FEATURE_PARITY.md`)
