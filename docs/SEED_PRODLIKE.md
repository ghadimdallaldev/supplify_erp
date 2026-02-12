# Prod-like seed (full dataset)

This seed populates the database with a **prod-like full dataset** so the UI feels "alive" across Invoices, Restaurant/Supplier Inventories, Reservations, Warehouses, and Orders.

## Run instructions

**From repo root:**

```bash
ALLOW_PRODLIKE_SEED=true pnpm run seed:prodlike
```

**From `apps/api`:**

```bash
ALLOW_PRODLIKE_SEED=true node scripts/prodlike.seed.js
```

### Login accounts (Keycloak)

After seeding data, create login accounts for all restaurants and suppliers so you can sign in as any of them:

```bash
pnpm run seed:accounts
```

(Requires Keycloak running at `KEYCLOAK_BASE_URL` with admin user. Default admin/admin for local.)

- **Restaurants:** `restaurant-1@test.com` … `restaurant-10@test.com` (role: restaurant)
- **Suppliers:** `contact-0@supplier0.test` … `contact-49@supplier49.test` (role: supplier)
- **Password for all:** `Supplify1!` (or set `SEED_ACCOUNTS_PASSWORD`)

On first login, the API creates the `app_user` row from Keycloak; tenant is resolved by matching email to `restaurant.contact_email` or `supplier.contact_email`.

### Quick lists (all restaurants)

After prodlike seed, create quick lists for every restaurant:

```bash
pnpm run seed:quick-lists
```

Creates 3–6 quick lists per restaurant with 5–20 items each (from supplier products). Optional: `SEED=1337` for determinism.

**Optional:**

- `SEED=1337` (default) – use another number for a different deterministic dataset.
- `ALLOW_PRODLIKE_SEED_FORCE=true` – allow running in `NODE_ENV=production` (use with caution).

## Safety

- The script **refuses to run** unless:
  - `ALLOW_PRODLIKE_SEED=true`, and
  - `NODE_ENV !== 'production'` (unless `ALLOW_PRODLIKE_SEED_FORCE=true`).
- It **deletes all existing restaurants and suppliers** and all dependent data (branches, staff, products, inventories, orders, invoices, reservations, warehouses, etc.) before seeding.
- Idempotent: safe to run multiple times; each run resets and recreates data.

## What you’ll see in the UI

After running the seed:

- **Invoice dashboard** – Total invoices, Outstanding, Overdue, Total paid, Avg days to pay, last 30d paid/outstanding, and a populated invoice list with multiple rows and supplier names.
- **Invoices list** – Mixed statuses: Issued, Partially paid, Paid, Overdue, Void/Canceled.
- **Restaurant inventories** – On-hand, low-stock thresholds, reorder suggestions, branch-scoped rows.
- **Supplier inventories** – Stock per warehouse (30–80 items per supplier, 300–1500 units spread across items).
- **Supplier warehouses** – Multiple warehouses per supplier (1–3) with locations and inventory.
- **Reservations** – Upcoming and past reservations per branch (40–150 per restaurant), mixed statuses (Pending, Confirmed, Seated, Completed, Cancelled, Waitlist), party sizes and time slots.
- **Orders** – 60–180 orders per restaurant over the last 90 days, 6–25 lines per order, 2–7 suppliers per order; each restaurant’s history includes items from all 50 suppliers.
- **Staff & shifts** – Restaurant staff (6–14 per restaurant), roles (manager, cashier, chef, receiver, accountant, waiter), and shifts for the last 14 days (morning/evening).
- **Subscriptions** – Mixed tiers (Free, Bronze, Gold, Platinum), billing cycles (monthly/yearly), and states (Active, Trialing, Past due, Cancelled).

## Volumes (minimum)

| Entity | Count |
|--------|--------|
| Restaurants | 10 |
| Branches | 2–4 per restaurant |
| Restaurant staff | 6–14 per restaurant |
| Suppliers | 50 |
| Warehouses | 1–3 per supplier |
| Catalog items per supplier | 30–80 |
| Orders per restaurant | 60–180 (last 90 days) |
| Invoices per restaurant | 20–60 (last 120 days) |
| Reservations per restaurant | 40–150 (last 30d + next 14d) |
| Staff shifts | 2+ per day per restaurant (last 14 days) |

## Implementation details

- **Determinism:** Seeded RNG (`SEED` env, default 1337); no `Math.random()`.
- **Performance:** Single transaction, batch inserts where possible; savepoints during reset so one missing table doesn’t abort the run.
- **Schema-aware:** Uses actual table/column names from migrations. If your DB has different columns (e.g. `branch` with `tenant_id` vs `restaurant_id`, or `customer_order.branch_id`), you may need to adjust the seed or run the migrations that add those columns.
- **Helpers:** `scripts/seed/seedRng.js`, `scripts/seed/timeUtils.js`, `scripts/seed/bulkInsert.js`.
