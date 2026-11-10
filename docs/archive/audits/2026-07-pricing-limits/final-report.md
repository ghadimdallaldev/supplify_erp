# Supplify Pricing And Limits Final Report

**Date:** 2026-07-17
**Scope:** Repository-level final report for the four-plan pricing, trial, limits, billing, admin, UI, migration, and documentation work.

This report summarizes the implementation. The detailed runtime audit is `docs/pricing-and-limits-audit.md`, the machine-readable audit is `docs/pricing-and-limits-data.json`, and the per-file evidence index is `docs/pricing-and-limits-file-index.md`.

## 1. Architecture Decision

Existing internal plan codes were preserved. Public naming is tenant-aware, while compatibility codes remain stable for entitlement resolution, billing history, plan comparison, migrations, tests, and existing subscription rows.

| Internal code | Restaurant handling                                  | Supplier handling                                  |
| ------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `free`        | Internal trial row, default target Restaurant Growth | Internal trial row, default target Supplier Growth |
| `silver`      | Restaurant Growth                                    | Hidden legacy supplier compatibility/manual review |
| `gold`        | Restaurant Scale                                     | Supplier Growth                                    |
| `platinum`    | Hidden Restaurant Custom/manual handling             | Supplier Scale                                     |
| `enterprise`  | Hidden custom/admin handling                         | Hidden custom/admin handling                       |

## 2. Final Plan Table

| Tenant type | Public plan       | Internal code | Monthly | Annual | Key limits                                                                                                                    | Add-ons                                                                        |
| ----------- | ----------------- | ------------- | ------: | -----: | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Restaurant  | Restaurant Growth | `silver`      |     $49 |   $490 | 1 branch, 5 users, 30 AI/day, 2 GB storage, normal purchasing activity unlimited                                              | None                                                                           |
| Restaurant  | Restaurant Scale  | `gold`        |    $149 | $1,490 | 3 branches, 20 users, 150 AI/day, 10 GB storage, normal purchasing activity unlimited                                         | Additional branch, $39/month                                                   |
| Supplier    | Supplier Growth   | `gold`        |    $149 | $1,490 | 1 branch, 1 warehouse, 50 active customer locations/month, 10 users, 5 drivers, 10 promotions, 50 AI/day, 5 GB storage        | None                                                                           |
| Supplier    | Supplier Scale    | `platinum`    |    $349 | $3,490 | 3 branches, 3 warehouses, 200 active customer locations/month, 30 users, 20 drivers, 50 promotions, 300 AI/day, 30 GB storage | +50 active customer locations $75/month, branch $49/month, warehouse $19/month |

Exact catalog limit maps are database-driven through `subscription_plan` and mirrored in `docs/pricing-and-limits-data.json`:

| Plan              | Limit map                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Restaurant Growth | `branches=1`, `users=5`, `orders_per_day=-1`, `suppliers_per_restaurant=-1`, `restaurant_inventory_skus=-1`, `chats_per_day=500`, `open_conversations=30`, `storage_mb=2048`, `quick_lists=-1`, `quick_list_items=-1`, `scheduled_quick_lists=-1`, `deal_redemptions_per_day=-1`, `scheduled_order_grace_per_day=0`, `ai_requests_per_day=30`.   |
| Restaurant Scale  | `branches=3`, `users=20`, `orders_per_day=-1`, `suppliers_per_restaurant=-1`, `restaurant_inventory_skus=-1`, `chats_per_day=-1`, `open_conversations=-1`, `storage_mb=10240`, `quick_lists=-1`, `quick_list_items=-1`, `scheduled_quick_lists=-1`, `deal_redemptions_per_day=-1`, `scheduled_order_grace_per_day=0`, `ai_requests_per_day=150`. |
| Supplier Growth   | `branches=1`, `warehouses=1`, `active_customer_locations_monthly=50`, `users=10`, `drivers=5`, `supplier_products_skus=-1`, `chats_per_day=500`, `open_conversations=30`, `storage_mb=5120`, `promotions=10`, `ai_requests_per_day=50`.                                                                                                          |
| Supplier Scale    | `branches=3`, `warehouses=3`, `active_customer_locations_monthly=200`, `users=30`, `drivers=20`, `supplier_products_skus=-1`, `chats_per_day=-1`, `open_conversations=-1`, `storage_mb=30720`, `promotions=50`, `ai_requests_per_day=300`.                                                                                                       |

Exact catalog feature maps are database-driven through `subscription_plan` and mirrored in `docs/pricing-and-limits-data.json`:

