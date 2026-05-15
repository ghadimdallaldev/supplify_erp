# Performance and indexing (Phase D)

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

## Query patterns

- **Admin financial overview:** Uses SUM on invoice with status filters; indexes above avoid full table scans.
- **Entitlements / usage:** Single tenant; usage_meter and subscription are fetched by tenant_id + tenant_type.
- **Admin health:** system_event filtered by severity and ordered by created_at DESC with LIMIT.

## Atomic usage

Daily meters (orders_per_day, chats_per_day) use `checkAndIncrementUsage` with a transaction and `SELECT ... FOR UPDATE` on the usage_meter row so concurrent requests do not double-count. See [HARDENING.md](../architecture/HARDENING.md).
