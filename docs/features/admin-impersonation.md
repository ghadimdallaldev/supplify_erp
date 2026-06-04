# Admin impersonation (view as tenant)

Platform admins can open the **restaurant** or **supplier** workspace as a tenant for support and debugging—without tenant passwords and with a full audit trail.

**Canonical audit:** [IMPERSONATION_AUDIT.md](../IMPERSONATION_AUDIT.md)  
**Admin guide:** [ADMIN.md](../admin/admin-guide.md) · **QA:** [regression-checklist.md](../qa/regression-checklist.md) §4.9, §ADM-45–49

---

## User flow

1. **Admin Dashboard** → **Tenants** → **Impersonate** on a restaurant or supplier row.
2. API sets httpOnly cookie `impersonation_token` and redirects to **`/app/dashboard`**.
3. Sticky banner: **Impersonating [tenant name]** + **Exit impersonation**.
4. Sidebar, entitlements, branch switcher, and tenant pages use the **impersonated tenant type** (`useImpersonation()`).
5. **Exit** clears cookie, logs `IMPERSONATION_END`, returns to `/app/admin`.
6. **Logout** also clears impersonation (`auth.routes.js`).

Suspended or deactivated branches require confirmation: POST body `acknowledgeSuspended: true` after `403 TENANT_SUSPENDED`.

---

## API

Base: `/api/admin-dashboard` (requires `ADMIN` + `ADMIN_ACCESS`).

| Method | Path                | Body / response                                                                                                                                        |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/impersonate`      | `{ tenantId, tenantType: "RESTAURANT" \| "SUPPLIER", acknowledgeSuspended?: boolean }` → `{ tenantId, tenantType, tenantName, expiresAt, redirectTo }` |
| GET    | `/impersonate`      | `{ active: false }` or `{ active: true, tenantId, tenantType, tenantName, expiresAt, sessionId, realAdminUserId }`                                     |
| POST   | `/impersonate/stop` | `{ stopped: true }`                                                                                                                                    |

Env: `IMPERSONATION_SECRET`, `IMPERSONATION_MAX_DURATION_MINUTES` (default 60).

---

## Backend

| Piece               | Location                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| JWT cookie          | `apps/api/src/lib/impersonation.js`                                                                          |
| Per-request context | `apps/api/src/middlewares/impersonationContext.js`                                                           |
| Effective tenant    | `getEffectiveTenant(req)`, `getRequestTenant(req)` in `rbac.js`                                              |
| Role gates          | `requireRole` allows ADMIN when impersonated `tenantType` matches                                            |
| Branch switch       | `impersonationCanAccessBranch`, `canSwitchActiveTenant`                                                      |
| Org branches        | `restaurant-org.routes.js`, `org.routes.js` (list all branches when impersonating)                           |
| Billing block       | `impersonation-guards.js` on payment mutations                                                               |
| Audit               | `admin_audit_log`: `IMPERSONATION_START` / `IMPERSONATION_END`; `audit_logs`: `impersonation.blocked_action` |

---

## Frontend

| Piece          | Location                                               |
| -------------- | ------------------------------------------------------ |
| Hook           | `apps/web/src/hooks/useImpersonation.ts`               |
| Banner         | `apps/web/src/components/ImpersonationBanner.tsx`      |
| Entitlements   | `useEntitlements` loads when impersonating             |
| Permissions    | `usePermissions` → all tenant keys while impersonating |
| Branch context | `BranchContext.tsx`, `BranchSwitcher.tsx`              |

Tenant pages should use `isEffectiveRestaurant` / `isEffectiveSupplier` from `useImpersonation()`, not `user.role === 'ADMIN'`.

---

## Security summary

| Rule                        | Behavior                                                      |
| --------------------------- | ------------------------------------------------------------- |
| Who                         | `ADMIN` + `ADMIN_ACCESS` only                                 |
| Cannot impersonate          | Contact email linked to `app_user.role = ADMIN`               |
| Cookie binding              | Only the admin who started the session (`adminUserId` in JWT) |
| TTL                         | Short-lived JWT + cookie `maxAge`                             |
| Real actor                  | Always `req.userData.id` in audit and logs                    |
| Blocked while impersonating | Billing checkout, payment methods, pay-now, auto-renew        |
| Allowed                     | Most tenant read/write (audited); not tier/pricing changes    |

---

## Tests

- `apps/api/src/lib/impersonation.test.js`
- `apps/api/src/lib/rbac.impersonation.test.js`
- `apps/api/src/lib/impersonation-guards.test.js`

Run: `npm test --workspace=apps/api -- impersonation`
