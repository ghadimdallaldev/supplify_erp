# Supplify — Complete Feature Catalog

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [four-plan-pricing-model.md](./four-plan-pricing-model.md) and [plans-and-limits.md](./plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

**Product:** Supplify ERP — Restaurant & F&B supplier marketplace  
**Stack:** React (Vite) + Express API + PostgreSQL + Keycloak + Redis + S3/MinIO + Socket.IO  
**Last updated:** 2026-06-12 (Track F doc backfill)

This document lists **every major product capability** in the monorepo: web UI routes, API surfaces, background jobs, subscription gates, and platform operations. For verification steps, see [features.md](./features.md).

**Removed from product (not MVP):** Order approvals & budgets (`approvals_budgets`) — see [approvals-budgets.md](../features/approvals-budgets.md).

**Release branches:** `dev` → `preprod` → `prod` only; prod never merges `dev` directly ([BRANCHING.md](../BRANCHING.md)).

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [User roles & access model](#2-user-roles--access-model)
3. [Public features (no login)](#3-public-features-no-login)
4. [Authentication & account lifecycle](#4-authentication--account-lifecycle)
5. [Restaurant tenant features](#5-restaurant-tenant-features)
6. [Supplier tenant features](#6-supplier-tenant-features)
7. [Platform admin features](#7-platform-admin-features)
8. [Cross-cutting platform services](#8-cross-cutting-platform-services)
9. [Subscriptions, plans & monetization](#9-subscriptions-plans--monetization)
10. [RBAC permissions catalog](#10-rbac-permissions-catalog)
11. [Subscription feature flags (plan entitlements)](#11-subscription-feature-flags-plan-entitlements)
12. [Usage limits & meters](#12-usage-limits--meters)
13. [Notifications & messaging channels](#13-notifications--messaging-channels)
14. [Background jobs & automation](#14-background-jobs--automation)
15. [Integrations & infrastructure](#15-integrations--infrastructure)
16. [Developer, QA & deployment tooling](#16-developer-qa--deployment-tooling)
17. [Web route index](#17-web-route-index)
18. [API route index](#18-api-route-index)

---

## 1. Product overview

Supplify connects **restaurants** (buyers) with **food & beverage suppliers** (sellers) for:

- B2B catalog browsing and ordering
- Supplier fulfillment and invoicing
- Restaurant receiving, inventory, and finance hooks
- Front-of-house reservations and back-of-house staff labour
- SaaS subscriptions with plan limits and feature gating
- Platform administration, impersonation, and observability

The app is a **multi-tenant ERP/marketplace** with three primary logged-in personas plus public guest/staff portals.

---

## 2. User roles & access model

| Role               | Description                                                      | Primary navigation                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RESTAURANT**     | Buyer: orders, inventory, reservations, staff, suppliers         | Dashboard, Orders, Products, Cart, Quick Lists, Reservations, Receiving, Staff, Inventory (+ waste tab), Suppliers, Deals, Reports, Disputes, Invoices, Chat, Settings, Org (multi-branch) |
| **SUPPLIER**       | Seller: catalog, fulfillment, restaurants, invoices              | Dashboard, Orders, Products, Fulfillment, Restaurants, Invoices, Chat, Settings                                                                                                            |
| **ADMIN**          | Platform operator: tenants, plans, billing, flags                | Admin Dashboard, Supplier Admin, Restaurant Admin, Settings                                                                                                                                |
| **PENDING**        | New signup before tenant setup                                   | Redirected to `/register/complete`                                                                                                                                                         |
| **Public guest**   | No account                                                       | Reservation booking, manage booking by token                                                                                                                                               |
| **Staff (portal)** | Operational staff only (`STAFF_PORTAL`); separate from Team RBAC | `/staff/login`, `/staff/dashboard` — **no** `/app` access unless also a platform user (dual link)                                                                                          |

**Additional controls:**

- **Tenant-scoped RBAC** — fine-grained permissions per restaurant/supplier (e.g. `INVOICES_VIEW`, `STAFF_MANAGE`).
- **Admin impersonation** — platform admin navigates the full restaurant or supplier workspace (signed cookie, branch-aware, billing mutations blocked); see [features/admin-impersonation.md](../features/admin-impersonation.md).
- **Multi-branch** — restaurants and suppliers use org branch accounts (`/api/restaurant-org`, `/api/org`, `/app/org`) with Regional Manager scoping and link-based team invites (`/invite?type=rm|rb|sb`).
- **Multi-warehouse fulfillment** — Gold+ suppliers route order lines to warehouses (single default vs per-item routing).
- **Subscription entitlements** — plan features and usage limits enforced on API.
- **Account lock** — billing overdue / pending activation can block app access (billing middleware).

---

## 3. Public features (no login)

| Feature                              | Web route                                  | API                                                                         |
| ------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------- |
| Guest reservation booking            | `/reserve`, `/reserve/:restaurantIdOrSlug` | `GET/POST /api/public/reservations*`                                        |
| Reservation availability slots       | (portal UI)                                | `GET /api/public/reservations/availability`                                 |
| Waitlist signup                      | (portal UI)                                | `POST /api/public/reservations/waitlist`                                    |
| Booking confirmation page            | `/reserve/confirmation`                    | —                                                                           |
| Manage booking (cancel / reschedule) | `/reserve/manage/:token`                   | `GET/POST /api/public/reservations/manage*`                                 |
| List restaurants for booking         | (portal)                                   | `GET /api/public/restaurants`, `GET .../restaurants/:idOrSlug`              |
| Staff portal login (Keycloak)        | `/staff/login`                             | OAuth via `/auth/login`; callback → `/staff/dashboard` for `STAFF_PORTAL`   |
| Staff self-service (authenticated)   | `/staff/dashboard`                         | `GET/POST /api/staff/self/*` (cookie session; own staff profile only)       |
| Staff magic-link login (legacy)      | `/staff`, `/staff/dashboard?token=…`       | `POST /api/public/staff/request-link`, `.../session`, public staff routes   |
| Staff clock in / out                 | (portal)                                   | `POST /api/staff/self/check-in`, `.../self/time-entries/:id/check-out`      |
| Staff PTO / swap / availability      | (portal)                                   | `POST /api/staff/self/pto`, `.../swaps`, `.../availability`                 |
| Manager: portal account controls     | `/app/staff` → Team                        | `POST /api/staff/members/:id/portal/create-account`, invite, reset, disable |

**Notes:** Public staff APIs are rate-limited. Magic links require `portal_access_enabled`. Operational staff must not receive `restaurant`/`supplier` Keycloak roles. See `docs/features/staff-portal-access.md`.

---

## 4. Authentication & account lifecycle

| Feature                                  | Web / flow                                                                              | API                                                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login (Keycloak OIDC)                    | `/login` → `/auth/login`                                                                | `GET /auth/login`                                                                                                                                          |
| Self-registration (Keycloak hosted form) | Login page → register                                                                   | `GET /auth/register`                                                                                                                                       |
| OAuth callback                           | —                                                                                       | `GET /auth/callback`                                                                                                                                       |
| Current user profile + tenant RBAC       | AuthGuard loads user                                                                    | `GET /auth/me`                                                                                                                                             |
| Token refresh                            | Automatic (cookies)                                                                     | `POST /auth/refresh`                                                                                                                                       |
| Logout (+ Keycloak SSO logout URL)       | Header logout                                                                           | `POST /auth/logout`                                                                                                                                        |
| Complete tenant setup after signup       | `/register/complete`                                                                    | `GET /api/register/status`, `POST /api/register/complete` (restaurant or supplier)                                                                         |
| Account activation (billing lock)        | `/app/activate`                                                                         | `GET /api/billing/status`; `POST /api/billing/checkout` starts a selected paid-plan trial target or paid checkout                                          |
| Self-service trial activation            | `/app/activate` -> selected Growth/Scale trial; upgrade modal during pending activation | `activateFreePlan.ts` -> checkout with internal trial row plus selected paid `trialTargetPlanId`                                                           |
| Demo login panel (dev)                   | Login page                                                                              | —                                                                                                                                                          |
| OAuth full-page redirect (iframe-safe)   | Login / register buttons                                                                | `redirectToAuth()` → `/auth/login` or `/auth/register` via `getAuthBaseUrl()` (uses `VITE_API_URL` or same origin in dev; breaks out of embedded previews) |
| Session expired / auth error messaging   | `/login?expired=true`, `?error=`                                                        | —                                                                                                                                                          |
| Session store (OAuth state)              | —                                                                                       | PostgreSQL `session` table                                                                                                                                 |
| CSRF protection (API)                    | `X-Requested-With` header                                                               | Middleware                                                                                                                                                 |
| Security headers                         | —                                                                                       | Helmet (CSP, HSTS prod)                                                                                                                                    |

**Auth cookies:** `access_token`, `refresh_token` (httpOnly). **Impersonation cookie:** `impersonation_token`.

---

## 5. Restaurant tenant features

### 5.1 Navigation & dashboard

| Feature                           | Web route        | API (primary)                     |
| --------------------------------- | ---------------- | --------------------------------- |
| Dashboard                         | `/app/dashboard` | Stats, shortcuts                  |
| Role-aware sidebar                | —                | —                                 |
| Plan badge / entitlements display | Sidebar          | `/api/subscriptions/entitlements` |
| Pending orders badge              | Sidebar          | Dashboard stats                   |
| Notification bell                 | Header           | `/api/notifications`              |

### 5.2 Marketplace & ordering

| Feature                                   | Web route                            | API                                                                                                                |
| ----------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Product catalog browse                    | `/app/products`                      | `/api/products`                                                                                                    |
| Product detail                            | `/app/products/:id`                  | `/api/products/:id`                                                                                                |
| Categories & tags filters                 | Products page                        | `/api/products/categories`, `/tags`                                                                                |
| Shopping cart                             | `/app/cart`                          | Orders + products                                                                                                  |
| Place order                               | Cart                                 | `POST /api/orders`                                                                                                 |
| Orders list & filters                     | `/app/orders`                        | `GET /api/orders`                                                                                                  |
| Order detail & status                     | `/app/orders/:id`                    | `GET/PATCH /api/orders/:id`                                                                                        |
| Supplier decline (reason required)        | Order list/detail                    | `PATCH` with `decline_reason`; restaurant sees decline label                                                       |
| Order reminders to supplier               | Order detail                         | `POST /api/orders/:id/remind`                                                                                      |
| Order calendar view                       | Orders / dashboard                   | `/api/orders/calendar` (plan `order_calendar`)                                                                     |
| Order amendments (plan)                   | Order detail                         | `/api/orders/:id/amendments` (plan `order_amendments`)                                                             |
| Tenant roles (plan)                       | Settings → Team                      | `/api/roles/*` (gated); `auth/me` permissions always resolved                                                      |
| Manual order (supplier-created on behalf) | —                                    | `POST /api/orders/manual` (supplier)                                                                               |
| Quick lists (saved templates)             | `/app/quick-lists`                   | `/api/quick-lists`                                                                                                 |
| Quick list items CRUD                     | Quick Lists                          | `/api/quick-lists/:id/items`                                                                                       |
| Schedule quick list → auto order          | Quick Lists                          | Schedule endpoints on quick-lists                                                                                  |
| Scheduled order execution                 | —                                    | Cron: `executeScheduledOrders`                                                                                     |
| Reorder suggestions                       | —                                    | Restaurant inventory API                                                                                           |
| Supplier discovery                        | `/app/suppliers`                     | `/api/suppliers` (incl. `is_followed`, store deal badges)                                                          |
| Supplier detail & follow/block            | `/app/suppliers/:id`                 | `/api/suppliers/:id/follow`, block endpoints — see [supplier-follow.md](../features/supplier-follow.md)            |
| Unified search & history                  | Products, Suppliers pages            | `/api/search`, `/api/search/history` — see [search-and-discovery.md](../features/search-and-discovery.md)          |
| Quote requests (RFQ)                      | `/app/quote-requests`                | `/api/quote-requests` — see [quote-requests.md](../features/quote-requests.md)                                     |
| B2B loyalty (earn/redeem)                 | `/app/loyalty`                       | `/api/loyalty/restaurant/*`, `/api/loyalty/supplier/*`                                                             |
| Supplier statistics                       | Supplier detail                      | `GET /api/suppliers/:id/statistics`                                                                                |
| Reports & analytics (plan)                | `/app/reports`                       | `/api/reports/restaurant/*` (spend, categories, top products, etc.)                                                |
| Disputes & returns (plan)                 | `/app/disputes`, `/app/disputes/:id` | `/api/disputes`, `/api/credit-notes`; replacement orders on dispute resolution                                     |
| Active supplier deals / promotions        | `/app/deals`                         | `/api/promotions` (feed, redeem, new-deals banner, dismiss; `?highlight=` deep link)                               |
| Store-wide deal badges                    | Suppliers list                       | `has_store_deal` on `GET /api/suppliers` — [store-wide-deal-badges.md](../features/store-wide-deal-badges.md)      |
| Supplier reviews                          | Supplier detail                      | `/api/reviews/suppliers/:id`, summary, `POST` review                                                               |
| Consumer guest ordering                   | `/order/:restaurantSlug/*`           | `/api/public/consumer/:slug/*`, `/api/consumer/*` admin — [consumer-ordering.md](../features/consumer-ordering.md) |
| Consumer restaurant reviews               | Receipt / public                     | `/api/consumer-reviews/restaurants/:id` — [restaurant-reviews.md](../features/restaurant-reviews.md)               |
| Consumer loyalty program                  | `/app/consumer-loyalty`              | `/api/loyalty/consumer/*` — [consumer-loyalty.md](../features/consumer-loyalty.md)                                 |

### 5.3 Chat & collaboration

| Feature                        | Web route    | API                                                                                                          |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------ |
| Conversations list             | `/app/chat`  | `GET /api/chat/conversations`                                                                                |
| Messages (REST)                | Chat         | `GET/POST .../messages`                                                                                      |
| Real-time messages (Socket.IO) | Chat         | `send_message`, `new_message`, `typing`, read receipts; `notification_new`, `entitlements_refresh` on layout |
| Shared Socket.IO client        | Chat, Layout | `getAppSocket()` + `getSocketBaseUrl()` (one connection per user; Redis adapter when `REDIS_URL` set)        |
| Read receipts                  | Chat         | PATCH read endpoints                                                                                         |
| Message replies                | Chat         | `replyTo` on messages                                                                                        |
| Attachments in chat            | Chat         | Files + chat                                                                                                 |
| Delete conversation            | Chat         | `DELETE .../conversations/:id`                                                                               |
| Admin-started conversations    | —            | Admin chat endpoints                                                                                         |

### 5.4 Inventory & receiving

| Feature                                    | Web route                        | API                                                                 |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------- |
| Restaurant inventory (on-hand, par levels) | `/app/restaurant-inventory`      | `/api/restaurant-inventory`                                         |
| Inventory history                          | Inventory tab                    | `/api/restaurant-inventory/history`                                 |
| Waste & spoilage logging (plan)            | Inventory → **Waste & spoilage** | `POST .../adjust` (`WASTAGE`/`SPOILAGE`), `GET .../waste-analytics` |
| Reorder suggestions                        | Inventory                        | `/api/restaurant-inventory/reorder-suggestions`                     |
| Receiving reports                          | `/app/receiving`                 | `/api/receiving`                                                    |
| Record goods-in / quality                  | Receiving                        | `POST /api/receiving/receive`                                       |

### 5.5 Finance

| Feature                   | Web route       | API                                |
| ------------------------- | --------------- | ---------------------------------- |
| Invoices list             | `/app/invoices` | `/api/invoices`                    |
| Invoice PDF               | Invoices        | `GET /api/invoices/:id/pdf`        |
| Invoice create/update     | —               | `POST/PATCH /api/invoices`         |
| Payments                  | —               | `/api/payments`                    |
| Restaurant finance / COGS | —               | `/api/restaurant-finance`          |
| Expense tracking          | —               | `/api/restaurant-finance/expenses` |
| Finance analytics         | —               | Multiple finance GET endpoints     |

### 5.6 Reservations (front of house)

| Feature                         | Web route           | API                             |
| ------------------------------- | ------------------- | ------------------------------- |
| Reservations board / floor plan | `/app/reservations` | `/api/reservations/board`       |
| Table management                | Reservations        | `POST /api/reservations/tables` |
| Create / edit bookings          | Reservations        | `POST/PATCH /api/reservations`  |
| Waitlist management             | Reservations        | Board + public waitlist         |
| Analytics (FOH)                 | Reservations        | Reservation analytics endpoints |

### 5.7 Staff & labour

| Feature                          | Web route            | API                       |
| -------------------------------- | -------------------- | ------------------------- |
| Staff directory                  | `/app/staff`         | `/api/staff/members`      |
| Shifts scheduling                | Staff → Schedule tab | `/api/staff/shifts`       |
| Time entries & clock             | Staff                | `/api/staff/time-entries` |
| PTO requests & approval          | Staff → PTO tab      | `/api/staff/pto`          |
| Availability                     | Staff                | `/api/staff/availability` |
| Shift swaps                      | Staff                | `/api/staff/swaps`        |
| Announcements & acknowledgements | Staff                | announcements endpoints   |
| Documents (HR)                   | Staff                | `/api/staff/documents`    |
| Incidents                        | Staff                | `/api/staff/incidents`    |
| Performance reviews              | Staff                | performance endpoints     |
| Payroll records                  | Staff                | `/api/staff/payroll`      |

### 5.8 Settings & tenant configuration

Restaurant **Settings** (`/app/settings`) renders **Restaurant onboarding / settings hub** with tabs:

| Tab               | Capabilities                                                                          |
| ----------------- | ------------------------------------------------------------------------------------- |
| **Profile**       | Name, contact, address, logo upload, trade license                                    |
| **Team**          | Link-based team invites (`/api/restaurants/invitations/members`), pending invitations |
| **Branches**      | Org branches, two-step create + manager invite (`/api/restaurant-org`)                |
| **Subscription**  | Plan, usage, upgrade prompts, billing status                                          |
| **Notifications** | Email, WhatsApp, in-app; per-category toggles                                         |
| **Activity**      | Tenant audit log; filter by labeled action/resource                                   |

Also available via API (not always separate pages):

| Feature                    | API                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Restaurant profile CRUD    | `/api/restaurants`                                                                                     |
| Restaurant onboarding team | `/api/restaurant-onboarding/team` (legacy contacts)                                                    |
| Restaurant org & branches  | `/api/restaurant-org`, `/api/restaurant-org/branches` (flag: `multi_branch`)                           |
| Restaurant invitations     | `/api/restaurants/invitations/members`, `/api/restaurants/invitations/branches`, `/invite?type=rm\|rb` |
| Branches (legacy links)    | `/api/branches`                                                                                        |
| Restaurant pricing view    | `/api/restaurant-pricing/my-pricing`                                                                   |

---

## 6. Supplier tenant features

### 6.1 Navigation & operations

| Feature                                      | Web route                            | API                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard                                    | `/app/dashboard`                     | Stats                                                                                                                                                  |
| Products catalog management                  | `/app/products`                      | `/api/products` POST/PATCH                                                                                                                             |
| Product images / files                       | Products                             | `/api/files/presign`, attach                                                                                                                           |
| Bulk product image import (ZIP)              | Products → **Import Product Images** | `POST /api/supplier/products/images/import/*` — [bulk-product-image-import.md](../features/bulk-product-image-import.md)                               |
| Product thumbnails in catalog lists          | Products table/cart                  | `product.image_thumb_url` (optimized); falls back to `image_url`                                                                                       |
| Prices & price lists                         | —                                    | `/api/prices`                                                                                                                                          |
| Supplier inventory & stock                   | `/app/inventory`                     | `/api/inventory`                                                                                                                                       |
| Stock adjustments & alerts                   | Inventory                            | adjustments, `/alerts`                                                                                                                                 |
| Warehouses & fulfillment                     | Settings → Warehouses                | `/api/warehouses`, `/api/warehouses/routing/*`, `/api/suppliers/me/fulfillment`, `/api/orders/:id/warehouses` (flags: `warehouses`, `multi_warehouse`) |
| Supplier org & branches                      | `/app/org`                           | `/api/org`, `/api/org/branches`, `/api/org/context/switch` (flag: `multi_branch`)                                                                      |
| Branch manager invitations                   | `/app/org`, `/invite/branch`         | `/api/org/invitations`, `/api/public/invitations/branch` (flag: `multi_branch`; link-only, no email)                                                   |
| Orders (incoming)                            | `/app/orders`                        | `/api/orders` (auto warehouse assignment on create when multi-warehouse)                                                                               |
| Fulfillment board                            | `/app/fulfillment`                   | `/api/fulfillment/board`                                                                                                                               |
| Fulfillment waves / routes / exceptions      | Fulfillment                          | `/api/fulfillment/*`                                                                                                                                   |
| Restaurants (customers)                      | `/app/restaurants`                   | `/api/restaurants`                                                                                                                                     |
| Restaurant-specific pricing tiers            | —                                    | `/api/restaurant-pricing`                                                                                                                              |
| Invoices                                     | `/app/invoices`                      | `/api/invoices`                                                                                                                                        |
| Chat                                         | `/app/chat`                          | `/api/chat`                                                                                                                                            |
| Promotions management (plan) — UI: **Deals** | `/app/promotions`                    | `/api/promotions` (supplier CRUD, restaurant eligibility)                                                                                              |
| Reports & analytics (plan)                   | `/app/reports`                       | `/api/reports/supplier/*`                                                                                                                              |
| Tenant audit log (plan)                      | Settings → Activity                  | `/api/audit` (labeled filter dropdowns)                                                                                                                |
| Supplier command center                      | `/app/command-center`                | `GET /api/supplier/command-center` — [supplier-ops.md](../features/supplier-ops.md)                                                                    |
| Receivables & aging                          | Invoices page                        | `GET /api/supplier/invoices/receivables`, statement CSV                                                                                                |
| CSV product import                           | Products page                        | `POST /api/supplier/products/import/preview`, `/import` (optional `image_url` column)                                                                  |
| Supplier quote inbox                         | `/app/supplier/quotes`               | `/api/quote-requests/supplier/inbox`                                                                                                                   |
| Supplier profile & settings                  | `/app/supplier-settings`             | `/api/suppliers`                                                                                                                                       |

### 6.2 Supplier settings hub tabs

| Tab               | Capabilities                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| **Profile**       | Business profile, logo; address fields normalized from API JSON (`street` / `line1`, `region` / `state`) |
| **Contacts**      | Contact persons                                                                                          |
| **Business**      | VAT, legal, onboarding fields                                                                            |
| **Warehouses**    | Warehouse locations (plan limits); formatted address lines via `formatAddressLine`                       |
| **Delivery**      | Delivery zones / logistics settings                                                                      |
| **Branches**      | Supplier branch accounts                                                                                 |
| **Notifications** | Channel + category preferences                                                                           |
| **Plan**          | Subscription & usage                                                                                     |
| **Activity**      | Tenant audit log; human-readable action/resource filters                                                 |

| Feature                              | API                                              |
| ------------------------------------ | ------------------------------------------------ |
| Supplier self profile                | `GET /api/suppliers/me`                          |
| Followers / blocks (restaurant side) | Restaurant routes on `/api/suppliers/:id/follow` |

---

## 7. Platform admin features

### 7.1 Admin navigation

| Page                              | Web route                |
| --------------------------------- | ------------------------ |
| Admin Dashboard                   | `/app/admin`             |
| Supplier Admin (tenant-focused)   | `/app/admin/suppliers`   |
| Restaurant Admin (tenant-focused) | `/app/admin/restaurants` |

### 7.2 Admin dashboard tabs

| Tab                   | Capabilities                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Overview**          | MRR/ARR, tenant counts, alerts, KPIs                                                                                                       |
| **Activity**          | Recent platform activity feed                                                                                                              |
| **Tenants**           | List/search suppliers & restaurants, impersonate                                                                                           |
| **Subscriptions**     | All tenant subscriptions, plan changes, unlock, **Extend trial** (expired Free Trial)                                                      |
| **Plans**             | Create/edit subscription plans (limits + features JSON)                                                                                    |
| **Finance**           | GMV, outstanding, revenue by plan                                                                                                          |
| **Usage**             | Per-tenant usage meters & quota overrides                                                                                                  |
| **Features**          | Global + per-tenant feature flag overrides                                                                                                 |
| **Deals & Boosts**    | Approve/reject pending supplier deals; insights; boost pricing                                                                             |
| **Limit overrides**   | Per-tenant plan limit overrides                                                                                                            |
| **Platform settings** | Free Trial length (**7–90** days, default **30**) · Growth program: [supplier-customer-growth.md](../features/supplier-customer-growth.md) |
| **Health**            | DB pool, recent errors, system health                                                                                                      |
| **Audit**             | Admin audit log search & filters                                                                                                           |

### 7.3 Admin API capabilities (`/api/admin-dashboard`)

- Overview & conversion stats
- Plans CRUD
- Subscriptions list / update / preview plan change / unlock billing / **extend Free Trial**
- Usage per tenant
- Financial overview
- Audit logs
- Impersonate start/stop/status (`sessionId`, `acknowledgeSuspended`, `redirectTo`)
- Tenant list (suppliers, restaurants)
- Per-tenant entitlements & usage
- Limit overrides (create/delete)
- Feature flags: global list, patch global, tenant overrides CRUD
- Platform settings: `GET/PATCH /api/admin-dashboard/platform-settings` (`freeSandboxDays` **7–90**, default 30)
- Growth program: `GET/PATCH /api/admin-dashboard/growth-settings` (`referral_program_config`)
- Deal admin: approve/reject/pause; pending queue & insights
- System health

### 7.4 Legacy admin routes (`/api/admin`)

- Audit log export-style access
- Role-aware dashboard stats

---

## 8. Cross-cutting platform services

| Service                       | Description                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **File storage**              | S3/MinIO presigned uploads; product images (single + bulk ZIP job); server-side `putObject` for optimized imports; storage quota metering |
| **Notifications**             | In-app log, email (SMTP), WhatsApp (Meta Cloud API), Web Push (VAPID), Platinum outbound webhooks; user preferences                       |
| **Web Push (PWA)**            | `usePushNotifications`, service worker `static/sw.js`, `/api/push/*` (opt-in `push_enabled`)                                              |
| **Realtime**                  | Socket.IO for chat + layout events (cookie JWT auth; `getAppSocket()`; optional Redis adapter for multi-replica)                          |
| **Audit logging**             | Admin actions, impersonation, plan changes                                                                                                |
| **Conversion events**         | Upgrade funnel analytics (view plans, blocked limits, etc.)                                                                               |
| **System events**             | API error observability                                                                                                                   |
| **Redis**                     | Order calendar cache                                                                                                                      |
| **Rate limiting**             | Global, auth, public, staff-link, chat-send limiters                                                                                      |
| **Plan enforcement**          | `requireFeature()`, `checkLimit()`, usage meters                                                                                          |
| **Billing access middleware** | Locked tenants → billing/subscription routes only                                                                                         |
| **Monetization UI**           | Upgrade modals, limit banners, pay-overdue modal                                                                                          |
| **Impersonation banner**      | Sticky “Impersonating …” + exit; `useImpersonation` drives tenant UI                                                                      |
| **Branch context**            | Active branch cookie/header for multi-site ops                                                                                            |
| **i18n-ready product data**   | Product `name_ar`, `description_ar` fields                                                                                                |
| **Demo data & seeds**         | Extensive seed scripts for dev/demo                                                                                                       |

---

## 9. Subscriptions, plans & monetization

| Feature                  | API / UI                                   |
| ------------------------ | ------------------------------------------ |
| Current subscription     | `/api/subscriptions/current`               |
| Entitlements snapshot    | `/api/subscriptions/entitlements`          |
| Available plans catalog  | `/api/subscriptions/plans`                 |
| Usage per meter          | `/api/subscriptions/usage/:meter`          |
| Plan recommendation      | `/api/subscriptions/recommendation`        |
| Record conversion events | POST conversion events                     |
| Billing status           | `/api/billing/status`                      |
| Payment methods          | `/api/billing/payment-methods`             |
| Checkout / pay now       | `/api/billing/checkout`, `/pay-now`        |
| Auto-renew toggle        | `/api/billing/auto-renew`                  |
| Subscription billing job | Locks accounts, grace period (hourly cron) |
| Account activation page  | `/app/activate`                            |

**Plan tiers (examples in DB):** Free, Silver, Gold, Platinum (restaurant & supplier catalogs); features and limits vary by plan code.

---

## 10. RBAC permissions catalog

Tenant-scoped permissions (from `apps/api/src/lib/permissions.js`):

| Domain           | Permissions                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Orders           | `ORDERS_VIEW`, `ORDERS_CREATE`, `ORDERS_EDIT`, `ORDERS_MANAGE`                                   |
| Invoices         | `INVOICES_VIEW`, `INVOICES_CREATE`, `INVOICES_EDIT`, `INVOICES_MANAGE`                           |
| Inventory        | `INVENTORY_VIEW`, `INVENTORY_EDIT`, `INVENTORY_MANAGE`                                           |
| Reservations     | `RESERVATIONS_VIEW`, `RESERVATIONS_CREATE`, `RESERVATIONS_EDIT`, `RESERVATIONS_MANAGE`           |
| Staff            | `STAFF_VIEW`, `STAFF_INVITE`, `STAFF_EDIT`, `STAFF_MANAGE`                                       |
| Settings         | `SETTINGS_VIEW`, `SETTINGS_EDIT`, `SETTINGS_MANAGE`                                              |
| Chat             | `CHAT_VIEW`, `CHAT_SEND`, `CHAT_MANAGE`                                                          |
| Subscriptions    | `SUBSCRIPTIONS_VIEW`, `SUBSCRIPTIONS_MANAGE`                                                     |
| Catalog          | `CATALOG_VIEW`, `CATALOG_EDIT`, `CATALOG_MANAGE`                                                 |
| Warehouses       | `WAREHOUSES_VIEW`, `WAREHOUSES_EDIT`, `WAREHOUSES_MANAGE`                                        |
| Receiving        | `RECEIVING_VIEW`, `RECEIVING_MANAGE`                                                             |
| Payments         | `PAYMENTS_VIEW`, `PAYMENTS_MANAGE`                                                               |
| Fulfillment      | `FULFILLMENT_VIEW`, `FULFILLMENT_MANAGE`                                                         |
| Promotions       | `PROMOTIONS_VIEW`, `PROMOTIONS_MANAGE`                                                           |
| Customers        | `CUSTOMERS_IMPORT`, `CUSTOMERS_MANAGE`                                                           |
| Growth           | `GROWTH_VIEW`                                                                                    |
| Driver           | `DRIVER_DELIVERIES_VIEW`, `DRIVER_DELIVERIES_MANAGE`                                             |
| Recipes          | `RECIPES_VIEW`, `RECIPES_VIEW_COSTS`, `RECIPES_EDIT`, `RECIPES_MANAGE`                           |
| Admin (platform) | `ADMIN_ACCESS`, `ADMIN_TENANTS`, `ADMIN_PLANS`, `ADMIN_SUPPORT`, `ADMIN_FINANCE`, `ADMIN_GROWTH` |

Default roles seeded: restaurant owner, supplier owner, admin roles (see migrations `0041`, `0042`).

---

## 11. Subscription feature flags (plan entitlements)

Canonical keys in `apps/api/src/lib/feature-keys.js`:

### Restaurant plan features

| Key                     | Display name                                            |
| ----------------------- | ------------------------------------------------------- |
| `chat`                  | Chat                                                    |
| `order_calendar`        | Order calendar                                          |
| `reports`               | Reports & analytics                                     |
| `smart_reorder`         | Smart reorder                                           |
| `multi_branch`          | Multi-branch                                            |
| `receiving_quality`     | Receiving & quality                                     |
| `finance_invoices`      | Finance & invoices                                      |
| `quick_lists`           | Quick lists                                             |
| `inventory_management`  | Inventory management                                    |
| `waste_tracking`        | Waste tracking (inventory tab + analytics)              |
| `advanced_roles`        | Named tenant roles & custom role builder                |
| `disputes_returns`      | Disputes & returns                                      |
| `supplier_deals`        | Browse/redeem supplier deals                            |
| `supplier_deals_redeem` | Supplier deal redemptions (metered)                     |
| `order_amendments`      | Post-place order amendments                             |
| `supplier_reviews`      | Supplier reviews                                        |
| `push_notifications`    | Web push (PWA)                                          |
| `tenant_audit_log`      | Tenant activity log                                     |
| `waitlist_auto_promo`   | Waitlist auto-promotion                                 |
| `notifications`         | Notifications (tier: email / email+WhatsApp / +webhook) |
| `api_integrations`      | API integrations                                        |
| `support_sla`           | Support SLA                                             |
| `custom_branding`       | Custom branding                                         |
| `feature_flags_access`  | Feature flag admin (tenant)                             |
| `recipe_costing`        | Recipe costing & cost analysis                          |
| `fulfillment_tools`     | Fulfillment tools                                       |
| `ai_platform`           | AI platform (LLM reorder assistant)                     |

**Removed keys (not in catalog):** `approvals_budgets`

### Supplier plan features

| Key                    | Display name                                          |
| ---------------------- | ----------------------------------------------------- |
| `chat`                 | Chat                                                  |
| `order_calendar`       | Order calendar                                        |
| `reports`              | Reports & analytics                                   |
| `smart_reorder`        | Smart reorder                                         |
| `ai_platform`          | AI platform (LLM reorder assistant)                   |
| `multi_branch`         | Multi-branch org accounts                             |
| `warehouses`           | Warehouses                                            |
| `multi_warehouse`      | Multi-warehouse fulfillment                           |
| `fulfillment_tools`    | Fulfillment tools                                     |
| `fulfillment`          | Fulfillment (alias → `fulfillment_tools`)             |
| `driver_management`    | Driver management (alias → `fulfillment_tools`)       |
| `disputes_returns`     | Disputes & returns                                    |
| `finance_invoices`     | Finance & invoices                                    |
| `quick_lists`          | Quick lists                                           |
| `inventory_management` | Inventory management                                  |
| `advanced_roles`       | Named tenant roles                                    |
| `notifications`        | Notifications                                         |
| `api_integrations`     | API integrations                                      |
| `support_sla`          | Support SLA                                           |
| `custom_branding`      | Custom branding                                       |
| `feature_flags_access` | Feature flag admin                                    |
| `promotions`           | Deals (supplier plan feature; internal key unchanged) |
| `push_notifications`   | Web push                                              |
| `order_amendments`     | Order amendments                                      |
| `tenant_audit_log`     | Activity log                                          |
| `supplier_growth`      | Customer growth & referrals                           |

**Admin overrides:** global defaults + per-tenant overrides via Admin → Features tab.

---

## 12. Usage limits & meters

### Restaurant limits

| Meter key                   | Typical meaning       |
| --------------------------- | --------------------- |
| `branches`                  | Max branches          |
| `users`                     | Team users            |
| `orders_per_day`            | Daily order cap       |
| `suppliers_per_restaurant`  | Linked suppliers      |
| `restaurant_inventory_skus` | Inventory SKU count   |
| `chats_per_day`             | Chat messages per day |
| `storage_mb`                | File storage quota    |

### Supplier limits

| Meter key                | Typical meaning       |
| ------------------------ | --------------------- |
| `warehouses`             | Warehouse count       |
| `branches`               | Supplier org branches |
| `users`                  | Team users            |
| `supplier_products_skus` | Product SKU count     |
| `chats_per_day`          | Chat messages per day |
| `storage_mb`             | File storage quota    |

Overrides: admin can set per-tenant limit overrides; API returns `LIMIT_EXCEEDED` with upgrade CTA in UI.

---

## 13. Notifications & messaging channels

### Channels

| Channel  | Technology                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| In-app   | `notification_log` + header bell; toast/sound via `useNotificationAlerts`; **team-wide** `notifyTenantUsers`         |
| Email    | SMTP (Resend recommended)                                                                                            |
| WhatsApp | Meta Cloud API server send via `whatsapp.service.js` (tier + `whatsapp_enabled` + phone)                             |
| Webhook  | Platinum outbound HTTP (`notification/webhook.js`); tenant URL + secret in Settings                                  |
| Push     | Web Push via VAPID (`web-push`); `GET /api/push/vapid-public-key`, subscribe/unsubscribe; service worker at `/sw.js` |

### Notification categories (preference keys)

Orders (new, acknowledged, processing, shipped, delivered, cancelled/declined), messages, invoices (issued, overdue, collections reminders), payments, inventory (low/out of stock — supplier + restaurant), reservations (created, waitlist, staff events, guest confirm/cancel/reschedule), staff (PTO, swap, shift, announcements, documents), scheduled orders, disputes, amendments, billing lifecycle (trial, activate, renew, fail, lock, cancel, plan change), growth (connection request/accept/decline, referral, sponsorship), supplier reorder reminder send, role changed (email), driver milestones (in-app only), promotions, test.

### Triggers (examples)

- Order status changes (recipient = full tenant team; supplier decline → restaurant)
- New chat message
- Invoice overdue job
- Reservation created / waitlist
- Staff PTO/swap requests
- Guest reservation confirmations
- Scheduled quick-list order ran

---

## 14. Background jobs & automation

| Job                                       | Schedule                 | Purpose                                                                                       |
| ----------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| Scheduled quick-list orders               | Every 5 min (dev config) | Auto-create orders from quick lists                                                           |
| Invoice overdue check                     | Every 24h                | Mark overdue, notify                                                                          |
| Subscription billing                      | Every 1h                 | Grace period, account lock, renewals                                                          |
| Free Trial expiry (`free-sandbox-expiry`) | Every 1h + startup       | `notifyBillingTrialExpired` then lock; `notifyBillingAccountLocked`; read-only GET after lock |
| Trial ending soon                         | Every 1h                 | `notifyBillingTrialEnding` (2-day and 1-day reminders)                                        |
| Email retry / digest                      | 1h / 24h                 | Failed SMTP retry; daily digest for `notify_email_digest` users                               |
| Reservations schema ensure                | API startup              | Runtime migration guard                                                                       |
| Staff schema ensure                       | API startup              | Runtime migration guard                                                                       |

---

## 15. Integrations & infrastructure

| Integration          | Use                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keycloak**         | OIDC login, roles, self-registration, SSO logout (`post.logout.redirect.uris` on `supplify-api` / `supplify-web`; seeded in `realm-export.json`, applied by `keycloak-init.sh`) |
| **PostgreSQL**       | Primary database (~65 migrations)                                                                                                                                               |
| **Redis**            | Order calendar cache                                                                                                                                                            |
| **S3 / MinIO**       | Object storage for uploads                                                                                                                                                      |
| **Resend (SMTP)**    | Transactional email                                                                                                                                                             |
| **Web Push (VAPID)** | Browser push notifications (`VAPID_*` env on API)                                                                                                                               |
| **Socket.IO**        | Realtime chat + layout notifications                                                                                                                                            |
| **Docker Compose**   | Local full stack (Postgres, Redis, Keycloak, MinIO, nginx)                                                                                                                      |
| **Railway**          | Cloud deployment (dev / preprod / prod)                                                                                                                                         |
| **Local CI**         | `pnpm lint`, `pnpm test:ci`, `pnpm build` before deploy                                                                                                                         |
| **Playwright**       | E2E tests (`tests/e2e`)                                                                                                                                                         |
| **Semantic release** | Versioning (root config)                                                                                                                                                        |

---

## 16. Developer, QA & deployment tooling

| Capability                 | Command / location                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Monorepo (pnpm workspaces) | `apps/api`, `apps/web`, `infra`                                                                        |
| DB migrate                 | `pnpm db:migrate` (skips tenant role backfill when complete)                                           |
| Tenant role backfill       | `pnpm db:migrate-users-to-roles`                                                                       |
| Fast dev restart           | `pnpm dev -- --no-migrate`                                                                             |
| DB seed (many scenarios)   | `pnpm db:seed`, `seed:full`, `seed:demo-*`, etc.                                                       |
| Tier demo catalog (wipe)   | `pnpm seed:tier-catalog` — 1 restaurant + 1 supplier per Free/Silver/Gold; team logins; audit backfill |
| Feature demo data          | `pnpm seed:features` — disputes, deals, reports samples (uses Gold tier slugs)                         |
| Activity log backfill      | `pnpm seed:audit-backfill` — `order.created` / `product.created` from existing seed rows               |
| API unit tests (Vitest)    | `pnpm test:ci` (~207+ tests)                                                                           |
| Web unit tests             | Vitest in `apps/web`                                                                                   |
| E2E API tests              | `pnpm e2e`                                                                                             |
| E2E Playwright             | `pnpm e2e:playwright`                                                                                  |
| E2E reset-seed endpoint    | `POST /api/e2e/reset-seed` (when `E2E_SECRET` set)                                                     |
| OpenAPI generation         | `pnpm openapi:gen`                                                                                     |
| Local dev (native)         | `pnpm dev`                                                                                             |
| Local Docker stack         | `pnpm local:up`                                                                                        |
| Railway deploy             | `pnpm promote:preprod`, `pnpm promote:prod`                                                            |
| Branch deploy model        | `dev` → `preprod` → `prod`                                                                             |
| Manual QA checklist        | `docs/qa/regression-checklist.md`                                                                      |
| Tenant audit log (detail)  | `docs/features/tenant-audit-log.md`                                                                    |
| Tenant roles (detail)      | `docs/features/tenant-roles.md`                                                                        |
| Security audit notes       | `docs/security/security-audit-report.md`                                                               |
| Email operations           | `docs/operations/email-system.md`                                                                      |

---

## 17. Web route index

| Route                       | Page / purpose                                    |
| --------------------------- | ------------------------------------------------- |
| `/login`                    | Login                                             |
| `/register/complete`        | Post-signup tenant setup                          |
| `/`                         | Dashboard (auth)                                  |
| `/app`                      | Dashboard                                         |
| `/app/dashboard`            | Dashboard                                         |
| `/app/activate`             | Billing activation                                |
| `/app/products`             | Products                                          |
| `/app/products/:id`         | Product detail                                    |
| `/app/orders`               | Orders                                            |
| `/app/orders/:id`           | Order detail                                      |
| `/app/cart`                 | Cart                                              |
| `/app/quick-lists`          | Quick lists                                       |
| `/app/restaurant-inventory` | Restaurant inventory                              |
| `/app/onboarding`           | Restaurant onboarding (legacy path)               |
| `/app/receiving`            | Receiving                                         |
| `/app/reservations`         | Reservations                                      |
| `/app/staff`                | Staff HR                                          |
| `/app/suppliers`            | Suppliers                                         |
| `/app/suppliers/:id`        | Supplier detail                                   |
| `/app/restaurants`          | Restaurants (supplier view)                       |
| `/app/restaurants/:id`      | Restaurant detail                                 |
| `/app/settings`             | Settings (role-specific)                          |
| `/app/chat`                 | Chat                                              |
| `/app/fulfillment`          | Fulfillment                                       |
| `/app/inventory`            | Supplier inventory                                |
| `/app/invoices`             | Invoices                                          |
| `/app/supplier-settings`    | Supplier settings                                 |
| `/app/admin`                | Admin dashboard                                   |
| `/app/admin/suppliers`      | Admin → suppliers                                 |
| `/app/admin/restaurants`    | Admin → restaurants                               |
| `/app/reports`              | Reports & analytics (plan)                        |
| `/app/disputes`             | Disputes & returns (plan)                         |
| `/app/promotions`           | Supplier **Deals** management (route unchanged)   |
| `/legal/reaccept`           | Legal pack re-acceptance gate (stale acceptances) |
| `/app/deals`                | Restaurant active supplier deals                  |
| `/app/command-center`       | Supplier command center                           |
| `/app/quote-requests`       | Restaurant RFQ list                               |
| `/app/supplier/quotes`      | Supplier quote inbox                              |
| `/app/loyalty`              | B2B loyalty balances (restaurant)                 |
| `/app/consumer-loyalty`     | Consumer loyalty program admin                    |
| `/app/consumer-menu`        | Consumer menu admin                               |
| `/app/consumer-orders`      | Consumer guest orders                             |
| `/order/:restaurantSlug`    | Public consumer storefront                        |
| `/supplier/:idOrSlug`       | Public supplier mini-store                        |
| `/app/disputes`             | Disputes list (plan)                              |
| `/app/disputes/:id`         | Dispute detail                                    |
| `/app/reports`              | Reports & analytics (plan)                        |
| `/app/org`                  | Supplier org / branches                           |
| `/app/org/branches/:id`     | Branch detail                                     |
| `/invite`, `/invite/branch` | Team / branch invitations                         |
| `/reserve`                  | Public booking                                    |
| `/reserve/:idOrSlug`        | Public booking by restaurant                      |
| `/reserve/confirmation`     | Booking confirmed                                 |
| `/reserve/manage/:token`    | Manage booking                                    |
| `/staff`                    | Staff login                                       |
| `/staff/dashboard`          | Staff portal                                      |

---

## 18. API route index

| Prefix                          | Module                                                |
| ------------------------------- | ----------------------------------------------------- |
| `/health`                       | Health check                                          |
| `/auth/*`                       | Authentication                                        |
| `/api/register/*`               | Registration completion                               |
| `/api/products`                 | Catalog                                               |
| `/api/prices`                   | Pricing                                               |
| `/api/inventory`                | Supplier inventory                                    |
| `/api/suppliers`                | Suppliers                                             |
| `/api/restaurants`              | Restaurants                                           |
| `/api/orders`                   | Orders                                                |
| `/api/orders/calendar`          | Order calendar                                        |
| `/api/roles`                    | Tenant named roles (plan `advanced_roles`)            |
| `/api/credit-notes`             | Credit notes (disputes)                               |
| `/api/reports`                  | Restaurant & supplier analytics                       |
| `/api/disputes`                 | Disputes & returns                                    |
| `/api/promotions`               | Supplier promotions / restaurant deals (incl. banner) |
| `/api/search`                   | Unified product/supplier search + history             |
| `/api/loyalty`                  | B2B + consumer loyalty programs                       |
| `/api/consumer`                 | Consumer menu/orders/fulfillment (admin)              |
| `/api/public/consumer/:slug`    | Guest consumer ordering (public)                      |
| `/api/consumer-reviews`         | Consumer restaurant reviews                           |
| `/api/quote-requests`           | RFQ create/compare + supplier inbox                   |
| `/api/supplier`                 | Command center, receivables, import, ops              |
| `/api/reviews`                  | Supplier reviews (B2B)                                |
| `/api/audit`                    | Tenant audit log                                      |
| `/api/push`                     | Web Push VAPID + subscriptions                        |
| `/api/files`                    | File uploads                                          |
| `/api/admin`                    | Legacy admin                                          |
| `/api/chat`                     | Messaging                                             |
| `/api/invoices`                 | Invoices                                              |
| `/api/payments`                 | Payments                                              |
| `/api/quick-lists`              | Quick lists                                           |
| `/api/restaurant-inventory`     | Restaurant inventory                                  |
| `/api/restaurant-onboarding`    | Onboarding / team                                     |
| `/api/receiving`                | Receiving                                             |
| `/api/restaurant-finance`       | Finance                                               |
| `/api/reservations`             | Reservations (auth)                                   |
| `/api/staff`                    | Staff HR                                              |
| `/api/restaurant-pricing`       | Contract pricing                                      |
| `/api/notifications`            | Notifications                                         |
| `/api/subscriptions`            | Subscriptions                                         |
| `/api/billing`                  | Billing                                               |
| `/api/public`                   | Public portals                                        |
| `/api/admin-dashboard`          | Platform admin                                        |
| `/api/branches`                 | Restaurant linked branch accounts                     |
| `/api/org`                      | Supplier org, branches, users, context                |
| `/api/warehouses`               | Warehouses, zones, routing, inventory                 |
| `/api/suppliers/me/fulfillment` | Multi-warehouse supplier toggle                       |
| `/api/orders/:id/warehouses`    | Order warehouse assignments                           |
| `/api/fulfillment`              | Fulfillment                                           |
| `/api/e2e`                      | E2E helpers (gated)                                   |

---

## Related documentation

| Document                                                                             | Purpose                                                    |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [store-wide-deal-badges.md](../features/store-wide-deal-badges.md)                   | Supplier list on-sale badges                               |
| [supplier-follow.md](../features/supplier-follow.md)                                 | Follow/unfollow suppliers                                  |
| [quote-requests.md](../features/quote-requests.md)                                   | RFQ + public mini-store                                    |
| [supplier-ops.md](../features/supplier-ops.md)                                       | Command center, CSV import, bulk image import, receivables |
| [bulk-product-image-import.md](../features/bulk-product-image-import.md)             | ZIP / mapping CSV / URL image import                       |
| [search-and-discovery.md](../features/search-and-discovery.md)                       | Search API + history                                       |
| [consumer-ordering.md](../features/consumer-ordering.md)                             | Guest B2C ordering                                         |
| [restaurant-reviews.md](../features/restaurant-reviews.md)                           | Consumer restaurant reviews                                |
| [supplier-loyalty.md](../features/supplier-loyalty.md)                               | B2B loyalty earn/redeem                                    |
| [consumer-loyalty.md](../features/consumer-loyalty.md)                               | B2C loyalty program                                        |
| [waste-tracking.md](../features/waste-tracking.md)                                   | Restaurant waste & spoilage                                |
| [warehouse-fulfillment.md](../features/warehouse-fulfillment.md)                     | Warehouses, routing, order assignments                     |
| [deals-and-promotions.md](../features/deals-and-promotions.md)                       | Deals lifecycle & admin approval                           |
| [DEALS_BOOSTS_WORDING_CLEANUP.md](../ui/DEALS_BOOSTS_WORDING_CLEANUP.md)             | UI label map (Deals vs Boosts)                             |
| [LEGAL_PACK_REACCEPTANCE.md](../ui/LEGAL_PACK_REACCEPTANCE.md)                       | Legal pack login gate                                      |
| [2026-06-09-pre-deploy-checklist.md](../releases/2026-06-09-pre-deploy-checklist.md) | Coordinated release checklist                              |
| [disputes-returns.md](../features/disputes-returns.md)                               | Disputes & replacement orders                              |
| [BRANCHING.md](../BRANCHING.md)                                                      | dev → preprod → prod release chain                         |
| [supplier-branches.md](../features/supplier-branches.md)                             | Supplier org & branch accounts                             |
| [features.md](./features.md)                                                         | Shorter catalog + verification commands                    |
| [regression-checklist.md](../qa/regression-checklist.md)                             | QA smoke tests                                             |
| [admin_endpoints.md](../blueprint/admin/admin_endpoints.md)                          | Admin API reference                                        |
| [admin-feature-flags.md](../admin/admin-feature-flags.md)                            | Feature toggle API                                         |
| [email-system.md](../operations/email-system.md)                                     | Transactional email (SMTP)                                 |
| [SECURITY_AUDIT_REPORT.md](../security/SECURITY_AUDIT_REPORT.md)                     | Security posture                                           |

---

_This catalog is derived from the codebase (`apps/web`, `apps/api`, `docs/`, migrations). If a feature is behind a plan flag or permission, it may be hidden or API-blocked for tenants without entitlement._
