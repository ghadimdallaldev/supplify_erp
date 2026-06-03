# QA automation guide

How to run automated checks in the Supplify monorepo: API unit tests (Vitest), web unit tests, RBAC/billing subsets, and CI. For API mock patterns and stabilization history, see **[API test suite stabilization](../API_TEST_SUITE_STABILIZATION.md)**.

## Quick commands (monorepo root)

| Command               | Mode                   | What it runs                                              |
| --------------------- | ---------------------- | --------------------------------------------------------- |
| `pnpm test:api`       | **Run once** (CI-safe) | Full API Vitest suite (`apps/api`, 131 files, ~770 tests) |
| `pnpm test:api:watch` | Watch                  | API tests while developing                                |
| `pnpm test:web`       | Run once               | Full web Vitest suite                                     |
| `pnpm test:web:watch` | Watch                  | Web tests while developing                                |
| `pnpm test:all`       | Run once               | API + web (`pnpm test:ci`)                                |
| `pnpm test:billing`   | Run once               | Billing/subscription/plan subset (API)                    |
| `pnpm test:rbac`      | Run once               | API + web RBAC-focused files                              |
| `pnpm test:ci`        | Run once               | Same as `test:all` (used by `pnpm qa`)                    |
| `pnpm qa`             | Run once               | lint + typecheck + `test:ci` + build                      |

### Final verification (PR / Cursor / CI)

Always use **non-watch** commands before claiming green:

```bash
pnpm test:api
pnpm test:web
# or
pnpm test:all
```

Do **not** use `pnpm test` or `pnpm --filter @supplify/api test` for final verification — those start Vitest in **watch** mode.

## Run one API test file

From repo root:

```bash
pnpm --filter @supplify/api test:api src/lib/subscription.test.js
pnpm --filter @supplify/api test:api src/routes/billing.routes.test.js
```

From `apps/api`:

```bash
pnpm test:api src/lib/subscription.test.js
```

## Test environment variables

Defaults are set in `apps/api/src/test/setup.js` (no real Postgres required for unit/route tests):

| Variable               | Default in tests                          |
| ---------------------- | ----------------------------------------- |
| `NODE_ENV`             | `test`                                    |
| `BILLING_GATEWAY`      | `stub`                                    |
| `JWT_SECRET`           | `test-jwt-secret`                         |
| `IMPERSONATION_SECRET` | `test-impersonation-secret-for-api-tests` |

Set the same values when running tests locally or in your own CI runner.

## Common mock patterns (API route tests)

### Partial RBAC mock

```javascript
vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal, {
    // optional: getRequestTenant, resolveAdminContext, etc.
  })
})
```

### Tenant resolve

```javascript
vi.mock('../lib/tenant-resolve.js', () => ({
  requireRestaurantId: vi.fn().mockResolvedValue('restaurant-1'),
  requireSupplierId: vi.fn().mockResolvedValue('supplier-1'),
}))
```

### Logger (keep `logEvent` / `createModuleLogger`)

```javascript
vi.mock('../lib/logger.js', async (importOriginal) => {
  const actual = await importOriginal()
  const silentLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
  return { ...actual, logger: silentLogger, createModuleLogger: () => silentLogger }
})
```

### Factories

| Factory                                | Use for                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| `src/test/factories/subscription.js`   | `subscriptionRow`, `createSubscriptionQueryRouter()`                 |
| `src/test/factories/deal-promotion.js` | `activeRestaurantDeal()` (unit tests only; do not change deal rules) |
| `src/test/factories/tenant.js`         | `requestTenant()`, `tenantContext()`                                 |
| `src/test/factories/entitlements.js`   | `entitlementsPayload()`                                              |

## Test rules

1. **Do not weaken tests to make them pass** — fix mocks, fixtures, or expectations; only change product code when a failure is a verified bug.
2. **Classify every failure** before fixing:
   - **Product bug** — behavior wrong vs spec; fix code + add/adjust test.
   - **Test bug** — wrong mock, missing export, bad assertion.
   - **Fixture issue** — stale DB row shape or factory data.
   - **Env issue** — missing env var, watch vs run, Redis/network in CI.
3. **Use factories** for tenants, subscriptions, and promotion **unit** fixtures (`src/test/factories/`).
4. **Keep RBAC mocks updated** when `rbac.js`, `tenant-resolve.js`, `tenant-switch.js`, or `logger.js` gain new exports — prefer `loadRbacRouteMock` + `importOriginal` partial mocks.
5. **Non-watch for verification** — `pnpm test:api`, `pnpm test:web`, `pnpm test:all`; watch only while iterating (`test:api:watch`).
6. **Do not change tier/pricing or Deals/Promotions business logic** in test-only stabilization work unless a test proves a real bug in that area.

## CI

GitHub Actions was removed from this repo. Run before deploy or in your own pipeline:

1. `pnpm install --frozen-lockfile`
2. `pnpm test:ci` (API + web unit tests)
3. `pnpm build`

E2E (Playwright) is not part of the default check; run `pnpm e2e:playwright` locally when Docker infra is up. See [tests/README.md](../../tests/README.md).

## Delivery GPS / tracking (targeted runs)

```bash
pnpm --filter @supplify/api test:api src/lib/delivery-tracking-payload.test.js src/lib/restaurant-tracking-payload.test.js src/routes/orders-driver-tracking.test.js src/services/driver-location.service.test.js
pnpm --filter @supplify/web test:run -- deliveryTrackingLabels DeliveryTrackingMap DriverDispatchBoard FulfillmentTrackingTab RestaurantOrderTrackingPanel restaurantTrackingMessages orderTimeline
```

Manual regression: [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md) §6.6.1, §7.4.1, §7.4.2. Feature spec: [fulfillment-logistics.md](../features/fulfillment-logistics.md).

## Related docs

- [API test suite stabilization](../API_TEST_SUITE_STABILIZATION.md) — baseline failures, fixes, risks
- [Manual test checklist](./MANUAL_TEST_CHECKLIST.md)
- [Billing activation manual checklist](./MANUAL_TEST_CHECKLIST_BILLING_ACTIVATION.md)
- [tests/README.md](../../tests/README.md) — Playwright E2E