| Plan              | Feature map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restaurant Growth | `chat=multi_supplier`, `order_calendar`, `quick_lists=full_schedule`, `receiving_quality=photos_enabled`, `disputes_returns`, `finance_invoices=record_payments`, `inventory_management=real_time`, `recipe_costing`, `waste_tracking=analytics_dashboard`, `supplier_deals`, `supplier_deals_redeem`, `supplier_reviews`, `order_amendments`, `notifications=in_app_and_email`, `push_notifications`, `reports=basic_kpis`, `smart_reorder=full_90day_trends`, `ai_platform`, `support_sla=standard_72h`; disabled: `multi_branch`, `custom_branding`, `tenant_audit_log`, `waitlist_auto_promo`, `advanced_roles`, `api_integrations`, `feature_flags_access`, `fulfillment_tools`.                                                                                                                                     |
| Restaurant Scale  | `chat=group_chat_files`, `order_calendar`, `quick_lists=ai_smart_automation`, `receiving_quality=quality_scoring`, `disputes_returns`, `finance_invoices=advanced_finance_dashboard`, `inventory_management=multi_branch_tracking`, `recipe_costing`, `waste_tracking=analytics_dashboard`, `supplier_deals`, `supplier_deals_redeem`, `supplier_reviews`, `order_amendments`, `notifications=email_whatsapp_webhook`, `push_notifications`, `reports=advanced_forecasting_custom_reports`, `smart_reorder=ai_forecast_seasonality`, `ai_platform`, `multi_branch=central_purchasing`, `custom_branding=logo_colors`, `tenant_audit_log`, `waitlist_auto_promo`, `advanced_roles`, `api_integrations=full_api_webhooks`, `feature_flags_access=addon_toggles`, `support_sla=priority_24h`; disabled: `fulfillment_tools`. |
| Supplier Growth   | `chat=group_chat_files`, `order_calendar`, `reports=basic_kpis`, `smart_reorder=full_90day_trends`, `ai_platform`, `warehouses`, `fulfillment`, `fulfillment_tools=manual_orders_invoices`, `driver_management`, `disputes_returns`, `finance_invoices=record_payments`, `quick_lists`, `inventory_management=real_time`, `notifications=in_app_and_email`, `support_sla=standard_72h`, `promotions`, `push_notifications`, `order_amendments`, `supplier_growth`; disabled: `multi_branch`, `multi_warehouse`, `advanced_roles`, `api_integrations`, `custom_branding`, `feature_flags_access`, `tenant_audit_log`.                                                                                                                                                                                                      |
| Supplier Scale    | `chat=real_time_media_read_receipts`, `order_calendar`, `reports=advanced_forecasting_custom_reports`, `smart_reorder=ai_forecast_seasonality`, `ai_platform`, `multi_branch`, `warehouses`, `multi_warehouse`, `fulfillment`, `fulfillment_tools=routing_full_suite`, `driver_management`, `disputes_returns`, `finance_invoices=advanced_finance_dashboard`, `quick_lists`, `inventory_management=lot_expiry_tracking`, `advanced_roles`, `notifications=email_whatsapp_webhook`, `api_integrations=full_api_webhooks`, `support_sla=priority_24h`, `custom_branding=logo_colors`, `feature_flags_access=addon_toggles`, `promotions`, `push_notifications`, `order_amendments`, `tenant_audit_log`, `supplier_growth`.                                                                                                 |

## 3. Migration Results

Migration file: `apps/api/db/migrations/0190_four_plan_pricing_model.sql`.

| Current code | Restaurant mapping                                                  | Supplier mapping                        |
| ------------ | ------------------------------------------------------------------- | --------------------------------------- |
| `free`       | Trial target Restaurant Growth                                      | Trial target Supplier Growth            |
| `silver`     | Restaurant Growth                                                   | Supplier Growth with change-log history |
| `gold`       | Restaurant Scale                                                    | Supplier Growth                         |
| `platinum`   | Restaurant Scale with change-log history/manual review where needed | Supplier Scale                          |
| `enterprise` | Manual custom review                                                | Manual custom review                    |

The migration preserves subscription IDs, plan-code compatibility, trial state, billing periods, and change history where the repository can enforce it. The `pricing_migration_preview` table reports tenant type, current/proposed plan, usage, target limits, required overrides, preserved add-ons, preserved overrides, manual-review flag, and review reasons.

Real over-limit tenant counts and conflicts require running the preview against the target database. The repository cannot prove production tenant usage without that environment.

## 4. Files Changed

The full file-by-file implementation index is `docs/pricing-and-limits-file-index.md`. It records each touched runtime, migration, UI, documentation, and test file with purpose, status, covered pricing/features/limits/enforcement dimensions, and key behavior notes.

High-level behavior changes:

