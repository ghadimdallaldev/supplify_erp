# Supplify Feature Catalog

Canonical list of all implemented features. Single source of truth for backend enforcement, frontend surfaces, permissions, and limits.

**Conventions**

- `feature_key`: stable string identifier
- `applies_to`: RESTAURANT | SUPPLIER | ADMIN | MULTI (multiple tenant types)
- Backend enforcement: file and method/route where access or limit is enforced
- Frontend surfaces: pages/components that expose the feature
- **PARTIAL**: Feature exists but enforcement or surface is incomplete
- **UNKNOWN**: Referenced but mapping unclear

---

## Orders

| feature_key     | display_name         | applies_to | permissions_required                   | limit_key      | backend_enforcement                                                                      | frontend_surfaces                      | plan_availability |
| --------------- | -------------------- | ---------- | -------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- | ----------------- |
| orders_list     | Order list & search  | MULTI      | ORDERS_VIEW                            | —              | apps/api/src/routes/orders.routes.js router.use(requirePermission('ORDERS_VIEW')), GET / | apps/web/src/pages/OrdersPage.tsx      | UNKNOWN           |
| order_detail    | Order detail view    | MULTI      | ORDERS_VIEW                            | —              | orders.routes.js GET /:id (tenant check)                                                 | apps/web/src/pages/OrderDetailPage.tsx | UNKNOWN           |
| order_create    | Create / place order | RESTAURANT | ORDERS_CREATE (not enforced per-route) | orders_per_day | orders.routes.js POST / checkLimit(restaurantId, 'RESTAURANT', 'orders_per_day')         | OrdersPage, CartPage flow              | UNKNOWN           |
| order_edit      | Edit / update order  | MULTI      | ORDERS_EDIT (not enforced per-route)   | —              | orders.routes.js PATCH /:id                                                              | OrderDetailPage                        | UNKNOWN           |
| orders_calendar | Orders calendar view | MULTI      | —                                      | —              | apps/api/src/routes/orders.calendar.routes.js requireAuth, getRequestTenant              | DashboardPage (CalendarView)           | Bronze+           |

**Flags**

- Order create: limit enforced (orders_per_day). No requirePermission('ORDERS_CREATE') on POST; router uses ORDERS_VIEW only. **PARTIAL**.

---

## Inventory

| feature_key          | display_name                        | applies_to | permissions_required                    | limit_key                                                         | backend_enforcement                                                                     | frontend_surfaces                      | plan_availability                                  |
| -------------------- | ----------------------------------- | ---------- | --------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| supplier_inventory   | Supplier inventory (stock)          | SUPPLIER   | INVENTORY_VIEW                          | —                                                                 | apps/api/src/routes/inventory.routes.js router.use(requirePermission('INVENTORY_VIEW')) | apps/web/src/pages/InventoryPage.tsx   | UNKNOWN                                            |
| restaurant_inventory | Restaurant inventory (par levels)   | RESTAURANT | INVENTORY_VIEW                          | restaurant_inventory_skus (distinct SKUs in restaurant_inventory) | restaurant-inventory.routes.js requirePermission('INVENTORY_VIEW')                      | RestaurantInventoryPage.tsx            | UNKNOWN                                            |
| inventory_edit       | Edit inventory / stock              | MULTI      | INVENTORY_EDIT (not enforced per-route) | —                                                                 | inventory.routes.js, restaurant-inventory.routes.js                                     | InventoryPage, RestaurantInventoryPage | UNKNOWN                                            |
| inventory_management | Inventory management (feature flag) | MULTI      | —                                       | —                                                                 | `requireFeature('inventory_management')` on inventory management routes                 | InventoryPage, RestaurantInventoryPage | All plans (requireFeature('inventory_management')) |

**Flags**

- SubscriptionInfo shows "Products" usage. Enforced in subscription.js checkLimit: supplier uses `supplier_products_skus` limit key; restaurant uses `restaurant_inventory_skus` limit key. **PARTIAL** (limit keys corrected from generic `products` to type-specific keys).

---

## Invoices

| feature_key        | display_name                                           | applies_to | permissions_required | limit_key | backend_enforcement                                                                                                        | frontend_surfaces                                                        | plan_availability                                                    |
| ------------------ | ------------------------------------------------------ | ---------- | -------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| invoices_list      | Invoice list                                           | MULTI      | INVOICES_VIEW        | —         | apps/api/src/routes/invoices.routes.js router.use(requirePermission('INVOICES_VIEW'))                                      | apps/web/src/pages/InvoicesPage.tsx                                      | finance_invoices feature — all plans (view on Free, more on Bronze+) |
| invoice_detail     | Invoice detail & PDF                                   | MULTI      | INVOICES_VIEW        | —         | invoices.routes.js GET /:id                                                                                                | InvoicesPage                                                             | finance_invoices feature — all plans (view on Free, more on Bronze+) |
| restaurant_finance | Restaurant finance (invoices, pay, analytics, overdue) | RESTAURANT | —                    | —         | apps/api/src/routes/restaurant-finance.routes.js `requireFeature('finance_invoices')`, requireRole(['RESTAURANT','ADMIN']) | InvoicesPage.tsx (invoices, pay, analytics); DashboardPage (Spend Trend) | finance_invoices feature gate applied                                |

