# Access control: subscription features vs RBAC

Two independent layers must both pass for a tenant user to use a capability.

## Subscription features (`requireFeature`)

- **Question:** Did this **tenant** pay for the product module?
- **Source:** `subscription_plan.features` / entitlements (`apps/api/src/lib/feature-keys.js`)
- **Middleware:** `requireFeature(key, getTenantId, getTenantType)` in `subscription.js`
- **Frontend:** `featureEnabled(entitlements.features.*)` or helpers in `apps/web/src/lib/planFeatureGates.ts`

Use on **router scope** for the module (e.g. entire `/api/restaurant-finance` → `finance_invoices`).

## RBAC permissions (`requirePermission`)

- **Question:** Is this **user** allowed to perform the action in this tenant?
- **Source:** `user_role` → `role_permission` (`docs/architecture/RBAC.md`)
- **Middleware:** `resolveTenantContext` then `requirePermission('INVOICES_VIEW')`
- **Frontend:** `usePermissions().can('INVOICES_VIEW')`, `RequirePermission`

Use on **routes and UI actions** (view vs manage).

## Tenant resolution (`tenant-resolve.js`)

- **Question:** Which restaurant/supplier row does this request target?
- **Use:** `requireRestaurantId(req)` / `requireSupplierId(req)` from `apps/api/src/lib/tenant-resolve.js`
- **Do not** resolve only via `restaurant.contact_email = user.email` — team members and multi-tenant users will fail.

`getRestaurantIdForRequest` uses active tenant, workspace membership, impersonation, then primary contact fallback.

## Module analytics vs global reports

| UI location                     | Plan gate            | Permission                  |
| ------------------------------- | -------------------- | --------------------------- |
| `/app/reports`                  | `reports`            | `ORDERS_VIEW` (reports API) |
| Finance / invoices analytics    | `finance_invoices`   | `INVOICES_VIEW`             |
| Reservations in-page analytics  | (none beyond module) | `RESERVATIONS_VIEW`         |
| Dashboard invoice spend snippet | `finance_invoices`   | —                           |

Do **not** put `requireFeature('reports')` on embedded charts inside Finance, Reservations, or Dashboard — that is the global Reports product.

## Checklist for new endpoints

1. Router: `requireAuth`, `resolveTenantContext`, `requireFeature('<module>')` if billable module
2. Route: `requirePermission('<DOMAIN>_VIEW' | '_MANAGE')`
3. Handler: `const restaurantId = await requireRestaurantId(req)`
4. Frontend nav: `can('…_VIEW')` **and** `hasPlanFeature(…, '<module>')` when module is plan-gated
