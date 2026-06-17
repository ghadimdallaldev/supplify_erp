# 17 — Glossary

**Audience:** Sales, support, onboarding specialists, developers, and customers who need a shared vocabulary for Supplify.

**Source of truth:** Application code (`apps/api`, `apps/web`), migrations, and companion docs in `docs/onboarding/`.

Terms are grouped by theme. Where a concept has both a **plan entitlement** (subscription feature) and an **RBAC permission**, both are noted — they are independent gates (see [09-authentication-rbac.md](./09-authentication-rbac.md) and [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md)).

---

## Platform & identity

### Tenant

A **tenant** is a billable organization row in the database: either a `restaurant` or a `supplier`. Every tenant has its own subscription, team, branding, and data isolation. API handlers resolve the active tenant via `tenant-resolve.js` (`getRestaurantIdForRequest`, `getSupplierIdForRequest`). Platform admins (`ADMIN` role) are not tenants.

### Workspace

A **workspace** is the authenticated product experience for one tenant. Users see one restaurant **or** one supplier workspace at a time. Table `user_workspace_membership` enforces **at most one** active restaurant or supplier account per user (migration `0104_user_workspace_membership.sql`). The account creator is **main admin** (`is_main_admin`) with the **Owner** system role.

### Organization (org)

Restaurant and supplier tenants can have an **organization** parent (`restaurant_organizations`, `supplier_organizations`) with child **branches**. Org-level billing rolls up to the root tenant via `resolveOrgBillingTenantId`. Multi-branch features require plan key `multi_branch` (Gold+ on paid tiers; enabled on Free Trial via Gold feature parity).

### Branch

A **branch** is a physical or logical site under an org: `restaurant_branch` or `supplier_branch`. Branches scope orders, inventory, quick lists, and delivery coordinates. Plan limit `branches` caps active locations (Free/Silver: 1; Gold: 3; Platinum: unlimited). Branch invites use `/invite/branch`.

### Platform role (`app_user.role`)

Keycloak-linked persona stored on `app_user`: `PENDING` (registration incomplete), `RESTAURANT`, `SUPPLIER`, `ADMIN`, or `STAFF_PORTAL`. This is **not** the same as tenant RBAC roles (Owner, Manager, etc.).

### Main admin

The user who created the tenant (`is_main_admin = true`). Cannot be removed without transfer. Always mapped to **Owner** unless explicitly reassigned within guard rules in `rbac-guards.js`.

### Pending activation

Subscription state `lock_reason = pending_activation` after registration. `billingAccessMiddleware` blocks writes until the user completes `/app/activate` (free or paid checkout). Distinct from Free Trial **sandbox expiry**.

### Free Trial / sandbox expiry

Free plan workspaces get `subscription.free_sandbox_expires_at` (default 7 days from `platform_setting.free_sandbox_days`). After expiry, account is locked: reads mostly allowed, writes return **402 Payment Required**.

---

## Access control

### RBAC (role-based access control)

**Tenant-scoped RBAC** maps users to roles (`tenant_user_roles`) and roles to permission keys (`tenant_role_permissions`). Canonical permission constants live in `apps/api/src/lib/permission-keys.js` (52 keys). Backend enforcement is mandatory via `requirePermission`; the React app mirrors checks for UX only.

### Permission

A granular capability key such as `ORDERS_CREATE`, `RECEIVING_MANAGE`, or `INVOICES_VIEW`. **`hasPermission`** treats domain `_MANAGE` as satisfying `_VIEW` / `_EDIT` checks. Permissions are cached in Redis (`perm:{userId}:{tenantId}:{tenantType}`, TTL ~180s).

### System role

Predefined role template synced per tenant from `role-matrix.js`: e.g. Restaurant **Owner**, **Purchaser**, **Receiving Staff**; Supplier **Warehouse Manager**, **Driver**. Owner has `permissions: 'ALL'`.

### Custom role

Tenant-defined role created under **Settings → Team → Roles** when plan feature `advanced_roles` is enabled (Gold+). Names cannot collide with reserved system role names. Assigner cannot grant permissions they do not hold.

### Admin permission

Platform-scoped keys for `ADMIN` users: `ADMIN_ACCESS`, `ADMIN_TENANTS`, `ADMIN_PLANS`, `ADMIN_SUPPORT`, `ADMIN_FINANCE`, `ADMIN_GROWTH`. Stored in legacy `role` / `role_permission` tables. Tab visibility in `/app/admin` follows `resolveAdminDashboardPermission()`.

### Entitlement

Runtime subscription payload from `GET /api/subscriptions/entitlements`: effective **plan**, **features**, **limits**, **usage**, overrides, and addons. Frontend hook: `useEntitlements()`. Entitlements answer: _did this tenant pay for the module?_

### Feature (plan feature key)

