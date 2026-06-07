# Supplify Role Test Matrix

Date: 2026-06-07  
Legend: **Pass** = verified via automated tests and/or static code audit; **Partial** = covered in code/tests but not full manual E2E on dev; **Fail** = gap found

## Restaurant roles

| Role            | Screen / API                   | Expected access                 | Actual access                                    | Pass/Fail | Notes                                       |
| --------------- | ------------------------------ | ------------------------------- | ------------------------------------------------ | --------- | ------------------------------------------- |
| Owner           | `/app/dashboard`               | Full restaurant nav             | Full nav per `ORDERS_*`, `CATALOG_*`, etc.       | Pass      | `rbac-full-app.test.js`                     |
| Owner           | `POST /api/orders`             | Create orders                   | `RESTAURANT` + `ORDERS_CREATE`                   | Pass      | `orders.routes.test.js`                     |
| Owner           | `GET /api/fulfillment/*`       | 403                             | Blocked (supplier-only router)                   | Pass      | `fulfillment.routes.test.js`                |
| Manager         | Orders create/edit             | Yes (no billing admin)          | Permission matrix `Restaurant Manager`           | Pass      | `tenant-role-matrix.test.js`                |
| Purchaser       | Cart/checkout                  | Create orders, catalog          | `ORDERS_CREATE`, `CATALOG_VIEW`                  | Pass      | Matrix + UI `RequirePermission`             |
| Receiving Staff | `/app/receiving`               | Receive/dispute; no create      | `RECEIVING_*` without `ORDERS_CREATE`            | Pass      | Matrix                                      |
| Accountant      | `/app/invoices`                | Finance only                    | `INVOICES_*`, `PAYMENTS_*`, `SUBSCRIPTIONS_VIEW` | Partial   | UI gating tests need BranchProvider wrapper |
| Viewer          | Mutations                      | 403 on writes                   | `isViewOnly` + API `requirePermission`           | Pass      | `orders-driver-access`, promotions RBAC     |
| Viewer          | `PATCH /api/orders/:id`        | 403                             | Mutation guard                                   | Pass      | Route tests                                 |
| Branch user     | Branch context                 | Scoped tenant via header/cookie | `activeTenantContext` middleware                 | Partial   | `branches.routes.test.js`                   |
| Any             | `GET /api/orders/:id/tracking` | Sanitized payload               | No driver id, route id, ping history             | Pass      | `orders-driver-tracking.test.js`            |
| Any             | Logout / session               | Clears session                  | `/auth/logout`, cookie clear                     | Pass      | `auth.routes.test.js`                       |

## Supplier roles

| Role               | Screen / API                    | Expected access            | Actual access                                 | Pass/Fail | Notes                                 |
| ------------------ | ------------------------------- | -------------------------- | --------------------------------------------- | --------- | ------------------------------------- |
| Owner              | `/app/command-center`           | Full supplier ops          | All `SUPPLIER_*` permissions                  | Pass      | Matrix                                |
| Manager            | Fulfillment board               | View + manage dispatch     | `FULFILLMENT_VIEW/MANAGE`                     | Pass      | `fulfillment.routes.test.js`          |
| Fulfillment staff  | `/app/fulfillment`              | Dispatch, routes, tracking | Feature gate `warehouses` + fulfillment perms | Pass      | Feature + route tests                 |
| Driver manager     | `/api/drivers`                  | CRUD drivers               | `FULFILLMENT_*` + `driver_management` feature | Pass      | `drivers.routes.test.js`              |
| Driver (workspace) | `/app/driver-deliveries` only   | Minimal nav                | `isDriverRole` sidebar branch                 | Pass      | `rbacGating.test.tsx` (fixed)         |
| Driver             | Supplier admin routes           | 403                        | `requireRole` + permission checks             | Pass      | `orders-driver-access.routes.test.js` |
| Driver             | Other drivers' assignments      | 403                        | `assertDriverAssignmentAccess`                | Pass      | `driver-rbac.js` + tests              |
| Viewer             | Dispatch mutations              | 403                        | `DriverDispatchBoard.viewer.test.tsx`         | Pass      | Component test                        |
| Accountant         | Promotions/catalog              | No access                  | Finance permissions only                      | Partial   | UI test drift                         |
| Catalog Manager    | Products only                   | No invoices                | `rbacCatalogManagerGating`                    | Partial   | Test needs BranchSwitcher mock        |
| Any                | Other supplier's data           | 403                        | Tenant id in all fulfillment queries          | Pass      | SQL scoping in route tests            |
| Any                | `POST /api/orders/:id/location` | Assigned driver only       | GPS validation service                        | Pass      | `orders-driver-location.test.js`      |

