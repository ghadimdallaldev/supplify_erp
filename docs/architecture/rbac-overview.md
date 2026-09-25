# RBAC: Tenant Roles and Permissions

Tenant-scoped RBAC provides a clean foundation for mapping subscription features and limits. Phase 1 implements roles, permissions, and guards only; subscription plan logic is unchanged.

## Tenant types

- **RESTAURANT** – Restaurant tenant (branches, reservations, staff, orders, etc.).
- **SUPPLIER** – Supplier tenant (catalog, warehouses, orders, invoices, etc.).
- **ADMIN** – Global admin (no tenant_id; platform-wide access).
- **STAFF_PORTAL** – Staff self-service app users (`staff_portal` / `staff_portal_user` Keycloak realm roles map to `STAFF_PORTAL_APP_ROLE`). Routes using `assertStaffPortalRouteAccess` restrict these users to staff-portal paths only.

## Roles

### Restaurant roles (7)

Role identifiers are name strings (not uppercase codes) as defined in `role-matrix.js`.

| Name               | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| Owner              | Full access to restaurant tenant                                   |
| Restaurant Manager | Orders, receiving, catalog view, recipes; no team or billing admin |
| Purchaser          | Ordering, quick lists, inventory, receiving; no staff/settings     |
| Receiving Staff    | Receiving and inventory only                                       |
| Accountant         | Invoices, payments, reports; read-only orders. No recipes.         |
| Viewer             | Read-only across all tenant areas                                  |
| FOH Staff          | Reservations and front-of-house only                               |

### Supplier roles (9)

| Name                    | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| Owner                   | Full access to supplier tenant                                   |
| Supplier Manager        | Catalog, orders, fulfillment, warehouses; no subscription manage |
| Warehouse Manager       | Warehouse operations, receiving, fulfillment; no catalog billing |
| Order Fulfillment Staff | Fulfillment board only; cannot edit warehouse or catalog         |
| Driver                  | Driver deliveries and GPS tracking only                          |
| Catalog Manager         | Product catalog and images; no orders or fulfillment             |
| Promotions Manager      | Deals/promotions with order manage + catalog view for deal ops   |
| Accountant              | Invoices, payments, reports; read-only orders                    |
| Viewer                  | Read-only across all supplier areas                              |

### Admin roles

| Code          | Name          | Description               |
| ------------- | ------------- | ------------------------- |
| SUPER_ADMIN   | Super Admin   | Full platform access      |
| SUPPORT_ADMIN | Support Admin | Support and impersonation |
| FINANCE_ADMIN | Finance Admin | Financial and billing     |
| GROWTH_ADMIN  | Growth Admin  | Analytics and growth      |

## Permission keys (by domain)

Permission codes are string enums used in code and DB. `*_MANAGE` implies all actions in that domain (e.g. `ORDERS_MANAGE` implies view/create/edit).

### Orders

- `ORDERS_VIEW`, `ORDERS_CREATE`, `ORDERS_EDIT`, `ORDERS_MANAGE`

### Invoices

- `INVOICES_VIEW`, `INVOICES_CREATE`, `INVOICES_EDIT`, `INVOICES_MANAGE`

### Inventory

- `INVENTORY_VIEW`, `INVENTORY_EDIT`, `INVENTORY_MANAGE`

### Reservations

- `RESERVATIONS_VIEW`, `RESERVATIONS_CREATE`, `RESERVATIONS_EDIT`, `RESERVATIONS_MANAGE`

### Staff

- `STAFF_VIEW`, `STAFF_INVITE`, `STAFF_EDIT`, `STAFF_MANAGE`

### Settings

- `SETTINGS_VIEW`, `SETTINGS_EDIT`, `SETTINGS_MANAGE`

### Chat

- `CHAT_VIEW`, `CHAT_SEND`, `CHAT_MANAGE`
- Supplify Assistant (`/api/assistant`) does **not** add a new permission key; each tool reuses existing view permissions (`INVENTORY_VIEW`, `ORDERS_VIEW`, `INVOICES_VIEW`, `RECIPES_VIEW`, `FULFILLMENT_VIEW`, `DRIVER_DELIVERIES_VIEW`, `ADMIN_ACCESS`, …) plus plan feature `ai_platform`.