Boolean or tier string in `subscription_plan.features` JSON, e.g. `finance_invoices`, `smart_reorder`, `driver_management`. Enforced by `requireFeature()` → **403 FEATURE_NOT_AVAILABLE**. Canonical keys: `feature-keys.js`.

### Limit (plan limit key)

Numeric cap in plan JSON, e.g. `orders_per_day`, `warehouses`, `branches`. Value `-1` or `null` means unlimited. Enforced by `requireWithinLimit()` or inline `checkLimit()`. Resolution order: plan → plan override → tenant override → location addons.

### Feature gate vs permission gate

Both must pass for many actions:

| Layer        | Question              | Example                              |
| ------------ | --------------------- | ------------------------------------ |
| Entitlement  | Tenant on right plan? | `disputes_returns` for dispute API   |
| RBAC         | User allowed?         | `RECEIVING_MANAGE` to post receiving |
| Billing lock | Account writable?     | Not locked / not expired Free Trial  |

### Impersonation

Admin **view-as** tenant workflow. Cookie `impersonation_token` (JWT signed with `IMPERSONATION_SECRET`). Requires `ADMIN_SUPPORT` or `SUPER_ADMIN`. Effective permissions come from **view-as role**, not blanket Owner bypass. Cleared on login/logout. Documented in `impersonation.js`.

### Staff portal

Separate operational surface for restaurant **scheduling staff** (`STAFF_PORTAL` app role, Keycloak `staff_portal`). Not tenant Team RBAC. Allowlisted API paths only; home `/staff/dashboard`.

---

## Commerce & orders

### Customer order

B2B order from restaurant to supplier (`customer_order` + line items). Status lifecycle includes placement, supplier acceptance/decline, fulfillment, delivery, invoicing. Restaurants need `ORDERS_CREATE`; suppliers need `ORDERS_VIEW` / `ORDERS_MANAGE` to decline or manage.

### Quick list / ordering list

Saved reorder template (`quick_list`, `quick_list_item`). UI label **Ordering Lists**; route `/app/quick-lists`. Plan feature `quick_lists`; limits `quick_lists`, `quick_list_items`, `scheduled_quick_lists`. Can scope to `branch_id`.

### Scheduled quick list

Quick list with `is_scheduled = true` for automated or calendar-driven reorder. Free Trial has hidden limit `scheduled_order_grace_per_day` (one daily order overflow).

### Smart reorder

Restaurant feature `smart_reorder` (Gold+): cadence detection, at-risk SKUs, dashboard widgets. Uses `reorder-cadence` service and optional `ai_platform` LLM assistant (`ai_requests_per_day` limit on Gold/Platinum).

### Reorder cadence

Computed ordering rhythm per restaurant SKU/branch from historical order and inventory signals. API: `POST /api/restaurant-inventory/reorder-cadence/recompute`; supplier at-risk view: `GET /api/supplier/reorder-cadence/at-risk`. Requires inventory + smart reorder entitlements.

### Order amendment

Post-placement change request (`order_amendments` tables). Plan feature `order_amendments` (all tiers including Free Trial). Restaurant accepts/rejects; does not silently mutate lines without workflow.

### Substitution

Supplier-proposed replacement product when original is unavailable. Creates `order_fulfillment_issue` with status `substitution_suggested` and may spawn pending **amendment** for mapped products. Order lines are **not** auto-changed. API under `/api/supplier/orders/:orderId/fulfillment-issues/substitution`.

### Shortage

Supplier-reported inability to fulfill ordered quantity. Creates fulfillment issue `shortage_reported`; may open contextual chat (`ORDER_REFERENCE` message type).

### Fulfillment

Supplier-side pick/pack/dispatch workflow. Plan features `fulfillment` and/or `fulfillment_tools` (supplier only; off for restaurants). Permissions `FULFILLMENT_VIEW`, `FULFILLMENT_MANAGE`. UI: `/app/fulfillment` board, routes, warehouse assignment.

### Fulfillment issue

Structured shortage/substitution record (`order_fulfillment_issue`, migration `0134_order_fulfillment_issues.sql`). Statuses: `shortage_reported`, `substitution_suggested`, `waiting_restaurant_approval`, `accepted`, `rejected`.

### Decline reason

Supplier rejection of an order with coded/text reason before fulfillment starts. Requires `ORDERS_MANAGE`.

### Contract pricing

Negotiated price list between supplier and restaurant; overrides catalog default on eligible lines.

### Supplier follow

Restaurant relationship `restaurant_supplier_follow` / `supplier_follow`. Limit `suppliers_per_restaurant` by plan.

### Deal / promotion

Supplier commercial offer. Restaurant redemption: `supplier_deals`, `supplier_deals_redeem`; supplier promos: `promotions` with limit `promotions`. Admin may approve certain deal types.

### Quote request

Restaurant-initiated RFQ-style flow to supplier outside standard catalog checkout (see product guide).

