# Feature catalog & verification

This document lists every major product area in Supplify, how it maps to API routes and web UI, who can access it, and how to verify it locally.

## Prerequisites

```cmd
pnpm setup
pnpm dev
```

| Service | URL (native dev) |
|---------|------------------|
| Web (Vite) | http://localhost:5173 (or next free port, e.g. 5174) |
| API | http://localhost:4000 |
| Health | http://localhost:4000/health |
| Keycloak | http://localhost:8180 |
| Full stack (Docker profile `full`) | http://localhost via nginx |

After seed (`scripts\run-local.cmd seed` or `pnpm db:seed` + `pnpm seed:demo-users`):

| Role | Email | Password |
|------|-------|----------|
| Restaurant | `restaurant@supplify.com` | see `apps/api/scripts/seed-demo-users.js` |
| Supplier | `supplier@supplify.com` | same |
| Platform admin | `admin@supplify.com` | same |

## Roles & navigation

The sidebar (`apps/web/src/components/Sidebar.tsx`) adapts by role and admin impersonation:

| Role | Primary nav |
|------|-------------|
| **Restaurant** | Dashboard, Products, Orders, Chat, Quick Lists, Cart, Suppliers, Reservations, Staff, Inventory, Receiving, Invoices, Settings |
| **Supplier** | Dashboard, Products, Orders, Chat, Restaurants, Fulfillment, Invoices, Settings |
| **Platform admin** | Admin Dashboard, Supplier Admin, Restaurant Admin, Settings |
| **Public (no login)** | Reservation portal, staff self-service |

RBAC permissions (e.g. `RESERVATIONS_VIEW`, `STAFF_VIEW`, `INVOICES_VIEW`) further filter restaurant nav items.

## Marketplace & catalog

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Dashboard | `/app/dashboard` | — | Role-specific widgets and shortcuts |
| Products | `/app/products`, `/app/products/:id` | `/api/products` | Catalog browse; supplier-managed SKUs |
| Prices | — | `/api/prices` | Price lists, contract pricing |
| Suppliers | `/app/suppliers`, `/app/suppliers/:id` | `/api/suppliers` | Restaurant view of linked suppliers |
| Restaurants | `/app/restaurants`, `/app/restaurants/:id` | `/api/restaurants` | Supplier view of restaurant customers |
| Branches | Settings / tenant config | `/api/branches` | Multi-branch restaurants |
| Warehouses | Supplier ops | `/api/warehouses` | Supplier warehouse locations |

**Verify:** Log in as restaurant → Products loads; as supplier → Restaurants loads. API tests: `products.routes.test.js`, `suppliers.routes.test.js`, `restaurants.routes.test.js`.

## Ordering

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Orders list & detail | `/app/orders`, `/app/orders/:id` | `/api/orders` | Placement, status workflow, reminders |
| Order calendar | — | `/api/orders/calendar` | Delivery / pickup calendar (Redis-backed cache) |
| Cart | `/app/cart` | via orders/products | Checkout flow |
| Quick lists | `/app/quick-lists` | `/api/quick-lists` | Saved order templates; scheduled re-order |
| Scheduled orders | — | cron in `server.js` | Runs every 5 min in dev |

**Verify:** Restaurant → Cart → place order → Orders list shows new order. Supplier → Fulfillment sees incoming orders. Tests: `orders.routes.test.js`, `orders.calendar.routes.test.js`, `scheduled-orders.service.test.js`.

## Chat & realtime

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Chat UI | `/app/chat` | `/api/chat` | Conversations, messages, attachments |
| Socket.IO | — | same origin as API | Initialized in `server.js` |

Gated by subscription feature `chat` (see [admin-feature-flags.md](./admin-feature-flags.md)).

**Verify:** Restaurant opens chat from supplier detail; messages persist after refresh. Tests: `chat.routes.test.js`, web `useSocket.test.ts`.

## Fulfillment & supplier inventory

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Fulfillment | `/app/fulfillment` | `/api/orders` (supplier status) | Pick/pack/ship workflow |
| Supplier inventory | `/app/inventory` | `/api/inventory` | Stock levels, reservations |
| Supplier settings | `/app/supplier-settings` | `/api/suppliers` | Onboarding / profile |

**Verify:** Supplier login → Fulfillment → advance order status. Tests: `inventory.routes.test.js`.

## Restaurant operations

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Restaurant inventory | `/app/restaurant-inventory` | `/api/restaurant-inventory` | On-hand, par levels |
| Receiving | `/app/receiving` | `/api/receiving` | Goods-in, quality checks |
| Onboarding | `/app/onboarding` | `/api/restaurant-onboarding` | Restaurant setup wizard |
| Restaurant pricing | — | `/api/restaurant-pricing` | Internal menu / cost pricing |
| Restaurant finance | — | `/api/restaurant-finance` | COGS / finance hooks |

**Verify:** Restaurant → Receiving → record receipt against PO. Feature flags: `receiving_quality`, `inventory_management`.

## Finance & billing

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Invoices | `/app/invoices` | `/api/invoices` | AR/AP style invoice list |
| Payments | — | `/api/payments` | Payment recording |

