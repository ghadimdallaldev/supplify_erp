# API cron / scheduled jobs

All background jobs run **inside the API process** ([`apps/api/src/server.js`](../../apps/api/src/server.js)) via [`registerCronJobs`](../../apps/api/src/lib/register-cron-jobs.js) using `setInterval`. There is no separate Railway cron service. Each tick is wrapped in [`runCronJob`](../../apps/api/src/lib/cron-runner.js), which enforces:

- **In-process guard** — skip if the previous tick is still running on this instance.
- **PostgreSQL advisory lock** — skip if another API replica holds the lock (safe for horizontal scaling).
- **Test isolation** — crons are not registered when `NODE_ENV=test`.

Scheduled quick lists additionally use a **`quick_list_execution` ledger** (one row per list per UTC day) and `FOR UPDATE SKIP LOCKED` when claiming due lists.

**Full audit:** [`docs/audits/CRON_AND_BACKGROUND_JOBS_AUDIT.md`](../audits/CRON_AND_BACKGROUND_JOBS_AUDIT.md)

## Job inventory

| Job                                   | Default interval                                | Handler                                                                                                                                                                                                                          |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduled quick lists                 | 5 min (dev), 1 h (production `NODE_ENV`)        | [`scheduled-orders.service.js`](../../apps/api/src/services/scheduled-orders.service.js)                                                                                                                                         |
| Invoice overdue                       | 24 h                                            | [`invoice-overdue.job.js`](../../apps/api/src/jobs/invoice-overdue.job.js)                                                                                                                                                       |
| Subscription billing                  | 1 h                                             | [`subscription-billing.job.js`](../../apps/api/src/jobs/subscription-billing.job.js)                                                                                                                                             |
| Waitlist expired offers               | 15 min                                          | [`waitlistPromotion.js`](../../apps/api/src/services/waitlistPromotion.js)                                                                                                                                                       |
| Promotions expiry                     | 30 min                                          | [`promotions-expiry.job.js`](../../apps/api/src/jobs/promotions-expiry.job.js)                                                                                                                                                   |
| Invitation expiry                     | 1 h                                             | branch + restaurant invitation libs                                                                                                                                                                                              |
| Free sandbox expiry                   | 1 h                                             | [`free-sandbox-expiry.job.js`](../../apps/api/src/jobs/free-sandbox-expiry.job.js)                                                                                                                                               |
| Trial ending soon                     | 1 h                                             | [`trial-ending-soon.job.js`](../../apps/api/src/jobs/trial-ending-soon.job.js) — 2-day and 1-day reminders before Free Trial expiry                                                                                              |
| Fulfillment exceptions                | 30 min                                          | [`fulfillment-exceptions.job.js`](../../apps/api/src/jobs/fulfillment-exceptions.job.js)                                                                                                                                         |
| Delivery rollover                     | 1 h (`CRON_DELIVERY_ROLLOVER_INTERVAL_MS`)      | [`delivery-rollover.job.js`](../../apps/api/src/jobs/delivery-rollover.job.js) — no-op unless `DELIVERY_ROLLOVER_ENABLED=true`                                                                                                   |
| Operational reminders                 | 24 h (`CRON_OPERATIONAL_REMINDERS_INTERVAL_MS`) | [`operational-reminders.job.js`](../../apps/api/src/jobs/operational-reminders.job.js)                                                                                                                                           |
| Collections reminders                 | 24 h                                            | [`collections-reminders.job.js`](../../apps/api/src/jobs/collections-reminders.job.js) — overdue invoice email/in-app reminders with `invoice_reminder_log` dedup (migration `0176`)                                             |
| Driver location retention             | 24 h                                            | [`driver-location-retention.job.js`](../../apps/api/src/jobs/driver-location-retention.job.js) — purges `driver_location_ping` older than `GPS_LOCATION_RETENTION_DAYS` (default 90); does not delete `driver_latest_location`   |
| Email retry                           | 1 h                                             | [`email-retry.job.js`](../../apps/api/src/jobs/email-retry.job.js) — retries `email_delivery_log` rows with `status=failed` and stored `retry_payload`                                                                           |
| Email digest                          | 24 h                                            | [`email-digest.job.js`](../../apps/api/src/jobs/email-digest.job.js) — daily rollup for users with `notify_email_digest=true`                                                                                                    |
| Stale GPS alerts                      | 15 min                                          | [`stale-gps-alerts.job.js`](../../apps/api/src/jobs/stale-gps-alerts.job.js) — supplier alerts for stale active delivery GPS                                                                                                     |
| Log retention                         | 24 h                                            | [`log-retention.job.js`](../../apps/api/src/jobs/log-retention.job.js) — purges old logs/sessions per retention env vars                                                                                                         |
| Reorder forecast (`reorder_forecast`) | 24 h (`86400000` ms)                            | [`reorder-forecast.job.js`](../../apps/api/src/jobs/reorder-forecast.job.js) — `refreshAllDirtyForecasts()` for restaurants with `smart_reorder`; processes `reorder_forecast_dirty` queue and rows past 24h TTL (`stale_after`) |
| Growth program maintenance            | 1 h                                             | [`sponsorship-expiry.job.js`](../../apps/api/src/jobs/sponsorship-expiry.job.js) — expire sponsorships, growth invitations, connection requests                                                                                  |