**Flags**

- restaurant-finance.routes.js now has `requireFeature('finance_invoices')` applied (previously requireRole only — was marked **PARTIAL**).

---

## Reservations

| feature_key         | display_name                                      | applies_to     | permissions_required | limit_key | backend_enforcement                                                                           | frontend_surfaces                                                                                                       | plan_availability |
| ------------------- | ------------------------------------------------- | -------------- | -------------------- | --------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| reservations_board  | Reservations board & management                   | RESTAURANT     | RESERVATIONS_VIEW    | —         | apps/api/src/routes/reservations.routes.js router.use(requirePermission('RESERVATIONS_VIEW')) | ReservationsPage.tsx, ReservationBoard.tsx, ReservationCreateDrawer, ReservationTableBuilder, ReservationAnalyticsPanel | UNKNOWN           |
| public_reservations | Public reservation portal (book, confirm, manage) | MULTI (public) | —                    | —         | apps/api/src/routes/public.routes.js (no auth for book/confirm/manage by token)               | PublicReservationPortal.tsx, PublicReservationConfirmation.tsx, PublicReservationManage.tsx                             | UNKNOWN           |

---

## Chat

| feature_key        | display_name             | applies_to | permissions_required               | limit_key     | backend_enforcement                                                                                           | frontend_surfaces                    | plan_availability                                       |
| ------------------ | ------------------------ | ---------- | ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| chat_conversations | Chat conversations list  | MULTI      | CHAT_VIEW                          | —             | apps/api/src/routes/chat.routes.js router.use(requirePermission('CHAT_VIEW'))                                 | ChatPage.tsx                         | All plans (in-app basic), more channels on higher tiers |
| chat_send          | Send chat messages       | MULTI      | CHAT_SEND (not enforced per-route) | chats_per_day | chat.routes.js checkUsageWithWarning('chats_per_day') before send; incrementUsage('chats_per_day') after send | ChatPage                             | All plans (in-app basic), more channels on higher tiers |
| chat_feature_flag  | Chat feature flag (plan) | MULTI      | —                                  | —             | GET /api/subscriptions/features/:featureKey isFeatureEnabled(tenantId, tenantType, featureKey)                | SubscriptionInfo.tsx (features.chat) | UI label "Chat"; plan features JSONB                    |

**Flags**

- Chat send: limit enforced (chats_per_day). No requirePermission('CHAT_SEND') on send route. **PARTIAL**.

---

## Fulfillment

| feature_key      | display_name           | applies_to | permissions_required | limit_key | backend_enforcement                                                                                                | frontend_surfaces   | plan_availability                                                         |
| ---------------- | ---------------------- | ---------- | -------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------- |
| fulfillment_page | Fulfillment (supplier) | SUPPLIER   | —                    | —         | fulfillment.routes.js `requireFeature('fulfillment')`; supplier's dedicated route enforces feature gate            | FulfillmentPage.tsx | Bronze+                                                                   |
| receiving        | Receiving (restaurant) | RESTAURANT | —                    | —         | apps/api/src/routes/receiving.routes.js `requireFeature('receiving_quality')`, requireRole(['RESTAURANT','ADMIN']) | ReceivingPage.tsx   | receiving_quality feature — Bronze+ for photos, Gold+ for quality scoring |

**Flags**

- Fulfillment: `fulfillment.routes.js` uses `requireFeature('fulfillment')`. General fulfillment page concept is feature-gated.
- Receiving: now gated with `requireFeature('receiving_quality')` in addition to requireRole.

---

## Catalog (Products)

| feature_key    | display_name              | applies_to | permissions_required | limit_key              | backend_enforcement                                                                                                                      | frontend_surfaces        | plan_availability                 |
| -------------- | ------------------------- | ---------- | -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------- |
| products_list  | Product catalog list      | MULTI      | CATALOG_VIEW         | —                      | apps/api/src/routes/products.routes.js router.use(requirePermission('CATALOG_VIEW'))                                                     | ProductsPage.tsx         | UNKNOWN                           |
| product_detail | Product detail            | MULTI      | CATALOG_VIEW         | —                      | products.routes.js GET /:id                                                                                                              | ProductDetailPage.tsx    | UNKNOWN                           |
| product_create | Create product (supplier) | SUPPLIER   | —                    | supplier_products_skus | products.routes.js POST / checkLimit(supplierId, 'SUPPLIER', 'supplier_products_skus'); incrementUsage(..., 'supplier_products_skus', 1) | ProductsPage (supplier)  | SubscriptionInfo "Products" usage |
| product_edit   | Edit product              | SUPPLIER   | —                    | —                      | products.routes.js PATCH /:id                                                                                                            | ProductDetailPage        | UNKNOWN                           |
| prices         | Supplier pricing          | SUPPLIER   | —                    | —                      | apps/api/src/routes/prices.routes.js requireAuth, requireRole                                                                            | — (API only or embedded) | UNKNOWN                           |

