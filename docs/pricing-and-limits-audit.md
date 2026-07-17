# Supplify Pricing, Plans, And Limits Audit

**Generated:** 2026-07-16  
**Scope:** Post-implementation repository audit for the four-plan commercial model.  
**Source of truth principle:** Runtime behavior from migrations, API code, billing services, entitlement utilities, and frontend subscription surfaces. Product docs are checked for drift but are not the authority.

## 1. Executive Summary

Supplify now uses a simpler public commercial model:

| Tenant type | Public plan       | Internal code | Monthly | Annual | Primary scale metric                                   |
| ----------- | ----------------- | ------------- | ------: | -----: | ------------------------------------------------------ |
| Restaurant  | Restaurant Growth | `silver`      |     $49 |   $490 | Active branches, included 1                            |
| Restaurant  | Restaurant Scale  | `gold`        |    $149 | $1,490 | Active branches, included 3                            |
| Supplier    | Supplier Growth   | `gold`        |    $149 | $1,490 | Active ordering customer locations/month, included 50  |
| Supplier    | Supplier Scale    | `platinum`    |    $349 | $3,490 | Active ordering customer locations/month, included 200 |

The implementation deliberately preserves legacy internal codes instead of renaming every subscription and feature gate. Public labels are tenant-aware and come from the catalog/API formatting layer, while inactive rows remain available for hidden legacy/custom handling.

The public free-plan experience has been replaced by a 30-day free trial of a selected paid plan. Internally, the `free` row and `free_sandbox_expires_at` lock flow remain for compatibility, with `subscription.trial_target_plan_id` recording the selected paid-plan target when present.

Add-ons are admin-provisioned for this release. They increase effective limits and are included in checkout totals, renewal totals, billing status, and invoice metadata. There are no self-service add-on purchase controls.

Billing remains manual/stub provider compatible. Repository-level recurring totals and ledger rows are now consistent, but live automated payment-provider subscriptions and webhooks are still external production work.

## 2. Architecture Decision

Internal codes were preserved:

| Code         | Restaurant handling                                         | Supplier handling                                         |
| ------------ | ----------------------------------------------------------- | --------------------------------------------------------- |
| `free`       | Internal 30-day trial row, default target Restaurant Growth | Internal 30-day trial row, default target Supplier Growth |
| `silver`     | Restaurant Growth                                           | Hidden legacy supplier compatibility/manual review        |
| `gold`       | Restaurant Scale                                            | Supplier Growth                                           |
| `platinum`   | Hidden Restaurant Custom/custom handling                    | Supplier Scale                                            |
| `enterprise` | Hidden custom/admin handling                                | Hidden custom/admin handling                              |

This is the lowest-risk migration path because plan code is used by tier comparison, feature resolution, old aliases, tests, billing history, admin flows, and existing subscription rows. User-facing names are now resolved with tenant-aware display helpers instead of cosmetic code renames.

## 3. Runtime Source Of Truth

| Concern                                                    | Runtime authority                                                                                    | Notes                                                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan prices, display names, descriptions, features, limits | `subscription_plan`, updated by `0190_four_plan_pricing_model.sql`                                   | Tenant-specific rows are authoritative.                                                                                                                    |
| Plan labels                                                | `apps/api/src/lib/plan-codes.js` plus DB names                                                       | Hides legacy public names such as Silver/Gold/Platinum.                                                                                                    |
| Public plans API                                           | `apps/api/src/routes/subscriptions.routes.js`                                                        | Returns tenant-specific rows, annual savings from DB prices, current plan marker, trial eligibility, and add-on options.                                   |
| Entitlements                                               | `apps/api/src/lib/subscription/entitlements.js`                                                      | Resolves trial target features/limits, add-ons, overrides, usage, AI metadata, and active customer location usage.                                         |
| Limit keys                                                 | `apps/api/src/lib/limit-resolution.js`                                                               | Includes `active_customer_locations_monthly`; paid restaurant commercial meters are unlimited where required.                                              |
| Add-on definitions                                         | `apps/api/src/lib/subscription-addons.js`                                                            | Admin-provisioned recurring prices and limit increments.                                                                                                   |
| Billing totals                                             | `apps/api/src/lib/billing/billing-service.js`                                                        | `base plan price + active add-ons = recurring total`; annual add-ons use monthly \* 10.                                                                    |
| Renewal ledger                                             | `apps/api/src/jobs/subscription-billing.job.js`                                                      | Renewal uses the same recurring total calculation and creates invoice/payment ledger rows.                                                                 |
| Trial duration                                             | `platform_setting.free_sandbox_days` via `platform-settings.js`                                      | Default 30, clamped 7-90.                                                                                                                                  |
| Frontend plan display                                      | `apps/web/src/lib/planComparison.ts`, `SubscriptionInfo.tsx`, `PaymentModal.tsx`, `UpgradeModal.tsx` | DB-driven prices; old public names/prices removed from runtime copy; pending activation starts the hidden trial row against the selected paid plan target. |

