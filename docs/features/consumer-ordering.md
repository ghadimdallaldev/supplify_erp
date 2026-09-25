# Consumer ordering (B2C)

Guest-facing online ordering for restaurants: menu with modifiers, cart, fulfillment picker (delivery / takeaway / dine-in), COD checkout, and **universal live order tracking** via receipt link (no login required).

## Web routes

| Route                                          | Purpose                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `/order/:restaurantSlug`                       | Public storefront home                                                            |
| `/order/:restaurantSlug/menu`                  | Browse menu, modifiers, cart drawer                                               |
| `/order/:restaurantSlug/checkout`              | Fulfillment picker + place order (COD)                                            |
| `/order/:restaurantSlug/receipt/:receiptToken` | Live 4-step tracker + receipt (polls every 5s)                                    |
| `/order/:restaurantSlug/track`                 | Lookup order by order number + phone/email                                        |
| `/order/:restaurantSlug/account`               | Diner login / signup (username + password)                                        |
| `/order/:restaurantSlug/rewards`               | Member balance + ledger                                                           |
| `/app/consumer-menu`                           | Restaurant workspace — menu + fulfillment admin, allergens/dietary tags, QR share |
| `/app/consumer-orders`                         | Kitchen board — kanban by status, advance chain, 86 items from tickets            |
| `/app/consumer-loyalty`                        | Rewards program configuration                                                     |

## Order status (v1)

Stored statuses stay the same for every fulfillment type. The kitchen board and guest tracker show a label that matches how the guest is eating:

| Status      | Delivery   | Takeaway         | Dine-in        |
| ----------- | ---------- | ---------------- | -------------- |
| `RECEIVED`  | Received   | Received         | Received       |
| `PREPARING` | Preparing  | Preparing        | Preparing      |
| `SHIPPED`   | On the way | Ready for pickup | Ready to serve |
| `DELIVERED` | Delivered  | Picked up        | Served         |
| `CANCELLED` | Cancelled  | Cancelled        | Cancelled      |

`DELIVERED` still awards member points. Cancelling an open ticket returns redeemed points and removes points earned on that order. A delivered order cannot be cancelled, so those points stay. The kitchen board can cancel a ticket that is not already delivered or cancelled.

## API

| Area               | Endpoints                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public auth        | `POST .../auth/signup`, `login`, `logout`, `GET .../auth/me`                                                                                                |
| Public storefront  | `GET /api/public/consumer/:restaurantSlug/storefront` (home hero, hours, branches)                                                                          |
| Public menu        | `GET /api/public/consumer/:restaurantSlug/menu?branchId=`                                                                                                   |
| Public fulfillment | `GET /api/public/consumer/:restaurantSlug/fulfillment-options?branchId=` (foreign `branchId` → 400)                                                         |
| Admin menu         | `GET/POST/PATCH/DELETE /api/consumer/menu/*` (incl. modifiers, bulk import). Category/item/import `branchId` must belong to the restaurant (400 otherwise). |
| Admin orders       | `GET /api/consumer/orders?branchId=` rejects a foreign location (400). `PATCH /api/consumer/orders/:id/status`                                              |
| Admin fulfillment  | `GET /api/consumer/fulfillment?branchId=` rejects a foreign location (400). `GET/PATCH /api/consumer/fulfillment/:branchId`, zone CRUD, live ordering hours |
| Public orders      | `POST .../orders`, `GET .../orders/:receiptToken/receipt`, `POST .../orders/track`                                                                          |
| Public loyalty     | `GET .../loyalty/preview` (member session)                                                                                                                  |

Migrations: `0161_consumer_ordering.sql`, `0163_consumer_b2c_complete.sql`, `0164_consumer_ordering_hours.sql`, `0165_supplier_delivery_zone_columns.sql` (unifies `delivery_zone` for B2C + supplier warehouse zones — required for supplier delivery board after B2C rollout), `0201_menu_item_allergens.sql` (allergen + dietary tags).

## Menu quality extras

- Admin and public menu expose `allergens` / `dietary_tags`; guest menu filters and item badges.
- Menu admin shares a storefront QR image (download + share) for the public `/order/:slug` URL. Clearing a dish photo removes it, and a dish cannot be filed under a category from a different branch.
- Kitchen board can **86** an item (`is_available=false`) from an open ticket when the user has `CATALOG_EDIT`.
- A modifier group cannot require more choices than its maximum, so a guest is never blocked from ordering an item by an impossible rule. A discount modifier cannot make the line price negative.
- A branch minimum applies to takeaway and dine-in as well as delivery. A delivery zone with a higher minimum uses that higher amount. The menu cart and checkout show the current menu price, including modifiers, before the guest pays. A dish that is no longer on the menu is marked unavailable in the cart. A dish or modifier that is no longer on the menu blocks the order. The server still prices the committed order. Checkout only prices items that belong to this restaurant, this branch (or a shared menu), and an active category. An item or modifier 86'd before the order commits is rejected. A negative delivery fee is treated as zero.
- Ticket numbers for a restaurant are taken one at a time from the highest number on the restaurant’s local day, so two guests checking out together do not get the same ticket, and an order just after local midnight is not numbered on the previous day.
- A scheduled order must fall inside live ordering hours in the restaurant’s timezone. A time after the next opening but outside those hours, such as the middle of the night, is rejected. Checkout reads the picked time as that restaurant clock, using `timeZone` on the fulfillment options, and blocks a time outside those hours before the order is sent.
- Kitchen status updates lock the ticket. Sending the status it already has does not write another history row or award points again.

## Infrastructure (Keycloak & Docker)

**Diner signup does not use Keycloak.** No new Keycloak clients, realms, or redirect URIs are required.

| Concern        | B2C diners                                        | ERP staff / suppliers                 |
| -------------- | ------------------------------------------------- | ------------------------------------- |
| Auth           | API-issued JWT in `consumer_auth_token` cookie    | Keycloak OIDC (`access_token` cookie) |
| Identity store | `consumer_member` table (per restaurant)          | Keycloak + `app_user`                 |
| Docker service | None extra — uses existing **api** + **postgres** | **keycloak** unchanged                |

**Docker / env:** set `CONSUMER_AUTH_SECRET` on the API service (optional; falls back to `SESSION_SECRET`). Already wired in root `docker-compose.yml` and `deploy/docker-compose.*.yml`. Run `pnpm db:migrate` so migrations `0161`–`0165` apply on every environment.

**Production:** use a dedicated `CONSUMER_AUTH_SECRET` (`openssl rand -hex 32`) so diner session tokens are signed independently of staff sessions. Cookie settings (`COOKIE_SECURE`, `COOKIE_SAME_SITE`, `WEB_ORIGINS`) apply to diner cookies the same as staff cookies.

## Related

- [consumer-loyalty.md](./consumer-loyalty.md) — earn/redeem for signed-up diners only
- [reservations-foh.md](./reservations-foh.md) — public portal pattern
- [restaurant-branches.md](./restaurant-branches.md) — branch scoping

## Deferred

- Per-fulfillment step labels on tracker
- ETA, driver map, push notifications
- Mobile parity (`docs/mobile/MOBILE_FEATURE_PARITY.md`)
