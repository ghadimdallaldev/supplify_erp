# Supplier capabilities

Concise map of supplier-side features. Detailed specs live under [features/](../features/). Full historical dump: [archive/old/supplier-capabilities-full.md](../archive/old/supplier-capabilities-full.md).

## App navigation

| Area                    | Route (typical)    | Spec                                                                                                     |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| Dashboard               | `/app`             | [features.md](./features.md)                                                                             |
| Products & catalog      | `/app/products`    | [feature-catalog-technical.md](./feature-catalog-technical.md)                                           |
| Orders                  | `/app/orders`      | [ordering-decline.md](../features/ordering-decline.md)                                                   |
| Chat                    | `/app/chat`        | [notifications-and-alerts.md](../features/notifications-and-alerts.md)                                   |
| Restaurants (customers) | `/app/restaurants` | [features.md](./features.md)                                                                             |
| Inventory               | `/app/inventory`   | [warehouse-fulfillment.md](../features/warehouse-fulfillment.md)                                         |
| Fulfillment & drivers   | `/app/fulfillment` | [drivers-and-gps-tracking.md](../features/drivers-and-gps-tracking.md)                                   |
| Deals & promotions      | `/app/promotions`  | [deals-and-promotions.md](../features/deals-and-promotions.md)                                           |
| Invoices                | `/app/invoices`    | [finance-implementation.md](./finance-implementation.md)                                                 |
| Branches & team         | Settings           | [supplier-branches.md](../features/supplier-branches.md), [tenant-roles.md](../features/tenant-roles.md) |
| Settings & plan usage   | `/app/settings`    | [plans-and-limits.md](./plans-and-limits.md)                                                             |

## Core flows

| Flow             | Summary                                                    | Spec                                                                                               |
| ---------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Order → invoice  | Acknowledge → fulfill → deliver → auto-invoice on complete | [finance-implementation.md](./finance-implementation.md), [receiving.md](../features/receiving.md) |
| Driver dispatch  | Assign driver → POD → GPS tracking                         | [drivers-and-gps-tracking.md](../features/drivers-and-gps-tracking.md)                             |
| Multi-warehouse  | Zones, routing, warehouse-scoped inventory                 | [warehouse-fulfillment.md](../features/warehouse-fulfillment.md)                                   |
| Deals & boost    | Create deal → admin approve → paid boost window            | [deals-and-promotions.md](../features/deals-and-promotions.md)                                     |
| Contract pricing | Per-restaurant price lists                                 | [contract-pricing.md](../features/contract-pricing.md)                                             |
| Disputes         | Incoming restaurant disputes                               | [disputes-returns.md](../features/disputes-returns.md)                                             |
| Reports          | Sales, inventory, fulfillment analytics                    | [reports-analytics.md](../features/reports-analytics.md)                                           |

## Subscription & limits

Suppliers share tier names with restaurants; limits differ (SKUs, warehouses, promotions, chats/day). See [subscriptions.md](./subscriptions.md) and Settings → **Plan & usage**.

## Access control

Tenant roles, warehouse scope, driver portal link — [security/rbac.md](../security/rbac.md).

## QA

Manual regression: [regression-checklist.md](../qa/regression-checklist.md). Supplier pain-killer / command center: covered in archived [supplier-pain-killer-features-audit.md](../archive/audits/supplier-pain-killer-features-audit.md).
