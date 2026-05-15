# Admin Implementation Audit — Step 1

**Date:** 2026-02-13  
**Goal:** Upgrade Admin to production-grade SaaS operator console.  
**Scope:** Full scan of Admin routes, controllers, services, UI, middleware, RBAC, audit, subscriptions, chat admin.

---

## 1. What Exists

### 1.1 Admin Routes

| Location                                        | Mount                  | Purpose                                                                                                                       |
| ----------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/routes/admin.routes.js`           | `/api/admin`           | Legacy admin: `GET /audit`, `GET /dashboard` (role-aware stats)                                                               |
| `apps/api/src/routes/admin-dashboard.routes.js` | `/api/admin-dashboard` | Main admin: overview, plans, subscriptions, usage, audit-logs, tenants (suppliers/restaurants), override limits, tenant usage |

**Admin route summary:**

- **`/api/admin`**: `GET /audit` (filtered audit list), `GET /dashboard` (stats by role: ADMIN sees platform-wide, SUPPLIER/RESTAURANT see own).
- **`/api/admin-dashboard`**: `GET /overview`, `GET/POST /plans`, `PATCH /plans/:id`, `GET /subscriptions`, `PATCH /subscriptions/:id`, `GET /usage/:tenantId`, `GET /audit-logs`, `GET /tenants/suppliers`, `GET /tenants/restaurants`, `POST/DELETE /tenants/:tenantType/:id/override-limit`, `GET /tenants/suppliers/:id/usage`, `GET /tenants/restaurants/:id/usage`.

### 1.2 Admin “Controllers” / Handlers

- **No separate controller layer.** Route handlers in `admin.routes.js` and `admin-dashboard.routes.js` perform DB access and response logic directly (inline).
- **Shared helper:** `logAudit(req, actionType, actionDescription, targetEntityType, targetEntityId, oldValue, newValue, metadata)` in `admin-dashboard.routes.js` for admin_audit_log writes.

### 1.3 Admin Services

- **No dedicated admin service layer.** Subscription/plan logic lives in:
  - `apps/api/src/lib/subscription.js`: `getTenantSubscription`, `isFeatureEnabled`, `checkLimit`, `incrementUsage`, etc. (tenant-scoped, used by tenant and plan enforcement).
  - `apps/api/src/lib/plan-enforcement.js`: `checkBranchLimit`, `checkWarehouseLimit`, `createAuditLog` (branch/warehouse limits + audit helper).
- **Plan enforcement** is used by branches and warehouses routes; not a dedicated “admin service.”

### 1.4 Admin UI Pages

| Path                     | File                                  | Content                                                                                                                                                        |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/app/admin`             | `AdminDashboardPage.tsx`              | Tabs: Overview, Plans, Subscriptions, Tenants, Usage, Audit Logs. Uses RTK Query: overview, plans, subscriptions, audit logs, tenants (suppliers/restaurants). |
| `/app/admin/suppliers`   | Same page, `initialTab='suppliers'`   | Supplier Admin: Directory, Usage & Quotas, Audit Logs.                                                                                                         |
| `/app/admin/restaurants` | Same page, `initialTab='restaurants'` | Restaurant Admin: Directory, Usage & Quotas, Audit Logs.                                                                                                       |

- **Routing:** `App.tsx` defines `/app/admin`, `/app/admin/suppliers`, `/app/admin/restaurants` → `AdminDashboardPage` with appropriate `initialTab`.
- **No** dedicated System Health, Financial Overview, or Impersonation UI.

### 1.5 Admin Middleware

- **RBAC:** `requireAuth` and `requireRole(['ADMIN'])` from `apps/api/src/lib/rbac.js`. Used on all admin and admin-dashboard routes. No separate “admin middleware” module.
- **No** impersonation middleware, no `impersonationContext`, no admin-role or admin-permission middleware.

### 1.6 RBAC Logic

- **`apps/api/src/lib/rbac.js`**:
  - **Roles:** Single tenant/app role: `ADMIN`, `SUPPLIER`, `RESTAURANT`. Stored in `app_user.role`.
  - **Resolution:** From Keycloak realm roles (`admin` → ADMIN, `supplier` → SUPPLIER) or by demo email (`admin@supplify.com`, `supplifyadmin@supplify.com` → ADMIN).
  - **Middleware:** `requireRole(allowedRoles)` — checks `req.userData.role` against array; `requireOwnership(ownerType)` — ADMIN bypasses, else SUPPLIER/RESTAURANT must match.
- **No** admin sub-roles (e.g. SUPER_ADMIN, SUPPORT_ADMIN, FINANCE_ADMIN, GROWTH_ADMIN). No permission enum or mapping table.

### 1.7 Audit Logging

