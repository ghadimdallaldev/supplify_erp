# Test coverage map

| Feature / module        | Smoke                                      | Critical E2E                                                                                                  | Nightly                    | API                                                |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------- |
| **Auth**                | Login page loads; unauthenticated redirect | Session persistence; logout                                                                                   | —                          | —                                                  |
| **Tenant registration** | —                                          | —                                                                                                             | —                          | Register routes 401                                |
| **Billing activation**  | —                                          | —                                                                                                             | —                          | Billing checkout 401                               |
| **RBAC**                | —                                          | Restaurant and supplier cannot access admin UI                                                                | —                          | Admin overview/plans 401                           |
| **Orders**              | —                                          | Orders→cart; supplier inbox; supplier fulfill (ack→ship→deliver); supplier decline; restaurant sees delivered | —                          | —                                                  |
| **Receiving**           | —                                          | —                                                                                                             | —                          | `receiving.routes.test.js`                         |
| **Tenant RBAC**         | —                                          | —                                                                                                             | —                          | workspace + rbac-guards + tenant-roles route tests |
| **Order timeline**      | —                                          | —                                                                                                             | —                          | `orderTimeline.test.ts`                            |
| **Catalog**             | —                                          | Restaurant & supplier open products; restaurant search and add to cart                                        | —                          | —                                                  |
| **Subscription limits** | —                                          | App loads with subscription context                                                                           | —                          | —                                                  |
| **Navigation**          | —                                          | —                                                                                                             | Dashboard; Quick Lists nav | —                                                  |
| **Cart**                | —                                          | Via orders and catalog (place order, add to cart)                                                             | —                          | —                                                  |
| **Promotions & deals**  | —                                          | Order detail with applied promotion (via orders E2E)                                                          | —                          | Promotions API auth gates                          |

## Test locations

- **Smoke**: `e2e/suites/smoke/smoke.spec.ts`
- **Critical E2E**: `e2e/suites/critical_e2e/` — `auth.spec.ts`, `rbac.spec.ts`, `orders.spec.ts`, `catalog.spec.ts`, `subscription-limits.spec.ts`
- **Nightly**: `e2e/suites/nightly/nightly.spec.ts`
- **API**: `api/admin-rbac.spec.ts`, `api/registration-activation.spec.ts`, `api/promotions-deals-gates.spec.ts`
- **Unit (deals/promotions)**: `apps/api/src/services/promotions.service.test.js`, `apps/api/src/services/deal-promotions.service.test.js`, `apps/api/src/services/deal-lifecycle.service.test.js`, `apps/api/src/routes/promotions.routes.test.js`, `apps/api/src/routes/feature-gates.routes.test.js`, `apps/web/src/lib/planLimits.test.ts`, `apps/web/src/lib/upgradeCopy.test.ts`
- **Unit (RBAC/receiving/timeline)**: `workspace-membership.test.js`, `rbac-guards.test.js`, `tenant-roles.routes.test.js`, `receiving.routes.test.js`, `orderReceiving.test.ts`, `orderTimeline.test.ts`

## Feature inventory

- **File**: `tests/feature-inventory.yml` — lists every feature and linked test files.
- **Gate**: `pnpm test:coverage-map` fails if any feature has no tests or a linked file is missing. Run in CI.

## Roles (storageState)

- `critical_e2e_restaurant`: restaurant_manager
- `critical_e2e_admin`: admin
- `critical_e2e_supplier`: supplier_user
- `nightly`: uses restaurant storageState

## Reset/seed scenarios

- **orders_basic**: One PLACED order (fixed id) for supplier to fulfill.
- **orders_delivered**: One DELIVERED order for restaurant to see.
- **catalog_basic**: At least one product (supplier) for restaurant to browse/add to cart.
- **subscription_limits_basic**: Usage at limit for subscription UI/API checks.
