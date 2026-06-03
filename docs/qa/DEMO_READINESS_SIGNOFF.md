# Demo readiness sign-off

**Date:** 2026-06-01  
**Branch:** working tree (local validation)  
**Bar:** Zero known failures on automated gates + demo script; DB/E2E require running stack.

## Automated gates (executed)

| Gate                              | Result      | Notes                                                                                              |
| --------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `pnpm test:ci`                    | **PASS**    | API 770 tests, Web 202 tests                                                                       |
| `pnpm test:rbac`                  | **PASS**    | API 156 + Web 14                                                                                   |
| `pnpm test:billing`               | **PASS**    | 122 tests                                                                                          |
| `pnpm typecheck`                  | **PASS**    |                                                                                                    |
| `pnpm build`                      | **PASS**    | Web production build                                                                               |
| `pnpm verify:tier-matrix`         | **SKIP**    | PostgreSQL not running locally (`ECONNREFUSED :5433`) — **must pass in CI/demo env after migrate** |
| `pnpm db:migrate`                 | **BLOCKED** | Same — start Postgres (`pnpm dev:docker` or Railway)                                               |
| Playwright smoke / critical / api | **BLOCKED** | Keycloak unreachable at `http://localhost:8080`                                                    |

## Bug fixes applied (minimal)

1. **`apps/api/src/lib/cache.js`** — Redis error handler no longer throws when test mocks omit `logger.warn` (uses `warn ?? info ?? error`).
2. **`apps/api/src/services/scheduled-orders.service.test.js`** — Logger mock includes `warn` (aligns with other route tests).

No product behavior changes beyond these test-stability fixes.

## Tier feature binding (already in codebase)

- Runtime: `getEnforcementPlanLimits` + org billing tenant on usage meters
- Guard: `pnpm verify:tier-matrix` + `tier-binding.test.js` / `tier-matrix-verify.test.js`
- FE: `planFeatureGates.ts` (`planFeatures` fallback), multi-branch copy Gold+

## Environment prerequisites for full sign-off

On the machine you demo from:

```bash
pnpm dev:docker   # or Railway dev with Postgres + Redis + Keycloak
pnpm db:migrate
pnpm seed:tier-catalog
pnpm seed:demo-users
pnpm db:seed
pnpm seed:prodlike
pnpm verify:tier-matrix   # expect: OK, exit 0
pnpm e2e:playwright       # after Keycloak + app up
```

If `verify:tier-matrix` reports **FAILURES**, add a new corrective migration (`UPDATE subscription_plan ...`) — do not edit `0117`/`0119`/`0120`.

## Manual demo script

Presenter path: [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) (includes restaurant + supplier GPS demo steps)  
Full checklist: [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md) — delivery GPS: **§6.6.1**, **§7.4.1**, **§7.4.2**

| Block                 | Status      | Notes                       |
| --------------------- | ----------- | --------------------------- |
| Part 0 — Setup        | **Pending** | Needs live DB + dev servers |
| Restaurant core       | **Pending** | Run after seed              |
| Supplier core         | **Pending** | Run after seed              |
| Tiers / billing       | **Pending** | Stub card + tier accounts   |
| RBAC / team           | **Pending** | Gold+ tenant                |
| Admin / impersonation | **Pending** | `admin@supplify.com`        |

## Known limitations (presenters)

- **Redis optional:** Calendar cache falls back to in-memory if Redis down; warn logs only.
- **Lint:** `pnpm lint` may fail on pre-existing unused-var warnings in web (`max-warnings 0`) — not part of demo gate unless you enable it.
- **E2E:** Requires Keycloak realm `Supplify`, demo users, API/web on consistent host (`VITE_API_URL` = API origin).

## Sign-off checklist

- [x] Unit + RBAC + billing tests green
- [x] Typecheck + build green
- [ ] `verify:tier-matrix` green on demo database
- [ ] Playwright smoke + `critical_e2e_*` + `api` green
- [ ] [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) executed once — all steps Pass

**Demo-ready for external users** when the four unchecked items above are complete on the target environment.