## 4. Final Plan And Limit Summary

| Plan                         | Limits                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restaurant Growth (`silver`) | branches 1, users 5, AI 30/day, storage 2 GB, commercial order/supplier/SKU/order-line/deal-style limits unlimited by catalog convention.                                          |
| Restaurant Scale (`gold`)    | branches 3, users 20, AI 150/day, storage 10 GB, same normal purchasing activity unlimited.                                                                                        |
| Supplier Growth (`gold`)     | supplier branches 1, warehouses 1, active customer locations/month 50, users 10, drivers 5, promotions 10, AI 50/day, storage 5 GB, product/order commercial meters unlimited.     |
| Supplier Scale (`platinum`)  | supplier branches 3, warehouses 3, active customer locations/month 200, users 30, drivers 20, promotions 50, AI 300/day, storage 30 GB, product/order commercial meters unlimited. |

Unlimited commercial meters continue to use the existing `-1` convention. Technical safety controls such as upload size limits, pagination, API rate limits, import batch limits, and payload maximums remain separate from commercial limits.

## 5. Add-ons

| Tenant/plan      | Add-on                                  | Key                                     | Monthly | Annual | Limit impact                             |
| ---------------- | --------------------------------------- | --------------------------------------- | ------: | -----: | ---------------------------------------- |
| Restaurant Scale | Additional branch                       | `restaurant_extra_branch`               |     $39 |   $390 | +1 branch each                           |
| Supplier Scale   | Additional 50 active customer locations | `supplier_active_customer_locations_50` |     $75 |   $750 | +50 active customer locations/month each |
| Supplier Scale   | Additional supplier branch              | `supplier_extra_branch`                 |     $49 |   $490 | +1 branch each                           |
| Supplier Scale   | Additional warehouse                    | `supplier_extra_warehouse`              |     $19 |   $190 | +1 warehouse each                        |

Add-ons are admin-provisioned only. Active add-ons are included in entitlement limits, billing status recurring totals, checkout invoices, and renewal invoices. Removal/cancellation is represented by addon status/end date; self-service purchase UI is intentionally not exposed.

## 6. Active Customer Location Metric

The canonical supplier usage key is `active_customer_locations_monthly`.

Definition:

