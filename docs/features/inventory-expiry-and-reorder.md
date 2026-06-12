# Supplify Restaurant Operations Features

Operational features for restaurant inventory expiry, supplier shortage/substitution chat, ordering lists, and smart reorder reminders.

## Feature 1: Restaurant item expiry tracking

### Behavior

- Batch/lot-level tracking in `restaurant_inventory_lot` (additive to aggregate `restaurant_inventory`).
- Status computed at read time: `safe`, `expiring_soon`, `expired` (threshold default 7 days, configurable per restaurant).
- Capture during receiving (optional per line) or manually from inventory expiry tab.
- Grouped in-app notifications (not per page load); deduped via `inventory_expiry_notification_log`.

### Data model

- `restaurant_inventory_lot`, `restaurant_inventory_settings`, `inventory_expiry_notification_log` — migration `0133_restaurant_inventory_lots.sql`.

### API

| Method    | Path                                               | Permission                |
| --------- | -------------------------------------------------- | ------------------------- |
| GET       | `/api/restaurant-inventory/expiry`                 | `INVENTORY_VIEW`          |
| GET       | `/api/restaurant-inventory/expiry/summary`         | `INVENTORY_VIEW`          |
| POST      | `/api/restaurant-inventory/expiry`                 | `INVENTORY_MANAGE`        |
| PATCH     | `/api/restaurant-inventory/expiry/:lotId`          | `INVENTORY_MANAGE`        |
| DELETE    | `/api/restaurant-inventory/expiry/:lotId`          | `INVENTORY_MANAGE`        |
| GET/PATCH | `/api/restaurant-inventory/expiry/settings`        | view / `INVENTORY_MANAGE` |
| POST      | `/api/restaurant-inventory/expiry/check-reminders` | `INVENTORY_MANAGE`        |

### Notifications

- Categories: `inventory_expiring`, `inventory_expired`
- Preference: `notify_inventory_expiring`
- One grouped notification per restaurant per day per alert kind
- Optional `snoozed_until` on ledger rows (future UI)

---

## Feature 2: Supplier shortage / substitution chat

### Behavior

- Supplier reports shortage or suggests substitution from order detail.
- Creates `order_fulfillment_issue`, posts `ORDER_REFERENCE` chat message, notifies restaurant team.
- Substitutions with mapped products also create pending `order_amendments` (existing accept/reject flow).
- Order lines are **not** auto-changed.

### Status values

`shortage_reported`, `substitution_suggested`, `waiting_restaurant_approval`, `accepted`, `rejected`

### API

| Method | Path                                                            |
| ------ | --------------------------------------------------------------- |
| GET    | `/api/supplier/orders/:orderId/fulfillment-issues`              |
| POST   | `/api/supplier/orders/:orderId/fulfillment-issues/shortage`     |
| POST   | `/api/supplier/orders/:orderId/fulfillment-issues/substitution` |
| POST   | `/api/supplier/orders/:orderId/fulfillment-issues/open-chat`    |

### TODO

- Formal shortage accept workflow that adjusts quantities without full amendment UI.

---

## Feature 3: Restaurant ordering lists (quick lists)

### Behavior

- Reuses `quick_list` / `quick_list_item` with optional `branch_id` and `default_unit`.
- UI labeled **Ordering Lists**; route remains `/app/quick-lists`.
- Catalog: **Add to ordering list** on products; dashboard quick access card.
- Add-to-cart from list uses existing client cart flow.

### API enhancements

- `branchId` on create/update; filter `GET /api/quick-lists?supplierId=&branchId=`

---

## Feature 4b: Deterministic reorder forecasts (Gold / Platinum)

See [ai-smart-reorder.md](./ai-smart-reorder.md) for full spec.

- Cached per restaurant / branch / product in `reorder_forecast`
- Gold: 30/90-day usage + lead time; Platinum: seasonality + trend
- Enriches `GET /reorder-assistance` without replacing cadence, expiry, or quick-list signals

---

## Feature 5: AI Smart Reorder assistant (Gold / Platinum)

See [ai-smart-reorder.md](./ai-smart-reorder.md) § Phase 2.

- **Gold** (`full_90day_trends`): `POST /reorder-assistance/explain` — LLM or heuristic summary of suggestions
- **Platinum** (`ai_forecast_seasonality`): above + `POST /reorder-assistance/ask` — natural-language product matching
- Gated by plan `smart_reorder` tier, feature flag `ai_platform`, env `AI_ENABLED` + provider key
- Metered: `ai_requests_per_day` (Gold 20, Platinum 100); heuristic fallbacks do not consume quota

---

## Feature 4: Smart reorder reminders (cadence)

### Behavior

- Detects weekday patterns from order history (product → category → supplier fallback).
- Config: `MIN_ORDERS_FOR_CADENCE=4`, `LOOKBACK_DAYS=180`.
- Missed expected order triggers grouped restaurant + supplier notifications (deduped per cadence per day).
- Skips if restaurant ordered same product/category from supplier within 1-day grace.

### API

| Method | Path                                                  |
| ------ | ----------------------------------------------------- |
| GET    | `/api/restaurant-inventory/reorder-reminders`         |
| POST   | `/api/restaurant-inventory/reorder-cadence/recompute` |
| GET    | `/api/supplier/reorder-cadence/at-risk`               |

### Cron

- `operational_reminders` job (daily): expiry checks + cadence recompute + missed-order notifications.

---

## Permissions summary

| Role                     | Expiry    | Shortage chat    | Ordering lists |
| ------------------------ | --------- | ---------------- | -------------- |
| Restaurant Owner/Manager | manage    | view orders/chat | manage         |
| Viewer                   | view only | view             | view           |
| Supplier                 | no access | create issues    | N/A            |

---

## Tests

- `apps/api/src/services/inventory-expiry.service.test.js` — status + dedup
- `apps/api/src/services/order-fulfillment-issues.service.test.js` — message template
- `apps/api/src/services/reorder-cadence.service.test.js` — cadence detection

Run:

```bash
cd apps/api && pnpm test -- inventory-expiry order-fulfillment reorder-cadence
```

---

## Railway deploy checklist

After pushing to Railway (API + web redeploy from `deploy/railway/<env>/`):

1. **Migrations** — run once per environment (Postgres is not migrated on container start):

   ```bash
   DATABASE_URL="<that env's Postgres URL>" pnpm db:migrate
   ```

   Required files: `0133_restaurant_inventory_lots.sql`, `0134_order_fulfillment_issues.sql`, `0135_reorder_cadence_and_quick_list_branch.sql`, `0166_reorder_forecast.sql`, `0167_ai_platform_and_usage.sql`.

2. **API env** — committed `deploy/railway/<env>/api.env` already sets `CRONS_ENABLED=true`. Operational reminders use the default 24 h interval (`CRON_OPERATIONAL_REMINDERS_INTERVAL_MS=86400000`); override only if you need a different cadence.

3. **Web env** — no new `VITE_*` variables; features are API-driven.

4. **Redis** — recommended on API (`REDIS_URL`) so notifications and chat work across replicas.

See [../operations/railway-environments.md](../operations/railway-environments.md) and [../operations/cron-jobs.md](../operations/cron-jobs.md).

---

## Known limitations

- Notification snooze UI not exposed (ledger column exists for expiry).
- Cadence evaluation uses UTC weekdays until per-restaurant timezones exist.
- Shortage quantity adjustment requires amendment accept or manual order edit.
