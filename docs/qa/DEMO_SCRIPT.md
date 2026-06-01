# Supplify — Demo day script (presenter)

Use this path on the **same database and build** you validated in [DEMO_READINESS_SIGNOFF.md](./DEMO_READINESS_SIGNOFF.md). Stub card: `4242424242424242` (any future expiry/CVC) when `BILLING_GATEWAY=stub`.

## Before you start

1. `pnpm db:migrate` && `pnpm seed:tier-catalog` (fresh DB)
2. `pnpm seed:demo-users` (Keycloak + admin)
3. `pnpm db:seed` && `pnpm seed:prodlike` (catalog, orders, demo tenants)
4. Optional tier matrix accounts: `pnpm seed:tier-matrix`
5. Start stack: `pnpm dev` (web + API on same host, e.g. `localhost`)
6. Confirm `GET /api/health` → `{ "status": "ok" }`

## Logins (prodlike / tier seeds)

| Persona               | Email                                                    | Password (default seed) |
| --------------------- | -------------------------------------------------------- | ----------------------- |
| Platform admin        | `admin@supplify.com`                                     | `SupplifyAdmin1!`       |
| Restaurant (prodlike) | see `seed:prodlike` output                               | `Supplify1!`            |
| Supplier (prodlike)   | see `seed:prodlike` output                               | `Supplify1!`            |
| Tier restaurant       | `restaurant-{free\|silver\|gold\|platinum}@supplify.com` | `Supplify1!`            |
| Tier supplier         | `supplier-{free\|silver\|gold\|platinum}@supplify.com`   | `Supplify1!`            |

## 1. Platform admin (5 min)

1. Log in → `/app/admin`
2. Open Restaurants / Suppliers lists — data loads
3. **Impersonation:** View as a restaurant → sidebar matches tenant; billing guard still applies
4. Exit impersonation → back to admin

## 2. Restaurant core (10 min)

Use **Gold** or prodlike restaurant with active subscription.

1. Dashboard → no errors in console
2. **Catalog:** `/app/products` — browse, search, open product
3. **Cart / order:** add to cart → `/app/cart` → place order → success
4. **Orders:** `/app/orders` — new order visible; try **search**; open detail
5. **Receiving:** mark delivered order as received (`/app/receiving`) if status allows
6. **Quick list (optional):** `/app/quick-lists` — one list visible per plan
7. **Waitlist (Gold+, optional):** cancel reservation → guest on waitlist gets offer link → `/reserve/waitlist/:token/accept`

## 3. Supplier core (10 min)

Use **Gold** or prodlike supplier.

1. Dashboard
2. **Products:** add or edit a product (if permitted)
3. **Orders:** incoming order → advance status (confirm / ship / deliver as UI allows)
4. **Fulfillment:** `/app/fulfillment` — dispatch board loads (Gold+)
5. **Chat:** `/app/chat` — open thread; send message; **second browser** sees it within ~1s (Socket.IO). Optional: typing indicator, notification toast on dashboard.

## 4. Plans & billing (5 min)

1. Restaurant **Settings → Subscription** — current plan, limits summary
2. Show **Silver vs Gold** gate: e.g. Reports (`/app/reports`) or multi-branch org (Gold+)
3. **Activation (if demoing new tenant):** `/app/activate` → free checkout or stub paid upgrade
4. Confirm entitlements match tier (deals on Free Trial **1/day**, Silver **10/day**, Gold **50/day**)

## 5. RBAC / team (5 min)

On tenant with **advanced_roles** (Gold+):

1. Settings → Team / roles
2. Invite or pick existing user → assign role (e.g. Purchaser)
3. Log in as that user → nav matches permissions (no Settings if not allowed)

## 6. Restaurant deals (optional, 3 min)

Restaurant **Silver+** with `supplier_deals`:

1. `/app/products` — deals/promotions visible when entitled
2. Redeem at checkout within daily cap (**Free Trial: 1/day**; Silver: 10/day)

---

Full regression: [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md)  
Billing detail: [MANUAL_TEST_CHECKLIST_BILLING_ACTIVATION.md](./MANUAL_TEST_CHECKLIST_BILLING_ACTIVATION.md)
