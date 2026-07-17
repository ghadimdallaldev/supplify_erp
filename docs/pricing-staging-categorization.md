# Working-tree categorization (pre-stage)

# Backup branch: backup/full-wip-20260717-170757 @ 3f263ba09c11f02c67dcfc31f8b04733b8851cb6

# Generated: 2026-07-17

## Categories

# P = Four-plan pricing and limits (implementation)

# A = AI Reorder feature

# S = Shared dependency required by both

# U = Unrelated / scope drift / comment-only cleanup

# D = Documentation or tests (for the category in Notes)

| Path                                                              | Cat | Notes                                                               |
| ----------------------------------------------------------------- | :-: | ------------------------------------------------------------------- |
| apps/api/db/migrations/0190_four_plan_pricing_model.sql           |  P  | Core catalog migration                                              |
| apps/api/src/lib/plan-codes.js                                    |  P  | Tenant-aware Growth/Scale labels                                    |
| apps/api/src/lib/plan-codes.test.js                               |  D  | Pricing tests                                                       |
| apps/api/src/lib/subscription/plans.js                            |  P  | Plan loading/recommendations                                        |
| apps/api/src/lib/subscription/free-trial-plan-features.js         |  P  | Trial target plan                                                   |
| apps/api/src/lib/subscription/entitlements.js                     |  P  | Limits/usage/add-ons/AI quota metadata                              |
| apps/api/src/lib/limit-resolution.js                              |  P  | active_customer_locations_monthly                                   |
| apps/api/src/lib/limit-resolution.test.js                         |  D  | Pricing tests                                                       |
| apps/api/src/lib/subscription-addons.js                           |  P  | Add-on catalog/pricing                                              |
| apps/api/src/lib/subscription-addons.test.js                      |  D  | Pricing tests                                                       |
| apps/api/src/lib/billing/billing-service.js                       |  P  | Checkout/renewal totals + trial                                     |
| apps/api/src/lib/billing/billing-service.test.js                  |  D  | Pricing tests                                                       |
| apps/api/src/jobs/subscription-billing.job.js                     |  P  | Renewal with add-ons                                                |
| apps/api/src/jobs/subscription-billing.job.test.js                |  D  | Pricing tests                                                       |
| apps/api/src/lib/user-seat-limits.js                              |  P  | Seat counting                                                       |
| apps/api/src/lib/plan-enforcement.js                              |  P  | Branch/warehouse/location helpers                                   |
| apps/api/src/lib/plan-enforcement.test.js                         |  D  | Pricing tests                                                       |
| apps/api/src/lib/plan-admin-validation.js                         |  P  | Admin plan validation                                               |
| apps/api/src/lib/background-write-locks.js                        |  P  | Locked-tenant write guard                                           |
| apps/api/src/lib/four-plan-migration-sql.test.js                  |  D  | Migration SQL tests                                                 |
| apps/api/src/lib/subscription.test.js                             |  D  | Pricing/usage tests                                                 |
| apps/api/src/lib/subscription-plan-display.test.js                |  D  | Display-name tests                                                  |
| apps/api/src/lib/branch-invitations.js                            |  P  | Seat/invitation limits                                              |
| apps/api/src/lib/restaurant-invitations.js                        |  P  | Seat/invitation limits                                              |
| apps/api/src/routes/subscriptions.routes.js                       |  P  | Public plans/entitlements                                           |
| apps/api/src/routes/subscriptions.routes.test.js                  |  D  | Pricing API tests                                                   |
| apps/api/src/routes/billing.routes.js                             |  P  | Billing status/checkout                                             |
| apps/api/src/routes/billing.routes.test.js                        |  D  | Minor billing test                                                  |
| apps/api/src/routes/admin-dashboard/limits.js                     |  P  | Overrides/add-ons                                                   |
| apps/api/src/routes/admin-dashboard/subscriptions.js              |  P  | Trial extension                                                     |
| apps/api/src/routes/admin-dashboard.routes.test.js                |  D  | Admin pricing tests                                                 |
| apps/api/src/routes/branch-invitations.routes.js                  |  P  | Seat enforcement                                                    |
| apps/api/src/routes/branch-invitations-public.routes.js           |  P  | Seat enforcement                                                    |
| apps/api/src/routes/restaurant-invitations.routes.js              |  P  | Seat enforcement                                                    |
| apps/api/src/routes/drivers.routes.js                             |  P  | Driver seat/limit enforcement                                       |
| apps/api/src/routes/drivers.routes.test.js                        |  D  | Driver limit test                                                   |
| apps/api/src/routes/tenant-roles.routes.js                        |  P  | User seat enforcement                                               |
| apps/api/src/routes/tenant-roles.routes.test.js                   |  D  | Seat tests                                                          |
| apps/api/src/routes/branches.routes.js                            |  P  | Plan-label / limit messaging                                        |
| apps/api/src/routes/restaurants.routes.js                         |  P  | Plan-label messaging                                                |
| apps/api/src/routes/suppliers/relationships.js                    |  P  | Plan-label requiredPlan                                             |
| apps/api/src/routes/notifications.routes.js                       |  P  | Plan-label copy                                                     |
| apps/api/src/routes/quick-lists.routes.js                         |  P  | Plan-label copy                                                     |
| apps/api/src/services/supplier-connection-request.service.js      |  P  | Active location cap                                                 |
| apps/api/src/services/supplier-growth-invitation.service.js       |  P  | Active location cap                                                 |
| apps/api/src/services/supplier-sponsorship.service.js             |  P  | Active location cap                                                 |
| apps/api/src/services/custom-domain.service.js                    |  P  | Scale plan copy                                                     |
| apps/api/src/services/notification/in-app.js                      |  P  | Comment: plan eligibility                                           |
| apps/api/src/services/quick-list-ai.service.js                    |  P  | Scale plan copy (no new AI modules)                                 |
| apps/api/src/lib/quick-list-tier.js                               |  P  | Comment cleanup                                                     |
| apps/api/src/lib/warehouse-helpers.js                             |  P  | Comment cleanup                                                     |
| apps/api/src/lib/feature-keys.js                                  |  P  | Limit/feature key additions                                         |
| apps/api/src/lib/ai-platform.js                                   |  P  | Comment: Growth/Scale capability wording                            |
| apps/api/src/config/env.js                                        |  P  | Comment: remove Platinum label                                      |
| apps/api/src/middlewares/errorHandler.js                          |  P  | Limit/plan error shaping                                            |
| apps/api/src/middlewares/errorHandler.test.js                     |  D  | Error handler tests                                                 |
| apps/api/src/jobs/email-digest.job.js                             |  P  | Background lock                                                     |
| apps/api/src/jobs/email-digest.job.test.js                        |  D  | Lock tests                                                          |
| apps/api/src/jobs/email-retry.job.js                              |  P  | Background lock                                                     |
| apps/api/src/jobs/email-retry.job.test.js                         |  D  | Lock tests                                                          |
| apps/api/src/jobs/invoice-overdue.job.js                          |  P  | Background lock                                                     |
| apps/api/src/jobs/invoice-overdue.job.test.js                     |  D  | Lock tests                                                          |
| apps/api/src/jobs/fulfillment-exceptions.job.js                   |  P  | Background lock                                                     |
| apps/api/src/jobs/fulfillment-exceptions.job.test.js              |  D  | Lock tests                                                          |
| apps/api/src/jobs/promotions-expiry.job.js                        |  P  | Background lock                                                     |
| apps/api/src/jobs/promotions-expiry.job.test.js                   |  D  | Lock tests                                                          |
| apps/api/src/jobs/stale-gps-alerts.job.js                         |  P  | Background lock                                                     |
| apps/api/src/jobs/stale-gps-alerts.job.test.js                    |  D  | Lock tests                                                          |
| apps/api/src/lib/active-gps-deliveries.js                         |  P  | Lock filter                                                         |
| apps/api/src/lib/active-gps-deliveries.test.js                    |  D  | Lock tests                                                          |
| apps/api/src/services/collections-reminders.service.js            |  P  | Background lock                                                     |
| apps/api/src/services/collections-reminders.service.test.js       |  D  | Lock tests                                                          |
| apps/api/src/services/delivery-rollover.service.js                |  P  | Background lock                                                     |
| apps/api/src/services/delivery-rollover.service.test.js           |  D  | Lock tests                                                          |
| apps/api/src/services/inventory-expiry.service.js                 |  P  | Background lock                                                     |
| apps/api/src/services/inventory-expiry.service.test.js            |  D  | Lock tests                                                          |
| apps/api/src/services/product-import.service.js                   |  P  | Background lock                                                     |
| apps/api/src/services/product-import.service.test.js              |  D  | Lock tests                                                          |
| apps/api/src/services/product-image-import.service.js             |  P  | Background lock                                                     |
| apps/api/src/services/product-image-import.service.test.js        |  D  | Lock tests                                                          |
| apps/api/src/services/promotions.service.js                       |  P  | Background lock                                                     |
| apps/api/src/services/promotions.service.test.js                  |  D  | Lock tests                                                          |
| apps/api/src/services/recipe-recalc-queue.service.js              |  P  | Background lock                                                     |
| apps/api/src/services/recipe-recalc-queue.service.test.js         |  D  | Lock tests                                                          |
| apps/api/src/services/reorder-cadence.service.js                  |  P  | Background lock                                                     |
| apps/api/src/services/reorder-cadence.service.test.js             |  D  | Lock tests                                                          |
| apps/api/src/services/reorder-forecast-cache.service.js           | P/S | Mostly locks; best-effort AI cache invalidate (safe if AI unstaged) |
| apps/api/src/services/reorder-forecast-cache.service.test.js      |  D  | Lock tests                                                          |
| apps/api/src/services/scheduled-orders.service.js                 |  P  | Skip locked tenants                                                 |
| apps/api/src/services/scheduled-orders.service.test.js            |  D  | Lock tests                                                          |
| apps/api/src/services/waitlistPromotion.js                        |  P  | Skip locked tenants                                                 |
| apps/api/src/services/waitlistPromotion.test.js                   |  D  | Lock tests                                                          |
| apps/web/src/lib/planComparison.ts                                |  P  | Growth/Scale comparison                                             |
| apps/web/src/lib/planComparison.test.ts                           |  D  | Pricing tests                                                       |
| apps/web/src/lib/activateFreePlan.ts                              |  P  | Trial activation                                                    |
| apps/web/src/lib/activateFreePlan.test.ts                         |  D  | Pricing tests                                                       |
| apps/web/src/lib/upgradeCopy.ts                                   |  P  | Upgrade copy                                                        |
| apps/web/src/lib/upgradeCopy.test.ts                              |  D  | Pricing tests                                                       |
| apps/web/src/lib/formatPlanPrice.ts                               |  P  | DB-driven prices                                                    |
| apps/web/src/lib/planLimits.ts                                    |  P  | Limit labels                                                        |
| apps/web/src/lib/planLimits.test.ts                               |  D  | Pricing tests                                                       |
| apps/web/src/lib/planFeatureGates.ts                              |  P  | Feature gates copy                                                  |
| apps/web/src/lib/adminLimitLabels.ts                              |  P  | Admin limit labels                                                  |
| apps/web/src/lib/adminLimitLabels.test.ts                         |  D  | Pricing tests                                                       |
| apps/web/src/lib/growthSponsorshipPlans.ts                        |  P  | Plan naming                                                         |
| apps/web/src/lib/adminTenantSearch.test.ts                        |  D  | Minor test update                                                   |
| apps/web/src/components/UpgradeModal.tsx                          |  P  | Plan picker / trial target                                          |
| apps/web/src/components/UpgradeModal.test.ts                      |  D  | Pricing tests                                                       |
| apps/web/src/components/SubscriptionInfo.tsx                      |  P  | Trial/add-ons/usage UI                                              |
| apps/web/src/components/LimitExceededBanner.tsx                   |  P  | Growth/Scale copy                                                   |
| apps/web/src/components/FeatureLockedCard.tsx                     |  P  | Scale fallback copy                                                 |
| apps/web/src/components/RecommendedBadge.tsx                      |  P  | Comment cleanup                                                     |
| apps/web/src/components/billing/PaymentModal.tsx                  |  P  | Annual savings from DB                                              |
| apps/web/src/components/admin/dashboard/AdminPlansTab.tsx         |  P  | Admin plan editor                                                   |
| apps/web/src/components/admin/AdminPlatformSettingsPanel.tsx      |  P  | Trial settings                                                      |
| apps/web/src/components/admin/AdminLimitsTab.tsx                  |  P  | Limit labels                                                        |
| apps/web/src/components/admin/AdminTenantPicker.tsx               |  P  | Minor admin UX                                                      |
| apps/web/src/components/admin/limits/OverridesTable.tsx           |  P  | Limit labels                                                        |
| apps/web/src/components/notifications/NotificationWebhookCard.tsx |  P  | Plan copy                                                           |
| apps/web/src/components/public/CustomDomainCatalogHost.tsx        |  P  | Plan copy                                                           |
| apps/web/src/components/settings/CustomDomainCard.tsx             |  P  | Plan copy                                                           |
| apps/web/src/components/settings/TenantBrandingPanel.tsx          |  P  | Plan copy                                                           |
| apps/web/src/components/settings/WarehouseFulfillmentSettings.tsx |  P  | Plan copy                                                           |
| apps/web/src/components/quick-lists/QuickListScheduleDialog.tsx   |  P  | Plan copy                                                           |
| apps/web/src/pages/AccountActivationPage.tsx                      |  P  | Trial activation UX                                                 |
| apps/web/src/pages/QuickListsPage.tsx                             |  P  | Plan copy                                                           |
| apps/web/src/services/api/base.ts                                 |  P  | Sanitize legacy plan labels in API errors                           |
| apps/web/src/services/api/endpoints/billing.ts                    |  P  | Billing types/fields                                                |
| apps/web/src/types/admin.ts                                       |  P  | Entitlement/billing types                                           |
| apps/web/vitest.config.ts                                         |  S  | Needed for web pricing tests under pnpm                             |
| apps/web/src/i18n/locales/en/admin.json                           |  P  | Plan/trial copy                                                     |
| apps/web/src/i18n/locales/ar/admin.json                           |  P  | Plan/trial copy                                                     |
| apps/web/src/i18n/locales/en/common.json                          |  P  | Plan/trial copy                                                     |
| apps/web/src/i18n/locales/ar/common.json                          |  P  | Plan/trial copy                                                     |
| apps/web/src/i18n/locales/en/onboarding.json                      |  P  | Plan/trial copy                                                     |
| apps/web/src/i18n/locales/ar/onboarding.json                      |  P  | Plan/trial copy                                                     |
| apps/web/src/i18n/locales/en/settings.json                        |  P  | Plan/trial copy                                                     |
| apps/web/src/i18n/locales/ar/settings.json                        |  P  | Plan/trial copy                                                     |
| apps/web/src/i18n/locales/en/cart.json                            |  P  | Plan copy                                                           |
| apps/web/src/i18n/locales/ar/cart.json                            |  P  | Plan copy                                                           |
| apps/web/src/i18n/locales/en/calendar.json                        |  P  | Plan copy                                                           |
| apps/web/src/i18n/locales/ar/calendar.json                        |  P  | Plan copy                                                           |
| apps/web/src/i18n/locales/en/reports.json                         |  P  | Plan copy                                                           |
| apps/web/src/i18n/locales/ar/reports.json                         |  P  | Plan copy                                                           |
| apps/web/src/i18n/locales/en/suppliers.json                       |  P  | Plan copy                                                           |
| docs/product/four-plan-pricing-model.md                           |  D  | Canonical pricing doc                                               |
| docs/pricing-and-limits-audit.md                                  |  D  | Audit                                                               |
| docs/pricing-and-limits-data.json                                 |  D  | Audit data                                                          |
| docs/pricing-and-limits-file-index.md                             |  D  | File index                                                          |
| docs/pricing-and-limits-final-report.md                           |  D  | Final report                                                        |
| docs/product/plans-and-limits.md                                  |  D  | Pricing docs                                                        |
| docs/product/plans.md                                             |  D  | Legacy marking                                                      |
| docs/product/subscriptions.md                                     |  D  | Superseded marking                                                  |
| docs/product/tier-matrix.md                                       |  D  | Superseded marking                                                  |
| docs/product/features.md                                          |  D  | Pricing wording                                                     |
| docs/product/feature-comparison.md                                |  D  | Growth/Scale rows                                                   |
| docs/product/feature-catalog-full.md                              |  D  | Trial wording                                                       |
| docs/product/feature-catalog-technical.md                         |  D  | Pricing wording                                                     |
| docs/product/enterprise.md                                        |  D  | Custom handling                                                     |
| docs/product/PLATINUM_CATALOG_ONLY_FEATURES.md                    |  D  | Historical marking                                                  |
| docs/product/monetization-ux.md                                   |  D  | Pricing UX                                                          |
| docs/product/restaurant-capabilities.md                           |  D  | Plan wording                                                        |
| docs/product/README.md                                            |  D  | Links                                                               |
| docs/admin/admin-guide.md                                         |  D  | Admin pricing ops                                                   |
| docs/admin/feature-flags.md                                       |  D  | Minor plan wording                                                  |
| docs/architecture/tenancy.md                                      |  D  | Plan wording                                                        |
| docs/features/free-trial-expiry.md                                |  D  | Trial language                                                      |
| docs/features/ai-quick-lists.md                                   |  D  | Quota/plan language                                                 |
| docs/features/notifications-and-alerts.md                         |  D  | Trial event copy                                                    |
| docs/features/disputes-returns.md                                 |  D  | Plan feature notes                                                  |
| docs/features/contract-pricing.md                                 |  D  | Plan wording                                                        |
| docs/features/deals-and-promotions.md                             |  D  | Plan wording                                                        |
| docs/features/drivers-and-gps-tracking.md                         |  D  | Plan wording                                                        |
| docs/features/ordering-amendments.md                              |  D  | Plan wording                                                        |
| docs/features/receiving.md                                        |  D  | Plan wording                                                        |
| docs/features/recipe-costing.md                                   |  D  | Plan wording                                                        |
| docs/features/reports-analytics.md                                |  D  | Plan wording                                                        |
| docs/features/restaurant-branches.md                              |  D  | Plan wording                                                        |
| docs/features/supplier-branches.md                                |  D  | Plan wording                                                        |
| docs/features/supplier-customer-growth.md                         |  D  | Plan wording                                                        |
| docs/features/supplier-follow.md                                  |  D  | Plan wording                                                        |
| docs/features/supplier-ops.md                                     |  D  | Plan wording                                                        |
| docs/features/supplier-reviews.md                                 |  D  | Plan wording                                                        |
| docs/features/tenant-audit-log.md                                 |  D  | Plan wording                                                        |
| docs/features/tenant-registration.md                              |  D  | Plan wording                                                        |
| docs/features/tenant-roles.md                                     |  D  | Plan wording                                                        |
| docs/features/waitlist-auto-promotion.md                          |  D  | Plan wording                                                        |
| docs/features/warehouse-fulfillment.md                            |  D  | Plan wording                                                        |
| docs/features/waste-tracking.md                                   |  D  | Plan wording                                                        |
| docs/features/README.md                                           |  D  | Index links                                                         |
| docs/features/inventory-expiry-and-reorder.md                     |  D  | Minor plan wording                                                  |
| apps/api/db/migrations/0189_reorder_recommendation_feedback.sql   |  A  | AI feedback schema — EXCLUDE                                        |
| apps/api/src/lib/reorder-ai-normalize.js                          |  A  | New AI module — EXCLUDE                                             |
| apps/api/src/lib/reorder-ai-normalize.test.js                     |  A  | EXCLUDE                                                             |
| apps/api/src/lib/reorder-ai-schema.js                             |  A  | New AI module — EXCLUDE                                             |
| apps/api/src/services/reorder-ai-context.service.js               |  A  | New AI module — EXCLUDE                                             |
| apps/api/src/services/reorder-ai-context.service.test.js          |  A  | EXCLUDE                                                             |
| apps/api/src/services/reorder-ai.service.js                       |  A  | Depends on unfinished AI modules — EXCLUDE                          |
| apps/api/src/services/reorder-ai.service.test.js                  |  A  | EXCLUDE                                                             |
| apps/api/src/services/reorder-ai.service.llm.test.js              |  A  | EXCLUDE                                                             |
| apps/api/src/services/restaurant-reorder-assistance.service.js    |  A  | Large AI recommend rewrite — EXCLUDE                                |
| apps/api/src/services/restaurant-reorder-ai-recommend.test.js     |  A  | EXCLUDE                                                             |
| apps/api/src/routes/restaurant-inventory.routes.js                |  A  | AI recommend/feedback routes (+ some plan copy) — EXCLUDE           |
| apps/api/src/routes/restaurant-inventory.routes.test.js           |  A  | EXCLUDE                                                             |
| apps/api/src/routes/restaurant-inventory.pagination.test.js       |  A  | Tied to inventory/AI route changes — EXCLUDE                        |
| apps/web/src/components/inventory/ReorderAssistancePanel.tsx      |  A  | EXCLUDE                                                             |
| apps/web/src/components/inventory/ReorderAssistancePanel.test.tsx |  A  | EXCLUDE                                                             |
| apps/web/src/components/dashboard/DashboardWidgetGrid.tsx         |  A  | AI recommend widget — EXCLUDE                                       |
| apps/web/src/components/dashboard/DashboardWidgetGrid.test.tsx    |  A  | EXCLUDE                                                             |
| apps/web/src/pages/DashboardPage.tsx                              |  A  | Wired to AI recommend widget — EXCLUDE                              |
| apps/web/src/services/api/endpoints/restaurantInventory.ts        |  A  | AI recommend/feedback API — EXCLUDE                                 |
| apps/web/src/services/api/index.ts                                |  A  | Exports AI mutations — EXCLUDE                                      |
| apps/web/src/types/reorder.ts                                     |  A  | AI recommend types — EXCLUDE                                        |
| docs/features/ai-smart-reorder.md                                 |  A  | Mixed; heavy AI recommend rewrite — EXCLUDE from pricing stage      |
| docs/mobile/MOBILE_FEATURE_PARITY.md                              | U/A | Small add; not required for pricing — EXCLUDE                       |

## Coupling finding

Pricing implementation files do **not** import `reorder-ai-normalize`, `reorder-ai-schema`, or `reorder-ai-context`.
`reorder-ai.service.js` **does** import those unfinished modules → must stay out of pricing stage.

## Scope drift

- Many one-line Silver/Gold/Platinum → Growth/Scale comment/error-string updates (included as pricing copy).
- Em-dash → hyphen comment nits in a few files.
- `vitest.config.ts` pnpm jest-dom inline is shared tooling, not product scope.