## Driver scenarios

| Scenario               | Screen / API                     | Expected                                   | Actual                                     | Pass/Fail | Notes                           |
| ---------------------- | -------------------------------- | ------------------------------------------ | ------------------------------------------ | --------- | ------------------------------- |
| Driver login           | OAuth + `/app/driver-deliveries` | Driver home redirect                       | `SupplierHome` → driver deliveries         | Pass      | Code audit                      |
| With active route      | Route panel + stops              | Reorder, next stop                         | `FulfillmentRoutesTab`, `DriverRoutePanel` | Partial   | API tests; manual GPS on device |
| Standalone assignments | Delivery cards                   | Status transitions                         | `driverDeliveryActions.ts` tests           | Pass      |                                 |
| No assignments         | Empty state                      | Friendly copy                              | Driver page empty UI                       | Partial   | Manual                          |
| GPS allowed            | `POST .../location`              | Pings when picked_up/out_for_delivery      | `driverGpsTracking.test.ts`                | Pass      |                                 |
| GPS denied             | No crash                         | Graceful badge                             | `useDriverLocationTracking`                | Partial   | Browser manual                  |
| Delivered              | Order status                     | Does **not** auto-receive restaurant order | Separate receive flow                      | Pass      | `restaurantTrackingMessages`    |
| Terminal delivery      | GPS                              | Stops sending                              | Status guard in hook                       | Pass      |                                 |

## Platform admin

| Role          | Screen / API                 | Expected              | Actual                         | Pass/Fail | Notes                            |
| ------------- | ---------------------------- | --------------------- | ------------------------------ | --------- | -------------------------------- |
| Super admin   | `/app/admin`                 | Admin nav + tabs      | `ADMIN_*` permissions on API   | Pass      | `admin-dashboard.routes.test.js` |
| Super admin   | `GET /api/admin-dashboard/*` | Granular admin perms  | `requireAnyPermission` stack   | Pass      | 31 tests pass                    |
| Support       | Impersonation                | Start/stop + banner   | `impersonation.js` + UI banner | Pass      | `rbac.impersonation.test.js`     |
| Impersonating | Billing mutations            | Blocked               | `rejectImpersonationMutation`  | Pass      | `billing.routes.test.js`         |
| Non-admin     | `/api/admin/audit`           | 403                   | `requireRole(['ADMIN'])`       | Pass      | **New** `admin.routes.test.js`   |
| Non-admin     | Admin sidebar                | Hidden when not ADMIN | Sidebar branch                 | Pass      | E2E `rbac.spec.ts`               |

## Cross-role security checks

| Check                               | Expected                 | Actual                                 | Pass/Fail |
| ----------------------------------- | ------------------------ | -------------------------------------- | --------- |
| Restaurant → supplier GPS internals | 403 / sanitized          | Restaurant tracking payload strips ids | Pass      |
| Driver → supplier fulfillment UI    | No nav + API 403         | Driver-only sidebar                    | Pass      |
| Supplier A → Supplier B orders      | 403                      | Tenant scoping                         | Pass      |
| Subscription suspended              | 403 non-billing          | `resolveTenantContext`                 | Pass      |
| Billing locked                      | 402 except billing paths | `billingAccessMiddleware`              | Pass      |
| Viewer cannot POST orders           | 403                      | Permission middleware                  | Pass      |