---

## Warehouses & Branches

| feature_key     | display_name                   | applies_to | permissions_required | limit_key  | backend_enforcement                                                                                                                                                                                         | frontend_surfaces                                                                                 | plan_availability                               |
| --------------- | ------------------------------ | ---------- | -------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| warehouses      | Warehouses (supplier)          | SUPPLIER   | WAREHOUSES_VIEW      | warehouses | warehouses.routes.js `requireFeature('warehouses')`, `requirePermission('WAREHOUSES_VIEW')`; `checkWarehouseLimit` on create                                                                                | SupplierSettingsPage (Warehouses tab), InventoryPage, ProductsPage                                | Bronze+ (`warehouses` plan flag)                |
| multi_warehouse | Multi-warehouse fulfillment    | SUPPLIER   | WAREHOUSES_VIEW      | —          | `requireFeature('multi_warehouse')` on routing rules, simulate, per-warehouse inventory; suppliers.routes.js PATCH `/me/fulfillment`; `warehouseRouting.js` on order create when `fulfillment_mode = multi` | SupplierSettingsPage (fulfillment toggle), OrderDetailPage (split badges / multi-location banner) | Gold+; also `supplier.multi_warehouse_enabled`  |
| supplier_org    | Supplier org & branch accounts | SUPPLIER   | — (org roles)        | branches   | org.routes.js `requireSupplierOrgContext`; POST `/api/org/branches` requires `requireFeature('multi_branch')`; branch limit via plan `limits.branches`                                                      | OrgOverviewPage (`/app/org`), BranchSwitcher, migrate-suppliers-to-orgs.js                        | Gold+ (`multi_branch` on supplier plans)        |
| branch_invites  | Branch manager invite links    | SUPPLIER   | Org Owner            | —          | `branch-invitations.routes.js` + public accept; `requireFeature('multi_branch')`; 7-day tokens; hourly expiry job                                                                                           | AddBranchModal, BranchInvitationsPanel, `/invite/branch`                                          | Gold+ (`multi_branch`); no email delivery yet   |
| branches        | Branches (restaurant)          | RESTAURANT | SETTINGS_VIEW        | branches   | branches.routes.js `requirePermission('SETTINGS_VIEW')`; `checkBranchLimit(restaurantId)` on create                                                                                                         | RestaurantOnboardingPage (Branches tab), Settings, CalendarView, BranchSwitcher                   | plan-enforcement.js eligiblePlans Gold/Platinum |

---

## Quick Lists & Cart

| feature_key | display_name    | applies_to | permissions_required | limit_key                       | backend_enforcement                                                                                                                                               | frontend_surfaces  | plan_availability                                                                     |
| ----------- | --------------- | ---------- | -------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| quick_lists | Quick lists     | RESTAURANT | —                    | orders_per_day                  | apps/api/src/routes/quick-lists.routes.js `requireFeature('quick_lists')`, requireRole(['RESTAURANT','ADMIN']); checkLimit(..., 'orders_per_day') when scheduling | QuickListsPage.tsx | All plans (requireFeature('quick_lists') — enabled on all tiers including Free basic) |
| cart        | Cart & checkout | RESTAURANT | —                    | orders_per_day (on place order) | Orders flow                                                                                                                                                       | CartPage.tsx       | UNKNOWN                                                                               |

**Flags**

- Quick lists: `requireFeature('quick_lists')` now applied; uses requireRole (no requirePermission). Previously **PARTIAL**, now feature-gated.

---

## Staff

| feature_key        | display_name                                            | applies_to           | permissions_required | limit_key | backend_enforcement                                                                                           | frontend_surfaces                                        | plan_availability |
| ------------------ | ------------------------------------------------------- | -------------------- | -------------------- | --------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------- |
| staff_management   | Staff members, shifts, PTO, etc.                        | RESTAURANT           | STAFF_VIEW           | —         | apps/api/src/routes/staff.routes.js router.use(requirePermission('STAFF_VIEW'))                               | StaffPage.tsx                                            | UNKNOWN           |
| staff_self_service | Staff self-service (PTO, swap, dashboard, clock in/out) | MULTI (public token) | —                    | —         | apps/api/src/routes/public.routes.js staff link, session, PTO, swap, time-entries, check-in, check-out        | StaffSelfServiceLogin.tsx, StaffSelfServiceDashboard.tsx | UNKNOWN           |
| users_limit        | Restaurant team / users limit                           | RESTAURANT           | —                    | users     | apps/api/src/routes/restaurant-onboarding.routes.js checkLimit(restaurantId, 'RESTAURANT', 'users') on invite | RestaurantOnboardingPage (onboarding/invite)             | UNKNOWN           |

