# API scripts

Operational scripts for migrations, seeds, cron replay, and local QA. **Only migration backfills run automatically on deploy** (via `startup-migrations.js` when `RUN_MIGRATIONS_ON_START=true`).

## Production / startup

| Script                           | Command                                               |
| -------------------------------- | ----------------------------------------------------- |
| `migrate.js`                     | `pnpm db:migrate`                                     |
| `migrate-users-to-roles.js`      | Auto on startup + `pnpm db:migrate-users-to-roles`    |
| `migrate-suppliers-to-orgs.js`   | Auto on startup + `pnpm db:migrate-suppliers-to-orgs` |
| `migrate-restaurants-to-orgs.js` | `pnpm db:migrate-restaurants-to-orgs`                 |
| `sync-system-roles.mjs`          | `pnpm db:sync-roles`                                  |
| `run-migration.js`               | Docker compose migrate service only                   |

## Seeds & resets (dev / local)

| Command                               | Purpose                                    |
| ------------------------------------- | ------------------------------------------ |
| `pnpm seed:full`                      | Full demo dataset (destructive to tenants) |
| `pnpm seed:tier-catalog`              | Tier matrix catalog reset                  |
| `pnpm seed:b2c` / `seed:staff-portal` | Consumer / staff portal demos              |
| `pnpm db:wipe-commercial`             | Remove commercial data (no re-seed)        |
| `pnpm db:wipe-all`                    | Nuclear schema wipe + re-migrate           |

Wipe and reset scripts are **DEV ONLY** — never against Railway preprod/prod.

## Jobs & QA

| Command                       | Purpose                                      |
| ----------------------------- | -------------------------------------------- |
| `pnpm jobs:list` / `jobs:run` | Manual cron job replay                       |
| `pnpm smoke:dev-api`          | Dev API smoke test                           |
| `pnpm discover:routes`        | Route inventory JSON/MD                      |
| `pnpm openapi:gen`            | Alias → `discover-routes` (full OpenAPI TBD) |
| `pnpm verify:tier-matrix`     | CI tier matrix check                         |

## Shared library

`seed/` — RNG, tier definitions, audit backfill helpers used by active seed scripts. Do not archive without updating imports.

## Archived one-offs

Superseded schema patches, wave-split tooling, and ad-hoc backfills live in [`docs/archive/scripts/one-off/`](../../../docs/archive/scripts/one-off/). See [`docs/operations/scripts-audit.md`](../../../docs/operations/scripts-audit.md).