### Subscriptions

- `SUBSCRIPTIONS_VIEW`, `SUBSCRIPTIONS_MANAGE`

### Catalog (supplier)

- `CATALOG_VIEW`, `CATALOG_EDIT`, `CATALOG_MANAGE`

### Warehouses (supplier)

- `WAREHOUSES_VIEW`, `WAREHOUSES_EDIT`, `WAREHOUSES_MANAGE`

### Receiving

- `RECEIVING_VIEW`, `RECEIVING_MANAGE`

### Payments

- `PAYMENTS_VIEW`, `PAYMENTS_MANAGE`

### Fulfillment (supplier)

- `FULFILLMENT_VIEW`, `FULFILLMENT_MANAGE`, `FULFILLMENT_TRANSFER`

### Promotions (supplier)

- `PROMOTIONS_VIEW`, `PROMOTIONS_MANAGE`

### Customers (supplier)

- `CUSTOMERS_IMPORT`, `CUSTOMERS_MANAGE`

### Growth (supplier)

- `GROWTH_VIEW`

### Driver deliveries

- `DRIVER_DELIVERIES_VIEW`, `DRIVER_DELIVERIES_MANAGE`

### Recipes (restaurant)

- `RECIPES_VIEW`, `RECIPES_VIEW_COSTS`, `RECIPES_EDIT`, `RECIPES_MANAGE`

### Admin

- `ADMIN_ACCESS`, `ADMIN_TENANTS`, `ADMIN_PLANS`, `ADMIN_SUPPORT`, `ADMIN_FINANCE`, `ADMIN_GROWTH`
- `/api/org` and `/api/restaurant-org` require impersonation for admins. Org context is the impersonated tenant’s organization, not leftover `org_user_roles` / `restaurant_org_user_roles` membership on the admin user. Unscoped admins cannot load or mutate org branches (`organization_id` is required on GET/DELETE). A `?organization_id=` that does not match the impersonated tenant returns 400. Unscoped `ADMIN_TENANTS` query overrides are not allowed. Unscoped ADMIN also cannot bind a leftover personal tenant from `active_tenant_token`; that cookie only switches branches while impersonating.
- Grant/revoke org branch access and unlink require the branch tenant to belong to the caller organization. Warehouse routing simulate product lookups are supplier-scoped.
- Branch invitation APIs (`/api/org/invitations`, `/api/restaurants/invitations/branches`) require impersonation for admins. A `?organization_id=` that does not match the impersonated tenant returns 400. Unscoped `ADMIN_TENANTS` query overrides are not allowed.
- Platform support chat (`GET /api/chat/admin/conversations`, admin-join, start-conversation) requires `ADMIN_SUPPORT`. Socket chat does not grant unscoped ADMIN access to marketplace threads; support threads also require `ADMIN_SUPPORT`.

## Database

**Primary schema** (used for RESTAURANT/SUPPLIER tenant-role checks):

- `tenant_roles` – `id`, `name`, `tenant_id`, `tenant_type`, `is_system`
- `tenant_role_permissions` – `(role_id, permission)`
- `tenant_user_roles` – `user_id`, `role_id`, `tenant_id`, `tenant_type`

**Legacy schema** (used for ADMIN type and as fallback):

- `role` – `id`, `code` (UNIQUE), `name`, `tenant_type`, `description`
- `permission` – `id`, `code` (UNIQUE), `name`, `domain`, `description`
- `role_permission` – `(role_id, permission_id)` PK
- `user_role` – `user_id`, `role_id`, `tenant_id`, `tenant_type`; UNIQUE `(user_id, role_id, tenant_id, tenant_type)`

**Org scope** (merged into effective permissions by `getPermissionsForUser`):

- `org_user_roles` – org-level supplier permissions resolved by `getOrgRolePermissions`
- `restaurant_org_user_roles` – org-level restaurant permissions resolved by `getRestaurantOrgRolePermissions`

For ADMIN roles, `tenant_id` is NULL and `tenant_type` is `'ADMIN'`.

## Resolving context

### Tenant context (restaurant/supplier)

