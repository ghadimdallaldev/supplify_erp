# Database migrations

SQL migrations live in `apps/api/db/migrations/` and run in lexical order. Applied versions are recorded in `schema_migrations.version` (filename).

## Running migrations

| Environment | Command |
|-------------|---------|
| Docker stack (recommended) | `scripts\run-local.cmd seed` or automatic via `supplify-migrate` on `docker compose up` |
| Host against Docker Postgres | `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/supplify node apps/api/scripts/run-migration.js` |
| pnpm (uses `migrate.js` wrapper) | `pnpm db:migrate` |

`apps/api/scripts/migrate.js` runs `run-migration.js` then runtime schema checks (reservations, staff app) from `src/lib/migrator.js`.

## Fresh database checklist

1. Start Postgres (`docker compose up -d postgres` or full stack).
2. Run migrations (`run-migration.js`).
3. Seed demo data: `scripts\run-local.cmd seed` (migrations + `seed.sql` + Keycloak users).

All **55** migrations (through `0055_admin_feature_toggles.sql`) must complete without error on an empty database.

## Common issues

### `role "api_user" does not exist`

Older migrations included `GRANT ... TO api_user`. Local Docker uses the `postgres` superuser; those grants are commented out in `0019`, `0020`, and `0039`. If you hit this on a partially migrated DB, either create the role or mark the migration applied after fixing the SQL manually.

### `cannot drop type order_status`

Migration `0021_update_order_status_enum.sql` converts `customer_order.status` to `TEXT`, drops the column default, then `DROP TYPE order_status CASCADE` before recreating the enum. If migration failed mid-way, restore from backup or reset the DB (`pnpm db:reset` / new volume).

### `0021` / enum already exists

Skip by ensuring `customer_order.status` is already the new enum; insert the migration row into `schema_migrations` only if the schema matches.

### Migrate container shows `WARN: partial SQL migrations`

The compose `migrate` service continues even if SQL migrations fail (`|| echo WARN`). Check logs: `docker compose logs migrate`. Fix the failing file and re-run `run-migration.js`.

### Reservations / staff tables missing

Runtime migrator (`migrator.js`) backfills `0033` / `0034` / `0035` when SQL files were skipped. API startup also calls the same checks.

## Adding a migration

1. Add `00NN_description.sql` under `apps/api/db/migrations/`.
2. Use idempotent patterns where possible: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
3. Avoid `GRANT` to roles that may not exist in dev.
4. Test on a fresh database (temporary Postgres container + `run-migration.js`).
5. Do not edit applied migration files in production; add a new forward migration instead.

## Reset (destructive)

```bash
pnpm db:reset
```

Or remove the Docker volume and `docker compose up` again.
