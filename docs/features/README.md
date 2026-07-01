# Features

Per-feature specifications. Naming: lowercase kebab-case.

## Core flows

| Topic                                      | Document                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ordering (amendments, decline)             | [ordering-amendments.md](./ordering-amendments.md), [ordering-decline.md](./ordering-decline.md)                                                                                                                         |
| Receiving                                  | [receiving.md](./receiving.md)                                                                                                                                                                                           |
| Inventory expiry & reorder                 | [inventory-expiry-and-reorder.md](./inventory-expiry-and-reorder.md)                                                                                                                                                     |
| Quick lists & schedules                    | See restaurant operations doc                                                                                                                                                                                            |
| Fulfillment, drivers, GPS                  | [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md)                                                                                                                                                             |
| Warehouses                                 | [warehouse-fulfillment.md](./warehouse-fulfillment.md)                                                                                                                                                                   |
| Deals & promotions                         | [deals-and-promotions.md](./deals-and-promotions.md) · [store-wide-deal-badges.md](./store-wide-deal-badges.md) · UI labels: [../ui/DEALS_BOOSTS_WORDING_CLEANUP.md](../ui/DEALS_BOOSTS_WORDING_CLEANUP.md)              |
| Staff portal                               | [staff-portal.md](./staff-portal.md)                                                                                                                                                                                     |
| Email & notifications                      | [notifications-and-alerts.md](./notifications-and-alerts.md)                                                                                                                                                             |
| Quote requests (RFQ)                       | [quote-requests.md](./quote-requests.md) · product spec: [../product/QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md](../product/QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md)                                                      |
| Supplier public mini-store                 | [quote-requests.md](./quote-requests.md) § Public mini-store                                                                                                                                                             |
| Search & discovery                         | [search-and-discovery.md](./search-and-discovery.md) · [product-favorites.md](./product-favorites.md)                                                                                                                    |
| Supplier follow                            | [supplier-follow.md](./supplier-follow.md)                                                                                                                                                                               |
| Supplier operations hub                    | [supplier-ops.md](./supplier-ops.md)                                                                                                                                                                                     |
| Bulk product image import (supplier)       | [bulk-product-image-import.md](./bulk-product-image-import.md) · parent: [supplier-ops.md](./supplier-ops.md)                                                                                                            |
| Supplier customer growth (import/referral) | [supplier-customer-growth.md](./supplier-customer-growth.md) · migration `0169_supplier_growth_program.sql`                                                                                                              |
| Custom branding (Gold+)                    | [../audits/REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md](../audits/REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md) § branding                                                                    |
| Reorder assistance                         | [inventory-expiry-and-reorder.md](./inventory-expiry-and-reorder.md) · audit: [../audits/REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md](../audits/REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md) |
| AI Smart Reorder (forecasts + LLM assist)  | [ai-smart-reorder.md](./ai-smart-reorder.md) · parent: [inventory-expiry-and-reorder.md](./inventory-expiry-and-reorder.md)                                                                                              |
| Recipe costing (purchasing-linked)         | [recipe-costing.md](./recipe-costing.md) · migration `0186_recipe_costing.sql` · plan `recipe_costing` (Gold+)                                                                                                           |
| Featured supplier placement                | [../audits/REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md](../audits/REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md)                                                                               |
| Admin support chat                         | [../audits/REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md](../audits/REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md)                                                                               |
| Cron / background jobs                     | [../operations/cron-jobs.md](../operations/cron-jobs.md) · [../audits/CRON_AND_BACKGROUND_JOBS_AUDIT.md](../audits/CRON_AND_BACKGROUND_JOBS_AUDIT.md)                                                                    |
| Admin impersonation                        | [admin-impersonation.md](./admin-impersonation.md)                                                                                                                                                                       |
| Admin operations tab                       | [admin-panel-operations.md](./admin-panel-operations.md)                                                                                                                                                                 |

## Tenant & billing

| Topic                     | Document                                                                                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration & activation | [tenant-registration.md](./tenant-registration.md) · Legal re-accept: [../ui/LEGAL_PACK_REACCEPTANCE.md](../ui/LEGAL_PACK_REACCEPTANCE.md) · Referral signup: [supplier-customer-growth.md](./supplier-customer-growth.md) |
| Free trial expiry         | [free-trial-expiry.md](./free-trial-expiry.md)                                                                                                                                                                             |
| Tenant roles              | [tenant-roles.md](./tenant-roles.md)                                                                                                                                                                                       |
| Branches & invitations    | [restaurant-branches.md](./restaurant-branches.md), [supplier-branches.md](./supplier-branches.md), [branch-invitations.md](./branch-invitations.md)                                                                       |

## Reviews & loyalty

| Topic              | Document                                         |
| ------------------ | ------------------------------------------------ |
| Supplier reviews   | [supplier-reviews.md](./supplier-reviews.md)     |
| Restaurant reviews | [restaurant-reviews.md](./restaurant-reviews.md) |
| Supplier loyalty   | [supplier-loyalty.md](./supplier-loyalty.md)     |
| Consumer loyalty   | [consumer-loyalty.md](./consumer-loyalty.md)     |

## Consumer (B2C)

| Topic              | Document                                         |
| ------------------ | ------------------------------------------------ |
| Guest ordering     | [consumer-ordering.md](./consumer-ordering.md)   |
| Consumer loyalty   | [consumer-loyalty.md](./consumer-loyalty.md)     |
| Restaurant reviews | [restaurant-reviews.md](./restaurant-reviews.md) |

## Other

Disputes, reservations, reports, contract pricing, waste tracking — see files in this folder.

Archived operator detail: [../archive/old/fulfillment-logistics.md](../archive/old/fulfillment-logistics.md).
