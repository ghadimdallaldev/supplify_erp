# Admin Features – Implementation Status

## Overview

Supplify’s admin area is a subscription-based operator console for managing tenants, plans, subscriptions, usage, and support (including chat and impersonation). Access is limited to users with the **ADMIN** role.

**Full guide:** [ADMIN.md](./ADMIN.md)  
**Audit & roadmap:** [ADMIN_AUDIT.md](../architecture/ADMIN_AUDIT.md)

---

## Access & Navigation

- **Base URL:** `/app/admin` (and `/app/admin/suppliers`, `/app/admin/restaurants`)
- **Sidebar (admin only):** Admin Dashboard, Supplier Admin, Restaurant Admin, Settings
- Admins do **not** see the standard Dashboard, Products, Orders, or Chat in the main nav; they use the admin views and can still use Chat in admin mode (join/start conversations).

---

## Admin Dashboard (`/app/admin`)

| Feature           | Status | Description                                                                                                                                                 |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**      | ✅     | Platform metrics: tenant counts (supplier/restaurant), subscription status breakdown, MRR/ARR, active subscriptions, orders/chats last 24h, past-due alerts |
| **Plans**         | ✅     | List all subscription plans; create plan; edit plan (name, pricing, limits, features, trial days, display order, active)                                    |
| **Subscriptions** | ✅     | List all tenant subscriptions with filters (status, tenant type); edit subscription (plan, status, cancel reason)                                           |
| **Tenants**       | ✅     | Supplier and Restaurant directories with plan, status, product/order counts, revenue/spend; **Impersonate** button per row to “view as” that tenant         |
| **Usage**         | ✅     | Usage & quotas view; per-tenant usage (supplier/restaurant admin pages); over-limit tracking                                                                |
| **Audit Logs**    | ✅     | Admin action history (plan/subscription/override changes, impersonation start/stop, chat admin actions); filters by tenant, action type                     |

---

## Impersonation (View as Tenant)

| Feature                    | Status | Description                                                                                                                                                                   |
| -------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start impersonation**    | ✅     | Tenants tab → **Impersonate**; JWT cookie; redirect to `/app/dashboard`; suspended tenants require `acknowledgeSuspended`.                                                    |
| **Full tenant navigation** | ✅     | Orders, products, inventory, settings, disputes, org/branches, entitlements via `useImpersonation()` + `getRequestTenant`.                                                    |
| **Impersonation banner**   | ✅     | Sticky “Impersonating [name]” + **Exit impersonation**; expiry shown on desktop.                                                                                              |
| **Branch switch**          | ✅     | Org/linked branch switch works under impersonation (`impersonationCanAccessBranch`).                                                                                          |
| **Stop / logout**          | ✅     | Exit → `/app/admin`; logout clears cookie (`IMPERSONATION_END` audited).                                                                                                      |
| **Security**               | ✅     | ADMIN + `ADMIN_ACCESS`; no admin-target impersonation; session bound to starting admin; billing mutations blocked while impersonating.                                        |
| **API / middleware**       | ✅     | `impersonationContext`, `getEffectiveTenant`, `requireRole` impersonation bypass, `impersonation-guards` on billing POST/PATCH/DELETE.                                        |
| **Docs / tests**           | ✅     | [features/admin-impersonation.md](../features/admin-impersonation.md), [IMPERSONATION_AUDIT.md](../IMPERSONATION_AUDIT.md); unit tests in `apps/api/src/lib/*impersonation*`. |

---

## Supplier Admin (`/app/admin/suppliers`)

| Feature            | Status | Description                                                                                     |
| ------------------ | ------ | ----------------------------------------------------------------------------------------------- |
| **Directory**      | ✅     | Supplier table: name, email, plan, subscription status, product count, warehouse count, revenue |
| **Usage & Quotas** | ✅     | Product/warehouse usage; over-limit indicators                                                  |
| **Audit Logs**     | ✅     | Admin actions (tab)                                                                             |
| **Impersonate**    | ✅     | Per-row **Impersonate** to view as that supplier                                                |

---

## Restaurant Admin (`/app/admin/restaurants`)

| Feature            | Status | Description                                                                         |
| ------------------ | ------ | ----------------------------------------------------------------------------------- |
| **Directory**      | ✅     | Restaurant table: name, email, plan, subscription status, orders (30d), total spent |
| **Usage & Quotas** | ✅     | Order and spending metrics                                                          |
| **Audit Logs**     | ✅     | Admin actions (tab)                                                                 |
| **Impersonate**    | ✅     | Per-row **Impersonate** to view as that restaurant                                  |

---

## Tenant Limit Overrides

| Feature             | Status | Description                                                                                                                       |
| ------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Add override**    | ✅     | `POST /api/admin-dashboard/tenants/:tenantType/:id/override-limit` (limit_type, override_value, expiration_date, reason); audited |
| **Remove override** | ✅     | `DELETE .../override-limit/:overrideId`; audited                                                                                  |
| **Enforcement**     | ✅     | Plan enforcement (e.g. branches, warehouses) respects overrides from `tenant_limit_override`                                      |

---

## Chat Admin

| Feature                | Status | Description                                                                                                                                   |
| ---------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Join conversation**  | ✅     | `POST /api/chat/conversations/:id/admin-join`; admin added as participant; system message; audit                                              |
| **Start conversation** | ✅     | `POST /api/chat/admin/start-conversation` (tenant_id, tenant_type, initial_message); creates conversation with `is_admin_conversation`; audit |
| **List conversations** | ✅     | `GET /api/chat/admin/conversations`; tenant name/email, admin count, last message                                                             |

---

## Technical Notes

- **Auth:** All admin routes use `requireAuth` and `requireRole(['ADMIN'])`.
- **Audit:** Admin actions write to `admin_audit_log` (admin_user_id, action_type, target entity, old/new value, ip, user_agent).
- **Impersonation:** Middleware `impersonationContext` runs globally after request context; cookie `impersonation_token` (httpOnly, sameSite, path=/). Use `getEffectiveTenant(req)` in routes that should scope by impersonated tenant.
- **Data:** Real-time from PostgreSQL; subscription and plan enforcement applied.

---

## Not Yet Implemented (see ADMIN_AUDIT.md)

- Admin sub-roles (e.g. SUPER_ADMIN, SUPPORT_ADMIN, FINANCE_ADMIN) and permission matrix
- System Health tab (failed jobs, webhook/API errors, DB pool, email failures)
- Global Financial Dashboard (GMV, outstanding/overdue, MRR/ARR, top tenants by revenue/overdue, revenue by plan)
- Full UI wiring for Plan/Subscription “Edit” and Override dialogs (partial today)
