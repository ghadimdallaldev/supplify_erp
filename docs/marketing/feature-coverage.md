# HORECA campaign claim coverage — 2026-11-11

This is a code/documentation review supporting the campaign copy. It does not certify security, prove every production deployment setting, or replace runtime checks. The microsite walkthroughs remain sample-data experiences.

## The 40+ features claim

Count basis: **44 distinct user capabilities across supplier and restaurant workflows**, with shared capabilities counted once. These are user tasks, not subscription feature keys; several tasks live under one subscription key. Availability varies by business, plan and setup. Public copy must not imply every capability is available on every account or illustrated in the microsite.

| #   | User capability                          | Implementation or domain source                         |
| --- | ---------------------------------------- | ------------------------------------------------------- |
| 1   | Search and discover suppliers            | `apps/api/src/routes/search.routes.js`                  |
| 2   | Follow suppliers                         | `apps/api/src/routes/suppliers/relationships.js`        |
| 3   | Supplier reviews                         | `apps/api/src/routes/reviews.routes.js`                 |
| 4   | Request and respond to quotes            | `apps/api/src/routes/quote-requests.routes.js`          |
| 5   | Manage product catalogs                  | `apps/api/src/routes/products.routes.js`                |
| 6   | Import catalog products from CSV         | `apps/api/src/routes/supplier-ops.routes.js`            |
| 7   | Bulk-import product images               | `docs/features/bulk-product-image-import.md`            |
| 8   | Save product favorites                   | `apps/api/src/routes/products.routes.js`                |
| 9   | Build a shopping cart                    | `apps/web/src/pages/CartPage.tsx`                       |
| 10  | Place orders                             | `apps/api/src/routes/orders/create.js`                  |
| 11  | Amend an order                           | `apps/api/src/routes/order-amendments.routes.js`        |
| 12  | View orders on a calendar                | `apps/api/src/routes/orders.calendar.routes.js`         |
| 13  | Save quick ordering lists                | `apps/api/src/routes/quick-lists.routes.js`             |
| 14  | Schedule repeat orders                   | `apps/api/src/routes/quick-lists.routes.js`             |
| 15  | Accept or decline incoming orders        | `apps/api/src/routes/orders/update.js`                  |
| 16  | Manage stock balances                    | `apps/api/src/routes/inventory.routes.js`               |
| 17  | Reserve stock for orders                 | `apps/api/src/services/supplier-order-stock.service.js` |
| 18  | Identify low-stock products              | `apps/api/src/routes/inventory.routes.js`               |
| 19  | Manage warehouses                        | `apps/api/src/routes/warehouses.routes.js`              |
| 20  | Prepare pick lists                       | `docs/features/warehouse-fulfillment.md`                |
| 21  | Coordinate work on the fulfillment board | `apps/api/src/routes/fulfillment/board.js`              |
| 22  | Manage and assign drivers                | `apps/api/src/routes/drivers.routes.js`                 |
| 23  | Track order delivery status              | `apps/api/src/routes/driver-tracking.routes.js`         |
| 24  | Record proof of delivery                 | `apps/api/src/routes/orders-driver.routes.js`           |
| 25  | Confirm goods received                   | `apps/api/src/routes/receiving.routes.js`               |
| 26  | Handle disputes and returns              | `apps/api/src/routes/disputes.routes.js`                |
| 27  | Issue credit notes                       | `apps/api/src/routes/credit-notes.routes.js`            |
| 28  | Manage invoices                          | `apps/api/src/routes/invoices.routes.js`                |
| 29  | View account statements                  | `apps/api/src/routes/restaurant-finance.routes.js`      |
| 30  | Review supplier customer activity        | `apps/api/src/routes/supplier-growth.routes.js`         |
| 31  | Create product deals                     | `apps/api/src/routes/promotions/supplier.js`            |
| 32  | Promote deals with sponsored boosts      | `apps/api/src/routes/promotions/supplier.js`            |
| 33  | Discover and redeem deal coupons         | `apps/api/src/routes/promotions/restaurant.js`          |
| 34  | Review deal performance                  | `apps/api/src/routes/promotions/supplier.js`            |
| 35  | View business reports and analytics      | `apps/api/src/routes/reports.routes.js`                 |
| 36  | Message business partners                | `apps/api/src/routes/chat/conversations.js`             |
| 37  | Receive operational notifications        | `apps/api/src/routes/notifications.routes.js`           |
| 38  | Calculate recipe costs                   | `apps/api/src/routes/recipes.routes.js`                 |
| 39  | Record waste                             | `apps/api/src/routes/restaurant-inventory.routes.js`    |
| 40  | Work across linked branch accounts       | `apps/api/src/routes/branches.routes.js`                |
| 41  | Configure custom team roles              | `apps/api/src/routes/tenant-roles.routes.js`            |
| 42  | Manage team members and their access     | `apps/api/src/routes/tenant-roles.routes.js`            |
| 43  | Configure business branding              | `apps/api/src/routes/suppliers/branding.js`             |
| 44  | Review business activity logs            | `apps/api/src/routes/tenant-audit.routes.js`            |

This count excludes roadmap-only features, automatic payment collection, unsupported integrations, and duplicated client-platform implementations. The demo teaser promises a fuller guided presentation and a few surprises, not undisclosed implemented functionality.

## Supplier promotion wording

Safe copy: suppliers can create product deals, reach followers, extend visibility through sponsored boosts, and view offer performance. Sources: `docs/features/deals-and-promotions.md`, `apps/api/src/routes/promotions/supplier.js` and `apps/api/src/routes/promotions/restaurant.js`. Eligibility, setup, review and activation requirements still apply. No ad prices, guaranteed results or automatic campaign approval are promised.

## Separate business workspaces

Public wording translates multi-tenancy into business terms: each company has its own workspace, records and team access; linked branch accounts keep separate operations. Connected restaurants and suppliers can see the orders/conversations relevant to their business relationship. This is not a claim that business partners can never see shared records. Sources: `docs/architecture/tenancy.md`, `apps/api/src/lib/rbac.js`, and `apps/api/src/routes/branches.routes.js`.

## Security wording

Safe copy describes concrete safeguards: protected sign-in, access based on team roles, and activity logs. Sources: `apps/api/src/routes/auth.routes.js`, `apps/api/src/lib/rbac.js` (session cookies, authentication and tenant context), `apps/api/src/routes/tenant-roles.routes.js`, and `apps/api/src/routes/tenant-audit.routes.js`.

The campaign does not claim invulnerability, a specific security certification, universal encryption at rest, mandatory MFA, or a completed independent penetration test. Existing deployment/security validation gates remain in effect.
