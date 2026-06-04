# Test Coverage Report

**Last verified:** June 2026 (`pnpm test:ci` — 131 API files / 770 tests; 59 web files / 202 tests)

Automated coverage spans API routes, services, libraries, middlewares, jobs, and React units. Manual regression: [regression-checklist.md](../qa/regression-checklist.md). Feature-level test maps: [deals-and-promotions.md](../features/deals-and-promotions.md), [waitlist-auto-promotion.md](../features/waitlist-auto-promotion.md).

## Summary

| Area                  |    Test files | Tests (approx.) | Runner                |
| --------------------- | ------------: | --------------: | --------------------- |
| API (`apps/api`)      |           131 |             770 | Vitest                |
| Web (`apps/web`)      |            59 |             202 | Vitest                |
| Playwright (`tests/`) | 12 spec files |   E2E/API smoke | Playwright (optional) |

## API coverage highlights

### Routes (representative)

- Auth, register, billing, subscriptions, feature-gates
- Orders (+ calendar, search/filter), products, inventory, receiving, invoices
- Chat, notifications (via notification service), disputes, reports
- Reservations, public (guest book/manage/waitlist/staff portal)
- Promotions/deals (+ supplier security, RBAC), reviews
- Staff, tenant-roles, branches, org, branch-invitations
- Admin dashboard, warehouses, fulfillment, drivers, suppliers, restaurants

### Services & jobs

- `notification.service`, `waitlistPromotion`, `scheduled-orders`, `promotions` / deal lifecycle / boost
- `reports`, `disputes`, `warehouseRouting`, `push`, `whatsapp`, mailers
- Cron idempotency: `cron-runner.test.js`; free sandbox expiry job

### Libraries & middleware

- RBAC (full-app, guards, role access, impersonation), subscription, limit-resolution, tier-matrix-verify
- Socket: `socket.test.js`, `socket-auth.test.js`
- Billing (stub gateway, activation, paid checkout), plan enforcement, feature flags
- `billingAccess` middleware, `errorHandler`

## Web coverage highlights

### Hooks & realtime

- `useChatRealtime.test.ts` — message/typing/read socket handlers
- `useNotificationAlerts.test.tsx` — toast dedupe, Socket.IO `notification_new`
- RBAC gating hooks (`rbacGating`, `rbacFullAppGating`, catalog manager)

### Pages & components (selected)

- `ReservationsPage.test.tsx`, `PublicReservationWaitlistOffer.test.tsx`
- Chat components (via hook tests + ChatPage integration through realtime hooks)
- Admin tabs, fulfillment dispatch, TeamRolesPanel, RolePermissionChecklist
- Plan limits, feature gates, contract/report response parsers (`reportResponse`, `contractPricingResponse`, `apiError`)

### Removed / replaced

- `useSocket.test.ts` — replaced by unified `getAppSocket()` + `useChatRealtime` / `useNotificationAlerts`

## Playwright & integration (`tests/`)

| Suite    | Path                                       | Focus                                                                                           |
| -------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Smoke    | `tests/e2e/suites/smoke/smoke.spec.ts`     | App shell, login                                                                                |
| Critical | `tests/e2e/suites/critical_e2e/*.spec.ts`  | auth, orders, catalog, rbac, subscription-limits                                                |
| Nightly  | `tests/e2e/suites/nightly/nightly.spec.ts` | Extended flows                                                                                  |
| API      | `tests/api/*.spec.ts`                      | registration-activation, admin-rbac, impersonation, promotions-deals-gates, receiving-delivered |

Requires Docker stack + Keycloak for full green. Not part of default `pnpm qa`.

## Running tests

```bash
pnpm test:api      # API once (CI-safe)
pnpm test:web      # Web once
pnpm test:all      # Both (= test:ci)
pnpm test:rbac     # RBAC subset
pnpm test:billing  # Billing/subscription subset
pnpm qa            # lint + typecheck + test:ci + build
pnpm e2e:playwright  # Playwright (stack must be up)
```

## Maintenance rules

1. Update this doc when adding a **new product area** or changing manual ↔ automated ID mapping.
2. Add/adjust tests with every bug fix and feature gate change.
3. Use factories in `apps/api/src/test/factories/` for subscription/tenant fixtures.
4. Final verification always uses **non-watch** commands (`pnpm test:api`, not bare `pnpm test`).

## Related docs

- [QA automation guide](../qa/testing-guide.md)
- [API test suite stabilization](../API_TEST_SUITE_STABILIZATION.md)
- [regression-checklist.md](../qa/regression-checklist.md)
