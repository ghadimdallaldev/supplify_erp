# Supplier onboarding guide

End-to-end onboarding for a **supplier** tenant: from first login through catalog, fulfillment, billing, and day-two operations. Routes and APIs match `apps/web/src/App.tsx` and the live API surface as of the current codebase.

**Primary persona:** Supplier owner or ops manager with `Org Owner` / `SETTINGS_MANAGE` permissions unless noted.

---

## Step 1 — Create your Supplify login (Keycloak)

| Field                    | Detail                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Obtain a Supplify identity before any tenant exists.                                                                            |
| **Who**                  | Future supplier owner (no tenant yet).                                                                                          |
| **Navigation path**      | `/login` → **Register** (redirects to `/auth/register` → Keycloak hosted registration).                                         |
| **Required data**        | Email, password, name (Keycloak fields).                                                                                        |
| **Expected result**      | Keycloak account exists; first app login creates `app_user` with `role: PENDING`.                                               |
| **Possible errors**      | Duplicate email in Keycloak; email verification required (realm policy); network/CORS to auth server.                           |
| **Validation checklist** | [ ] Can open `/login` without console errors. [ ] Register completes in Keycloak. [ ] First login redirects away from `/login`. |

**API:** OAuth/session via Keycloak; app session established through normal auth middleware. `GET /api/auth/me` returns `role: "PENDING"` until registration completes.

---

## Step 2 — Complete supplier organization setup

| Field                    | Detail                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Create supplier tenant, organization, default catalog, warehouse scaffold, and subscription row.                                                                                                                                                                   |
| **Who**                  | Authenticated user with `PENDING` role.                                                                                                                                                                                                                            |
| **Navigation path**      | Auto-redirect to `/register/complete` (also enforced by `AuthGuard` when `needsSetup === true`).                                                                                                                                                                   |
| **Required data**        | Account type **Supplier**, business name (required), phone (optional), legal acceptance checkboxes. Optional `referralToken` from `/register?ref=…`.                                                                                                               |
| **Expected result**      | `POST /api/register/complete` with `accountType: "SUPPLIER"` creates `supplier`, `supplier_organizations`, default `catalog`, system roles, and `subscription` with `lock_reason = pending_activation`. User role becomes `SUPPLIER`. Redirect to `/app/activate`. |
| **Possible errors**      | `409` — email already linked to a tenant; `409` — user already has workspace membership; validation on empty business name.                                                                                                                                        |
| **Validation checklist** | [ ] `GET /api/register/status` → `{ needsSetup: false }` after complete. [ ] `GET /api/auth/me` → `role: "SUPPLIER"`, tenant id present. [ ] `/app/activate` loads (other `/app/*` routes blocked until unlocked).                                                 |

**API:** `GET /api/register/status`, `POST /api/register/complete` (`accountType`, `businessName`, `phone?`, `referralToken?`, legal payload).

---

## Step 3 — Activate your workspace (billing)

| Field                    | Detail                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Clear `pending_activation` so write APIs and full navigation unlock.                                                                                                    |
| **Who**                  | Supplier owner on new tenant.                                                                                                                                           |
| **Navigation path**      | `/app/activate`                                                                                                                                                         |
| **Required data**        | **Activate free plan** (no card) or paid plan via upgrade modal (`POST /api/billing/checkout` with `planId`; stub card `4242424242424242` when `BILLING_GATEWAY=stub`). |
| **Expected result**      | `account_locked_at` cleared; `GET /api/billing/status` → `access.pendingActivation: false`, `access.isLocked: false`. Redirect to `/app` (supplier home).               |
| **Possible errors**      | `402` on writes while still locked; checkout validation for paid tiers; plan catalog empty if migrations/seeds not run.                                                 |
| **Validation checklist** | [ ] Free activation succeeds without payment method. [ ] Sidebar appears with supplier sections. [ ] `POST` to catalog/orders no longer returns activation lock.        |

**API:** `GET /api/billing/status`, `POST /api/billing/checkout`, `GET /api/subscriptions/entitlements`.

---

## Step 4 — Configure supplier profile & branding

