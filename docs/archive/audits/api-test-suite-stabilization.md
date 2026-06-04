# API test suite stabilization

Stabilized the `@supplify/api` Vitest suite so the full API Vitest suite completes reliably without a real Postgres instance. No product features, tier limits/prices, or deals/promotions business rules were changed.

**Workflow:** Use **`pnpm test:api`** (non-watch) from the repo root for CI, PR checks, and Cursor verification. See **[testing guide](../../qa/testing-guide.md)** for all scripts, test rules, and CI.

## Development workflow (locked)

| When                       | Command                                            |
| -------------------------- | -------------------------------------------------- |
| Before PR / agent “done”   | `pnpm test:api`                                    |
| While editing API tests    | `pnpm test:api:watch`                              |
| Billing/subscription smoke | `pnpm test:billing`                                |
| RBAC regression            | `pnpm test:rbac`                                   |
| API + web unit tests       | `pnpm test:all`                                    |
| CI (local / your runner)   | `pnpm test:ci` → `pnpm test:api` + `pnpm test:web` |

**Do not** use `pnpm test` or `pnpm --filter @supplify/api test` for final verification — those run Vitest in **watch** mode.

## Test rules

1. Do not weaken tests to pass — fix infrastructure or confirm a product bug.
2. Classify failures: **product bug** / **test bug** / **fixture issue** / **env issue**.
3. Use factories under `apps/api/src/test/factories/` for tenants, subscriptions, and promotion unit data.
4. Keep `loadRbacRouteMock` and partial logger mocks in sync when middleware exports change.
5. Use non-watch commands (`test:api`, `test:billing`) for final checks.

## How to run

From the monorepo root (preferred):

```bash
pnpm test:api
```

Equivalent:

```bash
pnpm --filter @supplify/api test:run
pnpm --filter @supplify/api test:api
```

From `apps/api`:

```bash
pnpm test:api
```

Run a single file:

```bash
pnpm --filter @supplify/api test:run src/lib/subscription.test.js
```

Billing-focused subset (regression smoke):

```bash
cd apps/api && pnpm test:run \
  src/jobs/free-sandbox-expiry.job.test.js \
  src/middlewares/billingAccess.test.js \
  src/lib/billing/billing-service.test.js \
  src/routes/billing.routes.test.js \
  src/routes/subscriptions.routes.test.js
```

## Required environment variables

Global defaults are applied in `apps/api/src/test/setup.js` (loaded via `vitest.config.js` `setupFiles`):

| Variable               | Test default                              | Notes                         |
| ---------------------- | ----------------------------------------- | ----------------------------- |
| `NODE_ENV`             | `test`                                    |                               |
| `BILLING_GATEWAY`      | `stub`                                    | Avoids live payment providers |
| `JWT_SECRET`           | `test-jwt-secret`                         | Auth token tests              |
| `IMPERSONATION_SECRET` | `test-impersonation-secret-for-api-tests` | Impersonation tests           |

Override any of these in the shell when a test needs a specific value (e.g. `WEB_ORIGIN` in auth callback tests sets locally in-file).

**No test database is required** for the current suite: route and lib tests mock `../lib/db.js` query functions.

## Test DB / migrations

- Unit and route tests do **not** run migrations or connect to Postgres.
- If you add integration tests that need a DB later, use a dedicated `DATABASE_URL` and document it here; keep them out of the default `test:run` glob or gate with `describe.skipIf(!process.env.DATABASE_URL)`.

## Shared test infrastructure