- **Tables:**
  - **`audit_log`** (migration 0001): `actor_sub`, `actor_role`, `action`, `resource`, `resource_id`, `payload`, `status`, `request_id`. Generic app audit.
  - **`admin_audit_log`** (migration 0022): `admin_user_id`, `admin_name`, `action_type`, `action_description`, `target_tenant_id`, `target_tenant_type`, `target_entity_type`, `target_entity_id`, `old_value`, `new_value`, `metadata`, `ip_address`, `user_agent`, `created_at`. Used by admin-dashboard and chat admin.
- **Who writes:**
  - **admin-dashboard.routes.js:** `logAudit()` — plan create/update, subscription update, override add/remove (correct columns).
  - **chat.routes.js:** Inserts for `ADMIN_JOINED_CHAT`, `ADMIN_STARTED_CHAT` (uses `action_type`, `target_entity_type`, `target_entity_id`, `action_description`, `admin_user_id` — no `target_tenant_id`/`admin_name` in some inserts).
  - **plan-enforcement.js:** `createAuditLog()` inserts with column **`changes_json`** — **admin_audit_log has no `changes_json`** (has `old_value`, `new_value`, `metadata`). **Schema mismatch.**
- **Who reads:**
  - **admin-dashboard.routes.js:** `GET /audit-logs` — filters by `tenantId`, `actionType`; uses correct `admin_audit_log` columns.
  - **admin.routes.js:** `GET /audit` — uses **`actor_sub`, `action`, `resource`** in WHERE and SELECT against **`admin_audit_log`**, which does **not** have those columns. **Bug: wrong schema / wrong table.**

### 1.8 Subscription Management

- **Plans:** CRUD in admin-dashboard (create plan, patch plan). Stored in `subscription_plan`.
- **Subscriptions:** List with filters (status, tenantType), PATCH to change plan_id, status, cancel_reason. Stored in `subscription`. Tenant resolved via JOIN to supplier/restaurant.
- **Overrides:** `tenant_limit_override` (migration 0024): create/delete from admin-dashboard; used by plan enforcement (e.g. branch/warehouse limits).
- **No** explicit “suspend account” flow that blocks login (only subscription status SUSPENDED; no Keycloak or app_user flag). No “Grant Trial” or “Apply Override” UI wiring in AdminDashboardPage (Edit/Override buttons are placeholders).

### 1.9 Chat Admin Access

- **Endpoints:**
  - `POST /api/chat/conversations/:conversationId/admin-join` — add admin as participant, system message, audit.
  - `POST /api/chat/admin/start-conversation` — body: `tenant_id`, `tenant_type`, `initial_message`; create conversation with `is_admin_conversation`, add admin, send message, audit.
  - `GET /api/chat/admin/conversations` — list conversations with tenant name/email, admin count, last message (limit 100).
- **Audit:** Admin join and admin start chat write to `admin_audit_log` (with available columns).
- **UI:** Chat admin list/join/start not clearly exposed in AdminDashboardPage (no “Chat” or “Conversations” tab in audit).

---

## 2. What Is Missing

- **Impersonation:** No endpoint, no signed token, no middleware, no “View as” or “Impersonating X” banner. No audit for impersonation start/stop or expiry.
- **Admin RBAC (sub-roles):** No SUPER_ADMIN / SUPPORT_ADMIN / FINANCE_ADMIN / GROWTH_ADMIN. No AdminPermission enum, no mapping table, no permission checks on plan edit, subscription change, suspend, financial views, impersonation, or overrides.
- **System Health:** No admin tab or API for failed jobs, webhook failures, recent API errors, DB pool stats, or email failures. No placeholder structure for future queues/logging.
- **Global Financial Dashboard:** No admin-only financial overview: GMV, outstanding/overdue invoices, MRR/ARR, top tenants by revenue/overdue, revenue by plan. No dedicated route or UI.
- **Unified admin prefix:** Admin is split between `/api/admin` and `/api/admin-dashboard`; not consistently under a single `/admin/*` namespace.
- **Admin route guard:** Frontend relies on role from auth state and sidebar visibility; no dedicated route guard that redirects non-admins away from `/app/admin/*`.
- **Wired actions in UI:** Plan “Edit”, Subscription “Edit”, Tenant “Override limits” and “Start conversation” are not fully wired (e.g. dialogs/mutations) in AdminDashboardPage.

---

## 3. Structural Weaknesses

