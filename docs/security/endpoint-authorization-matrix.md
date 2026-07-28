# Endpoint authorization matrix — Phase 1 seed

The complete route inventory is generated from code at [`route-inventory.json`](../audits/route-inventory.json) (`640` routes as of 2026-07-28). This document records the routes audited in Phase 1; every other inventory entry is `pending_phase2` and is not represented as exhaustively reviewed.

| Method   | Route                                                             | Authorization                                        | Status  | Evidence                                                       |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------- | ------- | -------------------------------------------------------------- |
| GET      | `/api/admin/audit`                                                | Auth + ADMIN + `ADMIN_ACCESS`                        | audited | `apps/api/src/routes/admin.routes.js`                          |
| GET      | `/api/admin/dashboard`                                            | Auth + tenant/admin context + view permission        | audited | `apps/api/src/routes/admin.routes.js`                          |
| GET      | `/api/admin/dashboard/summary`                                    | Auth + tenant context + `CATALOG_VIEW`/`ORDERS_VIEW` | audited | `apps/api/src/routes/admin.routes.js`                          |
| GET      | `/api/quote-requests/supplier/inbox`                              | Supplier + `ORDERS_VIEW`                             | audited | `apps/api/src/routes/quote-requests.routes.js`                 |
| GET      | `/api/quote-requests/supplier/inbox/:id`                          | Supplier + `ORDERS_VIEW`                             | audited | `apps/api/src/routes/quote-requests.routes.js`                 |
| POST     | `/api/quote-requests/supplier/inbox/:id/respond`                  | Supplier + `ORDERS_MANAGE`                           | audited | `apps/api/src/routes/quote-requests.routes.js`                 |
| GET      | `/api/restaurant/growth/connection-requests`                      | Restaurant + `SETTINGS_VIEW`                         | audited | `apps/api/src/routes/restaurant-connection-requests.routes.js` |
| POST     | `/api/restaurant/growth/connection-requests/:id/{accept,decline}` | Restaurant + `SETTINGS_MANAGE`                       | audited | same route module                                              |
| GET/POST | `/auth/refresh`, `/auth/mobile/refresh`                           | Dedicated refresh limiter                            | audited | `apps/api/src/server.js`                                       |
| POST     | `/api/public/invitations/{accept,branch/accept}`                  | Dedicated invitation limiter                         | audited | `apps/api/src/server.js`                                       |
| POST     | `/api/admin-dashboard/impersonate/stop`                           | Auth; allowlisted during impersonation               | audited | `apps/api/src/lib/impersonation-guards.js`                     |

Deferred: exhaustive authorization review of the remaining inventory, live ZAP testing, and full IDOR/business-abuse coverage.
