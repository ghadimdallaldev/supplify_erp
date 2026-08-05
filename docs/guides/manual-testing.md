# Manual testing

Single-tenant checklist for regression and release testing. For **routes, roles, and API map**, see [Feature overview & verification](../product/features.md).

---

## Setup (one-time)

- [ ] **Reduce DB to single tenant**  
       From repo root: `pnpm exec node apps/api/scripts/reduce-to-single-tenant.js`  
       Or from `apps/api`: `pnpm run reduce-to-single-tenant`  
       Result: 1 admin, 1 restaurant (Golden Fork), 1 supplier (Fresh Foods Co.).

- [ ] **Keycloak demo users** (if not already created)  
       From repo root: `pnpm run seed:demo-users`  
       Logins (exactly 1 admin, 1 restaurant, 1 supplier):
  - **Admin:** `admin@supplify.com` / `SupplifyAdmin1!`
  - **Restaurant:** `restaurant@supplify.com` / `SupplifyRestaurant1!`
  - **Supplier:** `supplier@supplify.com` / `SupplifySupplier1!`

- [ ] **API and Web** running (e.g. `pnpm dev` from monorepo or run api + web separately).

- [ ] **Keycloak** running (e.g. port 8180) if using real auth.

**Notes:**

- **Numbers:** Currency and numeric values should come from the API and use shared formatters (`formatCurrency` / `formatPrice`).
- **Tiers & features:** Enforced via `requireFeature`, `checkLimit`. Silver limits/features: migration `0117` · `pnpm run log:tier-limits`. Full gate matrix: [regression-checklist.md](../qa/regression-checklist.md) Part 3.
- **Free Trial expiry:** [free-trial-expiry.md](../features/free-trial-expiry.md); full regression cases **BIL-FT-01 … BIL-FT-12** in [regression-checklist.md](../qa/regression-checklist.md) §4.6.
- **Impersonation:** [admin-impersonation.md](../features/admin-impersonation.md) — start from Tenants tab; full tenant nav; exit via sticky banner; QA **ADM-IMP-01 … ADM-IMP-10** in [regression-checklist.md](../qa/regression-checklist.md).
- **Delivery GPS:** [drivers-and-gps-tracking.md](../features/drivers-and-gps-tracking.md) — restaurant **GPS-R01–R10** (§6.6.1), supplier **GPS-S01–S09** (§7.4.1), driver **DRV-GPS1–3** (§7.4.2); receiving flow [receiving.md](../features/receiving.md).

---

## 1. Authentication & session

- [ ] **Login page** (`/login`) — CTA, redirect to Keycloak, demo hints if present.
- [ ] **Session** — refresh and second tab stay authenticated.
- [ ] **Logout** — returns to `/login`, session cleared.
- [ ] **Expired session** — `/login?expired=true` messaging if applicable.

---

## 2. Restaurant — core nav & dashboard

- [ ] **Sidebar** — expected items; no admin-only links.
- [ ] **Dashboard** — loads; role-appropriate content.

---

## 3. Restaurant — products & catalog

- [ ] **Products list** — search/filter/tags; **detail** — add to cart.

---

## 4. Restaurant — cart & orders

- [ ] **Cart** — lines, quantity, place order.
- [ ] **Orders** — list, **server-side search**, inbox filters, **order detail** actions.
- [ ] **Order delivery tracking (restaurant)** — assigned driver → GPS states on timeline tab (`RestaurantOrderTrackingPanel`); **Receive order** when `DELIVERED`; see [drivers-and-gps-tracking.md](../features/drivers-and-gps-tracking.md) and checklist **GPS-R01–R10**.
- [ ] **Supplier decline** — as supplier, decline a `PLACED` order with a reason; as restaurant, confirm status **Declined by supplier** and reason on list + detail (see [order-decline.md](../features/order-decline.md)).

---

## 5. Restaurant — quick lists, suppliers, reservations

- [ ] **Quick lists** — CRUD, stat cards/empty state, add to cart/order.
- [ ] **Suppliers** — list (stat cards), detail, follow/request if present.
- [ ] **Reservations** — board (branch-aware when multi-branch), create, status flow, waitlist offer accept/decline (`/reserve/waitlist/:token/...`), analytics, booking link, table builder, **table assignment**, guest cancel/reschedule → staff + guest notifications when restaurant initiates (see [reservations-foh.md](../features/reservations-foh.md)).

---

