# Supplify test suite

- **E2E**: Playwright (TypeScript, POM, `data-testid` selectors, role-based `storageState`).
- **API**: Playwright request context in `tests/api/`.
- **Test data**: See [test-data/README.md](test-data/README.md) for reset/seed and factory.

## Run locally

1. **Prereqs**: Node 18+, pnpm, Keycloak (see repo SETUP.md). Start app and API:
   ```bash
   pnpm dev
   ```
2. **Seed demo users** (Keycloak + DB):
   ```bash
   pnpm seed:demo-users
   pnpm db:migrate && pnpm db:seed && pnpm seed:prodlike
   ```
3. **Install Playwright browsers** (once):
   ```bash
   pnpm exec playwright install chromium
   ```
4. **Run E2E** (from repo root):
   ```bash
   pnpm e2e:playwright
   ```
   Or by project:
   ```bash
   pnpm exec playwright test --config=tests/playwright.config.ts --project=smoke
   pnpm exec playwright test --config=tests/playwright.config.ts --project=critical_e2e_restaurant
   pnpm exec playwright test --config=tests/playwright.config.ts --project=api
   ```

**Auth**: `globalSetup` (`e2e/auth.setup.ts`) logs in as admin, restaurant, and supplier (Keycloak) and saves `e2e/.auth/*.json`. Ensure Keycloak and demo users exist or auth-dependent projects will fail.

## Run in CI

- Set `CI=1`, `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_API_URL` (and optionally `E2E_*` credentials).
- Run:
  ```bash
  pnpm e2e:playwright
  ```
- Artifacts: `playwright-report/` (HTML), `test-results/` (traces/screenshots on failure).

## Add tests

- **E2E**: Add specs under `e2e/suites/smoke`, `e2e/suites/critical_e2e`, or `e2e/suites/nightly`. Use fixtures from `e2e/fixtures` and POMs from `e2e/pages`. Use **only** `data-testid` selectors; add `data-testid` in app code where missing.
- **API**: Add specs in `api/*.spec.ts`; use `request.get/post(...)` with `apiURL`.
- **New POM**: Add under `e2e/pages/` and extend `BasePage`; register in `e2e/fixtures/index.ts`.

## Reset/seed automation (deterministic test data)

- **Test-only API**: When `E2E_SECRET` is set (env), the API exposes `POST /api/e2e/reset-seed` (protected by header `X-E2E-Secret`). Playwright calls this before critical_e2e tests to reset and seed data.
- **Scenarios**: `orders_basic`, `catalog_basic`, `subscription_limits_basic`, `orders_delivered`. Use in specs via `resetAndSeed(request, { scenario, orgId? })` from `e2e/utils/seed.ts`.
- **In tests**: Critical E2E specs use `beforeEach` (or per-test) `resetAndSeed(request, { scenario: 'orders_basic' })` etc. so tests are idempotent and do not rely on previous test state.
- **Local/CI**: Set `E2E_SECRET` in `apps/api/.env` (e.g. `E2E_SECRET=e2e-secret-local`). **Restart the API** after adding or changing it so the E2E route is mounted. Run Playwright with the same value: `E2E_SECRET=your-secret pnpm e2e:playwright` (or set in shell: `$env:E2E_SECRET="e2e-secret-local"` then `pnpm e2e:playwright`).

## Seed data (manual)

- Reset/seed: see [test-data/README.md](test-data/README.md).
- Factory: `tests/test-data/factory.ts` exports `DEMO_USER_EMAILS`, `TEST_ORG_IDS`, `E2E_ORDER_ID`, `getSeededData()` for use in tests.

## Coverage gate

- **Feature inventory**: `tests/feature-inventory.yml` lists all Supplify features and their linked test files.
- **Check**: `pnpm test:coverage-map` runs `tests/scripts/check-coverage-map.mjs` and **fails** if any feature has no tests or a linked file is missing. Run this in CI to enforce coverage.