| Area              | Previous behavior                                                       | New behavior                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Plan catalog      | Public Free/Silver/Gold/Platinum model surfaced broadly                 | Four public tenant-specific Growth/Scale plans, with hidden trial/custom rows                                                  |
| Trial             | Public free-style activation was ambiguous                              | 30-day trial of a selected paid plan, tracked by `trial_target_plan_id`                                                        |
| Restaurant limits | Several normal purchasing meters could behave like commercial caps      | Paid restaurant normal ordering, supplier, SKU, order-line, invoice, and deal-style meters are unlimited by catalog convention |
| Supplier limits   | Supplier product count was closer to a commercial scaling proxy         | Supplier scale metric is active ordering customer locations/month                                                              |
| Add-ons           | Limit add-ons were not consistently included in billing totals          | Admin-provisioned add-ons affect limits and recurring totals                                                                   |
| Billing           | Checkout/renewal totals could omit recurring add-ons                    | Base plan plus active add-ons is used for checkout, renewal, status, invoice, and payment metadata                             |
| AI                | Heuristic fallback could be confused with AI output                     | Genuine AI is metered and labeled; fallback is transparent when quota is exhausted                                             |
| Background jobs   | Some operational background writes could run for locked tenants         | Key jobs now check subscription/trial/payment lock state before writes                                                         |
| UI copy           | Legacy plan labels and stale fallbacks existed in subscription surfaces | Tenant-aware Growth/Scale copy and DB-driven prices are used                                                                   |

## 5. Database Changes

`0190_four_plan_pricing_model.sql` updates the subscription catalog to the four-plan model, adds `subscription.trial_target_plan_id`, updates plan feature/limit JSON, adds the supplier active customer location limit key, preserves legacy aliases/internal codes, remaps selected active legacy subscriptions, records plan changes in `subscription_change_log`, and creates/refills `pricing_migration_preview`.

Rollback guidance is operational rather than destructive: review the preview and change log, then restore prior catalog values or remap subscriptions explicitly if a deployment rollback is required.

## 6. Enforcement Changes

Restaurants now scale commercially by active branches. Paid restaurant normal orders, connected suppliers, inventory SKUs, order lines, invoice records, and deal-style usage are not primary commercial caps.

Suppliers now scale commercially by `active_customer_locations_monthly`, counting unique ordering restaurant branches for the supplier in the billing period, falling back to the UTC calendar month when needed. Supplier-initiated customer activation flows block at cap; normal incoming restaurant orders are not silently rejected.

User seat limits count active login-enabled tenant members plus pending non-expired invitations where relevant. Supplier driver creation is capped by plan. AI quota metering covers genuine provider/model calls and exposes transparent fallback behavior. Background write locks were added across scheduled orders, forecasts, notifications, promotions, delivery/GPS/fulfillment, imports, collections, inventory expiry, and related jobs. Add-ons now update effective limits and billing totals.

## 7. Billing Status

Completed internally:

- Checkout totals use database base plan price plus active recurring add-ons.
- Renewal totals use the same recurring calculation.
- Checkout and renewal create invoice/payment ledger rows with add-on metadata.
- Billing status exposes recurring total and active add-ons.
- Annual add-ons use the same two-months-free convention as base plans.

Still manual/stub compatible only:

- Existing stub/manual providers remain supported.
- Live PSP subscriptions, webhooks, external product/price IDs, off-session provider reconciliation, and production card automation are not implemented.

## 8. Tests

Exact verification commands and results are listed in `docs/pricing-and-limits-audit.md` section 12 and mirrored in `docs/pricing-and-limits-data.json`.

Important results:

- API focused subscription, billing, admin, AI, and scheduled-order tests passed.
- Background-lock suite passed: 17 files, 84 tests.
- Web focused pricing/admin tests passed: 5 files, 20 tests.
- Upgrade modal selected-paid-plan trial targeting tests passed: 3 files, 17 tests.
- `node --check apps/api/src/lib/subscription/plans.js` passed.
- Current product/admin/feature docs scan has no stale public Free/Silver/Gold/Platinum plan copy.
- Full web TypeScript still fails only on known unrelated FullCalendar/Recharts/Rnd JSX component type errors; no current pricing/admin files were implicated.

## 9. Remaining Risks

- Production migration preview has not been run in this repository session, so real over-limit tenant counts and manual-review conflicts are unknown.
- Live automated recurring billing remains external production work.
- Full end-to-end checkout, renewal, trial expiry, admin add-on provisioning, and migration preview review still need target-environment QA.
- Historical/archive docs may intentionally mention legacy labels for context.

## 10. Launch Recommendation

| Stage                            | Recommendation                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Demonstration                    | Ready after focused tests remain green.                                                                                   |
| Supervised pilot                 | Reasonable after migration preview review and manual QA of checkout, renewal, trial expiry, and admin add-ons.            |
| Live manual billing              | Reasonable with explicit operational controls and manual billing process.                                                 |
| Live automated recurring billing | Not ready until real PSP subscriptions, webhooks, idempotency reconciliation, and provider price mapping are implemented. |

The commercial model is now:

```text
Restaurants scale by active branches.
Suppliers scale by active ordering customer locations.
```