---

## Settings & Tenants

| feature_key       | display_name           | applies_to | permissions_required | limit_key                | backend_enforcement                                                                                                                     | frontend_surfaces                             | plan_availability |
| ----------------- | ---------------------- | ---------- | -------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------- |
| settings          | Tenant settings        | MULTI      | SETTINGS_VIEW        | —                        | branches.routes.js uses SETTINGS_VIEW; Settings page not explicitly gated by permission in code (Sidebar gates by can('SETTINGS_VIEW')) | SettingsPage.tsx, Sidebar (Settings link)     | UNKNOWN           |
| suppliers_list    | Suppliers (restaurant) | RESTAURANT | —                    | suppliers_per_restaurant | apps/api/src/routes/suppliers.routes.js checkLimit(restaurantId, 'RESTAURANT', 'suppliers_per_restaurant') on link                      | SuppliersPage.tsx, SupplierDetailPage.tsx     | UNKNOWN           |
| restaurants_list  | Restaurants (supplier) | SUPPLIER   | —                    | —                        | restaurants.routes.js requireAuth, requireRole                                                                                          | RestaurantsPage.tsx, RestaurantDetailPage.tsx | UNKNOWN           |
| supplier_settings | Supplier settings      | SUPPLIER   | —                    | —                        | —                                                                                                                                       | SupplierSettingsPage.tsx                      | UNKNOWN           |
| onboarding        | Restaurant onboarding  | RESTAURANT | —                    | users                    | restaurant-onboarding.routes.js, checkLimit users                                                                                       | RestaurantOnboardingPage.tsx                  | UNKNOWN           |
| advanced_roles    | Named tenant roles     | MULTI      | SETTINGS_VIEW (list) | —                        | tenant-roles.routes.js `requireFeature('advanced_roles')`; permissions on `auth/me` always resolved                                     | TeamRolesPanel (Settings → Team)              | Gold+             |
| tenant_audit_log  | Tenant activity log    | MULTI      | SETTINGS_VIEW        | —                        | tenant-audit.routes.js GET `/api/audit/logs`, `/logs/filters`, `/logs/export` (export: SETTINGS_MANAGE)                                 | ActivityLogTab (Settings → Activity)          | Gold+             |

---

## Subscriptions

| feature_key         | display_name                      | applies_to | permissions_required                          | limit_key | backend_enforcement                                                                             | frontend_surfaces                                                             | plan_availability   |
| ------------------- | --------------------------------- | ---------- | --------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------- |
| subscription_view   | View current subscription & usage | MULTI      | SUBSCRIPTIONS_VIEW                            | —         | apps/api/src/routes/subscriptions.routes.js router.use(requirePermission('SUBSCRIPTIONS_VIEW')) | Settings (SubscriptionInfo), GET /api/subscriptions/current, usage/:meterType | UNKNOWN             |
| subscription_manage | Change plan / billing             | MULTI      | SUBSCRIPTIONS_MANAGE (not enforced on routes) | —         | —                                                                                               | —                                                                             | UNKNOWN             |
| feature_flag_api    | Check feature by key (API)        | MULTI      | —                                             | —         | GET /api/subscriptions/features/:featureKey isFeatureEnabled(tenantId, tenantType, featureKey)  | SubscriptionInfo.tsx (chat, smart_reorder, reports, multi_branch)             | Plan features JSONB |

---

## Admin

