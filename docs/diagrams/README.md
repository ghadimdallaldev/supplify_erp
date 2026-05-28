# Supplify Mermaid diagrams

Canonical feature diagrams live under `docs/diagrams/`. Legacy blueprint diagrams remain in [`docs/blueprint/`](../blueprint/) and are cross-referenced here.

**Validate:** `pnpm run docs:diagrams:check`

**Tier source of truth:** [FINAL_TIER_MATRIX.md](../monetization/FINAL_TIER_MATRIX.md)

---

## Architecture

| File                                                                         | Covers                                       | Status  | Related                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------- | ------- | -------------------------------------------- |
| [architecture/system-context.mmd](architecture/system-context.mmd)           | Users, public guests, web, API, Keycloak, DB | current | `docs/blueprint/system_context.mmd`          |
| [architecture/api-routes-overview.mmd](architecture/api-routes-overview.mmd) | Major `/api` route groups and middleware     | current | `docs/blueprint/api_architecture.mmd`        |
| [architecture/deployment.mmd](architecture/deployment.mmd)                   | CDN, web, API, PostgreSQL, Keycloak          | current | `docs/blueprint/deployment_architecture.mmd` |

## Billing & subscriptions

| File                                                                                 | Covers                                           | Status  | Related                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ | ------- | ----------------------------------------------------- |
| [billing/free-trial-lifecycle.mmd](billing/free-trial-lifecycle.mmd)                 | Free Trial expiry, read-only lock, upgrade       | current | `docs/features/free-trial-expiry.md`                  |
| [billing/subscription-tier-resolution.mmd](billing/subscription-tier-resolution.mmd) | Silver/Gold/Platinum entitlements, bronze→silver | current | `apps/api/src/lib/subscription.js`                    |
| [billing/branch-addon-flow.mmd](billing/branch-addon-flow.mmd)                       | Branch limits, add-ons, 6-branch Enterprise cap  | current | `docs/BRANCHES_WAREHOUSES_AUDIT.md`                   |
| [billing/warehouse-addon-flow.mmd](billing/warehouse-addon-flow.mmd)                 | Supplier warehouse limits and add-ons            | current | `plan-enforcement.js`                                 |
| [billing/conversion-funnel.mmd](billing/conversion-funnel.mmd)                       | conversion_event analytics                       | current | `docs/blueprint/workflows/conversion_funnel_flow.mmd` |

## Admin

| File                                                                               | Covers                                        | Status  | Related                                   |
| ---------------------------------------------------------------------------------- | --------------------------------------------- | ------- | ----------------------------------------- |
| [admin/admin-dashboard-tabs.mmd](admin/admin-dashboard-tabs.mmd)                   | Admin panel tabs and API endpoints            | current | `AdminDashboardPage.tsx`                  |
| [admin/admin-tier-editing-validation.mmd](admin/admin-tier-editing-validation.mmd) | Plan CRUD validation, preview-change, force   | current | `plan-admin-validation.js`                |
| [admin/impersonation-flow.mmd](admin/impersonation-flow.mmd)                       | Impersonation cookie, full nav, billing block | current | `admin_impersonation_flow.mmd`            |
| [admin/tenant-plan-overrides.mmd](admin/tenant-plan-overrides.mmd)                 | Limit and feature overrides                   | current | `limit-resolution.js`, `feature-flags.js` |

## Restaurant

| File                                                                                 | Covers                                           | Status  | Related                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ | ------- | ----------------------------------- |
| [restaurant/branch-creation-org-model.mmd](restaurant/branch-creation-org-model.mmd) | Org branches, legacy link, legacy `branch` table | current | `docs/BRANCHES_WAREHOUSES_AUDIT.md` |
| [restaurant/cart-checkout-flow.mmd](restaurant/cart-checkout-flow.mmd)               | Cart → checkout → place order                    | current | `orders.routes.js`                  |
| [restaurant/quick-lists-flow.mmd](restaurant/quick-lists-flow.mmd)                   | Quick lists, schedules, limits                   | current | `quick-lists.routes.js`             |

## Supplier

| File                                                                                 | Covers                                           | Status  | Related                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ | ------- | -------------------------------- |
| [supplier/warehouse-fulfillment-model.mmd](supplier/warehouse-fulfillment-model.mmd) | Warehouses, multi-warehouse routing, fulfillment | current | `0081_warehouse_fulfillment.sql` |
| [supplier/product-catalog-flow.mmd](supplier/product-catalog-flow.mmd)               | Product CRUD, SKU limits, restaurant browse      | current | `products.routes.js`             |

## Reservations

| File                                                                                   | Covers                                     | Status  | Related                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------ | ------- | ----------------------------- |
| [reservations/public-reservations-flow.mmd](reservations/public-reservations-flow.mmd) | Public book, confirm, manage token         | current | `public.routes.js`            |
| [reservations/reservation-availability.mmd](reservations/reservation-availability.mmd) | Capacity, overlapping reservations         | current | `reservation-availability.js` |
| [reservations/waitlist-flow.mmd](reservations/waitlist-flow.mmd)                       | Waitlist insert, promotion, manual promote | current | `waitlistPromotion.js`        |

## Orders

