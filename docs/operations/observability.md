# Observability (Phase C)

Admin health signals and financial overview for operators.

## C1) System health

**Endpoint:** `GET /api/admin-dashboard/health` (admin only).

Returns:

- **jobFailures:** In-memory cron failure log from `getRecentCronFailures()`. Returns last N failures with job name, error message, and timestamp.
- **webhookFailures:** Placeholder (webhook tracking not yet implemented); returns [].
- **emailFailures:** Last 20 failed/retryable rows from `email_delivery_log` via `getAdminEmailHealthFailures()` (requires migration 0136). Includes `recipientRedacted` field.
- **recentApiErrors:** Last 50 rows from `system_event` where `severity = 'error'` (type, source, message, created_at).
- **dbPool:** If the DB client exposes pool stats: `{ total, idle, waiting }`; otherwise null.

**system_event table** (migration 0047): `type`, `severity` (info|warn|error), `source`, `payload` (JSONB), `created_at`. The centralized error handler middleware writes an `api_error` event on every unhandled error. Other sources (jobs, webhooks, email) can write to `system_event` when implemented.

## C2) Financial overview

**Endpoint:** `GET /api/admin-dashboard/financial-overview` (admin only).

Returns:

- **gmv:** Sum of `invoice.total_amount` for issued/paid/overdue invoices.
- **outstanding:** Sum of `invoice.balance_due` where status in (ISSUED, PARTIALLY_PAID, OVERDUE).
- **overdue:** Sum of `invoice.balance_due` where status = OVERDUE.
- **revenueByPlan:** Per-plan subscription count and MRR (from subscription + subscription_plan).
- **mrr / arr:** Sum of MRR across plans, and ARR = MRR × 12.
- **topTenantsByRevenue:** Top 10 restaurants by sum of paid/partially_paid invoice totals.
- **topTenantsByOverdue:** Top 10 restaurants by sum of overdue balance_due.

**Indexes** (migration 0047): `invoice(status, due_date)`, `invoice(restaurant_id, status, due_date)`, `invoice(supplier_id, status, due_date)` for efficient finance queries.

## Admin UI

- **Health tab:** Shows DB pool stats (if available) and recent API errors list.
- **Finance tab:** Shows GMV, Outstanding, Overdue, MRR, ARR; revenue by plan; top tenants by revenue and by overdue.

## Files touched (Phase C)

- **API:** `db/migrations/0047_system_events_observability.sql`; `lib/systemEvent.js`; `middlewares/errorHandler.js` (write system_event on error); `routes/admin-dashboard.routes.js` (GET /health, GET /financial-overview).
- **Web:** `services/api.ts` (getAdminHealth, getAdminFinancialOverview); `pages/AdminDashboardPage.tsx` (Health and Finance tabs).
