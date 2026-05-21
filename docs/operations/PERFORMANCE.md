# Performance and indexing (Phase D)

Indexes, query patterns, and local dev startup optimizations.

## Local dev startup (`pnpm dev`)

| Optimization                          | Effect                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant role backfill skip             | `migrate.js` skips `migrate-users-to-roles.js` when all tenants have Owner system roles and legacy `user_role` rows are mirrored in `tenant_user_roles` (~7s saved per start). |
| Parallel runtime schema checks        | Reservations + staff app schema checks run in parallel.                                                                                                                        |
| Redis disconnect in migration scripts | Migration child processes call `disconnectCache()` and exit so `pnpm dev` is not blocked after migrations.                                                                     |
| Faster backfill when needed           | Tenant processing uses bounded concurrency; permission rows are batch-inserted per role.                                                                                       |

Force full role backfill: `pnpm db:migrate-users-to-roles`. Skip entirely: `SKIP_TENANT_ROLE_BACKFILL=1 pnpm db:migrate`. Skip migrations on restart: `pnpm dev -- --no-migrate`.

## Docker Postgres port

Use `docker compose --env-file docker/.env` so `POSTGRES_PORT=5433` matches `apps/api/.env` `DATABASE_URL`. A port mismatch causes connection failures and slow failed retries.

## Indexes and query patterns

Indexes and query patterns for admin dashboards and usage/subscription flows.

## Indexes (migrations 0046, 0047)

### usage_meter

- **Unique:** `(tenant_id, tenant_type, meter_type, period_start_date)` — avoids duplicate rows per window (0022).
- **Lookup:** `(tenant_type, tenant_id, meter_type, period_start_date)` — 0046 for consistent window lookups and atomic check+increment.

### subscription

- **Existing:** `(tenant_id, tenant_type)`, `(status)`, `(plan_id)`.
- **Recommended:** `(tenant_type, tenant_id, status)` for admin list and suspension checks (0046 index on usage_meter; subscription already has idx_subscription_tenant and idx_subscription_status).

### invoice

- **0047:** `(status, due_date)` for outstanding/overdue aggregates.
- **0047:** `(restaurant_id, status, due_date)` where restaurant_id IS NOT NULL.
- **0047:** `(supplier_id, status, due_date)`.

### audit_logs

- **0046:** `(tenant_id, tenant_type)`, `(created_at DESC)`, `(action_type)`, `(request_id)`.

### system_event

- **0047:** `(created_at DESC)`, `(type)`, `(severity)` where severity = 'error'.

## Indexes (migration 0091)

Added 2026-05-21 targeting the hottest query paths identified in production profiling.

### subscription (partial index)

- **`idx_subscription_tenant_status_active`** — `(tenant_id, tenant_type, created_at DESC) WHERE status IN ('TRIALING', 'ACTIVE')`. Covers the most common lookup in `getTenantSubscription` without touching cancelled/expired rows.

### feature_flag_override

- **`idx_feature_flag_override_tenant_key`** — `(tenant_id, tenant_type, feature_key)`. Adds `feature_key` as a third column so the `ANY(...)` filter in `resolveAllFeaturesForTenant` is satisfied by index scan rather than heap filter.

### usage_meter

- **`idx_usage_meter_tenant_id_type_meter_period`** — `(tenant_id, tenant_type, meter_type, period_start_date)`. Complements the existing `tenant_type`-leading index; better for single-tenant meter reads.

### subscription_plan

- **`idx_subscription_plan_tenant_type_active`** — `(tenant_type, is_active, display_order) WHERE is_active = true`. Covers the catalog queries in `recommendPlan` and `ensureTenantSubscription`.

## Subscription caching

`getTenantSubscription` (the most-called function in the API) now caches its result for **30 seconds** using the existing `cache.js` layer (Redis when available, in-memory fallback). This eliminates the 2–3 redundant DB round-trips that occurred per request when `requireFeature`, `checkLimit`, and the route handler each called it independently.

- Cache key: `sub:{tenantId}:{tenantType}`
- TTL: 30 seconds
- Invalidation: called automatically on plan checkout, pay-now, admin subscription update, admin account unlock, and successful billing-job renewal
- `invalidateTenantSubscriptionCache(tenantId, tenantType)` is exported from `subscription.js` for use in any future mutation path

Also: `requireFeature` attaches the already-fetched subscription to `req.subscription` so route handlers can reuse it without a second lookup.

## N+1 query fixes

| Location                                 | Fix                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `orders.routes.js` `handleOrderDelivery` | Per-item `SELECT + UPDATE/INSERT` loop replaced with single batch `INSERT … ON CONFLICT … DO UPDATE` |
| `chat.routes.js` send message            | Per-attachment `INSERT INTO message_attachment` loop replaced with multi-row `INSERT`                |

## Query patterns

- **Admin financial overview:** Uses SUM on invoice with status filters; indexes above avoid full table scans.
- **Entitlements / usage:** Single tenant; usage_meter and subscription are fetched by tenant_id + tenant_type.
- **Admin health:** system_event filtered by severity and ordered by created_at DESC with LIMIT.

## Atomic usage

Daily meters (orders_per_day, chats_per_day) use `checkAndIncrementUsage` with a transaction and `SELECT ... FOR UPDATE` on the usage_meter row so concurrent requests do not double-count. See [HARDENING.md](../architecture/HARDENING.md).