Gated by `finance_invoices` where applicable. Tests: `invoices.routes.test.js`, `payments.routes.test.js`.

## Reservations (FOH)

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Reservations cockpit | `/app/reservations` | `/api/reservations` | Floor plan, board, bookings |
| Public booking | `/reserve`, `/reserve/:slug` | `/api/public/reservations*` | Guest-facing portal |
| Manage booking | `/reserve/manage/:token` | `/api/public/reservations/manage*` | Cancel / reschedule |
| Confirmation | `/reserve/confirmation` | — | Post-booking page |

Runtime schema ensured on API startup (`ensureReservationsSchema`). Tests: `reservations.routes.test.js`, `public.routes.test.js`.

**Verify:**

1. `GET http://localhost:4000/health` → `ok: true`
2. `GET http://localhost:4000/api/public/restaurants` → list (may be empty before seed)
3. Restaurant → Reservations → create booking on board
4. Open `/reserve` and complete guest flow

## Staff & labour

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Staff directory | `/app/staff` | `/api/staff` | Members, roles, shifts |
| Staff self-service | `/staff`, `/staff/dashboard` | `/api/public/staff*` | Magic-link login, clock in/out, PTO, swaps |

Runtime schema ensured on API startup (`ensureStaffAppSchema`). Tests: `staff.routes.test.js`, `public.routes.test.js` (staff endpoints).

**Verify:** Restaurant → Staff → view roster. Visit `/staff` → request link flow (email in dev logs).

## Subscriptions & entitlements

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Plans & usage | Settings / admin | `/api/subscriptions` | Plan catalog, tenant subscription |
| Feature gating | — | `requireFeature()` middleware | Blocks API when feature disabled |

Tests: `subscriptions.routes.test.js`, `feature-flags.test.js`, `subscription.test.js`.

## Notifications

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| In-app notifications | Header bell | `/api/notifications` | Order updates, reminders |

Tests: `notification.service.test.js`.

## Admin platform

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Admin dashboard | `/app/admin` | `/api/admin-dashboard` | Metrics, tenants, plans |
| Supplier admin | `/app/admin/suppliers` | same | Supplier tenant management |
| Restaurant admin | `/app/admin/restaurants` | same | Restaurant tenant management |
| Feature toggles | Admin → **Features** tab | `/api/admin-dashboard/feature-flags` | Global + per-tenant overrides |
| Impersonation | Banner when active | cookie + middleware | View app as tenant |
| Legacy admin routes | — | `/api/admin` | Internal maintenance endpoints |

See [admin-feature-flags.md](./admin-feature-flags.md) for toggle API details. Tests: `admin-dashboard.routes.test.js`.

## Auth & files

| Feature | Web route | API prefix | Notes |
|---------|-----------|------------|--------|
| Login / OIDC | `/login`, `/auth/login` | `/auth` | Keycloak code flow, HTTP-only cookies |
| File uploads | chat, products | `/api/files` | MinIO-backed storage |

Tests: `auth.routes.test.js`, `rbac.test.js`.

## Subscription feature keys

Canonical keys in `apps/api/src/lib/feature-keys.js`:

**Restaurant:** `chat`, `reports`, `smart_reorder`, `multi_branch`, `receiving_quality`, `finance_invoices`, `quick_lists`, `inventory_management`, `waste_tracking`, `approvals_budgets`, `notifications`, `api_integrations`, `support_sla`, `custom_branding`, `feature_flags_access`

**Supplier:** `chat`, `reports`, `fulfillment_tools`, `quick_lists`, `inventory_management`, `notifications`, `api_integrations`, `support_sla`, `custom_branding`, `feature_flags_access`

## Automated verification

From repo root (Windows without `pnpm` on PATH):

```cmd
node scripts/pnpm-run.mjs --filter @supplify/api test:run
node scripts/pnpm-run.mjs --filter @supplify/web test:run
```

Or with pnpm on PATH:

```cmd
pnpm test:ci
```

Expected: **141** API tests, **19** web tests, all passing.

Migrations (55 SQL files + runtime checks):

```cmd
node apps/api/scripts/migrate.js
```

## Manual smoke checklist

| Check | Command / action | Expected |
|-------|------------------|----------|
| API up | `GET /health` | `{ "ok": true, "status": "healthy" }` |
| DB migrated | `node apps/api/scripts/migrate.js` | All migrations skipped or applied; no errors |
| Public API | `GET /api/public/restaurants` | `200` JSON envelope |
| Web dev server | Open Vite URL in browser | Login page or app shell |
| Auth | Log in as each demo role | Correct sidebar for role |
| Chat | Send message restaurant ↔ supplier | Message appears; socket connected |
| Order | Place order from cart | Appears in Orders + supplier Fulfillment |
| Reservations | Restaurant board + `/reserve` | Booking created |
| Staff | `/app/staff` + `/staff` | Roster loads; self-service reachable |
| Admin flags | `/app/admin` → Features | List loads; toggle inherits/on/off |

## E2E (optional)

```cmd
pnpm e2e:playwright
```

Requires stack running and `E2E_SECRET` when hitting protected e2e routes (`/api/e2e`, non-production only).