| feature_key            | display_name                                                                                                       | applies_to | permissions_required | limit_key | backend_enforcement                                                                                                                                   | frontend_surfaces                                                                                                                                                                                  | plan_availability |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------- | -------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| admin_dashboard        | Admin dashboard (overview, plans, subscriptions, tenants, health, finance, usage, audit, impersonation, overrides) | ADMIN      | ADMIN_ACCESS         | —         | apps/api/src/routes/admin-dashboard.routes.js router.use(requireAuth, requireRole(['ADMIN']), resolveAdminContext, requirePermission('ADMIN_ACCESS')) | AdminDashboardPage.tsx (tabs: overview, plans, subscriptions, tenants, health, finance, usage, audit, impersonation); Sidebar shows admin nav for any ADMIN role (API still enforces ADMIN_ACCESS) | —                 |
| admin_audit            | Audit log                                                                                                          | ADMIN      | —                    | —         | admin-dashboard.routes.js GET /audit-logs                                                                                                             | AdminDashboardPage                                                                                                                                                                                 | —                 |
| admin_impersonation    | Impersonate tenant                                                                                                 | ADMIN      | —                    | —         | admin-dashboard.routes.js POST /impersonate, /impersonate/stop, GET /impersonate                                                                      | ImpersonationBanner, Admin UI                                                                                                                                                                      | —                 |
| admin_plans            | Manage subscription plans                                                                                          | ADMIN      | —                    | —         | admin-dashboard.routes.js GET/POST/PATCH /plans                                                                                                       | AdminDashboardPage Plans tab                                                                                                                                                                       | —                 |
| admin_subscriptions    | Manage tenant subscriptions                                                                                        | ADMIN      | —                    | —         | admin-dashboard.routes.js GET/PATCH /subscriptions, GET /usage/:tenantId                                                                              | AdminDashboardPage Subscriptions tab                                                                                                                                                               | —                 |
| admin_tenants          | List tenants (suppliers/restaurants)                                                                               | ADMIN      | —                    | —         | admin-dashboard.routes.js GET /tenants/suppliers, /tenants/restaurants                                                                                | AdminDashboardPage Tenants tab                                                                                                                                                                     | —                 |
| admin_override_limits  | Tenant limit overrides                                                                                             | ADMIN      | —                    | —         | admin-dashboard.routes.js POST/DELETE /tenants/:tenantType/:id/override-limit                                                                         | AdminDashboardPage                                                                                                                                                                                 | —                 |
| admin_dashboard_legacy | Legacy admin dashboard/audit                                                                                       | ADMIN      | —                    | —         | apps/api/src/routes/admin.routes.js GET /audit, GET /dashboard requireAuth, requireRole(['ADMIN'])                                                    | —                                                                                                                                                                                                  | —                 |

---

## Files & Storage

| feature_key | display_name | applies_to | permissions_required | limit_key  | backend_enforcement                                                                | frontend_enforcement | plan_availability |
| ----------- | ------------ | ---------- | -------------------- | ---------- | ---------------------------------------------------------------------------------- | -------------------- | ----------------- |
| file_upload | File upload  | MULTI      | —                    | storage_mb | apps/api/src/routes/files.routes.js checkLimit(tenantId, tenantType, 'storage_mb') | —                    | UNKNOWN           |

---

## Disputes & Returns

| feature_key      | display_name       | applies_to | permissions_required | limit_key | backend_enforcement                                     | frontend_surfaces | plan_availability |
| ---------------- | ------------------ | ---------- | -------------------- | --------- | ------------------------------------------------------- | ----------------- | ----------------- |
| disputes_returns | Disputes & returns | MULTI      | —                    | —         | disputes.routes.js `requireFeature('disputes_returns')` | DisputesPage.tsx  | Bronze+           |

---

## Approvals & Budgets

| feature_key       | display_name              | applies_to | permissions_required | limit_key | backend_enforcement                                       | frontend_surfaces | plan_availability                       |
| ----------------- | ------------------------- | ---------- | -------------------- | --------- | --------------------------------------------------------- | ----------------- | --------------------------------------- |
| approvals_budgets | Order approvals & budgets | MULTI      | —                    | —         | approvals.routes.js `requireFeature('approvals_budgets')` | ApprovalsPage.tsx | Bronze+ single-level, Gold+ multi-level |

---

## Promotions

| feature_key | display_name        | applies_to | permissions_required | limit_key | backend_enforcement                                 | frontend_surfaces  | plan_availability       |
| ----------- | ------------------- | ---------- | -------------------- | --------- | --------------------------------------------------- | ------------------ | ----------------------- |
| promotions  | Supplier promotions | SUPPLIER   | —                    | —         | promotions.routes.js `requireFeature('promotions')` | PromotionsPage.tsx | Bronze+ (SUPPLIER only) |

---

## Order Amendments

| feature_key      | display_name     | applies_to | permissions_required | limit_key | backend_enforcement                                             | frontend_surfaces          | plan_availability |
| ---------------- | ---------------- | ---------- | -------------------- | --------- | --------------------------------------------------------------- | -------------------------- | ----------------- |
| order_amendments | Order amendments | MULTI      | —                    | —         | order-amendments.routes.js `requireFeature('order_amendments')` | OrderDetailPage amendments | All plans         |

---

## Driver Management

| feature_key       | display_name      | applies_to | permissions_required | limit_key | backend_enforcement                                     | frontend_surfaces | plan_availability |
| ----------------- | ----------------- | ---------- | -------------------- | --------- | ------------------------------------------------------- | ----------------- | ----------------- |
| driver_management | Driver management | SUPPLIER   | —                    | —         | drivers.routes.js `requireFeature('driver_management')` | DriversPage.tsx   | Gold+             |

