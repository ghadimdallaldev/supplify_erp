# Scripts audit — keep / archive / delete

Last updated: 2026-06-15. Covers `apps/api/scripts/` (~49 active files), repo `scripts/` (~25), and `deploy/scripts/` (2 local Docker helpers).

**Cleanup done:** 71 one-off scripts moved to `docs/archive/scripts/one-off/`; `generate-openapi.js` restored as discover-routes shim; `seed:tier-catalog` aligned to `.mjs`; `prune-release-tree` keeps `migrate-suppliers-to-orgs.js`; see `apps/api/scripts/README.md`.

## What actually runs in production

| Environment                         | Auto-run on deploy                                                                                                                                                            | Manual only           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Railway dev / preprod / prod**    | `node apps/api/src/server.js`; if `RUN_MIGRATIONS_ON_START=true` → `startup-migrations.js` → SQL migrator + `migrate-users-to-roles.js` + `migrate-suppliers-to-orgs.js`      | Everything else       |
| **Docker compose (self-hosted)**    | One-shot `migrate` service: `run-migration.js` → `migrate-users-to-roles.js` → `sync-system-roles.mjs`                                                                        | `deploy/scripts/*.sh` |
| **Release branches (preprod/prod)** | `prune-release-tree.mjs` strips almost all of `apps/api/scripts/` — keeps only `migrate.js`, `run-migration.js`, `migrate-users-to-roles.js`, `sync-system-roles.mjs`, `lib/` | —                     |

Seeds, wipes, smoke tests, and one-off patches **never** run on Railway preprod/prod (`ENABLE_SEED_ROUTES=false` there).

---

## `apps/api/scripts/` — KEEP (core)

**Production / startup path**

| File                                    | Why keep                                                   |
| --------------------------------------- | ---------------------------------------------------------- |
| `migrate.js`                            | `pnpm db:migrate`, dev-native, release branches            |
| `run-migration.js`                      | Docker compose migrate container                           |
| `migrate-users-to-roles.js`             | Imported by `startup-migrations.js`; Docker backfill       |
| `migrate-suppliers-to-orgs.js`          | Imported by `startup-migrations.js`                        |
| `migrate-restaurants-to-orgs.js`        | `pnpm db:migrate-restaurants-to-orgs` (manual, idempotent) |
| `sync-system-roles.mjs`                 | `pnpm db:sync-roles`; Docker compose                       |
| `run-job.mjs`, `jobs-registry.mjs`      | `pnpm jobs:list` / `jobs:run` — manual cron replay         |
| `lib/is-main.mjs`, `lib/auth-token.mjs` | Shared helpers (smoke tests, seeds)                        |

**Shared seed library (`seed/`)**

Keep entire folder — imported by active seeds and tier tooling:

- `tierDefinitions.js`, `seedRng.js`, `timeUtils.js`, `scopedLocation.js`, `bulkInsert.js`
- `audit-demo-backfill.js`, `businessDemoData.js`, `wipe-commercial-data.js`

---

## `apps/api/scripts/` — KEEP (dev / QA — wired in package.json)