### B2C consumer order

Public storefront order at `/order/:restaurantSlug` — separate from B2B `customer_order` procurement.

---

## Logistics & receiving

### Warehouse

Supplier ship-from location (`warehouse` table). Plan feature `warehouses`; limit `warehouses` (0 on Free = feature effectively off; Silver: 1; Gold: 3; Platinum: ∞). Permissions `WAREHOUSES_VIEW`, `WAREHOUSES_EDIT`, `WAREHOUSES_MANAGE`. Multi-warehouse routing: `multi_warehouse` (Gold+).

### Receiving

Restaurant confirmation of goods delivered against an order. Plan feature `receiving_quality` (photos, quality scoring tiers). Permissions `RECEIVING_VIEW`, `RECEIVING_MANAGE`. API: `receiving.routes.js`. Distinct from supplier warehouse **receiving** in inventory context.

### Receiving session

Structured receive flow tying order lines to quantities received, optional quality photos/scores, and optional lot creation.

### Proof of delivery (POD)

Driver-captured evidence (notes, optional photo) on `delivered` transition. Driver permissions `DRIVER_DELIVERIES_MANAGE`.

### Delivery status

Driver assignment lifecycle: `assigned` → `picked_up` → `out_for_delivery` → `delivered` | `failed` | `rescheduled`. API: `PATCH /api/orders/:id/delivery-status`.

### Driver route

Ordered sequence of delivery stops (`fulfillment` routes API). Driver can build route from assignments: `POST /api/fulfillment/routes/build-from-assignments`.

### GPS tracking / ETA

Live driver location shared during `out_for_delivery` when supplier plan and restaurant **delivery coordinates** are set. Restaurant map privacy: driver-focused surfaces per product rules.

### Delivery coordinates

Latitude/longitude on restaurant or branch (`PATCH /api/restaurants/me/delivery-location`). Required for accurate ETA — street address alone is insufficient.

---

## Inventory & quality

### Restaurant inventory

On-hand stock per restaurant SKU (`restaurant_inventory`). Plan feature `inventory_management`; limit `restaurant_inventory_skus`.

### Inventory lot

Batch-level record (`restaurant_inventory_lot`) with `quantity`, `expiry_date`. Status at read time: `safe`, `expiring_soon`, `expired` (default threshold 7 days). Platinum tier string includes `lot_expiry_tracking`. Migration `0133_restaurant_inventory_lots.sql`.

### Supplier inventory

Warehouse-scoped available quantity (`inventory` / `available_qty` on supplier side). Drives fulfillment shortage detection.

### Waste tracking

Restaurant feature `waste_tracking` for recording spoilage/shrink with analytics tiers on paid plans.

### Stock status

Computed label (in stock, low, out) from thresholds — aggregate quantity; expiry handled at lot level.

### Dispute

Post-receiving disagreement (quality, quantity). Plan `disputes_returns`. May escalate to returns workflow.

### Quality score

Optional numeric/structured score on receiving when plan tier enables `receiving_quality` quality scoring (Gold+).

---

## Finance

### Invoice

Bill document tied to fulfilled/delivered orders. Plan feature `finance_invoices`. Permissions `INVOICES_VIEW`, `INVOICES_CREATE`, `INVOICES_EDIT`, `INVOICES_MANAGE`.

### Receivable

Supplier-side outstanding amount owed by restaurants (`GET /api/supplier/invoices/receivables*`). Requires `INVOICES_VIEW` + `finance_invoices` feature.

### Payable (restaurant)

Restaurant-side obligation to pay supplier invoices; recorded payments reduce open balance.

### Aging

Buckets of open receivables/payables by days outstanding (e.g. current, 30, 60, 90+). Shown in finance dashboards when `finance_invoices` tier includes analytics.

### Payment recording

Manual or stub-gateway payment applied to invoice (`PAYMENTS_VIEW`, `PAYMENTS_MANAGE`). Accountant role typical owner.

### Account statement

Period summary of orders, invoices, and payments between restaurant and supplier pair.

### Billing checkout

`POST /api/billing/checkout` — activates plan, clears `pending_activation`, or upgrades tier. Stub card `4242424242424242` when `BILLING_GATEWAY=stub`.

### Plan code

Canonical subscription tier: `free`, `silver`, `gold`, `platinum` (`plan-codes.js`). Legacy `enterprise` deactivated; `bronze` aliases to `silver`.

### Pending downgrade

`subscription.pending_plan_id` + `pending_effective_at` — lower tier applies on next billing cycle read.

### Limit override / feature override

Admin or growth tools to raise caps (`tenant_limit_override`, `plan_limit_override`) or toggle features (`feature-flags.js`) without changing base plan row.

---

## Growth & discovery

### Supplier growth

Supplier feature `supplier_growth` — referrals, customer import, command-center analytics. Free Trial includes via migration `0175`.