| File                                                     | Covers                                            | Status  | Related                                   |
| -------------------------------------------------------- | ------------------------------------------------- | ------- | ----------------------------------------- |
| [orders/order-lifecycle.mmd](orders/order-lifecycle.mmd) | Order states from cart through receiving/disputes | current | `docs/blueprint/workflows/order_flow.mmd` |

## Disputes

| File                                                                                       | Covers                                     | Status  | Related                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------ | ------- | ------------------------------ |
| [disputes/disputes-flow.mmd](disputes/disputes-flow.mmd)                                   | Open dispute → credit note or replacement  | current | `disputes.service.js`          |
| [disputes/credit-note-flow.mmd](disputes/credit-note-flow.mmd)                             | Credit note creation from resolution       | current | `disputes.service.js`          |
| [disputes/dispute-replacement-order-flow.mmd](disputes/dispute-replacement-order-flow.mmd) | Replacement `customer_order` (implemented) | current | `dispute-replacement-order.js` |

## Deals

| File                                                                       | Covers                                  | Status  | Related                     |
| -------------------------------------------------------------------------- | --------------------------------------- | ------- | --------------------------- |
| [deals/deals-admin-approval-flow.mmd](deals/deals-admin-approval-flow.mmd) | Deal lifecycle and admin approve/reject | current | `deal-lifecycle.service.js` |

## RBAC & feature flags

| File                                                                 | Covers                                   | Status  | Related                                |
| -------------------------------------------------------------------- | ---------------------------------------- | ------- | -------------------------------------- |
| [rbac/rbac-permissions.mmd](rbac/rbac-permissions.mmd)               | Roles, org RBAC, entitlements gates      | current | `docs/blueprint/rbac_multitenancy.mmd` |
| [rbac/feature-flags-overrides.mmd](rbac/feature-flags-overrides.mmd) | Override priority; Platinum catalog-only | partial | `PLATINUM_CATALOG_ONLY_FEATURES.md`    |

## Comms

| File                                                                   | Covers                             | Status  | Related                            |
| ---------------------------------------------------------------------- | ---------------------------------- | ------- | ---------------------------------- |
| [comms/chat-notifications-flow.mmd](comms/chat-notifications-flow.mmd) | Chat meters; notification channels | partial | Webhook = catalog-only on Platinum |

## QA

| File                                                   | Covers                           | Status  | Related           |
| ------------------------------------------------------ | -------------------------------- | ------- | ----------------- |
| [qa/qa-automation-flow.mmd](qa/qa-automation-flow.mmd) | `pnpm qa`, Playwright, API specs | current | `tests/README.md` |

---

## Legacy blueprint diagrams (`docs/blueprint/`)

| File                                               | Covers                    | Status  | Superseded by                              |
| -------------------------------------------------- | ------------------------- | ------- | ------------------------------------------ |
| `blueprint/feature_overview.mmd`                   | Product feature map       | current | —                                          |
| `blueprint/system_context.mmd`                     | System context            | current | `architecture/system-context.mmd`          |
| `blueprint/api_architecture.mmd`                   | API routes detail         | current | `architecture/api-routes-overview.mmd`     |
| `blueprint/deployment_architecture.mmd`            | Deployment                | current | `architecture/deployment.mmd`              |
| `blueprint/rbac_multitenancy.mmd`                  | RBAC + entitlements       | current | `rbac/rbac-permissions.mmd`                |
| `blueprint/erd_full.mmd`                           | Billing/tenant ERD subset | current | —                                          |
| `blueprint/workflows/subscription_flow.mmd`        | Admin subscription PATCH  | current | `billing/subscription-tier-resolution.mmd` |
| `blueprint/workflows/order_flow.mmd`               | Order placement           | current | `orders/order-lifecycle.mmd`               |
| `blueprint/workflows/fulfillment_flow.mmd`         | Pick/pack/route/POD       | current | `supplier/warehouse-fulfillment-model.mmd` |
| `blueprint/workflows/receiving_flow.mmd`           | Receiving reports         | current | —                                          |
| `blueprint/workflows/inventory_flow.mmd`           | Inventory limits          | current | —                                          |
| `blueprint/workflows/invoice_flow.mmd`             | Invoice payment states    | current | —                                          |
| `blueprint/workflows/chat_flow.mmd`                | Chat daily limit          | current | `comms/chat-notifications-flow.mmd`        |
| `blueprint/workflows/reservation_flow.mmd`         | Reservations overview     | current | `reservations/*`                           |
| `blueprint/workflows/admin_management_flow.mmd`    | Admin tabs (subset)       | current | `admin/admin-dashboard-tabs.mmd`           |
| `blueprint/workflows/admin_impersonation_flow.mmd` | Impersonation             | current | `admin/impersonation-flow.mmd`             |
| `blueprint/workflows/conversion_funnel_flow.mmd`   | Conversion events         | current | `billing/conversion-funnel.mmd`            |
| `blueprint/workflows/recommendation_flow.mmd`      | Plan recommendation API   | current | —                                          |
| `blueprint/ui_sitemap/*.mmd`                       | UI sitemaps (3)           | current | —                                          |

---

## Features without dedicated diagrams (gaps)

Listed in [MMD_DIAGRAM_AUDIT_REPORT.md](../../MMD_DIAGRAM_AUDIT_REPORT.md): staff scheduling detail, invoice PDF pipeline, smart reorder AI (catalog), enterprise assignment UI, legacy budget tables (deprecated DB only).
