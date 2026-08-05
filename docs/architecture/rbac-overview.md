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

| Name               | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| Owner              | Full access to restaurant tenant                               |
| Restaurant Manager | Operations, staff, orders, inventory; no subscription manage   |
| Purchaser          | Ordering, quick lists, inventory, receiving; no staff/settings |
| Receiving Staff    | Receiving and inventory only                                   |
| Accountant         | Invoices, payments, reports; read-only orders and inventory    |
| Viewer             | Read-only across all tenant areas                              |
| FOH Staff          | Reservations and front-of-house only                           |

### Supplier roles (9)

| Name                    | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| Owner                   | Full access to supplier tenant                                   |
| Supplier Manager        | Catalog, orders, fulfillment, warehouses; no subscription manage |
| Warehouse Manager       | Warehouse operations, receiving, fulfillment; no catalog billing |
| Order Fulfillment Staff | Fulfillment board only; cannot edit warehouse or catalog         |
| Driver                  | Driver deliveries and GPS tracking only                          |
| Catalog Manager         | Product catalog and images; no orders or fulfillment             |
| Promotions Manager      | Deals and promotions; no orders or catalog manage                |
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

- `FULFILLMENT_VIEW`, `FULFILLMENT_MANAGE`

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
- **Permission resolution order**: (1) if `tenantContext.roles` includes `'Owner'` → allow; (2) if `hasPermission(tenantContext.permissions ?? adminContext.permissions, permissionKey)` → allow; (3) otherwise 403. When an admin is impersonating, `resolveTenantContext` injects the effective tenant permissions (full Owner set or view-as-role) into `tenantContext.permissions`.
- **requireRole:** ADMIN may call restaurant-only or supplier-only routes when impersonating that `tenantType` (`getEffectiveTenant`).

## API

- **GET /auth/me** returns `tenantRoles`, `tenantPermissions`, `adminRoles`, `adminPermissions` (and existing fields). Use these for frontend gating.
- Key routes are protected with `requireAuth`, `resolveTenantContext` (or `resolveAdminContext`), and `requirePermission('...')`:
  - Restaurant: orders, invoices, inventory, reservations, staff, subscriptions, branches, restaurant-inventory, chat (view permission).
  - Supplier: orders, invoices, inventory, catalog/products, warehouses, subscriptions, chat (view permission).
  - Admin: `/api/admin-dashboard` requires `ADMIN_ACCESS`.

## Frontend

- **useImpersonation()** – `effectiveRole`, `isEffectiveRestaurant` / `isEffectiveSupplier`, `shouldLoadTenantEntitlements` for impersonating admins.
- **usePermissions()** – `can(permissionKey)`; when impersonating, returns `true` for tenant keys so UI matches backend `requirePermission` bypass.
- Sidebar: tenant nav when `useImpersonation()` reports restaurant/supplier; admin nav when platform admin and not impersonating; Settings/Staff/etc. gated by permissions.

**Impersonation:** [features/admin-impersonation.md](../features/admin-impersonation.md) · [IMPERSONATION_AUDIT.md](../IMPERSONATION_AUDIT.md)

## Subscription features vs RBAC

Plan entitlements (`requireFeature`) and role permissions (`requirePermission`) are **both** required. They answer different questions: whether the **tenant** bought the module vs whether the **user** may use it.

See **[ACCESS_CONTROL.md](./ACCESS_CONTROL.md)** for the full matrix (module analytics vs global `reports`, tenant resolution, and checklists for new routes).

## Default assignments (migration 0043)

- Users with `app_user.role = 'RESTAURANT'` and `restaurant.contact_email = app_user.email` get **RESTAURANT_OWNER** for that restaurant.
- Users with `app_user.role = 'SUPPLIER'` and `supplier.contact_email = app_user.email` get **SUPPLIER_OWNER** for that supplier.
- Users with `app_user.role = 'ADMIN'` get **SUPER_ADMIN** with `tenant_id` NULL and `tenant_type` 'ADMIN'.

New staff or multi-tenant users must be assigned roles via `user_role` (e.g. when inviting or linking to a tenant).

## Hardening pass (2026-05-27)

- [RBAC permission matrix](./RBAC_PERMISSION_MATRIX.md) — default restaurant/supplier roles and codes
- [RBAC audit report](./RBAC_AUDIT_REPORT.md) — route/page enforcement inventory and verification commands
- [RBAC hardening QA report](../qa/RBAC_HARDENING_QA_REPORT.md) — automated + manual test checklist

After deploy, system roles are synced automatically by the `migrate` container (`sync-system-roles.mjs`). On dev machines: `pnpm db:sync-roles`.
