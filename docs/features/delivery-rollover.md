# Delivery rollover (next-day)

Undelivered driver assignments can be moved to the next delivery day automatically after a configurable cutoff, or manually from the supplier dispatch board.

## Why

If a driver does not finish all stops before the operational day ends, assignments should not stay on **today’s** dispatch board or active route as if they are still in progress. Rollover marks them **rescheduled** for tomorrow without auto-delivering or auto-receiving.

## Configuration

| Variable                             | Default       | Description                                                           |
| ------------------------------------ | ------------- | --------------------------------------------------------------------- |
| `DELIVERY_ROLLOVER_ENABLED`          | `false`       | Master switch for the cron job                                        |
| `DELIVERY_ROLLOVER_CUTOFF_HOUR`      | `3`           | Local hour (0–23) after which same-day undelivered work rolls         |
| `DELIVERY_ROLLOVER_TIMEZONE`         | `Asia/Beirut` | IANA timezone for cutoff                                              |
| `DELIVERY_ROLLOVER_KEEP_DRIVER`      | `true`        | Keep driver on assignment; add to `Rollover YYYY-MM-DD` planned route |
| `CRON_DELIVERY_ROLLOVER_INTERVAL_MS` | `3600000`     | How often the API process checks (default 1 hour)                     |

Enable on **dev** in `apps/api/.env` to test:

```env
DELIVERY_ROLLOVER_ENABLED=true
DELIVERY_ROLLOVER_CUTOFF_HOUR=3
DELIVERY_ROLLOVER_TIMEZONE=Asia/Beirut
```

## Eligibility

An assignment is rolled when:

- Status is `assigned`, `picked_up`, `out_for_delivery`, or `rescheduled`
- Effective delivery date is **before** local today, **or** equal to local today and local time is **≥ cutoff hour**
- Order is not terminal: `DELIVERED`, `RECEIVED_*`, `CANCELLED`, `INVOICED`, `COMPLETED`
- Assignment is not `delivered`, `failed`, or `reassigned`
- Not already rolled earlier **the same local calendar day** (idempotent)

Effective delivery date = `scheduled_delivery_date` → active route `scheduled_date` → `assigned_at` date.

## Result

For each eligible assignment:

1. `driver_assignments.status` → `rescheduled`
2. `scheduled_delivery_date` → next calendar day
3. `rolled_over_at` set; `rollover_count` incremented
4. Incomplete stops removed from today’s `PLANNED` / `IN_PROGRESS` routes
5. If `DELIVERY_ROLLOVER_KEEP_DRIVER=true`, order appended to a planned route `Rollover {date}` for that driver
6. Audit log: `delivery.rollover` — _Delivery rolled over to next day because it was not delivered before cutoff._
7. **Order status unchanged** (stays `PROCESSING` / `SHIPPED`, etc.)

## GPS / ETA / tracking

- `rescheduled` is not a live-tracking status — GPS/ETA unavailable until dispatch resumes
- Restaurant tracking label: **Delivery has been rescheduled**
- Supplier dispatch board: **Moved to tomorrow** badge with date; bucket **Assigned**

## Manual action

**Fulfillment → Driver Dispatch** → **Move to tomorrow** on assigned or out-for-delivery cards.

API: `POST /api/fulfillment/assignments/:assignmentId/rollover-to-tomorrow` (requires `FULFILLMENT_MANAGE`). Uses the same service with `force: true` (ignores cutoff).

Reactivate for the new day: **Ready to dispatch** (`rescheduled` → `assigned`) on the dispatch board.

## Run manually

From repo root (with API env loaded):

```bash
node apps/api/scripts/run-delivery-rollover.mjs
node apps/api/scripts/run-delivery-rollover.mjs --force
node apps/api/scripts/run-delivery-rollover.mjs --supplier=SUPPLIER_UUID
```

## Railway scheduling

The job runs **inside the API process** (same pattern as fulfillment exceptions). On Railway **dev**:

1. Set env vars on the API service (see above).
2. Set `CRONS_ENABLED=true` (default).
3. Deploy — no separate worker required.
4. Optional: set `CRON_DELIVERY_ROLLOVER_INTERVAL_MS=1800000` (30 min) on dev for faster testing.

The job no-ops when `DELIVERY_ROLLOVER_ENABLED=false`.

## Notifications

- **Supplier:** one in-app notification per job run — _N deliveries were moved to tomorrow._
- **Restaurant:** optional (`notify_restaurant: true` on manual API only); cron does not notify restaurants by default.

## Rollback notes

- Rollover is non-destructive: assignment rows and audit logs remain
- To undo: use **Ready to dispatch**, reassign driver, or adjust `scheduled_delivery_date` in DB (support only)
- Disabling `DELIVERY_ROLLOVER_ENABLED` stops future automatic rolls; already rescheduled assignments stay as-is

## Key files

| Area          | File                                                 |
| ------------- | ---------------------------------------------------- |
| Service       | `apps/api/src/services/delivery-rollover.service.js` |
| Cron          | `apps/api/src/jobs/delivery-rollover.job.js`         |
| Migration     | `apps/api/db/migrations/0143_delivery_rollover.sql`  |
| Manual script | `apps/api/scripts/run-delivery-rollover.mjs`         |
| API           | `apps/api/src/routes/fulfillment.routes.js`          |
| UI            | `DriverDispatchBoard.tsx`, `DispatchOrderRow.tsx`    |
