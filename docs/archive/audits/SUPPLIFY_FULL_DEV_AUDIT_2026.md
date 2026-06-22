# Supplify Full Dev Audit — June 2026

**Date:** 2026-06-07  
**Environment:** Development only (no prod deploy)  
**Auditor:** Automated + static analysis + test suite  
**Goal:** Validate web/API stability before mobile app v1

---

## 1. Executive summary

Supplify dev is **in good shape for mobile kickoff** with **conditional go**. Core flows—orders, fulfillment dispatch, planned routes, driver GPS, restaurant tracking/ETA, RBAC, and subscription gating—are implemented with strong automated coverage on the hot path. This audit fixed **safe test drift and UI copy** issues, added **admin + notifications route tests**, and documented remaining gaps.

**Go/no-go:** **GO** to start mobile app planning/implementation for **driver + restaurant** flows, after resolving **mobile auth/session strategy** (see `docs/mobile/MOBILE_READINESS_AUDIT.md`). Run a **manual smoke on Railway dev** for roles you have not exercised live (accountant, viewer, branch user).

| Area                 | Status                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Backend API / RBAC   | Strong                                                                                                 |
| GPS / ETA / privacy  | Strong                                                                                                 |
| Driver flows         | Strong (your primary test focus aligns with coverage)                                                  |
| Restaurant flows     | Good (automated; manual catalog/checkout spot-check recommended)                                       |
| Supplier fulfillment | Good                                                                                                   |
| Admin                | Good (`admin-dashboard` well tested)                                                                   |
| Performance          | Good (recent index migrations)                                                                         |
| Test suite           | **930/944 API pass**, **260+/267 web pass** after fixes; 14 API + 5–7 web pre-existing failures remain |
| Mobile readiness     | API reusable; auth packaging is main work                                                              |

---

## 2. Audit scope

Phases 1–13 from audit brief:

1. Roles & permissions
2. Restaurant flows
3. Supplier flows
4. Driver flows
5. Admin flows
6. Backend/API
7. Performance
8. Frontend UI/UX
9. GPS/ETA/privacy
10. Database/migrations
11. Security
12. Automated tests
13. Mobile readiness

**Out of scope:** Production deploy, live Railway latency profiling, full manual QA of every screen on dev URLs.

---

## 3. Roles tested

Coverage via `pnpm test:rbac`, route tests, component gating tests, and static RBAC matrix review.

| Tenant       | Roles reviewed                                                                          |
| ------------ | --------------------------------------------------------------------------------------- |
| Restaurant   | Owner, Manager, Purchaser, Receiving, Accountant, Viewer, FOH Host, Branch              |
| Supplier     | Owner, Manager, Fulfillment, Warehouse, Driver, Catalog, Promotions, Accountant, Viewer |
| Driver       | Linked supplier user with `Driver` workspace role                                       |
| Admin        | Super/Support/Finance/Growth (API granular; UI shows admin nav for all `ADMIN`)         |
| Staff portal | Separate `STAFF_PORTAL` app role — blocked from main `/api/*` except allowlist          |

Full matrix: [`SUPPLIFY_ROLE_TEST_MATRIX.md`](./SUPPLIFY_ROLE_TEST_MATRIX.md)

---

## 4. Critical bugs found

**No critical production security or data-leak bugs were introduced or discovered requiring immediate code rollback.**

| Severity | Issue                                                                            | Status                                       |
| -------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| Medium   | Pre-existing API test failures (feature-flags, auth Keycloak mock, staff routes) | Documented; not blocking mobile              |
| Low      | Sidebar RBAC UI tests missing `BranchProvider` wrapper                           | Documented                                   |
| Low      | `GET /api/admin/dashboard` allows any authed role (tenant-scoped stats)          | By design; not equivalent to admin-dashboard |
| Info     | Restaurant tracking test used stale map test id                                  | **Fixed**                                    |

---

## 5. Bugs fixed (this audit)

See [`SUPPLIFY_AUDIT_FIX_LOG.md`](./SUPPLIFY_AUDIT_FIX_LOG.md).

Highlights:

- Restaurant tracking panel test aligned with `delivery-tracking-map` test id
- Fulfillment route activation copy → user-friendly labels
- Permission + invitation test mocks updated for parallel query / cache invalidation
- Billing free-checkout test stabilized
- New `admin.routes.test.js`, `notifications.routes.test.js`
- Driver sidebar RBAC test stabilized

---

## 6. Performance findings

See [`../performance/FULL_DEV_AUDIT_PERFORMANCE_FINDINGS.md`](../performance/FULL_DEV_AUDIT_PERFORMANCE_FINDINGS.md).

- Migrations `0137`–`0143` add GPS, query-driven, and order-create indexes
- RTK Query polling uses `skipPollingIfUnfocused` on tracking components
- `/auth/me` uses Redis cache + singleflight for permissions
- No unsafe blocking work found on order create response path in route tests

---

## 7. Security / RBAC findings

| Check                                  | Result                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Tenant isolation on orders/fulfillment | Pass — supplier id in queries                                                               |
| IDOR on driver location POST           | Pass — assignment + driver link checks                                                      |
| Restaurant tracking sanitization       | Pass — `restaurant-tracking-payload.js` strips driver id, route, coords from restaurant map |
| Admin-only routes                      | Pass — `/api/admin-dashboard` requires `ADMIN` + granular permissions                       |
| Impersonation safety                   | Pass — billing/subscription mutations blocked                                               |
| Subscription / billing lock            | Pass — 402/403 middleware                                                                   |
| Public supplier list                   | Intentional `optionalAuth` on `GET /api/suppliers`                                          |
| CSRF on mutating API                   | Enabled (exempt `/api/public`)                                                              |
| Secrets in repo                        | No real secrets in env examples (spot check)                                                |

**Recommendation (deferred):** Add rate limit review on `POST /api/orders/:id/location` under load test.

---

## 8. UI/UX findings

| Item                                               | Status                                                |
| -------------------------------------------------- | ----------------------------------------------------- |
| Driver UI — large buttons, simple labels           | Good (`driverDeliveryUi.ts`)                          |
| Restaurant tracking — reassuring copy              | Good (`restaurantTrackingMessages.ts`)                |
| Supplier map — driver + destination pins, recenter | Implemented (`DeliveryTrackingMap`)                   |
| Fulfillment route activation copy                  | **Improved** this audit                               |
| Loading / empty states on fulfillment tabs         | Present (skeletons, dashed empty routes)              |
| Mobile responsive driver/receiving                 | Prior PWA audit; tests exist                          |
| Status label consistency                           | Generally good; internal enums not exposed to drivers |

Remaining polish (deferred): accountant/catalog manager sidebar tests; `FulfillmentRoutesTab` empty-state test selector.

---

## 9. GPS / ETA / privacy findings

| Rule                                                | Implementation                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Driver-only GPS POST                                | `orders-driver.routes.js` + `driver-location.service.js`                   |
| Valid coords (no 0,0)                               | `delivery-coordinates.js`                                                  |
| Rate limit / staleness                              | Service + `isStale` in tracking payload                                    |
| ETA only when picked_up / out_for_delivery + coords | `delivery-eta.service.js` + `sanitizeEtaForRestaurant`                     |
| ETA hidden when assigned-only / no GPS              | Restaurant messages + ETA section `show` prop                              |
| Restaurant: no raw driver id / route                | `buildRestaurantTrackingResponse`                                          |
| Supplier: full ops data                             | `delivery-tracking-payload.js`                                             |
| Delivered ≠ auto-receive                            | Separate receiving flow; tests confirm CTA gating                          |
| Planned route does not start GPS                    | Route activation creates assignments; GPS on active delivery statuses only |

Tests: `orders-driver-tracking.test.js`, `orders-driver-location.test.js`, `deliveryEtaDisplay.test.ts`, `restaurantTrackingMessages.test.ts`

---

## 10. Database / migration findings