| Field                    | Detail                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Publish trustworthy business identity for restaurants and public mini-store.                                                              |
| **Who**                  | User with `SETTINGS_VIEW` / `SETTINGS_MANAGE`.                                                                                            |
| **Navigation path**      | Sidebar **Settings** → `/app/settings` (renders `SupplierSettingsPage`) or deep link `/app/supplier-settings?tab=profile`                 |
| **Required data**        | Legal name, logo, contact email/phone, address, VAT/tax IDs, public slug (used at `/supplier/:idOrSlug`).                                 |
| **Expected result**      | `GET /api/suppliers/me` reflects updates; `PATCH /api/suppliers/:id` persists profile fields; public catalog page shows branding.         |
| **Possible errors**      | Duplicate slug; permission denied without `SETTINGS_MANAGE`; image upload failures (storage config).                                      |
| **Validation checklist** | [ ] Profile tab saves without error. [ ] `/supplier/{slug}` loads publicly. [ ] Logo and name visible on supplier detail for restaurants. |

**API:** `GET /api/suppliers/me`, `PATCH /api/suppliers/:id`.

---

## Step 5 — Business policies, hours, and terms

| Field                    | Detail                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Set MOQ, payment terms, return policy, business hours, blackout dates restaurants see at order time.               |
| **Who**                  | Supplier settings manager.                                                                                         |
| **Navigation path**      | `/app/settings` → **Business** tab (`?tab=business`)                                                               |
| **Required data**        | Minimum order amount, payment terms text, business hours JSON, holiday/blackout dates (optional).                  |
| **Expected result**      | Business rules stored on `supplier` row; enforced or displayed in catalog/checkout flows per product docs.         |
| **Possible errors**      | Invalid JSON for hours; numeric validation on MOQ.                                                                 |
| **Validation checklist** | [ ] Business tab persists after refresh. [ ] MOQ visible on supplier profile or order validation where applicable. |

**API:** `PATCH /api/suppliers/:id` (business fields from onboarding migration `0005_supplier_onboarding.sql`).

---

## Step 6 — Warehouses & fulfillment mode

| Field                    | Detail                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Define ship-from locations and fulfillment behavior (required before inventory-backed dispatch on higher tiers).                                |
| **Who**                  | User with `WAREHOUSES_VIEW` / warehouse manage permissions.                                                                                     |
| **Navigation path**      | `/app/settings` → **Warehouses** tab (`?tab=warehouses`)                                                                                        |
| **Required data**        | Warehouse name, address, active flag; fulfillment toggles via `PATCH /api/suppliers/me/fulfillment`.                                            |
| **Expected result**      | At least one active warehouse; fulfillment settings align with plan entitlements (`fulfillment` feature).                                       |
| **Possible errors**      | Plan limit on warehouse count; feature gated on Free tier.                                                                                      |
| **Validation checklist** | [ ] Default warehouse exists post-registration. [ ] Can add/edit warehouse on entitled plan. [ ] Fulfillment page respects warehouse selection. |

**API:** Warehouse CRUD under `/api/suppliers/me/warehouses`; `PATCH /api/suppliers/me/fulfillment`.

---

## Step 7 — Team members, roles, and invitations

| Field                    | Detail                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Delegate catalog, orders, fulfillment, or driver access without sharing owner credentials.                                                                  |
| **Who**                  | Owner or user with staff/team permissions.                                                                                                                  |
| **Navigation path**      | `/app/settings` → **Team & roles** (`?tab=team`)                                                                                                            |
| **Required data**        | Invitee email, role (system or custom), optional name.                                                                                                      |
| **Expected result**      | Invite email sent; invitee accepts at `/invite?token=…&type=…` → `POST /api/invites/accept`; user bound to org workspace.                                   |
| **Possible errors**      | Seat/role limits on plan; email mismatch on invite accept; expired token.                                                                                   |
| **Validation checklist** | [ ] Invite link opens `/invite`. [ ] New member sees sidebar scoped to permissions. [ ] Driver role only sees **My Deliveries** (`/app/driver-deliveries`). |

**API:** Invite validate/accept routes; org role assignment via tenant RBAC.

---

## Step 8 — Register drivers (Gold+ / `driver_management`)

| Field                    | Detail                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Create driver records linked to users for last-mile delivery.                                                                                                      |
| **Who**                  | Supplier with `driver_management` entitlement and settings access.                                                                                                 |
| **Navigation path**      | `/app/settings` → **Drivers** tab (`?tab=drivers`)                                                                                                                 |
| **Required data**        | Driver name, phone, linked user account (invite or existing user).                                                                                                 |
| **Expected result**      | Driver appears in fulfillment dispatch board assignee list; linked user gets `DRIVER_DELIVERIES_VIEW`.                                                             |
| **Possible errors**      | Feature not on plan (Silver has fulfillment but not `driver_management`); user already linked to another driver; `403` from `requireFeature('driver_management')`. |
| **Validation checklist** | [ ] Driver list loads on Gold+. [ ] Assign driver action visible on `/app/fulfillment`. [ ] Driver can log in and open `/app/driver-deliveries`.                   |