## 6. Restaurant — staff, inventory, receiving, invoices, chat

- [ ] **Staff** — team, schedule/time, PTO, swaps, docs/incidents, payroll tabs as applicable.
- [ ] **Restaurant inventory** — levels, adjustments.
- [ ] **Receiving** — pending/history, submit report; confirm driver **DELIVERED** (not `COMPLETED`) appears in pending list ([receiving.md](../features/receiving.md)).
- [ ] **Invoices** — list, detail, payment recording.
- [ ] **Deals** — Silver+ feed; Free Trial **1 redemption/day** cap (see RST-82/83 in checklist).
- [ ] **Chat** — threads, send, **real-time delivery** (second browser), typing indicator, attachments if present.
- [ ] **Notifications** — bell + Socket.IO toast on new order/message (see §4.10 WS-\* in [regression-checklist.md](../qa/regression-checklist.md)).

---

## 7. Restaurant — onboarding & settings

- [ ] **Onboarding** — if shown, complete steps.
- [ ] **Settings** — profile, notifications, subscription/billing links.
- [ ] **Notifications** — trigger order/reservation event; bell + toast + sound for team users; email/WhatsApp when Gold+ tier and prefs enabled (`POST /api/notifications/test` for smoke).

---

## 8. Supplier — nav, products, orders, fulfillment, restaurants, invoices, chat, settings

- [ ] Sidebar matches supplier role.
- [ ] Products CRUD/inventory as allowed.
- [ ] **Bulk Upload** products CSV (optional `image_url` column).
- [ ] **Import Product Images** — ZIP by SKU or ZIP + mapping CSV; preview → confirm → job progress → failure report (migration `0168`).
- [ ] **Import Product Images** — second import while a job is running returns **409** (SUP-15f).
- [ ] Orders lifecycle (acknowledge → ship → deliver / **decline with required reason**).
- [ ] **Fulfillment** — dispatch board, tracking tab, command center GPS widget, **View tracking** drawer (Gold+ / `driver_management`); checklist **GPS-S01–S09**, **DRV-GPS1–3**.
- [ ] **Driver portal** (linked driver user) — active deliveries, GPS badge, mark delivered → restaurant tracking + receiving flow.
- [ ] **Restaurants** list/detail.
- [ ] **Invoices** list/create/issue.
- [ ] **Chat** and **supplier settings** (warehouses, notifications).
- [ ] **Customer follow-up** — create reorder reminder draft → **Send reminder** → restaurant receives in-app/email/WhatsApp (Gold+).

---

## 9. Admin — dashboard, tenants, impersonation, settings

- [ ] Admin-only nav.
- [ ] Tabs: overview, plans, subscriptions, tenants, health/finance/usage/audit as present.
- [ ] Supplier admin / restaurant admin routes.
- [ ] **Impersonate** restaurant → dashboard, orders, settings, branch switch (if applicable).
- [ ] **Impersonate** supplier → products, orders, fulfillment/warehouses.
- [ ] Sticky **Impersonating** banner; **Exit impersonation**; `/app/admin` redirects away while active.
- [ ] Billing payment actions blocked while impersonating.
- [ ] Admin **Settings** if any.

---

## 10. Public & staff flows

- [ ] **Public reservation** — book, confirm, manage token link.
- [ ] **Staff self-service** (`/staff`…) — login, shifts, clock, PTO, swaps if configured.

---

## 11. Cross-cutting

- [ ] Permission toggle hides route or returns 403.
- [ ] Plan limits → upgrade / block UX.
- [ ] Responsive smoke on login, dashboard, products, cart, one order, one reservation.
- [ ] 404 / API error handling.
- [ ] Logout clears UI state.

---

## Quick reference — logins

| Role       | Email                   | Password             |
| ---------- | ----------------------- | -------------------- |
| Admin      | admin@supplify.com      | SupplifyAdmin1!      |
| Restaurant | restaurant@supplify.com | SupplifyRestaurant1! |
| Supplier   | supplier@supplify.com   | SupplifySupplier1!   |

---

## Legacy extended scenarios (summary)

Older material used long **TC-xxx** style cases (auth, restaurant, supplier, admin, orders, chat, inventory, finance, subscriptions, notifications). That content overlapped this checklist and [FEATURE_CATALOG](../product/FEATURE_CATALOG.md). **Use this checklist as the canonical manual pass**; add ad-hoc notes per release rather than maintaining duplicate thousand-line documents.