- Counts distinct `COALESCE(customer_order.branch_id, customer_order.restaurant_id)`.
- Scopes to orders containing items for the supplier tenant.
- Uses the subscription billing period when available.
- Falls back to the current UTC calendar month when no subscription period is available.
- Counts qualifying commercial statuses: `ACKNOWLEDGED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `RECEIVED_PARTIAL`, `RECEIVED_FULL`, `RECEIVED_WITH_DISPUTE`, `INVOICED`, `COMPLETED`.
- Excludes draft, placed-only, cancelled, rejected, and non-commercial/test-like activity.
- Exposes usage and warning metadata in entitlements.

The current safe product behavior is not to silently reject incoming restaurant orders. When a supplier is already at the effective `active_customer_locations_monthly` cap, supplier-initiated customer activation flows block new connection requests, referral invitations, and sponsorships with a `LIMIT_EXCEEDED` response, conversion-event tracking, and upgrade/admin-review details.

## 7. Trial Behavior

The public trial is a 30-day trial of a selected paid plan. The internal `free` row remains active for compatibility with activation, admin extension, and account-lock middleware.

Trial behavior:

- `subscription.trial_target_plan_id` records the selected target paid plan.
- If target is missing, restaurants default to Restaurant Growth and suppliers default to Supplier Growth.
- Self-serve trial targets must be active paid catalog rows for the tenant type; internal free, enterprise, and admin-assignment/custom rows are rejected. Activation and upgrade-modal trial entry points pass the selected paid plan as `trial_target_plan_id` while keeping the internal `free` row hidden from comparison cards.
- Trial feature and limit resolution uses the target plan where available.
- Trial expiry still locks writes through `free_sandbox_expires_at` and billing access middleware.
- Admin trial extension remains available and audited.
- Trial AI uses `ai_trial_requests_total`: restaurant 50 total genuine LLM calls, supplier 100 total.
- Trial fallback output must be labeled heuristic/rule-based when quota is exhausted; it is not presented as AI output.

## 8. Enforcement Changes

Implemented or updated enforcement areas:

- Paid restaurant order/supplier/SKU/quick-list/deal-style commercial caps are unlimited in the plan catalog where required.
- Supplier active customer location usage is counted and exposed in entitlements, and supplier-initiated connection/invite/sponsor activation is blocked when the current billing-period count is already at the effective cap.
- User seat limits count active login-enabled tenant users and pending non-expired invitations when creating invites.
- Supplier driver limits block driver creation at the effective plan cap.
- AI quota behavior differentiates genuine LLM output from heuristic fallback and meters only provider-backed successes.
- Scheduled order execution skips locked restaurants, waitlist offer expiry can close stale offers but skips automatic next-guest promotion for locked restaurants, invoice overdue notifications require both restaurant and supplier tenants to be unlocked before the job claims the overdue notification write, email retry skips locked operational tenant-bound failed sends while allowing billing/payment/subscription lifecycle retries, and email digest sends only to admin users or users with an unlocked tenant membership, reorder forecast cache refresh skips locked restaurants before forecast writes, recipe recalculation queue processing skips locked restaurants and keeps dirty rows queued, automated collections reminders skip locked suppliers before reminder logs/notifications, inventory expiry reminders skip locked restaurants before dedup logs/notifications, reorder cadence reminders skip locked recipients before reminder logs/notifications, promotion expiry maintenance only activates scheduled supplier promotions for unlocked suppliers and skips expiry notification writes for locked suppliers, delivery rollover skips locked suppliers, stale GPS alerts skip locked suppliers before alert logs/notifications, fulfillment exception checks skip locked suppliers before exception writes, and queued supplier catalog/image imports fail before product writes when the supplier is locked, so expired trials/payment locks cannot create operational writes in the background.
- Subscription status and entitlement payloads expose add-ons, recurring totals, AI usage, trial target, and location-limit warnings.

Supplier active-customer-location enforcement is intentionally placed on supplier-initiated customer activation/onboarding surfaces. Normal incoming restaurant orders are not silently rejected; suppliers at cap must upgrade, add capacity, or receive admin handling before initiating more customer activation.

## 9. Migration Review

Migration `0190_four_plan_pricing_model.sql` performs the catalog conversion and creates an idempotently refreshed `pricing_migration_preview` table.

Preview output includes:

- tenant ID and tenant type
- current plan code
- proposed plan code
- current usage snapshot
- target limits
- manual-review flag
- review reasons

Suggested mapping:

| Current code | Restaurant proposed code                                                                                                 | Supplier proposed code                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `free`       | `silver` target trial                                                                                                    | `gold` target trial                                                                                                 |
| `silver`     | `silver`                                                                                                                 | `gold`; active Supplier Silver subscriptions are remapped to Supplier Growth with `subscription_change_log` history |
| `gold`       | `gold`                                                                                                                   | `gold`                                                                                                              |
| `platinum`   | `gold`; active Restaurant Platinum subscriptions are remapped to Restaurant Scale with `subscription_change_log` history | `platinum`                                                                                                          |
| `enterprise` | manual custom review                                                                                                     | manual custom review                                                                                                |

The preview intentionally avoids tenant names and tenant-confidential business details. Actual over-limit tenant counts require running the migration preview against the target environment database. Active Supplier Silver subscriptions are moved to the Supplier Growth row and active Restaurant Platinum subscriptions are moved to the Restaurant Scale row while preserving subscription IDs and billing dates; the migration records both changes in `subscription_change_log` and stores `previous_plan_code` as `silver` or `platinum` respectively.

## 10. Billing Status

Completed inside the repository:

- Checkout amount uses DB base plan price plus active recurring add-ons.
- Renewal amount uses the same recurring total calculation.
- Checkout creates invoice/payment ledger rows.
- Renewal now creates invoice/payment ledger rows with add-on metadata.
- Billing status exposes recurring total and active add-ons.
- Add-on annual pricing uses the same two-months-free convention as base plans.
- Renewal creates a PROCESSING payment claim before charging so duplicate workers do not both call the gateway for the same renewal idempotency key.

Not complete for automated live billing:

- Real PSP subscriptions are not implemented.
- Billing webhooks are not implemented.
- External product/price IDs are not modeled.
- Off-session charging remains tied to the existing stub/manual gateway registry unless a real provider is added.

Launch classification: ready for demonstration and supervised pilot validation; viable for live manual billing after migration-preview review; not ready for live automated recurring card billing.

## 11. Current Documentation State

Current docs:

- `docs/product/four-plan-pricing-model.md` is the canonical product model.
- `docs/product/plans-and-limits.md` points to the four-plan model.
- Admin, feature, AI, trial, registration, enterprise, tenant, and current product feature docs have been updated with four-plan notes.

Historical/superseded docs remain for context and should not be used as current pricing guidance.

## 12. Verification Snapshot

Focused tests already run during this implementation include:

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Result                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- | ------------- | ----------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| `node --check apps/api/src/lib/subscription/plans.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Passed.                                                                                                                             |
| `pnpm.cmd --filter @supplify/api exec vitest run apps/api/src/lib/plan-codes.test.js apps/api/src/lib/subscription.test.js apps/api/src/lib/billing/billing-service.test.js apps/api/src/routes/subscriptions.routes.test.js apps/api/src/routes/admin-dashboard.routes.test.js apps/api/src/services/reorder-ai.service.test.js apps/api/src/services/quick-list-ai.service.test.js apps/api/src/services/scheduled-orders.service.test.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Focused API subscription, billing, admin, AI, and scheduled-order coverage passed.                                                  |
| `pnpm.cmd --filter @supplify/api exec vitest run apps/api/src/jobs/invoice-overdue.job.test.js apps/api/src/jobs/email-retry.job.test.js apps/api/src/jobs/email-digest.job.test.js apps/api/src/services/reorder-forecast-cache.service.test.js apps/api/src/services/recipe-recalc-queue.service.test.js apps/api/src/services/waitlistPromotion.test.js apps/api/src/services/promotions.service.test.js apps/api/src/jobs/promotions-expiry.job.test.js apps/api/src/services/delivery-rollover.service.test.js apps/api/src/services/product-import.service.test.js apps/api/src/services/product-image-import.service.test.js apps/api/src/services/collections-reminders.service.test.js apps/api/src/services/inventory-expiry.service.test.js apps/api/src/services/reorder-cadence.service.test.js apps/api/src/lib/active-gps-deliveries.test.js apps/api/src/jobs/stale-gps-alerts.job.test.js apps/api/src/jobs/fulfillment-exceptions.job.test.js` | 17 background-lock test files, 84 tests passed.                                                                                     |
| `pnpm.cmd --filter @supplify/web exec vitest run src/lib/formatPlanPrice.test.ts src/lib/planComparison.test.ts src/lib/activateFreePlan.test.ts src/lib/upgradeCopy.test.ts src/components/admin/AdminPlatformSettingsPanel.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 5 web files, 20 tests passed.                                                                                                       |
| `pnpm.cmd --filter @supplify/web exec vitest run src/components/UpgradeModal.test.ts src/lib/activateFreePlan.test.ts src/lib/planComparison.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 3 web files, 17 tests passed, including UpgradeModal hidden-trial-row and selected-paid-plan targeting coverage.                    |
| `pnpm.cmd --filter @supplify/web exec tsc --noEmit --pretty false --skipLibCheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Failed only on known unrelated FullCalendar/Recharts/Rnd JSX component type errors; no current pricing/admin files were implicated. |
| `rg -n -i -e "Free plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Free tier                                                                                                                           | Silver plan | Gold plan | Platinum plan | public free | permanent free" docs/product docs/features docs/admin -g "\*.md"` | No matches in current product, feature, or admin docs. |
| `rg -n "[ \t]+$" docs/pricing-and-limits-file-index.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | No trailing whitespace matches.                                                                                                     |

Runtime scan for old public plan names/prices in `apps/api/src` and `apps/web/src`, excluding tests, produced no stale public-copy matches during the implementation pass.

Full web TypeScript still has unrelated existing JSX component type errors in FullCalendar/Recharts/Rnd surfaces. No current pricing files were implicated after the `SubscriptionInfo` typing fix.

## 13. Remaining Risks

- The migration preview must be run against the deployment database before launch; this repository audit cannot know real tenant over-limit counts.
- Live recurring provider work remains outside the implemented stub/manual gateway layer.
- Full end-to-end checkout and renewal should be exercised in the target environment with realistic add-ons and payment settings.
- Historical/archive docs may still mention old tier labels for context; current product, feature, and admin docs scan clean for public Free/Silver/Gold/Platinum-plan copy.

## 14. Launch Recommendation

| Launch stage                     | Recommendation                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Demonstration                    | Ready after current focused tests remain green.                                                                           |
| Supervised pilot                 | Reasonable after migration preview review and manual QA of checkout, renewal, trial expiry, and admin add-ons.            |
| Live manual billing              | Reasonable with operational controls and explicit manual billing process.                                                 |
| Live automated recurring billing | Not ready until real PSP subscriptions, webhooks, idempotency reconciliation, and provider price mapping are implemented. |

_End of post-implementation audit._