**API:** Driver CRUD under supplier settings / fulfillment APIs.

---

## Step 9 — Build and publish product catalog

| Field                    | Detail                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | List SKUs restaurants can browse, price, and order.                                                                      |
| **Who**                  | User with `CATALOG_VIEW` / `CATALOG_EDIT`.                                                                               |
| **Navigation path**      | Sidebar **Products** → `/app/products`; detail → `/app/products/:id`                                                     |
| **Required data**        | Product name, SKU, unit, price, category, status (`ACTIVE`), images, stock/availability as applicable.                   |
| **Expected result**      | `GET /api/products` lists tenant products; restaurants with relationship see items in `/app/products` (restaurant view). |
| **Possible errors**      | Plan SKU limits; validation on duplicate SKU; inactive catalog.                                                          |
| **Validation checklist** | [ ] Create product succeeds. [ ] Product visible to test restaurant account. [ ] Edit from detail page persists.         |

**API:** `GET /api/products`, `POST /api/products`, `PATCH /api/products/:id`, `GET /api/products/:id`.

---

## Step 10 — Contract pricing for key accounts

| Field                    | Detail                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Offer negotiated prices per restaurant without changing list price globally.                                              |
| **Who**                  | Catalog/pricing manager.                                                                                                  |
| **Navigation path**      | Sidebar **Contract Pricing** → `/app/contract-pricing`                                                                    |
| **Required data**        | Restaurant target, product or category, contract price, effective dates.                                                  |
| **Expected result**      | Restaurant sees overrides on **My Prices** (`/app/my-prices` on their side); order lines use contract price when matched. |
| **Possible errors**      | Restaurant not linked; overlapping contract windows.                                                                      |
| **Validation checklist** | [ ] Contract row saved. [ ] Restaurant **My Prices** shows entry. [ ] Test order reflects contract line price.            |

**API:** Contract pricing endpoints under `/api/contract-pricing` (see feature catalog).

---

## Step 11 — Promotions and supplier deals

| Field                    | Detail                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Run time-boxed promotions visible in marketplace and restaurant **Deals** tab.                              |
| **Who**                  | User with `PROMOTIONS_VIEW` / `PROMOTIONS_MANAGE` on entitled plan.                                         |
| **Navigation path**      | Sidebar **Deals** → `/app/promotions`                                                                       |
| **Required data**        | Deal type, discount, eligibility, schedule, optional payment for featured placement.                        |
| **Expected result**      | Active promotion on `GET /api/suppliers` (`has_store_deal`); restaurants browse `/app/deals`.               |
| **Possible errors**      | Promotion limit per plan; admin approval required for some deal types.                                      |
| **Validation checklist** | [ ] Promotion activates within schedule. [ ] Badge on supplier list. [ ] Discount applies at cart/checkout. |

**API:** `/api/promotions/*` supplier routes.

---

## Step 12 — Customer growth & restaurant acquisition

| Field                    | Detail                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Invite restaurants via referral links and track conversion.                                                                                               |
| **Who**                  | User with `GROWTH_VIEW` (plan + permission).                                                                                                              |
| **Navigation path**      | Sidebar **Customer Growth** → `/app/customer-growth`                                                                                                      |
| **Required data**        | Referral link (`/register?ref=…`); optional growth campaign metadata.                                                                                     |
| **Expected result**      | Restaurant signup with `referralToken` records attribution, auto-follow, and trial/discount eligibility per `supplier-customer-growth` docs.              |
| **Possible errors**      | Growth feature disabled on plan; invalid referral token.                                                                                                  |
| **Validation checklist** | [ ] Referral URL copies from UI. [ ] Test restaurant registration attributes referral. [ ] Restaurant appears under **Restaurants** (`/app/restaurants`). |

**API:** `POST /api/register/complete` with `referralToken`; growth analytics on supplier growth page.

---

## Step 13 — Acknowledge and process restaurant orders

