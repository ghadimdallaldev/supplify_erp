# Marketplace release 1 — progress ledger

Plans: `2026-11-25-marketplace-visibility.md` (Plan A) and `2026-11-25-platform-categories-and-shelves.md` (Plan B).
Branch `feat/marketplace-visibility` in `C:/w/erp-mv`, `C:/w/smv`, `C:/w/smiv` (all from `dev`:
ERP `a0b49dab`, Android `bf24cb0`, iOS `a2262fb`).

Harness DB: docker `supplify-marketplace-audit` (postgres:16-alpine, `127.0.0.1`, db `marketplace_audit`).

## Baseline (before Task 0)

- `pnpm test:api`: 411 files / 2805 tests passed.

## Tasks

| Task       | Commits (ERP / Android / iOS)                                    | Tests                                                    | Notes |
| ---------- | ---------------------------------------------------------------- | -------------------------------------------------------- | ----- |
| A0 harness | see git log `test(integrity): real-postgres marketplace harness` | `pnpm test:marketplace:pg` 5/5; `pnpm test:api` 411/2805 |       |

## Rulings

- A0: Ruling: the harness sets `SUPPLIFY_DATABASE_URL` as well as `DATABASE_URL` — `resolveNativeDatabaseUrl()` rewrites any localhost `DATABASE_URL` whose port differs from the dev `supplify-postgres` container to that container, so `DATABASE_URL` alone silently targets the developer database. Cost if wrong: none (extra guard; harness also asserts `current_database()`).
- A0: Ruling: test identities come from mocking `lib/auth.js` `verifyToken` (JWT-shaped `test.<payload>.sig` tokens with `exp`), with `x-test-user` translated to a Bearer header by an outer express wrapper; user/tenant/RBAC resolution stays real. Cost if wrong: auth itself is not covered by these tests (covered by existing unit tests).
- A0: Ruling: `resetMarketplaceDb` truncates the tenant root tables with CASCADE and restores migration-seeded rows wiped by the cascade (the platform `product_category` rows) from a snapshot schema. Cost if wrong: a future seeded reference table referencing a tenant root would be restored too (intended).
- A0: Ruling: `createApp()` extraction moves the router mounts into `app.js`; `feature-route-coverage.test.js` and `discover-routes.mjs` now read `app.js`. Cost if wrong: none.
- A0 note: product has no `is_active` column (Plan B "including inactive ones" has no target; ruling recorded at Plan B Task 3).