- **Two audit systems:** `audit_log` (old) and `admin_audit_log` (new). `GET /api/admin/audit` queries `admin_audit_log` with columns from the old schema (`actor_sub`, `action`, `resource`) → broken.
- **plan-enforcement.js** writes `changes_json` into `admin_audit_log`, which has no such column → INSERT will fail where that code path runs.
- **No service layer for admin:** Heavy logic and SQL in route handlers; harder to test and reuse (e.g. for System Health or Financial Overview).
- **Duplicate “dashboard” concepts:** `/api/admin/dashboard` (role-based stats) vs `/api/admin-dashboard/overview` (subscription/tenant/revenue). Two entry points for “admin overview.”
- **Chat admin audit:** Some inserts omit `target_tenant_id`, `admin_name`, or use inconsistent target_entity_type (e.g. tenant_type vs CONVERSATION).
- **Tenant resolution for non-admin routes:** Many routes use `req.userData` + email lookup to get tenant (supplier/restaurant). No central “effective tenant” (e.g. for future impersonation) — would require middleware and request context.

---

## 4. Security Concerns

- **Single admin role:** Any ADMIN can do everything (plans, subscriptions, overrides, audit, chat, tenant data). No least-privilege.
- **No impersonation controls:** When impersonation is added, must ensure: signed short-lived token, audit of start/end, no impersonation of Super Admin, session isolation.
- **Admin audit readability:** Any user with ADMIN can read full audit log; no restriction by admin sub-role (e.g. only SUPER_ADMIN sees certain actions).
- **Sensitive actions not gated:** Plan edit, subscription suspend, override create/delete are only gated by `requireRole(['ADMIN'])`; no rate limit or extra confirmation for dangerous actions.
- **Chat admin:** Admin can join any conversation and see full history; no check that conversation belongs to a tenant (restaurant/supplier) — currently acceptable but should remain explicit.

---

## 5. Multi-Tenant Isolation Concerns

- **Admin routes intentionally cross tenants:** Overview, tenants list, subscriptions, usage, audit logs correctly aggregate or list across all tenants. No tenant_id scoping by design.
- **Tenant-scoped routes used by admin:** Many non-admin routes (e.g. orders, invoices, inventory) allow ADMIN in `requireRole(['ADMIN', 'RESTAURANT'])`. For those, **tenant is derived from the resource (e.g. restaurant_id on order), not from the logged-in user.** So when an admin calls “list orders,” they must pass or filter by tenant; there is no automatic “current tenant” for admin. This is consistent with “admin sees everything via explicit tenant choice or list-all” but:
  - **Risk:** If any endpoint returns “all orders” when caller is ADMIN without requiring tenant filter, it would leak cross-tenant data. Audit did not find such a pattern; admin-specific endpoints use explicit tenant IDs or global lists.
- **Override and usage:** Override and usage APIs take `tenantId`/`tenantType` from params; admin can act on any tenant. No check that the admin’s “scope” (e.g. support vs super) limits which tenants they can touch — will matter once admin RBAC is added.
- **Impersonation (future):** Must ensure impersonation context is the only source of “effective tenant” for the request and is never confused with the admin’s own identity in audit or logging.

---

## 6. Summary Table

| Area                | Exists                                | Missing / Weak                                                                                |
| ------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| Admin routes        | `/api/admin`, `/api/admin-dashboard`  | Unified `/admin/*`; GET /api/admin/audit wrong schema                                         |
| Controllers         | Inline in routes                      | Dedicated admin service layer                                                                 |
| Services            | subscription.js, plan-enforcement.js  | Admin-specific service; createAuditLog schema fix                                             |
| Admin UI            | AdminDashboardPage, tabs              | System Health, Financial Overview, Impersonation banner, wire Edit/Override                   |
| Middleware          | requireAuth, requireRole(['ADMIN'])   | impersonationContext; requireAdminPermission                                                  |
| RBAC                | Single ADMIN role                     | Admin sub-roles and permission matrix                                                         |
| Audit               | admin_audit_log + logAudit            | Fix admin.routes audit query; fix plan-enforcement changes_json; consistent chat audit fields |
| Subscriptions       | Plans + subscriptions CRUD, overrides | Suspend/login enforcement; Grant Trial/Override UI                                            |
| Chat admin          | Join, start, list                     | UI tab; optional permission gating                                                            |
| Impersonation       | —                                     | Full feature (token, middleware, banner, audit, expiry)                                       |
| System Health       | —                                     | Tab + API (placeholders if no queues)                                                         |
| Financial dashboard | —                                     | GMV, MRR, ARR, top tenants, overdue, by plan                                                  |

---

**Next steps (implementation):**  
Step 2 — Impersonation.  
Step 3 — Admin RBAC (roles + permissions).  
Step 4 — System Health tab.  
Step 5 — Global Financial Dashboard.  
Step 6 — Structure & cleanup (routes, middleware, indexes).  
Step 7 — Update ADMIN.md (architecture, RBAC matrix, impersonation, security, financial queries, system health).