---

## Supplier Reviews

| feature_key      | display_name     | applies_to | permissions_required | limit_key | backend_enforcement                                    | frontend_surfaces            | plan_availability         |
| ---------------- | ---------------- | ---------- | -------------------- | --------- | ------------------------------------------------------ | ---------------------------- | ------------------------- |
| supplier_reviews | Supplier reviews | RESTAURANT | —                    | —         | reviews.routes.js `requireFeature('supplier_reviews')` | SupplierDetailPage (reviews) | Bronze+ (RESTAURANT only) |

---

## Notifications & Payments

| feature_key        | display_name           | applies_to | permissions_required | limit_key | backend_enforcement                                                     | frontend_surfaces           | plan_availability |
| ------------------ | ---------------------- | ---------- | -------------------- | --------- | ----------------------------------------------------------------------- | --------------------------- | ----------------- |
| notifications      | In-app notifications   | MULTI      | —                    | —         | apps/api/src/routes/notifications.routes.js                             | — (likely Header or Layout) | UNKNOWN           |
| push_notifications | Push notifications     | MULTI      | —                    | —         | push.routes.js `requireFeature('push_notifications')`                   | — (push service)            | All plans         |
| payments           | Payments (invoice pay) | RESTAURANT | —                    | —         | restaurant-finance.routes.js POST /invoices/:id/pay; payments.routes.js | —                           | UNKNOWN           |

---

## Dashboard & Home

| feature_key | display_name                       | applies_to | permissions_required | limit_key | backend_enforcement                                                              | frontend_surfaces                                                                                                                                                                           | plan_availability |
| ----------- | ---------------------------------- | ---------- | -------------------- | --------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| dashboard   | Main dashboard (stats, role-aware) | MULTI      | —                    | —         | apps/api/src/routes/admin.routes.js GET /dashboard requireAuth, getRequestTenant | DashboardPage.tsx (impersonation-aware: admin not impersonating sees admin landing + CTA to /app/admin; order calendar and tenant KPIs only for restaurant/supplier or admin impersonating) | UNKNOWN           |

**Flags**

- Dashboard is impersonation-aware: when user is ADMIN and not impersonating, DashboardPage shows an admin landing (no order calendar, no tenant stats); tenant content and Order Calendar only when effective role is RESTAURANT or SUPPLIER (including when admin is impersonating).

---

## Pricing (Contract / Tiers)

| feature_key           | display_name                     | applies_to | permissions_required | limit_key | backend_enforcement                                                                         | frontend_surfaces                      | plan_availability |
| --------------------- | -------------------------------- | ---------- | -------------------- | --------- | ------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------- |
| supplier_pricing      | Supplier pricing (prices, tiers) | SUPPLIER   | —                    | —         | apps/api/src/routes/prices.routes.js, restaurant-pricing.routes.js requireAuth, requireRole | — (API; may be in product/supplier UI) | UNKNOWN           |
| restaurant_my_pricing | Restaurant view "my pricing"     | RESTAURANT | —                    | —         | restaurant-pricing.routes.js GET /my-pricing requireRole(['RESTAURANT','ADMIN'])            | —                                      | UNKNOWN           |

---

## Reporting & Analytics

| feature_key           | display_name                       | applies_to | permissions_required | limit_key | backend_enforcement                                                                    | frontend_surfaces                               | plan_availability                          |
| --------------------- | ---------------------------------- | ---------- | -------------------- | --------- | -------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| reports               | Analytics / reports (feature flag) | MULTI      | —                    | —         | routes use `requireFeature('reports')`                                                 | SubscriptionInfo.tsx (features.reports)         | Gold+                                      |
| smart_reorder         | Smart reorder (feature flag)       | MULTI      | —                    | —         | isFeatureEnabled — not used on any route                                               | SubscriptionInfo.tsx (features.smart_reorder)   | UI only; **PARTIAL**                       |
| multi_branch          | Multi-branch (feature flag)        | RESTAURANT | —                    | —         | Branch limit enforced in plan-enforcement.js; no requireFeature('multi_branch')        | SubscriptionInfo.tsx (features.multi_branch)    | UI label; branch limit enforced separately |
| reservation_analytics | Reservation analytics              | RESTAURANT | RESERVATIONS_VIEW    | —         | reservations.routes.js (same router)                                                   | ReservationAnalyticsPanel.tsx                   | UNKNOWN                                    |
| invoice_analytics     | Invoice analytics                  | RESTAURANT | —                    | —         | restaurant-finance.routes.js GET /invoices/analytics (aggregates + time-series points) | DashboardPage (Spend Trend chart), InvoicesPage | UNKNOWN                                    |

---

## Integrations

