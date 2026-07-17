# Restaurant capabilities

Concise map of restaurant-side features. Detailed specs live under [features/](../features/). Full historical dump: [archive/old/restaurant-capabilities-full.md](../archive/old/restaurant-capabilities-full.md).

## App navigation

| Area                           | Route (typical)            | Spec                                                                                                                               |
| ------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard                      | `/app`                     | [features.md](./features.md)                                                                                                       |
| Quick lists & scheduled orders | `/app/quick-lists`         | [inventory-expiry-and-reorder.md](../features/inventory-expiry-and-reorder.md)                                                     |
| Cart & ordering                | `/app/cart`, `/app/orders` | [ordering-amendments.md](../features/ordering-amendments.md), [ordering-decline.md](../features/ordering-decline.md)               |
| Suppliers                      | `/app/suppliers`           | [features.md](./features.md)                                                                                                       |
| Inventory & expiry             | `/app/inventory`           | [inventory-expiry-and-reorder.md](../features/inventory-expiry-and-reorder.md), [waste-tracking.md](../features/waste-tracking.md) |
| Receiving                      | `/app/receiving`           | [receiving.md](../features/receiving.md)                                                                                           |
| Invoices & finance             | `/app/invoices`            | [finance-implementation.md](./finance-implementation.md)                                                                           |
| Chat                           | `/app/chat`                | [notifications-and-alerts.md](../features/notifications-and-alerts.md)                                                             |
| Reservations (FOH)             | `/app/reservations`        | [reservations-foh.md](../features/reservations-foh.md)                                                                             |
| Staff roster / portal          | `/app/staff`               | [staff-portal.md](../features/staff-portal.md)                                                                                     |
| Branches & team                | Settings                   | [restaurant-branches.md](../features/restaurant-branches.md), [tenant-roles.md](../features/tenant-roles.md)                       |
| Settings & billing             | `/app/settings`            | [tenant-registration.md](../features/tenant-registration.md), [free-trial-expiry.md](../features/free-trial-expiry.md)             |

## Core flows

| Flow                        | Summary                                               | Spec                                                                                                                             |
| --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Place order                 | Cart → supplier → acknowledgment → delivery → receive | [receiving.md](../features/receiving.md), [drivers-and-gps-tracking.md](../features/drivers-and-gps-tracking.md)                 |
| Smart reorder               | Usage-based suggestions from movement log             | [inventory-expiry-and-reorder.md](../features/inventory-expiry-and-reorder.md)                                                   |
| Waste & spoilage            | Log waste; analytics on inventory                     | [waste-tracking.md](../features/waste-tracking.md)                                                                               |
| Deals & coupons             | Discover supplier deals; redemption limits by plan    | [deals-and-promotions.md](../features/deals-and-promotions.md)                                                                   |
| Disputes                    | Shortages, returns, replacement orders                | [disputes-returns.md](../features/disputes-returns.md)                                                                           |
| Public booking              | Guest reservation & waitlist                          | [reservations-foh.md](../features/reservations-foh.md), [waitlist-auto-promotion.md](../features/waitlist-auto-promotion.md)     |
| Contract pricing            | Customer-specific supplier prices                     | [contract-pricing.md](../features/contract-pricing.md)                                                                           |
| Supplier connection request | Accept/decline supplier outreach from growth program  | [supplier-customer-growth.md](../features/supplier-customer-growth.md) — `GET/POST /api/restaurant/growth/connection-requests/*` |

## Plans & limits

Restaurant plans now use Restaurant Growth and Restaurant Scale; restaurants scale primarily by active branches. See [plans-and-limits.md](./plans-and-limits.md).

## Access control

Tenant roles, branch context, subscription feature gates, and RBAC permissions — [security/rbac.md](../security/rbac.md), [access-control.md](../architecture/access-control.md).

## QA

Manual regression: [regression-checklist.md](../qa/regression-checklist.md). Route smoke map: [features.md](./features.md).
