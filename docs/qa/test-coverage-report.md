# Test Coverage Report

**Last verified:** 2026-09-10 (file inventory + P0 suite green; full API suite was **291 passed / 2 failed** before cron+prices mock fixes — re-run `pnpm test:api` / `pnpm test:web` for sign-off totals).

Automated coverage spans API routes, services, libraries, middlewares, jobs, and React units. Manual regression: [regression-checklist.md](./regression-checklist.md). Feature-level test maps: [deals-and-promotions.md](../features/deals-and-promotions.md), [waitlist-auto-promotion.md](../features/waitlist-auto-promotion.md).

## Summary

| Area                 | Test files (approx.) | Notes                                 | Runner                |
| -------------------- | -------------------: | ------------------------------------- | --------------------- |
| API (`apps/api/src`) |                  293 | Prefer Vitest summary over this table | Vitest                |
| Web (`apps/web/src`) |                  126 | Prefer Vitest summary over this table | Vitest                |
| Playwright E2E       |                   27 | `tests/e2e/suites/**/*.spec.ts`       | Playwright (optional) |
| Playwright API smoke |                    5 | `tests/api/*.spec.ts`                 | Playwright (optional) |

## 2026-09-10 feature ↔ test map

| Area                   | Automated coverage (primary)                                                                                   | Manual IDs              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Reservation excellence | `reservation-policy.test.js`, `reservation-availability.test.js`, `reservations.routes.test.js`                | RST-42d–42n, PUB-17–21  |
| Supplier last-order    | `supplier-last-order.test.js`                                                                                  | RST-18a–18c             |
| Contract prices win    | `scheduled-orders.service.test.js`, `resolve-product-price.service.test.js`                                    | RST-18d–18f             |
| Promotion ad billing   | `promotion-ad-billing.test.js`, `promotions.boost-money-flow.test.js`, `restaurant-targeting.test.js`          | SUP-61–68, ADM-AD-01–05 |
| Quote inbox v2         | `quote-requests.service.test.js` (decline), `quote-requests.routes.test.js`, `SupplierQuoteInboxPage.test.tsx` | QRF-10–18               |
| Driver POD / multi-WH  | `driver-fulfillment.service.test.js` (extend for POD upsert / multi-leg)                                       | FUL-01–12               |
| Audience targeting     | `restaurant-targeting.test.js`, `deal-promotions.service.test.js`                                              | SUP-61, SUP-68          |
| Guest menu tags / 86   | Partial — add `consumer-menu-tags` / menu route tests when extending coverage                                  | MENU-01–03              |

## API coverage highlights

### Routes (representative)

- Auth, register, billing, subscriptions, feature-gates
- Orders (+ calendar, search/filter), products, inventory, receiving, invoices
- Chat, notifications (via notification service), disputes, reports
- Reservations, public (guest book/manage/waitlist/staff portal)
- Promotions/deals (+ boost money flow, supplier security, RBAC), reviews
- Quote requests (create/list/respond; decline + inbox filters expanding)
- Staff, tenant-roles, branches, org, branch-invitations
- Admin dashboard, warehouses, fulfillment, drivers, suppliers, restaurants

### Services & jobs

- `notification.service`, `waitlistPromotion`, `scheduled-orders`, `promotions` / deal lifecycle / boost / ad billing
- `quote-requests.service` (incl. `declineQuoteRequest`)
- `reports`, `disputes`, `warehouseRouting`, `push`, `whatsapp`, mailers
- Cron idempotency: `cron-runner.test.js`; free sandbox expiry job
- Reservation guest comms / reviews — expand job coverage as needed

### Libraries & middleware

- RBAC (full-app, guards, role access, impersonation), subscription, limit-resolution, tier-matrix-verify
- Socket: `socket.test.js`, `socket-auth.test.js`
- Billing (stub gateway, activation, paid checkout, promotion-ad billing), plan enforcement, feature flags
- `restaurant-targeting`, `supplier-last-order`, `reservation-policy`
- `billingAccess` middleware, `errorHandler`

## Web coverage highlights

### Hooks & realtime

- `useChatRealtime.test.ts` — message/typing/read socket handlers
- `useNotificationAlerts.test.tsx` — toast dedupe, Socket.IO `notification_new`
- RBAC gating hooks (`rbacGating`, `rbacFullAppGating`, catalog manager)

### Pages & components (selected)

- `ReservationsPage.test.tsx`, `PublicReservationWaitlistOffer.test.tsx`
- `SupplierQuoteInboxPage.test.tsx` — decline, tabs, search, counts
- Chat components (via hook tests + ChatPage integration through realtime hooks)
- Admin tabs, fulfillment dispatch, TeamRolesPanel, RolePermissionChecklist
- Plan limits, feature gates, contract/report response parsers (`reportResponse`, `contractPricingResponse`, `apiError`)

### Removed / replaced

- `useSocket.test.ts` — replaced by unified `getAppSocket()` + `useChatRealtime` / `useNotificationAlerts`

## Playwright & integration (`tests/`)

| Suite    | Path                                       | Focus                                                                                           |
| -------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Smoke    | `tests/e2e/suites/smoke/*.spec.ts`         | App shell, login, registration, consumer ordering                                               |
| Critical | `tests/e2e/suites/critical_e2e/*.spec.ts`  | auth, orders, catalog, rbac, quotes, deals, fulfillment, driver, subscription-limits            |
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

Targeted 2026-09-10 commands: [testing-guide.md](./testing-guide.md)#2026-09-10-release-areas-targeted-runs.

## Maintenance rules

1. Update this doc when adding a **new product area** or changing manual ↔ automated ID mapping.
2. Add/adjust tests with every bug fix and feature gate change.
3. Use factories in `apps/api/src/test/factories/` for subscription/tenant fixtures.
4. Final verification always uses **non-watch** commands (`pnpm test:api`, not bare `pnpm test`).
5. After `pnpm test:ci`, paste the Vitest file/test totals into **Last verified** above.

## Related docs

- [QA automation guide](./testing-guide.md)
- [API test suite stabilization](../API_TEST_SUITE_STABILIZATION.md)
- [regression-checklist.md](./regression-checklist.md)