- **resolveTenantContext** (middleware): After auth, calls `getRequestTenant(req)` (impersonation or contact_email). Loads `getRolesForUser(userId, tenantId, tenantType)` and `getPermissionsForUser(...)` and sets `req.tenantContext = { tenantId, tenantType, tenantName, roles[], permissions[] }`.
- When an admin is impersonating, the effective tenant is the impersonated one; permissions are still loaded for the current user in that tenant (admin may have no `user_role` there; backend allows access via impersonation bypass in `requirePermission`).

### Admin context

- **resolveAdminContext** (middleware): For `user.role === 'ADMIN'`, loads roles and permissions with `tenant_id` NULL and `tenant_type` 'ADMIN', and sets `req.adminContext = { roles[], permissions[] }`.

### requirePermission(permissionKey)

- Uses `req.tenantContext.permissions` or `req.adminContext.permissions` and `hasPermission(perms, key)` (exact or `*_MANAGE` for same domain).
- **Permission resolution order**: (1) if `tenantContext.roles` includes a **tenant** owner name (`Owner`, `RESTAURANT_OWNER`, `SUPPLIER_OWNER`) → allow; (2) if `hasPermission(tenantContext.permissions ?? adminContext.permissions, permissionKey)` → allow; (3) otherwise 403. `Org Owner` is an organization role, not a tenant-role bypass — org owners get access from org permission `ALL`. The same owner-name list is used on web (`tenantRoles.ts`) and both mobile apps (`usePermissions.ts`); a tenant role literally named `Org Owner` does not unlock the UI. Custom tenant roles cannot be named `Org Owner` / `Org Manager` / `Org Viewer` / `Regional Manager`. When an admin is impersonating, `resolveTenantContext` injects the effective tenant permissions (full Owner set or view-as-role) into `tenantContext.permissions`.
- **requireRole:** ADMIN may call restaurant-only or supplier-only routes when impersonating that `tenantType` (`getEffectiveTenant`).

## API

- **GET /auth/me** returns `tenantRoles`, `tenantPermissions`, `adminRoles`, `adminPermissions` (and existing fields). Use these for frontend gating.
- Key routes are protected with `requireAuth`, `resolveTenantContext` (or `resolveAdminContext`), and `requirePermission('...')`:
  - Restaurant: orders, invoices, inventory, reservations, staff, subscriptions, branches, restaurant-inventory, chat (view permission).
  - Supplier: orders, invoices, inventory (`INVENTORY_VIEW` plus `inventoryMutationGuard` so viewers cannot PATCH alerts or stock), catalog/products, warehouses, subscriptions, chat (view permission). `POST /api/files/presign` allows catalog/settings/staff/receiving/invoice editors **or** `CHAT_SEND`/`CHAT_MANAGE` so chat attachments work; `POST /api/files/product/:id/attach` stays on catalog/settings/staff/receiving/invoice keys only.
  - Admin: `/api/admin-dashboard` requires `ADMIN_ACCESS`.

## Frontend

- **useImpersonation()** – `effectiveRole`, `isEffectiveRestaurant` / `isEffectiveSupplier`, `shouldLoadTenantEntitlements` for impersonating admins.
- **usePermissions()** – `can(permissionKey)`; when impersonating, returns `true` for tenant keys so UI matches backend `requirePermission` bypass.
- Sidebar: tenant nav when `useImpersonation()` reports restaurant/supplier; admin nav when platform admin and not impersonating; Settings/Staff/etc. gated by permissions.
- Direct URLs under `/app/*` use `RequirePermission` at the router for the same keys as the matching API (catalog, orders, inventory, invoices, recipes, staff, settings, chat, fulfillment, receiving, promotions, reports). Restaurant onboarding requires `SETTINGS_VIEW` or `STAFF_VIEW`. Org branch detail requires `SETTINGS_VIEW`.

**Impersonation:** [features/admin-impersonation.md](../features/admin-impersonation.md) · [IMPERSONATION_AUDIT.md](../IMPERSONATION_AUDIT.md)

## Subscription features vs RBAC

Plan entitlements (`requireFeature`) and role permissions (`requirePermission`) are **both** required. They answer different questions: whether the **tenant** bought the module vs whether the **user** may use it.