## Environment variables

| Variable                                 | Default                                | Purpose                                                                   |
| ---------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `CRONS_ENABLED`                          | `true`                                 | Set `false` to disable all crons on a service (e.g. read-only replica).   |
| `CRON_SCHEDULED_ORDERS_INTERVAL_MS`      | `300000` (dev), `3600000` (production) | Poll interval for scheduled quick lists.                                  |
| `CRON_OPERATIONAL_REMINDERS_INTERVAL_MS` | `86400000` (24 h)                      | Expiry + reorder cadence reminder job.                                    |
| `CRON_DELIVERY_ROLLOVER_INTERVAL_MS`     | `3600000` (1 h)                        | Delivery rollover poll interval.                                          |
| `DELIVERY_ROLLOVER_ENABLED`              | `false`                                | Enable delivery rollover mutations.                                       |
| `GPS_LOCATION_RETENTION_DAYS`            | `90`                                   | Delete `driver_location_ping` rows older than this.                       |
| `DEFAULT_TENANT_TIMEZONE`                | `Asia/Beirut`                          | Default IANA zone for reorder cadence when `restaurant.timezone` is null. |
| `EMAIL_RETRY_MAX_ATTEMPTS`               | `3`                                    | Max retry attempts per failed email row.                                  |
| `NOTIFICATION_LOG_RETENTION_DAYS`        | `90`                                   | Log retention job purge threshold (0 = skip).                             |
| `EMAIL_DELIVERY_LOG_RETENTION_DAYS`      | `180`                                  | Purge sent/skipped email log rows.                                        |

## Manual trigger (HTTP)

`POST /api/quick-lists/execute-scheduled` (auth: `RESTAURANT` or `ADMIN`) runs scheduled orders via `runManualCronJob` (advisory lock; works when `CRONS_ENABLED=false`).

`POST /api/restaurant-inventory/expiry/check-reminders` (auth: `INVENTORY_MANAGE`) runs expiry notifications for the current restaurant via `runManualCronJob`.

## Manual trigger (CLI)

From `apps/api`:

```bash
pnpm jobs:list
pnpm jobs:run -- operational-reminders --dry-run
pnpm jobs:run -- inventory-expiry --dry-run
pnpm jobs:run -- reorder-cadence --dry-run
pnpm jobs:run -- trial-ending-soon --dry-run
pnpm jobs:run -- delivery-rollover --force
```

Legacy script: `node scripts/run-delivery-rollover.mjs [--force] [--supplier=UUID]`

## Observability

- Logs: `event: cron.started` / `cron.completed` / `cron.skipped` / `cron.failed` (includes `durationMs` and handler `result` when available)
- Admin health: `GET /api/admin-dashboard/health` → `jobFailures` (recent in-memory cron failures)

## Timezone note

Due dates and `preferred_time` for quick lists are still evaluated in **UTC**. Reorder cadence weekday detection uses each restaurant's `timezone` column (fallback `DEFAULT_TENANT_TIMEZONE`, default `Asia/Beirut`).

## Idempotency by job

| Job                                | Duplicate protection                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Scheduled quick lists              | Ledger `UNIQUE(quick_list_id, execution_date)` + row locks                                                       |
| Invoice overdue                    | `UPDATE ... WHERE overdue_notified_at IS NULL RETURNING`                                                         |
| Subscription billing               | `FOR UPDATE` per subscription + charge `idempotencyKey`                                                          |
| Trial ending soon                  | `billing_trial_reminder_log` UNIQUE claim before notify                                                          |
| Fulfillment exceptions             | Skip if open exception exists for `order_id` + `type`                                                            |
| Operational reminders              | Claim rows in `inventory_expiry_notification_log` / `reorder_cadence_reminder_log` before notify                 |
| Reorder forecast                   | Skips tenants without `smart_reorder`; upserts `reorder_forecast`, clears matching `reorder_forecast_dirty` rows |
| Promotions / invitations / sandbox | Idempotent SQL `UPDATE` predicates                                                                               |
| Waitlist                           | `FOR UPDATE SKIP LOCKED` in promotion flow                                                                       |

## Operations

- Migration `0130_quick_list_execution_ledger.sql` must be applied before scheduled-order idempotency is active.
- Migrations **0133–0135** must be applied before operational reminders (expiry lots, fulfillment issues, reorder cadence) are active.
- Migration **0166** (`reorder_forecast`, `reorder_forecast_dirty`) must be applied before the reorder forecast cron is active.
- Migration **0168** (`catalog_image_import_job`, `product.image_thumb_url`) must be applied before **Import Product Images** (bulk ZIP) is available — not a cron job; see [bulk-product-image-import.md](../features/bulk-product-image-import.md) and in-process worker `image-import-worker.js`.
- Migration **0152** (`billing_trial_reminder_log`) must be applied before trial-ending-soon reminders are active.
- Migration **0153** must be applied before email retry/digest, stale GPS dedup, restaurant timezone, and log retention jobs are active.
- Run `pnpm db:migrate` per environment; Railway uses `RUN_MIGRATIONS_ON_START=false`.
- Inspect runs: `SELECT * FROM quick_list_execution ORDER BY created_at DESC LIMIT 50;`
- Logs: search for `event: cron.started` / `cron.completed` / `cron.skipped`.
