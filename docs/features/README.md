# Feature specifications

Deep-dive docs per product area. The route map lives in [product/features.md](../product/features.md); enforcement keys in [FEATURE_CATALOG.md](../product/FEATURE_CATALOG.md).

**Plan tiers & limits:** [SUBSCRIPTIONS.md](../monetization/SUBSCRIPTIONS.md) (canonical Silver catalog: migration `0117`) · [PLANS.md](../monetization/PLANS.md)

| Doc                                                                      | Topic                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [order-decline.md](./order-decline.md)                                   | Supplier decline with required reason; restaurant display             |
| [notifications-delivery.md](./notifications-delivery.md)                 | Tenant team recipients, channels, order/reservation events            |
| [push-notifications.md](./push-notifications.md)                         | Web Push (VAPID), service worker                                      |
| [reservations-foh.md](./reservations-foh.md)                             | Board, availability, table assign, staff alerts                       |
| [waitlist-auto-promotion.md](./waitlist-auto-promotion.md)               | Waitlist offers on cancel                                             |
| [order-amendments.md](./order-amendments.md)                             | Post-place order changes                                              |
| [waste-tracking.md](./waste-tracking.md)                                 | Restaurant waste & spoilage (inventory tab)                           |
| [approvals-budgets.md](./approvals-budgets.md)                           | **Removed** — was order approval thresholds                           |
| [disputes-returns.md](./disputes-returns.md)                             | Disputes, credit notes, replacement orders                            |
| [receiving-delivered-flow.md](./receiving-delivered-flow.md)             | Restaurant receiving                                                  |
| [supplier-reviews.md](./supplier-reviews.md)                             | Post-delivery reviews                                                 |
| [fulfillment-logistics.md](./fulfillment-logistics.md)                   | Pick/pack/ship, driver dispatch, GPS tracking (supplier + restaurant) |
| [driver-delivery-current-state.md](./driver-delivery-current-state.md)   | Driver assignments, POD, GPS pings (current implementation)           |
| [restaurant-operations.md](./restaurant-operations.md)                   | Inventory expiry, shortages, smart reorder reminders                  |
| [warehouse-fulfillment.md](./warehouse-fulfillment.md)                   | Multi-warehouse routing                                               |
| [promotions-deals.md](./promotions-deals.md)                             | Deals and coupons                                                     |
| [staff-portal-access.md](./staff-portal-access.md)                       | Staff self-service                                                    |
| [tenant-registration-activation.md](./tenant-registration-activation.md) | Signup and activation                                                 |
| [free-trial-expiry.md](./free-trial-expiry.md)                           | Free Trial time limit, read-only lock, admin extend                   |
| [tenant-audit-log.md](./tenant-audit-log.md)                             | Tenant activity log                                                   |
| [tenant-roles.md](./tenant-roles.md)                                     | Named roles matrix                                                    |
| [branch-invitations.md](./branch-invitations.md)                         | Branch invites                                                        |
| [restaurant-branches.md](./restaurant-branches.md)                       | Restaurant org branches                                               |
| [supplier-branches.md](./supplier-branches.md)                           | Supplier org branches                                                 |
| [reports-analytics.md](./reports-analytics.md)                           | Reports module                                                        |
| [admin-impersonation.md](./admin-impersonation.md)                       | Platform admin view-as-tenant (support/debug)                         |

**QA:** [MANUAL_TEST_CHECKLIST.md](../qa/MANUAL_TEST_CHECKLIST.md) (delivery GPS: §6.6.1, §7.4.1) · [manual-testing.md](../guides/manual-testing.md) · [DEMO_SCRIPT.md](../qa/DEMO_SCRIPT.md)
