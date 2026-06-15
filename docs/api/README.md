# Supplify API — Route Groups

Base URL: `http://localhost:4000` (dev). All `/api/*` routes return JSON with shape `{ ok, data, error, requestId }` unless noted.

| Prefix                         | File                                  | Description                                                                                                                                    |
| ------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                  | `server.js`                           | Liveness probe (no auth)                                                                                                                       |
| `/auth`                        | `auth.routes.js`                      | Keycloak OAuth login, callback, session refresh, `/me`, logout                                                                                 |
| `/api/register`                | `register.routes.js`                  | Post-signup tenant profile completion                                                                                                          |
| `/api/products`                | `products.routes.js`                  | Supplier catalog CRUD, categories, tags                                                                                                        |
| `/api/prices`                  | `prices.routes.js`                    | Product pricing                                                                                                                                |
| `/api/inventory`               | `inventory.routes.js`                 | Supplier stock levels                                                                                                                          |
| `/api/suppliers`               | `suppliers.routes.js`                 | Supplier profiles, follow/block, statistics                                                                                                    |
| `/api/restaurants`             | `restaurants.routes.js`               | Restaurant profiles and admin CRUD                                                                                                             |
| `/api/orders/calendar`         | `orders.calendar.routes.js`           | Order calendar view (plan feature)                                                                                                             |
| `/api/orders`                  | `orders.routes.js`                    | Orders lifecycle, manual orders, supplier **decline** (`PATCH /:id` + `decline_reason`), amendments under `/:orderId/amendments`               |
| `/api/promotions`              | `promotions.routes.js`                | Supplier deals CRUD, restaurant discovery, boosts, admin approvals/pricing; order promotion join on GET                                        |
| `/api/audit`                   | `tenant-audit.routes.js`              | Tenant-scoped audit log                                                                                                                        |
| `/api/disputes`                | `disputes.routes.js`                  | Disputes and returns                                                                                                                           |
| `/api/credit-notes`            | `credit-notes.routes.js`              | Credit notes                                                                                                                                   |
| `/api/push`                    | `push.routes.js`                      | Web Push VAPID key and subscriptions                                                                                                           |
| `/api/reviews`                 | `reviews.routes.js`                   | Supplier reviews (public read; authenticated write)                                                                                            |
| `/api/reports`                 | `reports.routes.js`                   | Analytics and reports                                                                                                                          |
| `/api/roles`                   | `tenant-roles.routes.js`              | Custom tenant roles (advanced_roles feature)                                                                                                   |
| `/api/files`                   | `files.routes.js`                     | File upload presigns; `PUT /upload/:token` (10 MB); `PUT /upload-import/:token` (bulk ZIP, up to `IMPORT_ZIP_MAX_BYTES`)                       |
| `/api/admin`                   | `admin.routes.js`                     | Platform audit and dashboard snippets                                                                                                          |
| `/api/chat`                    | `chat.routes.js`                      | Messaging between restaurants and suppliers                                                                                                    |
| `/api/invoices`                | `invoices.routes.js`                  | Invoices                                                                                                                                       |
| `/api/payments`                | `payments.routes.js`                  | Payment records                                                                                                                                |
| `/api/quick-lists`             | `quick-lists.routes.js`               | Restaurant quick order lists                                                                                                                   |
| `/api/quote-requests`          | `quote-requests.routes.js`            | Restaurant RFQ / quote battle; supplier quote inbox ([spec](../product/QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md))                              |
| `/api/restaurant-inventory`    | `restaurant-inventory.routes.js`      | Restaurant-side inventory                                                                                                                      |
| `/api/restaurant-onboarding`   | `restaurant-onboarding.routes.js`     | Onboarding wizard                                                                                                                              |
| `/api/receiving`               | `receiving.routes.js`                 | Goods receiving                                                                                                                                |
| `/api/restaurant-finance`      | `restaurant-finance.routes.js`        | Finance and invoices (restaurant)                                                                                                              |
| `/api/reservations`            | `reservations.routes.js`              | Table reservations and waitlist                                                                                                                |
| `/api/staff`                   | `staff.routes.js`                     | Staff HR (shifts, PTO, time entries)                                                                                                           |
| `/api/restaurant-pricing`      | `restaurant-pricing.routes.js`        | Supplier pricing tiers for restaurants                                                                                                         |
| `/api/notifications`           | `notifications.routes.js`             | In-app notifications and preferences                                                                                                           |
| `/api/subscriptions`           | `subscriptions.routes.js`             | Plan subscription and entitlements                                                                                                             |
| `/api/billing`                 | `billing.routes.js`                   | Payment methods and checkout                                                                                                                   |
| `/api/public`                  | `public.routes.js`                    | Public reservations, staff portal, restaurant discovery, **public supplier catalog** (`/suppliers/:idOrSlug`, `/products`, `/products/priced`) |
| `/api/public/invitations`      | `branch-invitations-public.routes.js` | Accept branch invitation (token-based)                                                                                                         |
| `/api/admin-dashboard`         | `admin-dashboard.routes.js`           | Admin console: plans, tenants, feature flags, [impersonation](../features/admin-impersonation.md) (`/impersonate`, `/impersonate/stop`)        |
| `/api/branches`                | `branches.routes.js`                  | Branch settings                                                                                                                                |
| `/api/org`                     | `org.routes.js`                       | Multi-branch org overview (supplier)                                                                                                           |
| `/api/org/invitations`         | `branch-invitations.routes.js`        | Branch invitation management                                                                                                                   |
| `/api/restaurant-org`          | `restaurant-org.routes.js`            | Multi-branch org (restaurant)                                                                                                                  |
| `/api/restaurants/invitations` | `restaurant-invitations.routes.js`    | Restaurant branch invitations                                                                                                                  |
| `/api/warehouses`              | `warehouses.routes.js`                | Warehouses and stock                                                                                                                           |
| `/api/fulfillment`             | `fulfillment.routes.js`               | Fulfillment board, routes, dispatch, exceptions                                                                                                |
| `/api/drivers`                 | `drivers.routes.js`                   | Driver roster and assignments                                                                                                                  |
| `/api/supplier`                | `supplier-ops.routes.js`              | Supplier ops: command center, receivables, CSV import, **bulk image import**, substitutes, reorder intelligence                                |
| `/api/e2e`                     | `e2e.routes.js`                       | Test-only reset/seed (requires `E2E_SECRET` header)                                                                                            |

Authentication uses session cookies after Keycloak OAuth. Protected routes use `requireAuth`, tenant context, RBAC permissions, and optional `requireFeature()` plan gates.

**Global billing lock:** `billingAccessMiddleware` (in `server.js`) returns **402** `ACCOUNT_LOCKED` when the tenant subscription is locked. Exemptions: `/api/billing/*`, `/api/register/*`, `/auth/*`, `/health/*`, and subscription entitlements GETs. **Free Trial expired** (`free_sandbox_expired`): tenant **GET** routes remain allowed (read-only); writes still **402**. See [free-trial-expiry.md](../features/free-trial-expiry.md).

**Admin dashboard (subscription ops):** `POST /api/admin-dashboard/subscriptions/:id/unlock`, `POST …/extend-free-trial`, `GET/PATCH …/platform-settings` (`freeSandboxDays` **7–90**, default 30), `GET/PATCH …/growth-settings` (referral program config).

**Supplier growth:** `/api/supplier/growth/*` (import, prospects, invite, sponsor, metrics); public `GET /api/growth/referral/:token`; restaurant `GET/POST /api/restaurant/growth/connection-requests/*`. See [supplier-customer-growth.md](../features/supplier-customer-growth.md).