See **[ACCESS_CONTROL.md](./ACCESS_CONTROL.md)** for the full matrix (module analytics vs global `reports`, tenant resolution, and checklists for new routes).

## Socket chat authorization (2026-09-12)

Socket.IO chat events do not pass through Express middleware, so `join_conversation`, `send_message`, `message_read`, and `typing` repeat the critical boundary checks: the conversation must exist, its supplier/restaurant ID must match the socket's active tenant, the tenant must have the `chat` feature, and the user must have `CHAT_VIEW` or `CHAT_SEND` (with `CHAT_MANAGE` implication). Permission resolution uses tenant-role membership, so invited staff work without relying on the tenant contact email. Socket message persistence derives `sender_id` from the authenticated active tenant and applies the daily chat usage limit.

## Default assignments (migration 0043)

- Users with `app_user.role = 'RESTAURANT'` and `restaurant.contact_email = app_user.email` get **RESTAURANT_OWNER** for that restaurant.
- Users with `app_user.role = 'SUPPLIER'` and `supplier.contact_email = app_user.email` get **SUPPLIER_OWNER** for that supplier.
- Users with `app_user.role = 'ADMIN'` get **SUPER_ADMIN** with `tenant_id` NULL and `tenant_type` 'ADMIN'.

New staff or multi-tenant users must be assigned roles via `user_role` (e.g. when inviting or linking to a tenant).

## Hardening pass (2026-05-27)

- [RBAC permission matrix](./RBAC_PERMISSION_MATRIX.md) — default restaurant/supplier roles and codes
- [RBAC audit report](./RBAC_AUDIT_REPORT.md) — route/page enforcement inventory and verification commands
- Manual spot checks: [regression-checklist.md](../qa/regression-checklist.md) **RBAC-X01–X08** (2026-09-10) and §6.16 / §7.10

After deploy, system roles are synced automatically by the `migrate` container (`sync-system-roles.mjs`). On dev machines: `pnpm db:sync-roles`.

## Fulfillment transfer capability (2026-09-14)

FULFILLMENT_TRANSFER is an additive permission key in the existing legacy, named tenant-role, and supplier-organization permission stores. It is granted to existing supplier Owner/Manager/Warehouse Manager capabilities and appropriate organization roles; no new role names were introduced.

The permission is necessary but not sufficient: the server also checks supplier tenant ownership of every order line, warehouse ownership, organization/branch scope, assignment status, order status, and target-zone/stock eligibility. A supplier user cannot move an order to another supplier organization or escape assigned branch scope.

## Restaurant onboarding API (2026-09-25)

`/api/restaurant-onboarding` is tenant-scoped. Profile read/write uses `getRestaurantIdForRequest` (not `restaurant.contact_email`). Guards:

- `GET /profile` — `SETTINGS_VIEW`
- `PATCH /profile` — `SETTINGS_EDIT`. Web restaurant onboarding and supplier profile save actions are disabled without that key.
- `GET /team` — `STAFF_VIEW`
- `POST /team` — `STAFF_INVITE` or `STAFF_MANAGE`
- `DELETE /team/:id` — `STAFF_MANAGE`

View-only restaurant staff cannot add or remove onboarding team contacts.

Restaurant delivery GPS `GET /api/restaurants/me/delivery-locations` allows `SETTINGS_VIEW`, `ORDERS_VIEW`, or `ORDERS_CREATE` so checkout can pick a branch. `PATCH /me/delivery-location` and `PATCH /branches/:branchId/delivery-location` still require `SETTINGS_EDIT`. FOH and other roles without settings edit cannot change coordinates. `PATCH /branches/:branchId/delivery-location` updates only when `branch.tenant_id` is the restaurant.

Workspace Owner also bypasses inline `hasPermission` checks on supplier order tracking (`GET /api/orders/:id/tracking`), proof of delivery, order GPS pings (`POST /api/orders/:id/location`), and driver-self fulfillment routes (`/routes/today`, `/routes/active`, `/routes/build-from-assignments`). Driver-self routes still require a linked driver profile. `Org Owner` is not a tenant bypass.