| Script                                                                      | npm script                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------- |
| `prodlike.seed.js`                                                          | `seed:prodlike`                                     |
| `seed-full.mjs`                                                             | `seed:full`                                         |
| `seed-tier-catalog.js` + `seed-tier-catalog.mjs`                            | `seed:tier-catalog` (orchestrator + impl)           |
| `seed-tier-matrix.mjs`                                                      | `seed:tier-matrix`                                  |
| `seed-b2c-demo.mjs`                                                         | `seed:b2c`                                          |
| `seed-staff-portal-demo.mjs`                                                | `seed:staff-portal`                                 |
| `seed-business-engineer-demo.js`                                            | `seed:business-demo`                                |
| `seed-demo-tenants.js`, `seed-demo-users.js`, `seed-plan-tier-demos.js`     | `seed:demo-*`, `seed:plan-tiers`                    |
| `seed-billing.js`, `seed-feature-demos.js`, `seed-demo-readiness-extras.js` | billing / features / readiness                      |
| `seed-prodlike-team-backfill.js`, `seed-accounts-for-prodlike.js`           | prodlike team                                       |
| `seed-quick-lists.js`, `seed-chats.js`                                      | quick-lists, chats                                  |
| `seed-dev-role-matrix-users.js`                                             | `seed:dev-role-users`                               |
| `seed-audit-backfill.mjs`                                                   | root `seed:audit-backfill`                          |
| `seed.js`                                                                   | `db:seed` (minimal)                                 |
| `wipe-commercial-only.js`, `wipe-all-data.js`                               | `db:wipe-*` — **dev only, destructive**             |
| `reset.js`, `reduce-to-single-tenant.js`                                    | `db:reset`, `reduce-to-single-tenant`               |
| `initialize-subscriptions.js`                                               | `db:init-subs`                                      |
| `log-tier-limits.mjs`, `verify-tier-matrix.mjs`                             | tier ops / CI                                       |
| `discover-routes.mjs`, `dev-api-smoke-test.mjs`                             | route inventory, dev smoke                          |
| `email-test.js`                                                             | `email:test`                                        |
| `ensure-minio-buckets.js`                                                   | `storage:ensure-buckets`                            |
| `run-delivery-rollover.mjs`                                                 | Manual delivery rollover (documented in cron audit) |

---

## `apps/api/scripts/` — KEEP (useful, not in package.json)

| Script                      | Notes                                |
| --------------------------- | ------------------------------------ |
| `verify-rbac.js`            | RBAC verification after role changes |
| `export-tier-matrix.mjs`    | Export tier matrix for docs          |
| `walkthrough-b2c.mjs`       | B2C flow walkthrough                 |
| `send-test-notification.js` | Push notification debugging          |

---

## `apps/api/scripts/` — ARCHIVE (move to `docs/archive/scripts/` or delete after review)

One-off **schema patches** superseded by numbered SQL in `apps/api/db/migrations/`:

- `add-quick-list-columns.js`
- `apply-reminder-columns.js`
- `run-0039-notification-preferences.js`
- `apply-tags-migration.js`
- `apply-subscription-migration.js`
- `apply-enum-fix.js`
- `create-schema-table.js`, `fix-schema-table.js`
- `setup-notification-tables.js`, `setup-notification-simple.js`
- `check-order-enum.sql`, `set-restaurant-subscriptions-to-free.sql`, `reset-and-apply-subscription.sql`

One-off **refactor / codegen** (waves 2–4 splits, test mass-fixers) — safe to archive; do not run again:

- `split-wave4-routes.mjs`, `fix-wave4-imports.mjs`, `fix-supplier-sections.mjs`
- `move-imports-to-top.js`, `fix-remaining-imports.js`, `fix-import-extensions.js`
- `fix-test-imports.js`, `fix-all-test-imports.js`
- `fix-route-tests.js`, `fix-route-db-mocks.js`, `fix-all-route-tests.js`
- `fix-all-route-test-mocks.js`, `fix-all-route-tests-systematic.js`
- `generate-route-tests.js`

One-off **data backfills** (replaced by seeds or migrations):

- `add-products-to-example-supplier.js`, `add-inventory-to-example-supplier.js`
- `add-prices-to-products.js`, `add-prices-to-all-products.js`, `add-stock-to-products.js`
- `add-tags-to-products.js`, `add-supplier.js`, `add-restaurant.js`
- `add-suppliers-and-products.js`, `add-warehouse-to-inventory.js`
- `link-inventory-to-warehouses.js`, `create-warehouses.js`, `create-warehouses-simple.js`
- `seed-warehouses.js`, `backfill-invoices-for-completed-orders.js`
- `seed-supplier-products.js`, `seed-restaurant-inventory.js`, `seed-restaurant-inventory-demo.js`
- `seed-inventory.js`, `seed-contract-pricing.js`
- `create-20-orders.js`, `seed-20-orders-for-test.js`
- `reset-and-create-orders.js`, `reset-restaurant-orders-per-day.js`

**Debug / superseded seeds & tests:**

- `debug-overview-counts.mjs`, `debug-overview-built.mjs`, `debug-overview-all.mjs`
- `check-restaurant.js`, `check-user-restaurant.js`, `verify-restaurant-contact.js`
- `seed-simple.js`, `seed-comprehensive.js`, `seed-all.js` (use `seed-full.mjs` / `prodlike.seed.js`)
- `e2e-test.js`, `test-api-endpoints.js`, `test-notifications.js`