### Mini-store / public catalog

Unauthenticated supplier catalog at `/supplier/:idOrSlug` for discovery and quote flows.

### Supplier review

Restaurant rating of supplier; feature `supplier_reviews`.

### Referral token

`referralToken` on `POST /api/register/complete` from `/register?ref=…` linking new tenant to growth program.

### Customer import

Supplier bulk import of restaurant contacts (`CUSTOMERS_IMPORT` permission).

---

## Reservations & FOH

### Reservation

Table booking for restaurant FOH. Permissions `RESERVATIONS_*`. Public guest flow at `/reserve`.

### Waitlist

Queue when no tables available; feature `waitlist_auto_promo` for auto-promotion rules (Gold+).

### FOH Staff

Restaurant system role with reservations permissions only — no order create.

---

## Chat & notifications

### B2B chat

Tenant messaging with plan feature `chat` (tiered: multi_supplier, group_chat_files, real_time_media). Limits `chats_per_day`, `open_conversations`.

### ORDER_REFERENCE message

Chat message type linking thread to specific order — used in substitution/shortage flows.

### Push notification

Mobile/web push when `push_notifications` enabled; requires device registration.

### Notification preference

Per-user/category opt-in stored in notification settings (e.g. `notify_inventory_expiring`).

---

## Admin & platform

### Super Admin

Platform role with all `ADMIN_*` permissions.

### Support Admin

`ADMIN_ACCESS`, `ADMIN_TENANTS`, `ADMIN_SUPPORT` — tenant directory, impersonation, password reset.

### Finance Admin

Billing overview, revenue metrics — `ADMIN_FINANCE`.

### Growth Admin

Feature flags, deal approvals, experiments — `ADMIN_GROWTH`.

### Audit log

Platform and tenant activity records. Tenant feature `tenant_audit_log` (Gold+). Admin audit at `/app/admin` → Audit.

### Feature flag

Runtime toggle layered on plan JSON via `resolveFeatureEnabled()` — may enable beta features without plan migration.

### Conversion event

Monetization telemetry when user hits `BLOCKED_FEATURE` or `BLOCKED_LIMIT` — feeds admin conversion stats.

---

## Technical

### PWA (Progressive Web App)

Web app installable on mobile/desktop with service worker caching (`apps/web` Vite PWA plugin). Driver and field workflows are **PWA-friendly** (offline-limited; mutations require network). Not a separate native app — see `supplify-mobile` for React Native parity.

### OIDC / Keycloak

Identity provider for login. Authorization code flow via `/auth/login` → Keycloak → `/auth/callback`. Tokens in HttpOnly cookies (`access_token`, `refresh_token`).

### CSRF token

`X-CSRF-Token` header on state-changing API calls when using cookie auth.

### RTK Query

Redux Toolkit data layer in `apps/web` for API hooks (`useGetEntitlementsQuery`, etc.).

### Tenant context

Request attachment from `resolveTenantContext`: `tenantId`, `tenantType`, `permissions`, active branch.

### Active tenant cookie

`active_tenant` — branch/workspace switcher state for multi-branch users.

### Redis cache

Shared cache for permissions, entitlements, subscription (recommended production: `REDIS_URL`).

### Migration

Sequential SQL file in `apps/api/migrations/` — schema source of truth alongside runtime code.

### Route inventory

Machine-readable API catalog `docs/audits/route-inventory.json` (554 routes as of 2026-06-17).

---

## Acronyms

| Acronym | Meaning                                        |
| ------- | ---------------------------------------------- |
| B2B     | Business-to-business (restaurant ↔ supplier)  |
| B2C     | Business-to-consumer (public menu orders)      |
| ETA     | Estimated time of arrival (delivery)           |
| FOH     | Front of house (reservations, guest-facing)    |
| GPS     | Global positioning system (driver location)    |
| KPI     | Key performance indicator (dashboards/reports) |
| LLM     | Large language model (AI reorder assistant)    |
| MOQ     | Minimum order quantity (supplier policy)       |
| OIDC    | OpenID Connect (auth protocol)                 |
| POD     | Proof of delivery                              |
| PTO     | Paid time off (staff portal)                   |
| PWA     | Progressive Web App                            |
| RBAC    | Role-based access control                      |
| RFQ     | Request for quote                              |
| SKU     | Stock keeping unit (product identifier)        |
| SLA     | Service level agreement (support tier)         |
| VAT     | Value-added tax identifier                     |

---

## Related docs

- [09-authentication-rbac.md](./09-authentication-rbac.md) — permissions and roles in depth
- [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md) — feature and limit matrices
- [02-complete-product-guide.md](./02-complete-product-guide.md) — feature-to-route mapping
- [11-api-and-workflow-reference.md](./11-api-and-workflow-reference.md) — API workflows