`GET /api/restaurants`, `GET /api/restaurants/me`, `GET /api/restaurants/:id`, and org branch GET/PATCH omit tax, VAT, registration, and trade-license fields unless the caller is a platform admin, an Org Owner, or the owning tenant with `SETTINGS_VIEW`.

Supplier `/api/inventory` mutations require `INVENTORY_EDIT` or `INVENTORY_MANAGE`. Inventory alerts list warehouse names only when the warehouse belongs to the same supplier as the product, and do not return `contact_email`. Restaurant inventory low-stock handling notifies the restaurant only; it does not write supplier `inventory_alert` rows.

`GET /api/prices/product/:productId` requires `CATALOG_VIEW`, `ORDERS_VIEW`, or `INVENTORY_VIEW` and is scoped by supplier tenant id or restaurant follow, not `supplier.contact_email`.

## Tenant directory and notification webhooks (2026-09-25)

- `GET /api/restaurants` and `GET /api/restaurants/:id` require `ORDERS_VIEW` for suppliers and `ADMIN_TENANTS` or `ADMIN_ACCESS` for platform admins. Drivers and other supplier roles without order visibility cannot list or open customer restaurant rows (including spend and `contact_email`).
- `POST /api/restaurants/:id/logo` requires `SETTINGS_EDIT` and the active restaurant tenant id (same as profile PATCH). Admins must impersonate the restaurant.
- Order calendar and receiving restaurant resolution use `getRequestTenant` / `getRestaurantIdForRequest` only. They do not fall back to `contact_email`.
- Notification webhook GET requires `SETTINGS_VIEW`; PUT requires `SETTINGS_MANAGE`. Preference PATCH remains available to any authenticated tenant user.
- Restaurant receiving-quality reports require `RECEIVING_VIEW` in addition to the router-wide `ORDERS_VIEW` gate. Restaurant Accountant has no `RECIPES_*` and no `RECEIVING_VIEW`.
- Supplier Catalog Manager has catalog and inventory keys only (no `ORDERS_VIEW`). Command center requires `ORDERS_MANAGE`, `INVOICES_VIEW`, or `FULFILLMENT_VIEW` (same as web). Run sheet requires `FULFILLMENT_VIEW` or `DRIVER_DELIVERIES_VIEW`. Supplier `GET /api/suppliers/:id` requires `SETTINGS_VIEW`, `CATALOG_VIEW`, or `ORDERS_VIEW`. Receiving pending-orders does not return `supplier.contact_email`.
- `GET /api/payments/invoice/:invoiceId` is scoped to the caller’s supplier or restaurant invoice; admins must impersonate that tenant. `POST /api/payments` records cash only for the impersonated or native supplier tenant. `POST /api/orders/:id/remind` requires the restaurant tenant (admins must impersonate).
- Invoice list, detail, PDF, create, and status PATCH require a tenant. Platform admins must impersonate; they cannot list all invoices or create invoices via `supplier_id` in the body. Restaurant callers list invoices for their restaurant.
- Order list, order detail, packing slip JSON/PDF, and order PATCH require a tenant. Platform admins must impersonate. `GET /api/restaurant-finance/orders/:orderId/invoices` uses `requireTenantScope`. Product PATCH, price create/update, and product file attach require the supplier tenant. Staff APIs resolve the restaurant from tenant context only (no first-restaurant fallback, no `?restaurantId=` for unscoped admins). Warehouse and driver `?supplier_id=` must match the impersonated/native supplier; `ADMIN_TENANTS` query override is removed.
- Inventory list, alerts, product GET/PATCH, adjustments, and adjustment history require the supplier tenant (admins must impersonate). Product create `initialStock` mirrors into warehouse inventory for warehouse-mode suppliers. Warehouse-mode PATCH/adjustments write `warehouse_inventory` first and mirror the total into `inventory`. Inventory settings PATCH and alert acknowledge are supplier-scoped the same way. `GET /api/orders/:id/warehouses` uses `assertOrderReadAccess`. Order amendments require a restaurant or supplier tenant (no unscoped admin access).
- Seeded Accountant roles drop `RECIPES_*` on the next `pnpm db:sync-roles`.
- Web `/app/restaurants` and `/app/restaurants/:id` are gated with `ORDERS_VIEW`, matching the supplier sidebar and API.
