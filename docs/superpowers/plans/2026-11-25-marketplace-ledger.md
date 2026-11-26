# Marketplace release 1 — progress ledger

Plans: `2026-11-25-marketplace-visibility.md` (Plan A) and `2026-11-25-platform-categories-and-shelves.md` (Plan B).
Branch `feat/marketplace-visibility` in `C:/w/erp-mv`, `C:/w/smv`, `C:/w/smiv` (all from `dev`:
ERP `a0b49dab`, Android `bf24cb0`, iOS `a2262fb`).

Harness DB: docker `supplify-marketplace-audit` (postgres:16-alpine, `127.0.0.1`, db `marketplace_audit`).

## Baseline (before Task 0)

- `pnpm test:api`: 411 files / 2805 tests passed.

## Tasks

| Task                       | Commits (ERP / Android / iOS)                                                | Tests                                                                                                                            | Notes          |
| -------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| A0 harness                 | 4074ced9                                                                     | `pnpm test:marketplace:pg` 5/5; `pnpm test:api` 411/2805                                                                         |                |
| A1 org-level relationships | see git log `feat(api): organisation-level supplier relationships`           | relationship.test.js 15/15; `pnpm test:marketplace:pg` 14/14 (fresh DB); `pnpm test:api` 412/2820                                | migration 0238 |
| A2 relationship writes     | see git log `feat(api): race-safe relationship writes and auto-follow paths` | relationship-writes.service.test.js 7/7; follow-cap.pg.test.js 3/3; `pnpm test:api` 412/2826 (+ pain-killer flake, passes alone) | —              |

## Rulings

- A2: Ruling: errorHandler maps any error with `expose: true` + `code` + `statusCode` to `{name: code, message}` with that status; `RelationshipError` (lib/relationship.js) is the base, and `FollowRequiredError`, `RestaurantNotAvailableError`, `SupplierBlockedError`, `SupplierFollowLimitError` extend it. Cost if wrong: none (opt-in flag).
- A2: Ruling: a duplicate follow returns 200 `alreadyFollowing: true` instead of the old 400 "already being followed" (the plan's idempotency requirement); a duplicate block returns 200 `alreadyBlocked: true`. Cost if wrong: clients that relied on the 400 show success instead.
- A2: Ruling: follow/block targets resolve by branch id, org id or slug over active branches WITHOUT the public-catalog filter, so private suppliers can be followed (spec: "Follow to see the catalog"). Cost if wrong: a restaurant could follow an org whose catalog it still cannot see until the follow lands — intended.
- A2: Ruling: referral signup swallows SUPPLIER_FOLLOW_LIMIT_REACHED / SUPPLIER_BLOCKED (logged) so registration never fails on the follow; it runs inside the registration transaction and emits no hook (new restaurant, nothing cached). Connection-request accept follows before marking the request accepted, so a refused follow leaves the request pending and returns the error. Sponsorship accept no longer auto-follows (offers only reach followers). Cost if wrong: a referred restaurant at cap is not auto-followed.
- A2: Ruling: the follow-cap PG test mocks the cap value (3) because every seeded restaurant plan has `suppliers_per_restaurant = -1` and tenant overrides are increase-only; locking and counting are real. Cost if wrong: none.

- A1: Ruling: `supplier.organization_id` NOT NULL is backed by trigger `supplier_ensure_organization` (BEFORE INSERT OR UPDATE OF organization_id): any orgless insert or an unlink (which sets NULL) gets a new single-branch organisation. Registration now creates the organisation first. Seeds, admin create, e2e and the existing integrity tests keep working unchanged. Cost if wrong: trigger-created orgs lack org system roles until the next startup backfill (registration and unlink call `ensureOrgSystemRoles` themselves).
- A1: Ruling: a "standalone" supplier is now the only branch of its own organisation. `linkSupplierToOrganization` moves such a supplier into the target org, re-keys/merges its follows and blocks under the exclusive locks (both org keys, ascending order), closes the emptied org (`closed_at`, `close_reason = merged_into:<id>`, never deleted) and emits `kind: rekey` (an extension of the interface's kinds). The branch-account-link email lookup uses the same definition for suppliers. Cost if wrong: linking an org that already has other branches is refused (`ok:false`), as it was before (non-NULL org never linked).
- A1: Ruling: trigger `relationship_fill_supplier_org_id` fills `supplier_org_id` from `supplier_id` on insert for writers that only know the branch (seeds, legacy paths) during release 1; removed with `supplier_id` in Plan A Task 16. Cost if wrong: none (Task 2 writers set it explicitly).
- A1: Ruling: `emitRelationshipChanged` awaits every hook and logs (does not throw) a failing hook, because the relationship change is already committed. In `linkSupplierToOrganization` the hooks run inside the caller's transaction (before commit). Cost if wrong: a cache could be repopulated with pre-commit state for the moved pairs (same relationships, different org key) until its TTL / next version bump.
- A1: Ruling: "org-level relationship does not widen branch data scope" asserts 403 or 404 for a branch-B user on a branch-A order; existing branch RBAC returns 403 and Task 1 does not change order access. Cost if wrong: none for confidentiality (no data in body).
- A1: Ruling: the re-key PG tests mock `lockOrgBranchCapacity` (trial plans allow 1 branch); capacity has its own tests. Cost if wrong: none.
- A1: Added beyond the interface: `lockRelationshipsShared` (sorted), `FollowRequiredError`, `rekeyRelationshipsToOrg`, `resetRelationshipHooksForTests`, `connectMigrationClient` (db.js). Pre-flight: Interfaces A1→A2..A10 checked, names match.

- A0: Ruling: the harness sets `SUPPLIFY_DATABASE_URL` as well as `DATABASE_URL` — `resolveNativeDatabaseUrl()` rewrites any localhost `DATABASE_URL` whose port differs from the dev `supplify-postgres` container to that container, so `DATABASE_URL` alone silently targets the developer database. Cost if wrong: none (extra guard; harness also asserts `current_database()`).
- A0: Ruling: test identities come from mocking `lib/auth.js` `verifyToken` (JWT-shaped `test.<payload>.sig` tokens with `exp`), with `x-test-user` translated to a Bearer header by an outer express wrapper; user/tenant/RBAC resolution stays real. Cost if wrong: auth itself is not covered by these tests (covered by existing unit tests).
- A0: Ruling: `resetMarketplaceDb` truncates the tenant root tables with CASCADE and restores migration-seeded rows wiped by the cascade (the platform `product_category` rows) from a snapshot schema. Cost if wrong: a future seeded reference table referencing a tenant root would be restored too (intended).
- A0: Ruling: `createApp()` extraction moves the router mounts into `app.js`; `feature-route-coverage.test.js` and `discover-routes.mjs` now read `app.js`. Cost if wrong: none.
- A0 note: product has no `is_active` column (Plan B "including inactive ones" has no target; ruling recorded at Plan B Task 3).
