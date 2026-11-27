# Marketplace release 1 — evidence (Plan A)

Date: 2026-11-27. Scope: Plan A (marketplace visibility) Tasks 0–15, deployed to dev and preprod.
**Plan B (platform categories and shelves) was not started**, so the categories matcher
(150-name fixture) and `data_migration_run` rows do not exist yet. Production was not touched.

## Branches and deploys

| Repo                | Branch                        | Feature range        | dev merge  | preprod promote                      |
| ------------------- | ----------------------------- | -------------------- | ---------- | ------------------------------------ |
| supplify_erp        | `feat/marketplace-visibility` | `a0b49dab..2a529585` | `43666544` | `2d83304b` → `7905c8a9` → `dba42dea` |
| supplify-mobile     | `feat/marketplace-visibility` | `bf24cb0..cea3d20`   | `2aa711d`  | `41fa1d6` → `7152888`                |
| supplify-mobile-ios | `feat/marketplace-visibility` | `a2262fb..aaba3fc`   | `9700e1c`  | `f1ea322` → `0d81593`                |

Railway `RUN_MIGRATIONS_ON_START=true` on dev and preprod (checked). Dev API applied 0238/0239 at
2026-11-27 00:17:56 UTC. The first preprod deploy (`d6866e80`) failed with
`ERR_MODULE_NOT_FOUND: routes/e2e.routes.js` (the release prune did not know about `app.js`);
Railway kept the previous preprod deployment serving. Fixed in `c80abf3b`, redeployed
`dbca6ec8` SUCCESS, then `aa530347` SUCCESS with the stock-flag fix.

## Migration reconciliation

| Count                                         | Rehearsal before | Rehearsal after | dev after | preprod after |
| --------------------------------------------- | ---------------- | --------------- | --------- | ------------- |
| schema_migrations                             | 238 (0237)       | 240 (0239)      | 240       | 241¹ (0239)   |
| supplier_follow rows                          | 60               | 60              | 60        | 2             |
| distinct (restaurant, organisation)           | 60               | 60              | 60        | 2             |
| follows merged (duplicates per org)           | —                | 0               | 0         | 0             |
| follows dropped because blocked               | —                | 0               | 0         | 0             |
| suppliers given a new organisation            | 0 orgless        | 0               | 0         | 0             |
| supplier_blocklist rows                       | 0                | 0               | 0         | 0             |
| promotion_restaurant_targets (release 2 drop) | 0                | 0               | 0         | 0             |
| follows whose org ≠ branch org                | —                | 0               | 0         | 0             |

Rehearsal: Railway dev dump (PG 18.6) restored into local container
`supplify-marketplace-rehearsal`, full startup pipeline (`scripts/migrate.js`, backfills on).
¹ preprod carries one extra pre-existing `schema_migrations` row; not investigated (cosmetic).

## Tests

| Suite                                                                         | Result                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                              | 0 errors                                                                            |
| `pnpm test:api`                                                               | 2858 / 2858                                                                         |
| `pnpm test:marketplace:pg` (real PG)                                          | 64 passed, 7 skipped (benchmarks, opt-in)                                           |
| `pnpm test:web`                                                               | 670 / 670, excluding `sessionIsolation.test.ts` (fails identically at base)         |
| mobile `tsc` + jest (Android, iOS)                                            | clean; 278 / 278 each; `src/` identical                                             |
| Playwright on app-dev (smoke + critical restaurant + supplier, HORECA logins) | 39 passed, 0 failed                                                                 |
| Playwright on preprod                                                         | not run: the demo and default e2e accounts do not exist in realm `supplify-preprod` |
| preprod unauthenticated checks                                                | `/health` ok (env preprod); protected routes 401; web loads                         |

## Performance (p95, best of 3, audit dataset)

| Query            | Before   | After    | Budget |
| ---------------- | -------- | -------- | ------ |
| getRelationship  | 1.98 ms  | 1.53 ms  | 2 ms   |
| productList      | 66.14 ms | 27.81 ms | 60 ms  |
| groupedSearch    | 76.95 ms | 54.50 ms | 120 ms |
| customerList     | 32.03 ms | 29.04 ms | 40 ms  |
| dealList         | 35.61 ms | 33.07 ms | 80 ms  |
| conversationList | 29.28 ms | 24.81 ms | 40 ms  |

## Builds

- EAS Android demo (dev API), first build: `92b41c13-ba7b-4991-8c23-facd71a46246` FINISHED.
- EAS Android demo with the stock/label fix: `9f6dcee6-f5cc-415b-a70a-8c6cfd0893eb` FINISHED — https://expo.dev/accounts/supplify-team/projects/supplify-mobile/builds/9f6dcee6-f5cc-415b-a70a-8c6cfd0893eb (not re-captured on the emulator; the fix is covered by tests).
- EAS iOS simulator (`@supplify-team/supplify-mobile-ios`, preprod API):
  `ba957673-4e09-4d45-a654-1db51cd0a646` FINISHED. **iOS was not visually verified.**
- iOS EAS project id reconciled: `app.json` had been overwritten with the Android project
  (`69e55e43`) on 2026-11-16; restored to `34a9b878` (`5473796`), matching README and IOS_PLATFORM.md.

## Screenshots

Android (EAS demo APK on emulator, 390x844, dev API), in `design-audit/mobile/marketplace-visibility/`
(local, gitignored):

- `01-suppliers-unfollowed-no-message-390.png` — unfollowed suppliers have no Message action.
- `02-supplier-unfollowed-card-390.png` — supplier card after unfollow.
- `03-catalog-follow-and-add-390.png` — catalog of an unfollowed supplier: Follow & add. This capture
  found two defects, fixed in `2a529585` / `cea3d20` / `aaba3fc`: the label clipped to "Follow & a…",
  and non-followers saw "Availability unknown" (web: "0 kg") instead of the `in_stock` flag.

The full capture set (RTL, 360x800, font scale 1.3, chat banners) and web screenshots were not taken;
the owner closed the release once code and EAS builds were done.

## Remaining risks

- **iOS not visually verified** (simulator build only).
- Android captures cover only the catalog and supplier list; chat banners, cart FOLLOW_REQUIRED rows,
  growth screen, RTL and font scale are verified by tests only.
- No authenticated smoke on preprod (no preprod test accounts known).
- `sessionIsolation.test.ts` fails at base and is excluded from the web regression.
- My first rehearsal run applied 0238/0239 to the local Docker database (`supplify-postgres`:5433,
  `supplify`) because the API config rewrites localhost URLs in development; 0 orgs created, 0 blocks,
  5 follows remain. Not reverted.
- Plan A Task 16 / Plan B Task 10 (release 2: drop `supplier_id`, `promotion_restaurant_targets`)
  not started, as instructed. Plan B Tasks 1–9 not started.