---

## `apps/api/scripts/` — DELETE (after archive window)

Nothing is safe to hard-delete **today** without a quick grep — many orphans are still referenced in old docs. Recommended flow:

1. Move **ARCHIVE** list to `docs/archive/scripts/one-off/` (or `apps/api/scripts/_archive/`).
2. Run `rg apps/api/scripts/<name>` — if zero hits outside archive, delete in a follow-up PR.
3. Keep wipes (`wipe-*`, `reset.js`) in repo but add a header comment: `DEV ONLY — never run against Railway preprod/prod`.

**Fixed:**

- `generate-openapi.js` — thin shim delegating to `discover-routes.mjs` (full OpenAPI codegen TBD).
- `seed:tier-catalog` — both package.json files use `seed-tier-catalog.mjs`.

---

## Repo `scripts/` (~33 files)

### KEEP

| File                                                      | Role                                 |
| --------------------------------------------------------- | ------------------------------------ |
| `dev-native.mjs`, `dev-apps.mjs`, `dev-infra.mjs`         | Local dev orchestration              |
| `run-local.mjs` (+ `.sh`, `.ps1`, `.cmd`)                 | Docker local stack                   |
| `pnpm-run.mjs`, `ensure-pnpm.mjs`                         | pnpm without global install          |
| `ensure-native-env.mjs`, `ensure-docker-env.mjs`, `lib/*` | Env bootstrap                        |
| `promote-release.mjs`, `prune-release-tree.mjs`           | Release branch promotion             |
| `railway-sync-keycloak.mjs`, `railway-sync-vapid.mjs`     | Railway secret sync                  |
| `import-keycloak-realm.mjs`, `generate-vapid-keys.mjs`    | IdP / push setup                     |
| `check-mermaid-diagrams.mjs`                              | CI docs check                        |
| `migrate-users-to-roles.js`                               | Thin delegate to `apps/api/scripts/` |

### ARCHIVE

Historical **monolith split** tooling — do not run on current tree:

- `wave3-split.mjs`, `wave3-split-sidebar.mjs`, `wave3-split-workspace.mjs`
- `split-wave2.mjs`, `split-wave2-rest.mjs`, `split-wave2-dashboard-quicklists.mjs`
- `fix-api-paths.mjs`, `clean-endpoint-imports.mjs`

### KEEP (optional diagnostics)

- `measure-memory.mjs`, `memory-prod-api-smoke.mjs` — memory profiling; archive if unused >6 months

---

## `deploy/scripts/` (local Docker only)

### KEEP

- `keycloak-init.sh` — Keycloak realm bootstrap (root `docker-compose.yml`)
- `minio-init-buckets.sh` — MinIO bucket init (root `docker-compose.yml`)

EC2/VM deploy scripts were removed; production deploys use **Railway** (`deploy/railway/`).

---

## Recommended phased cleanup

| Phase | Action                                                                                                   | Risk                                                  |
| ----- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **1** | Fix `openapi:gen` broken script; align `seed:tier-catalog` entrypoint                                    | Low                                                   |
| **2** | Move ARCHIVE batch (~45 files) to `docs/archive/scripts/one-off/` with README listing original purpose   | Low                                                   |
| **3** | Grep-delete archived files with zero references                                                          | Medium — verify with team                             |
| **4** | Add `scripts/README.md` in `apps/api/scripts/` documenting KEEP list + dev-only warnings on wipes        | Low                                                   |
| **5** | Consider `prune-release-tree.mjs` adding `migrate-suppliers-to-orgs.js` to keep set (startup imports it) | Low — release branches may need supplier org backfill |

---

## Quick counts

| Location            | Total | Keep | Archive | Delete now        |
| ------------------- | ----- | ---- | ------- | ----------------- |
| `apps/api/scripts/` | ~120  | ~45  | ~70     | 0 (archive first) |
| `scripts/`          | 33    | 22   | 8       | 0                 |
| `deploy/scripts/`   | 2     | 2    | 0       | 0                 |