| feature_key | display_name                  | applies_to     | permissions_required | limit_key | backend_enforcement                                                                           | frontend_surfaces                                                                                                                 | plan_availability |
| ----------- | ----------------------------- | -------------- | -------------------- | --------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| public_api  | Public reservation/staff APIs | MULTI (public) | —                    | —         | public.routes.js (reserve, staff link, session, PTO, swap, time-entries, check-in, check-out) | PublicReservationPortal, PublicReservationConfirmation, PublicReservationManage, StaffSelfServiceLogin, StaffSelfServiceDashboard | UNKNOWN           |

---

## Limit Keys (summary)

| limit_key                 | applies_to | enforced_in                                                                                 |
| ------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| orders_per_day            | RESTAURANT | orders.routes.js (create), quick-lists.routes.js (schedule), scheduled-orders.service.js    |
| supplier_products_skus    | SUPPLIER   | products.routes.js (create); subscription.js checkLimit for supplier product/SKU count      |
| restaurant_inventory_skus | RESTAURANT | subscription.js checkLimit for distinct SKUs in restaurant_inventory                        |
| users                     | RESTAURANT | restaurant-onboarding.routes.js (invite)                                                    |
| chats_per_day             | MULTI      | chat.routes.js (send message)                                                               |
| storage_mb                | MULTI      | files.routes.js                                                                             |
| suppliers_per_restaurant  | RESTAURANT | suppliers.routes.js (link)                                                                  |
| branches                  | RESTAURANT | plan-enforcement.js checkBranchLimit; branches.routes.js                                    |
| warehouses                | SUPPLIER   | plan-enforcement.js checkWarehouseLimit; warehouses.routes.js                               |
| branches (supplier org)   | SUPPLIER   | org.routes.js POST /branches; plan-enforcement checkBranchLimit (supplier org member count) |

---

## Plan / Feature Keys (UI and API)

- **Plans (from migration 0022 / UI):** Free, Bronze, Gold, Platinum

**RESTAURANT** (23 keys): `chat`, `order_calendar`, `reports`, `smart_reorder`, `multi_branch`, `receiving_quality`, `disputes_returns`, `finance_invoices`, `quick_lists`, `inventory_management`, `waste_tracking`, `approvals_budgets`, `advanced_roles`, `notifications`, `api_integrations`, `support_sla`, `custom_branding`, `feature_flags_access`, `supplier_reviews`, `push_notifications`, `order_amendments`, `tenant_audit_log`, `waitlist_auto_promo`

**SUPPLIER** (22 keys): `chat`, `order_calendar`, `reports`, `multi_branch`, `warehouses`, `multi_warehouse`, `fulfillment_tools`, `fulfillment`, `driver_management`, `disputes_returns`, `quick_lists`, `inventory_management`, `advanced_roles`, `notifications`, `api_integrations`, `support_sla`, `custom_branding`, `feature_flags_access`, `promotions`, `push_notifications`, `order_amendments`, `tenant_audit_log`

Canonical source: `apps/api/src/lib/feature-keys.js`

---

## Features in UI but not enforced in backend

1. **smart_reorder** – Shown in SubscriptionInfo as plan feature; no route uses `requireFeature('smart_reorder')`. UI only.
2. **multi_branch** – Shown as feature; branch limit is enforced via `checkBranchLimit` (limits.branches), not via feature flag.
3. **Fulfillment** – `fulfillment.routes.js` now uses `requireFeature('fulfillment')` for the supplier's dedicated fulfillment routes. The general FulfillmentPage concept may still render without a hard feature gate on the page shell, but core API routes are gated.
4. **Order create** – Router requires ORDERS_VIEW only; ORDERS_CREATE not checked on POST.

**Fixed since last audit (2026-05-21):**

- **reports** – Routes now use `requireFeature('reports')`. Removed from unenforced list.
- **Receiving** – `receiving.routes.js` now has `requireFeature('receiving_quality')`. Removed from unenforced list.
- **Quick Lists** – `quick-lists.routes.js` now has `requireFeature('quick_lists')`. Removed from unenforced list.
- **Restaurant finance** – `restaurant-finance.routes.js` now has `requireFeature('finance_invoices')`. Removed from unenforced list.

---

---

## Revenue / Conversion (final polish)