| Field                    | Detail                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Move orders from placed → acknowledged → processing → shipped.                                                                                                  |
| **Who**                  | User with `ORDERS_VIEW` / `ORDERS_MANAGE`.                                                                                                                      |
| **Navigation path**      | Sidebar **Orders** → `/app/orders`; detail → `/app/orders/:id`                                                                                                  |
| **Required data**        | Order id; status transitions; line adjustments if supported.                                                                                                    |
| **Expected result**      | Order timeline updates; restaurant sees mirrored status; notifications fire per preferences.                                                                    |
| **Possible errors**      | Invalid status transition; billing lock (`402`) on expired trial.                                                                                               |
| **Validation checklist** | [ ] Pending badge on sidebar decrements when orders handled. [ ] Status change reflected on restaurant `/app/orders/:id`. [ ] Chat thread available if enabled. |

**API:** `GET /api/orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id` (status updates).

---

## Step 14 — Fulfillment dispatch board

| Field                    | Detail                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Assign drivers, pick/pack/ship, and track delivery lifecycle (Silver+ `fulfillment`).                                                      |
| **Who**                  | User with `FULFILLMENT_VIEW` / `FULFILLMENT_MANAGE`.                                                                                       |
| **Navigation path**      | Sidebar **Fulfillment** → `/app/fulfillment` (tabs: Dispatch, Routes, Delivery Tracking, Exceptions)                                       |
| **Required data**        | Warehouse context, driver assignment, delivery status per order.                                                                           |
| **Expected result**      | Board shows Unassigned → Assigned → Picked up → Out for delivery → Delivered/Failed; `PATCH /api/orders/:id/delivery-status` is canonical. |
| **Possible errors**      | Feature off on Free; no driver on Silver (manual ship only); assignment to unlinked driver.                                                |
| **Validation checklist** | [ ] Dispatch tab loads on Silver+. [ ] Assign driver updates card. [ ] Delivery tracking drawer shows GPS when enabled.                    |

**API:** `GET /api/supplier/deliveries/board`, `PATCH /api/orders/:id/delivery-status`, `POST /api/fulfillment/routes`, fulfillment route stop APIs.

---

## Step 15 — Planned routes and activation

| Field                    | Detail                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Batch orders into routes before dispatch-ready, then activate when orders hit `PROCESSING`/`SHIPPED`.                                                              |
| **Who**                  | Fulfillment manager.                                                                                                                                               |
| **Navigation path**      | `/app/fulfillment` → **Routes** tab; dispatch board **Assign to planned route**                                                                                    |
| **Required data**        | Driver, order selection, route date; activation on ready stops.                                                                                                    |
| **Expected result**      | `delivery_route.status` moves `PLANNED` → `IN_PROGRESS`; eligible stops sync to live dispatch; GPS begins when assignments reach `picked_up` / `out_for_delivery`. |
| **Possible errors**      | Order on two active routes; cancelled order auto-removed; activate with zero ready stops (route still may start per docs).                                         |
| **Validation checklist** | [ ] Planned route badge on dispatch cards. [ ] Activate ready orders promotes stops. [ ] Restaurant map hidden until dispatch starts (privacy).                    |

**API:** `POST /api/fulfillment/routes`, `POST /api/fulfillment/routes/:id/stops`, `PATCH /api/fulfillment/routes/:id` `{ status: "IN_PROGRESS" }`.

---

## Step 16 — Invoices and revenue visibility

| Field                    | Detail                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Issue and track invoices where `finance_invoices` entitlement is enabled.                                              |
| **Who**                  | User with `INVOICES_VIEW`.                                                                                             |
| **Navigation path**      | Sidebar **Invoices** → `/app/invoices`                                                                                 |
| **Required data**        | Linked orders, invoice lines, tax fields per jurisdiction setup.                                                       |
| **Expected result**      | Invoice list and PDF/export per implementation; restaurant sees matching invoice.                                      |
| **Possible errors**      | Feature not on plan; order not in invoiceable state.                                                                   |
| **Validation checklist** | [ ] Invoice generates from delivered order. [ ] Restaurant `/app/invoices` shows record. [ ] Totals match order lines. |

**API:** `/api/invoices/*` (tenant-scoped).

---

## Step 17 — Command center, dashboard, and reports

| Field                    | Detail                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Monitor ops KPIs, GPS summary, and analytics exports.                                                                                                |
| **Who**                  | Owner/analyst with analytics permissions.                                                                                                            |
| **Navigation path**      | **Command Center** → `/app/command-center`; **Dashboard** → `/app/dashboard`; **Reports** → `/app/reports` (plan-gated)                              |
| **Required data**        | Date filters, report type selection.                                                                                                                 |
| **Expected result**      | `GET /api/admin/dashboard` returns supplier-scoped stats when impersonating; command center shows GPS today summary; reports export when entitled.   |
| **Possible errors**      | `reports` feature off; empty data on new tenant.                                                                                                     |
| **Validation checklist** | [ ] Home `/` or `/app` loads supplier home. [ ] Command center shows fulfillment/GPS widgets on Gold+. [ ] Reports page accessible on entitled plan. |