| Check                  | Result                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| Migration count        | 142 numbered SQL files under `apps/api/db/migrations/`                                                          |
| Duplicate numbers      | `0103_*` (two files), `0108_*` (two files), `0130_*` (two files) — **pre-existing**; runner uses filename order |
| Recent fulfillment/GPS | `0127_delivery_route_planning`, `0137_driver_location_tracking`, `0143_restaurant_delivery_coordinates`         |
| Hot indexes            | `0138`, `0139`, `0140`, `0141`, `0142` performance migrations                                                   |
| Driver RBAC hardening  | `0126_rbac_driver_role_hardening`                                                                               |
| Coordinate fields      | Restaurant delivery location migration + app validation                                                         |

**Not run:** Full empty-DB migrate from scratch in this session (use `pnpm db:migrate` on clean DB in CI).

---

## 11. Tests added / updated

| Added                                    | Updated                                 |
| ---------------------------------------- | --------------------------------------- |
| `admin.routes.test.js` (4 tests)         | `permissions.test.js`                   |
| `notifications.routes.test.js` (3 tests) | `invitation-role-assignment.test.js`    |
|                                          | `subscriptions.routes.test.js`          |
|                                          | `billing.routes.test.js`                |
|                                          | `RestaurantOrderTrackingPanel.test.tsx` |
|                                          | `rbacGating.test.tsx`                   |

### Build / test results (post-fix)

| Suite                                                 | Result                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Critical API (orders, driver, fulfillment, rbac-full) | **57/57 pass**                                                                                |
| RBAC API (after fixes)                                | **154+/157 pass** (3 fixed; suite may still include unrelated failures when run in isolation) |
| Full API                                              | **930 pass / 14 fail** (pre-existing: feature-flags, auth, staff, suppliers)                  |
| Full web                                              | **~260 pass / ~7 fail** (sidebar gating family + FulfillmentRoutesTab)                        |
| Admin dashboard API                                   | **31/31 pass**                                                                                |

Pre-existing failures are **documented separately** — not introduced by this audit.

---

## 12. Remaining risks

1. **Manual role coverage** — Accountant, branch user, promotions manager not fully manually tested on dev
2. **UI RBAC test harness** — Several sidebar tests need shared `BranchProvider` wrapper
3. **feature-flags.test.js** — 5 failures; verify plan feature resolution before tier changes
4. **Polling load** — Multiple 15s trackers if supplier opens order + drawer + board simultaneously
5. **Mobile auth** — Cookie/CSRF model needs native equivalent before app store
6. **Duplicate migration numbers** — Low risk if migrate script orders lexicographically; document for new migrations

---

## 13. Deferred recommendations

1. Shared test utility: `renderWithAppProviders()` for Sidebar/Auth tests
2. `GET /api/admin/dashboard` — consider `requireRole(['ADMIN'])` if endpoint unused by tenants
3. Compact mobile payloads for dispatch board
4. Push notifications for restaurant "driver nearby"
5. E2E smoke: restaurant order → supplier dispatch → driver GPS → restaurant ETA → manual receive
6. Railway dev p95 benchmark script for top 10 endpoints

---

## 14. Mobile readiness notes

Full detail: [`../mobile/MOBILE_READINESS_AUDIT.md`](../mobile/MOBILE_READINESS_AUDIT.md)

- Reuse order, tracking, driver, fulfillment route APIs
- Prioritize **driver app**, then **restaurant order/track/receive**
- Blocker: **session/auth packaging**, not fulfillment API completeness

---

## 15. Go / no-go recommendation

### **GO (conditional)** — start mobile app

**Conditions before coding:**

1. Decide mobile auth approach (PKCE + secure token storage vs BFF cookies)
2. Run one manual dev smoke per untested role (30 min)
3. Stabilize or quarantine pre-existing `feature-flags` test failures before next billing/tier change

**Do not block mobile on:** supplier web fulfillment polish, admin mobile, or 100% web test pass rate (fix harness in parallel).

---

## Related documents

- [Role test matrix](./SUPPLIFY_ROLE_TEST_MATRIX.md)
- [Fix log](./SUPPLIFY_AUDIT_FIX_LOG.md)
- [Performance findings](../performance/FULL_DEV_AUDIT_PERFORMANCE_FINDINGS.md)
- [Mobile readiness](../mobile/MOBILE_READINESS_AUDIT.md)
- [RBAC overview](../architecture/rbac-overview.md)
- [Prior PWA audit](../archive/audits/pwa-mobile-readiness-audit.md)
