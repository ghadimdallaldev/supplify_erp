# API cron / scheduled jobs

All background jobs run **inside the API process** ([`apps/api/src/server.js`](../../apps/api/src/server.js)) using `setInterval`. There is no separate Railway cron service. Each tick is wrapped in [`runCronJob`](../../apps/api/src/lib/cron-runner.js), which enforces:

- **In-process guard** — skip if the previous tick is still running on this instance.
- **PostgreSQL advisory lock** — skip if another API replica holds the lock (safe for horizontal scaling).

Scheduled quick lists additionally use a **`quick_list_execution` ledger** (one row per list per UTC day) and `FOR UPDATE SKIP LOCKED` when claiming due lists.

## Job inventory

| Job                     | Default interval                         | Handler                                                                                  |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Scheduled quick lists   | 5 min (dev), 1 h (production `NODE_ENV`) | [`scheduled-orders.service.js`](../../apps/api/src/services/scheduled-orders.service.js) |
| Invoice overdue         | 24 h                                     | [`invoice-overdue.job.js`](../../apps/api/src/jobs/invoice-overdue.job.js)               |
| Subscription billing    | 1 h                                      | [`subscription-billing.job.js`](../../apps/api/src/jobs/subscription-billing.job.js)     |
| Waitlist expired offers | 15 min                                   | [`waitlistPromotion.js`](../../apps/api/src/services/waitlistPromotion.js)               |
| Promotions expiry       | 30 min                                   | [`promotions-expiry.job.js`](../../apps/api/src/jobs/promotions-expiry.job.js)           |
| Invitation expiry       | 1 h                                      | branch + restaurant invitation libs                                                      |
| Free sandbox expiry     | 1 h                                      | [`free-sandbox-expiry.job.js`](../../apps/api/src/jobs/free-sandbox-expiry.job.js)       |
| Fulfillment exceptions  | 30 min                                   | [`fulfillment-exceptions.job.js`](../../apps/api/src/jobs/fulfillment-exceptions.job.js) |

## Environment variables

| Variable                            | Default                                | Purpose                                                                 |
| ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `CRONS_ENABLED`                     | `true`                                 | Set `false` to disable all crons on a service (e.g. read-only replica). |
| `CRON_SCHEDULED_ORDERS_INTERVAL_MS` | `300000` (dev), `3600000` (production) | Poll interval for scheduled quick lists.                                |

## Manual trigger

`POST /api/quick-lists/execute-scheduled` (auth: `RESTAURANT` or `ADMIN`) runs the same logic as the scheduled-orders cron immediately.

## Timezone note

Due dates and `preferred_time` for quick lists are evaluated in **UTC** until per-restaurant timezones exist.

## Idempotency by job

| Job                                | Duplicate protection                                       |
| ---------------------------------- | ---------------------------------------------------------- |
| Scheduled quick lists              | Ledger `UNIQUE(quick_list_id, execution_date)` + row locks |
| Invoice overdue                    | `UPDATE ... WHERE overdue_notified_at IS NULL RETURNING`   |
| Subscription billing               | `FOR UPDATE` per subscription + charge `idempotencyKey`    |
| Fulfillment exceptions             | Skip if open exception exists for `order_id` + `type`      |
| Promotions / invitations / sandbox | Idempotent SQL `UPDATE` predicates                         |
| Waitlist                           | `FOR UPDATE SKIP LOCKED` in promotion flow                 |

## Operations

- Migration `0130_quick_list_execution_ledger.sql` must be applied before scheduled-order idempotency is active.
- Inspect runs: `SELECT * FROM quick_list_execution ORDER BY created_at DESC LIMIT 50;`
- Logs: search for `event: cron.started` / `cron.completed` / `cron.skipped`.