| Path                                            | Purpose                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/api/src/test/setup.js`                    | Global env defaults                                                                                 |
| `apps/api/src/test/rbac-route-mock.js`          | `loadRbacRouteMock()` — partial RBAC mock keeping real `requireAnyPermission`, `optionalAuth`, etc. |
| `apps/api/src/test/factories/subscription.js`   | `subscriptionRow`, `createSubscriptionQueryRouter()`                                                |
| `apps/api/src/test/factories/deal-promotion.js` | `activeRestaurantDeal()` for promotion unit tests                                                   |
| `apps/api/src/test/factories/tenant.js`         | `requestTenant()`, `tenantContext()`                                                                |
| `apps/api/src/test/factories/entitlements.js`   | `entitlementsPayload()`                                                                             |
| `apps/api/src/test/helpers.js`                  | `mockUser`, `setupMocks`, `clearAllMocks`                                                           |

### Route test pattern

Replace incomplete `vi.mock('../lib/rbac.js', () => ({ requireAuth: ... }))` with:

```javascript
vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal, {
    // optional overrides, e.g. getRequestTenant, resolveAdminContext
  })
})
```

When routes use `tenant-resolve.js`:

```javascript
vi.mock('../lib/tenant-resolve.js', () => ({
  requireRestaurantId: vi.fn().mockResolvedValue('restaurant-1'),
  requireSupplierId: vi.fn().mockResolvedValue('supplier-1'),
}))
```

For modules that export `createModuleLogger` / `logEvent`, prefer a **partial** logger mock:

```javascript
vi.mock('../lib/logger.js', async (importOriginal) => {
  const actual = await importOriginal()
  const silentLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
  return { ...actual, logger: silentLogger, createModuleLogger: () => silentLogger }
})
```

## Baseline failures (before stabilization)

**19 test files** failed collection or assertions (~19 tests, 624 passed) on full `test:run`.

| File                                     | Classification       | Symptom                                                         |
| ---------------------------------------- | -------------------- | --------------------------------------------------------------- |
| `subscription.test.js`                   | Test bug (mocks)     | `getTenantSubscription` null; grace-limit wrong fixture         |
| `orders.calendar.routes.test.js`         | Test bug (RBAC mock) | Missing `requirePermission` export                              |
| `orders.calendar.routes.feature.test.js` | Test bug (RBAC mock) | Same                                                            |
| `auth.routes.test.js`                    | Test bug (RBAC mock) | Missing `optionalAuth`                                          |
| `orders.routes.test.js`                  | Test bug (mocks)     | Missing `requireAnyPermission`; extra DB calls                  |
| `promotions.routes.test.js`              | Test bug (RBAC mock) | Missing `requireAnyPermission`                                  |
| `org.routes.test.js`                     | Test bug (RBAC mock) | Incomplete RBAC                                                 |
| `suppliers.routes.test.js`               | Test bug (mocks)     | Logger exports; stale restaurant DB stub                        |
| `reports.routes.test.js`                 | Test bug (RBAC mock) | Incomplete RBAC                                                 |
| `payments.routes.test.js`                | Test bug (mocks)     | Missing invoice scoping query mock                              |
| `promotions.supplier-security.test.js`   | Test bug (RBAC mock) | Incomplete RBAC                                                 |
| `tenant-role-matrix.test.js`             | Outdated expectation | Promotions Manager now has `ORDERS_MANAGE`                      |
| `promotions.service.test.js`             | Outdated fixture     | Deals need boost window fields                                  |
| `branches.routes.test.js`                | Test bug (mocks)     | Duplicate `tenant-switch` mock dropped `canSwitchActiveTenant`  |
| `reservations.routes.test.js`            | Test bug (mocks)     | Extra restaurant resolve query after `requireRestaurantId` mock |
| `invoices.routes.test.js`                | Test bug (RBAC mock) | `getRequestTenant` null                                         |
| `disputes.routes.test.js`                | Test bug (mocks)     | Missing tenant-resolve / RBAC                                   |
| `reviews.routes.test.js`                 | Test bug (mocks)     | Same                                                            |
| `impersonation.test.js`                  | Outdated expectation | `viewAsRoleId: null` in effective tenant                        |

## Fixes applied

1. **`loadRbacRouteMock`** — shared partial RBAC for route tests.
2. **`subscription.test.js`** — `org-billing-tenant`, `plan-enforcement` mocks; `createSubscriptionQueryRouter`; grace test uses `graceUsed: 0` when expecting allowance.
3. **Promotion / matrix / impersonation** — fixtures and expectations aligned with current product behavior (no logic changes).
4. **Route tests** — migrated to partial RBAC; added `tenant-resolve` where needed; fixed query mock ordering (orders warehouse assignments, payments invoice check, reservations board, suppliers list).
5. **`branches.routes.test.js`** — single `tenant-switch` mock with `canSwitchActiveTenant`.
6. **`vitest.config.js`** — `setupFiles: ['src/test/setup.js']`.
7. **Factories** — subscription, deal-promotion, tenant, entitlements helpers under `src/test/factories/`.

## Final result

```
Test Files  117 passed (117)
     Tests  683 passed (683)
```

(Date: 2026-05-28)

## Remaining risks / flaky notes

- **Redis log noise**: Several suites log `Redis connection established for calendar cache` when calendar/cache code loads; tests still pass without Redis if connection fails gracefully.
- **Notification errors in chat suite**: Occasional `Failed to send notification` log lines from incomplete notification DB mocks; does not fail tests today.
- **`drivers.routes.test.js` / `register.routes.test.js`**: Slower (~3–5s); may approach timeout on very slow CI runners.
- **Partial mocks**: New route exports from `rbac.js`, `logger.js`, or `tenant-switch.js` require updating shared mocks or using `importOriginal` partial mocks.
- **Integration tests**: Not part of default `test:run`; adding real DB tests should be opt-in.

## Product bugs found

None confirmed during this pass. Failures were classified as test infrastructure, outdated expectations, or fixture drift—not billing/subscription regressions.