**API:** `GET /api/admin/dashboard` (supplier tenant context), reports endpoints under `/api/reports`.

---

## Step 18 — Disputes and delivery exceptions

| Field                    | Detail                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Resolve quantity/quality issues and failed deliveries with audit trail.                                            |
| **Who**                  | User with fulfillment/dispute permissions.                                                                         |
| **Navigation path**      | Sidebar **Disputes** → `/app/disputes`; detail → `/app/disputes/:id`                                               |
| **Required data**        | Dispute reason, evidence, resolution notes.                                                                        |
| **Expected result**      | Dispute state machine progresses; linked order/receiving records updated per workflow.                             |
| **Possible errors**      | Feature `disputes_returns` disabled; permission denied.                                                            |
| **Validation checklist** | [ ] Create/respond to dispute from list. [ ] Detail page shows order link. [ ] Sidebar badge clears when resolved. |

**API:** `/api/disputes/*`.

---

## Step 19 — Public mini-store and quote inbox

| Field                    | Detail                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Let prospects browse catalog publicly; respond to restaurant RFQs.                                                                      |
| **Who**                  | Sales/catalog staff.                                                                                                                    |
| **Navigation path**      | Public `/supplier/:idOrSlug`; **Quote inbox** → `/app/quote-requests/supplier` → `/app/quote-requests/supplier/:quoteRequestSupplierId` |
| **Required data**        | Published products; quote line pricing, lead times, notes.                                                                              |
| **Expected result**      | Guest/restaurant browsing without login (optional auth); quote responses visible to restaurant on `/app/quote-requests/:id`.            |
| **Possible errors**      | Unpublished catalog; quote deadline passed.                                                                                             |
| **Validation checklist** | [ ] Public URL works logged out. [ ] Quote appears in inbox. [ ] Response visible to restaurant.                                        |

**API:** `GET /api/suppliers/:id`, quote request supplier endpoints.

---

## Step 20 — Reporting, health checks, and troubleshooting

| Field                    | Detail                                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Diagnose common production issues without platform admin access.                                                                                                                                                                                                      |
| **Who**                  | Supplier owner or support lead.                                                                                                                                                                                                                                       |
| **Navigation path**      | `/app/settings` → **Plan & usage** (`?tab=plan`); **Activity** tab if `tenant_audit_log` enabled; `/app/chat` for support threads                                                                                                                                     |
| **Required data**        | Symptom description, order id, driver id, timestamp, browser/device for driver GPS issues.                                                                                                                                                                            |
| **Expected result**      | Entitlements explain missing nav items; billing status explains `402` writes; audit shows recent settings changes.                                                                                                                                                    |
| **Possible errors**      | Trial expired (read-only GET allowed, writes `402`); GPS env disabled (`VITE_GPS_TRACKING_ENABLED=false`); plan limit exceeded.                                                                                                                                       |
| **Validation checklist** | [ ] `GET /api/billing/status` matches UI lock state. [ ] `GET /api/subscriptions/entitlements` explains missing **Fulfillment** nav. [ ] Driver GPS: location permission + `POST /api/orders/:id/location` succeeds. [ ] Escalate to admin with tenant id + order id. |

### Quick troubleshooting reference

| Symptom                        | Likely cause            | Check                                                |
| ------------------------------ | ----------------------- | ---------------------------------------------------- |
| Stuck on `/register/complete`  | `needsSetup` true       | `GET /api/register/status`                           |
| All writes fail `402`          | Trial expired or locked | `GET /api/billing/status`                            |
| No Fulfillment nav             | Plan or feature flag    | Entitlements `fulfillment`                           |
| No driver assign               | `driver_management` off | Upgrade to Gold+                                     |
| GPS stale on map               | Driver permission / env | `GPS_STALE_AFTER_SECONDS`, driver browser            |
| Restaurant cannot see tracking | Dispatch not started    | Assignment must be `picked_up` or `out_for_delivery` |

**Support escalation payload:** tenant id (supplier uuid), `subscription_id`, affected `orderId`, screenshot of `/app/fulfillment` or driver portal, and `requestId` from failed API response.
