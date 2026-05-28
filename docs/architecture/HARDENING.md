# Hardening (Phase A)

Production-grade billing safety, auditability, race conditions, and security.

## A1) Audit logging

- **Unified table `audit_logs`** (migration 0046): `action_type`, `actor_user_id`, `actor_admin_role`, `tenant_type`, `tenant_id`, `target_id`, `payload_json`, `request_id`, `created_at`.
- **Existing `admin_audit_log`** still used for admin UI; all admin actions also write to `audit_logs` via `writeAuditLog()` (see `lib/audit.js`).
- **Coverage:**
  - Subscription plan changes (admin): `subscription.updated`, `subscription.suspend`, `subscription.resume`
  - Limit override create/update/delete: `OVERRIDE_LIMIT`, `override.update`, `REMOVE_OVERRIDE`
  - Subscription suspend/resume: see above
  - Impersonation start/stop: `IMPERSONATION_START`, `IMPERSONATION_END`
  - Plan create/update: `plan.created`, `plan.updated`
- Optional: feature/limit enforcement failures can be written to `audit_logs` (aggregated); not implemented per-request to avoid volume.

## A2) Subscription state history

- **Table `subscription_change_log`** (migration 0046): `subscription_id`, `from_plan_id`, `to_plan_id`, `changed_by_user_id`, `changed_by_admin_id`, `reason`, `created_at`.
- On admin PATCH subscription (plan change), a row is inserted.
- **`subscription.previous_plan_code`** stores the previous plan code for quick access.

## A3) Downgrade protection and grace periods

- **Downgrade block:** If current usage exceeds the target plan limits, PATCH subscription returns 400 unless:
  - `force: true` (admin only) with **`reason`** required, or
  - `allowExceedance: true` (legacy).
- **Apply at period end:** Request body `applyAtPeriodEnd: true` with `planId` sets `pending_plan_id` and `pending_effective_at` (defaults to `current_period_end`) instead of changing plan immediately. On next `getTenantSubscription()` when `pending_effective_at` has passed, the pending plan is applied and `pending_plan_id`/`pending_effective_at` are cleared.

## A4) Usage race conditions

- **Atomic check + increment:** For daily meters (`orders_per_day`, `chats_per_day`), use `checkAndIncrementUsage(tenantId, tenantType, meterType, increment)` in `lib/subscription.js`. It runs in a transaction with row lock (`SELECT ... FOR UPDATE`) and UPSERT so concurrent requests cannot double-count.
- **Unique constraint:** `usage_meter` has `UNIQUE(tenant_id, tenant_type, meter_type, period_start_date)` (migration 0022). Index added in 0046 for consistent window lookups.
- **Consistent window:** Daily meters use `period_start_date = CURRENT_DATE`; check and increment use the same window.

## A5) Security hardening

- **Suspension:** `resolveTenantContext` in `lib/rbac.js` checks subscription status; if `SUSPENDED`, returns 403 `SUBSCRIPTION_SUSPENDED`. All tenant routes using `resolveTenantContext` are blocked when suspended.
- **Impersonation:** See [features/admin-impersonation.md](../features/admin-impersonation.md).
  - Short-lived JWT (`sessionId`, `adminUserId`, tenant claims); `impersonationContext` on every request.
  - Cannot impersonate ADMIN contact email; suspended/inactive tenant requires `acknowledgeSuspended`.
  - `requireRole` impersonation bypass; `getRequestTenant` + branch cookie; org branch lists for impersonating admin.
  - **Billing mutations blocked** while impersonating (`impersonation-guards.js`).
  - **Force stop on logout:** `clearImpersonationCookie(res)` in auth routes.
- **Rate limits** (in-memory; TODO: Redis for production):
  - `/api/public`: 200 requests per 15 min per IP (reservations, staff self-service).
  - `/api/chat`: 300 requests per 15 min per IP (chat send and other chat endpoints).
  - Auth: 500 per 15 min; global: 1000 per 15 min.

## Migrations

- **0046_hardening_audit_subscription_usage.sql:** `audit_logs`, `subscription_change_log`, `subscription.previous_plan_code`, `subscription.pending_plan_id` / `pending_effective_at`, `admin_audit_log.request_id`, usage_meter index.

## Files touched (Phase A)

- `apps/api/db/migrations/0046_hardening_audit_subscription_usage.sql`
- `apps/api/src/lib/audit.js` (new)
- `apps/api/src/lib/plan-enforcement.js` (fix admin_audit_log columns)
- `apps/api/src/lib/subscription.js` (checkAndIncrementUsage, getTenantSubscription pending apply)
- `apps/api/src/lib/impersonation.js` (clearImpersonationCookie)
- `apps/api/src/lib/rbac.js` (suspension check in resolveTenantContext)
- `apps/api/src/routes/admin-dashboard.routes.js` (logAudit + writeAuditLog, subscription PATCH force/reason/applyAtPeriodEnd, subscription_change_log, override upsert)
- `apps/api/src/routes/auth.routes.js` (clear impersonation on logout)
- `apps/api/src/routes/orders.routes.js` (checkAndIncrementUsage for orders_per_day)
- `apps/api/src/routes/chat.routes.js` (checkAndIncrementUsage for chats_per_day)
- `apps/api/src/server.js` (publicLimiter, chatSendLimiter)