| feature_key                | display_name                        | applies_to | permissions_required | limit_key | backend_enforcement                                                                                                                                          | frontend_surfaces                                                                     | plan_availability                    |
| -------------------------- | ----------------------------------- | ---------- | -------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------ |
| recommendation_api         | Plan recommendation (explainable)   | MULTI      | —                    | —         | GET /api/subscriptions/recommendation recommendPlan() returns reasonCode, evidence, comparedToCurrent (resolvesLimits, unlocksFeatures)                      | UpgradeModal, SubscriptionInfo (PlanRecommendationCta)                                | Deterministic; Free→Gold default     |
| subscription_plans_catalog | Plan catalog for tenant type        | MULTI      | —                    | —         | GET /api/subscriptions/plans (tenant_type from context)                                                                                                      | UpgradeModal comparison table                                                         | Self-serve plans only                |
| upgrade_modal_comparison   | Upgrade modal plan comparison table | MULTI      | —                    | —         | — (frontend uses entitlements + recommendation + plans)                                                                                                      | UpgradeModal.tsx (Current / Recommended / Top columns; limits + features; sticky CTA) | apps/web/src/lib/planComparison.ts   |
| conversion_events          | Funnel events (new types)           | MULTI      | —                    | —         | POST /api/subscriptions/conversion-event; types: CLICK_UPGRADE, CLOSE_UPGRADE_MODAL, DOWNGRADE_ATTEMPT_BLOCKED, RECOMMENDATION_SHOWN, RECOMMENDATION_CLICKED | UpgradeModal, Layout, SubscriptionInfo (recordConversionEvent)                        | conversion_event table               |
| admin_conversion_dropoff   | Admin conversion drop-off stats     | ADMIN      | —                    | —         | GET /api/admin-dashboard/conversion-stats funnelDropOff 7d/30d, recommendationFunnel, countsPerEventType                                                     | AdminDashboardPage "Conversion drop-off" mini table                                   | —                                    |
| near_limit_upgrade_cta     | Near-limit (≥80%) Upgrade CTA       | MULTI      | —                    | —         | — (frontend opens UpgradeModal, records OPEN_UPGRADE metadata source: near_limit, limitKey)                                                                  | Layout.tsx banner, SubscriptionInfo.tsx (Near limit block + per-row)                  | —                                    |
| downgrade_blocked_event    | Downgrade attempt blocked (server)  | ADMIN      | —                    | —         | admin-dashboard.routes.js PATCH /subscriptions/:id returns 400 when usage exceeds target; recordConversionEvent DOWNGRADE_ATTEMPT_BLOCKED                    | — (backend only)                                                                      | —                                    |
| recommended_badge          | Recommended badge on plan           | MULTI      | —                    | —         | — (frontend; uses GET /api/subscriptions/recommendation cache)                                                                                               | RecommendedBadge.tsx; SubscriptionInfo, UpgradeModal comparison header                | CURRENT_BEST → subtle style          |
| nav_upgrade_cta            | Top-nav Upgrade button (contextual) | MULTI      | —                    | —         | — (frontend; OPEN_UPGRADE metadata source: nav_upgrade_cta, trigger: free\|near_limit\|blocked)                                                              | Header.tsx (visibility: Free or ≥80% usage or blockedCountLast7d ≥ 1)                 | Dot when urgency                     |
| plan_subtitles             | Plan value copy (subtitles)         | MULTI      | —                    | —         | — (frontend constants PLAN_SUBTITLES in planComparison.ts)                                                                                                   | UpgradeModal headers, SubscriptionInfo, AdminDashboardPage plan cards                 | Free/Bronze/Gold/Platinum/Enterprise |

**Flags**

- Recommendation API: always returns a result; reasonCode one of FREE_DEFAULT, NEAR_LIMIT, LIMIT_EXCEEDED, FEATURE_BLOCKED, MULTIPLE_BLOCKS, CURRENT_BEST. Deterministic: lowest plan that resolves; Free with no issue → Gold.
- Enterprise checklist: [enterprise_checklist.md](../sales/enterprise_checklist.md) (discovery, sizing, integration, onboarding, contract template, timelines).
- Launch Polish: [LAUNCH_POLISH.md](../operations/LAUNCH_POLISH.md) (manual test notes for Recommended badge, nav Upgrade CTA, plan subtitles).

---

## Implementation notes (recent)

- **CORS (API):** Multiple dev origins supported via `WEB_ORIGINS` (default dev: localhost 5173–5175); production defaults to single `WEB_ORIGIN`. See apps/api/src/config/env.js, server.js, lib/socket.js.
- **API exports (web):** Subscription/entitlements and plan-change preview hooks exported from apps/web/src/services/api.ts (useGetEntitlementsQuery, usePreviewSubscriptionPlanChangeMutation).
- **Sidebar:** usePermissions imported from hooks/usePermissions; admin nav shown for any user with role ADMIN (no ADMIN_ACCESS gate in UI).
- **Launch Polish (micro):** RecommendedBadge component (planComparison.ts PLAN_SUBTITLES); Header nav Upgrade CTA (visibility from entitlements + blockedCountLast7d); manual checks in [LAUNCH_POLISH.md](../operations/LAUNCH_POLISH.md).

---

_Generated by scanning backend routes, frontend routes/pages/components, RBAC permissions, subscription.js, plan-enforcement.js, and SubscriptionInfo. Do not invent features; rename only when aligning with a future plan._
