# 10 — Subscriptions and Plans

Supplify monetization is **plan-driven**: every restaurant and supplier workspace has a `subscription` row joined to `subscription_plan` (limits + features JSON). Self-serve tiers are **Free Trial**, **Silver**, **Gold**, and **Platinum**. The legacy **Enterprise** tier was deactivated in migration `0066_remove_enterprise_tier.sql` and is not selectable; `normalizePlanCode()` maps `enterprise` → `platinum` for comparisons only.

Canonical plan codes: `free`, `silver`, `gold`, `platinum` (`apps/api/src/lib/plan-codes.js`).

---

## Plan catalog summary

| Plan       | Display name | Restaurant monthly / yearly | Supplier monthly / yearly | Notes                                                         |
| ---------- | ------------ | --------------------------- | ------------------------- | ------------------------------------------------------------- |
| `free`     | Free Trial   | $0 / $0                     | $0 / $0                   | Time-limited sandbox; Gold **feature** gates, Free **limits** |
| `silver`   | Silver       | $49 / $490                  | $49 / $490                | First paid tier (`0117_silver_tier_limits_features.sql`)      |
| `gold`     | Gold         | $149 / $1,490               | $149 / $1,490             | Core production tier (`0119_gold_tier_limits_features.sql`)   |
| `platinum` | Platinum     | $349 / $3,490               | $349 / $3,490             | High-capacity tier (`0120_platinum_tier_limits_features.sql`) |

Prices are stored on `subscription_plan.price_per_month` and `price_per_year`. Migrations **0117**, **0119**, and **0120** set limits, features, and confirm pricing for Silver/Gold/Platinum. Free-tier limits are maintained in `0145_plan_catalog_audit_sync.sql` (and runtime fallbacks in `limit-resolution.js`).

---

## Free Trial: Gold features, Free limits

Free Trial is **not** a stripped-down feature tier. Runtime enforcement uses **Gold feature JSON** while **Free limit caps** apply:

1. **DB sync** — Migrations `0112_free_gold_feature_parity.sql`, `0145_plan_catalog_audit_sync.sql`, and `0175_free_trial_supplier_growth_parity.sql` copy Gold `features` onto Free rows.
2. **Runtime override** — `resolveEffectivePlanFeatures()` (`apps/api/src/lib/subscription/free-trial-plan-features.js`) loads cached Gold features whenever `plan_code === 'free'`, so API gates stay correct even if catalog rows drift.

```javascript
// free-trial-plan-features.js — Free Trial uses Gold feature gates
if (planCode !== 'free' || !tenantType) return raw
return getGoldPlanFeatures(tenantType)
```

**Sandbox expiry** — Free workspaces get `subscription.free_sandbox_expires_at` (`0113_free_sandbox_expiry.sql`, default 7 days from `platform_setting.free_sandbox_days`). After expiry, `billingAccessMiddleware` locks writes (402); most GETs remain read-only except sensitive exports/reports.

**Hidden limit** — `scheduled_order_grace_per_day` lets scheduled quick-lists overflow the daily order cap once per day on Free; it is enforced but hidden from the entitlements UI (`HIDDEN_ENTITLEMENT_LIMIT_KEYS`).

---

## Feature keys

Canonical keys live in `apps/api/src/lib/feature-keys.js`.

### Restaurant (26 keys)

`chat`, `order_calendar`, `reports`, `smart_reorder`, `multi_branch`, `receiving_quality`, `disputes_returns`, `finance_invoices`, `quick_lists`, `inventory_management`, `waste_tracking`, `advanced_roles`, `notifications`, `api_integrations`, `support_sla`, `custom_branding`, `feature_flags_access`, `supplier_reviews`, `push_notifications`, `order_amendments`, `tenant_audit_log`, `waitlist_auto_promo`, `supplier_deals`, `supplier_deals_redeem`, `fulfillment_tools`, `ai_platform`

### Supplier (24 keys)

`chat`, `order_calendar`, `reports`, `multi_branch`, `warehouses`, `multi_warehouse`, `fulfillment_tools`, `fulfillment`, `driver_management`, `disputes_returns`, `finance_invoices`, `quick_lists`, `inventory_management`, `advanced_roles`, `notifications`, `api_integrations`, `support_sla`, `custom_branding`, `feature_flags_access`, `promotions`, `push_notifications`, `order_amendments`, `tenant_audit_log`, `supplier_growth`

**Enabled semantics** — A feature is **on** when its plan value is `true` or a non-empty tier string (not `false`, `disabled`, or `""`). Same rule in API (`evaluatePlanFeatureValue`) and web (`planLimits.ts`).

---

## Limit keys

From `apps/api/src/lib/limit-resolution.js`.

### Restaurant limits (15 keys)

| Key                             | Meaning                                     |
| ------------------------------- | ------------------------------------------- |
| `branches`                      | Active branch locations                     |
| `users`                         | Primary contact + `restaurant_team` rows    |
| `orders_per_day`                | `PLACED` orders today                       |
| `suppliers_per_restaurant`      | `supplier_follow` count                     |
| `restaurant_inventory_skus`     | Distinct SKUs in `restaurant_inventory`     |
| `chats_per_day`                 | Daily chat meter                            |
| `open_conversations`            | Non-archived conversations                  |
| `storage_mb`                    | Cumulative file storage                     |
| `quick_lists`                   | Quick list count                            |
| `quick_list_items`              | Items across all quick lists                |
| `scheduled_quick_lists`         | Lists with `is_scheduled = true`            |
| `scheduled_order_grace_per_day` | Hidden overflow for scheduled orders (Free) |
| `deal_redemptions_per_day`      | Supplier deal redemptions                   |
| `ai_requests_per_day`           | LLM reorder assistant calls (`0167`)        |

### Supplier limits (9 keys)

| Key                      | Meaning                               |
| ------------------------ | ------------------------------------- |
| `branches`               | Active branch locations               |
| `warehouses`             | Active warehouses (`0` = feature off) |
| `users`                  | Supplier contact (always 1)           |
| `supplier_products_skus` | Products in catalog                   |
| `chats_per_day`          | Daily chat meter                      |
| `open_conversations`     | Non-archived conversations            |
| `storage_mb`             | Cumulative file storage               |
| `promotions`             | Non-expired promotions                |

**Unlimited** — Limit value `-1` or `null` in plan JSON means no cap (`formatPlanLimitDisplay` → `unlimited`).

**Resolution order** — `resolveEffectiveLimit()` / `resolveAllEffectiveLimits()`: plan default → plan override (`plan_limit_override`, increase-only) → tenant override (`tenant_limit_override`, increase-only) → branch/warehouse addons (`subscription-addons.js`).

**Free fallbacks** — If plan JSON omits keys on Free, `FREE_TIER_LIMIT_PATCHES` and `fillMissingFreeTierLimits()` apply canonical caps before enforcement.

---

## Plan limit tables

Values from migrations **0117**, **0119**, **0120**, **0145** (Free), and **0167** (`ai_requests_per_day`). `-1` = unlimited.

### Restaurant limits

| Limit                           | Free Trial | Silver |  Gold  | Platinum |
| ------------------------------- | :--------: | :----: | :----: | :------: |
| `branches`                      |     1      |   1    |   3    |    ∞     |
| `users`                         |     1      |   3    |   15   |    ∞     |
| `orders_per_day`                |     3      |   20   |  100   |    ∞     |
| `suppliers_per_restaurant`      |     1      |   5    |   30   |    ∞     |
| `restaurant_inventory_skus`     |     10     |  250   | 3,000  |    ∞     |
| `chats_per_day`                 |     3      |   30   |  500   |    ∞     |
| `open_conversations`            |     1      |   5    |   30   |    ∞     |
| `storage_mb`                    |     50     |  500   | 10,240 |  30,720  |
| `quick_lists`                   |     1      |   10   |   50   |    ∞     |
| `quick_list_items`              |     1      |  100   |  500   |    ∞     |
| `scheduled_quick_lists`         |     1      |   3    |   15   |    ∞     |
| `deal_redemptions_per_day`      |     1      |   10   |   50   |    ∞     |
| `scheduled_order_grace_per_day` |     1      |   0    |   0    |    0     |
| `ai_requests_per_day`           |     0      |   0    |   20   |   100    |

### Supplier limits

| Limit                    | Free Trial | Silver |  Gold  | Platinum |
| ------------------------ | :--------: | :----: | :----: | :------: |
| `branches`               |     1      |   1    |   3    |    ∞     |
| `warehouses`             |     0      |   1    |   3    |    ∞     |
| `users`                  |     1      |   3    |   15   |    ∞     |
| `supplier_products_skus` |     10     |  250   | 3,000  |    ∞     |
| `chats_per_day`          |     3      |   30   |  500   |    ∞     |
| `open_conversations`     |     1      |   5    |   30   |    ∞     |
| `storage_mb`             |     50     |  500   | 10,240 |  30,720  |
| `promotions`             |     1      |   3    |   25   |    ∞     |

---

## Restaurant feature × plan matrix

**Free Trial column** = effective gates (Gold features via parity). ✓ = enabled; — = disabled. Tier strings are summarized in the **Tier** column for paid plans.

| Feature                 | Free Trial |        Silver         |          Gold           |               Platinum                |
| ----------------------- | :--------: | :-------------------: | :---------------------: | :-----------------------------------: |
| `chat`                  |     ✓      |   ✓ multi_supplier    |   ✓ group_chat_files    |    ✓ real_time_media_read_receipts    |
| `order_calendar`        |     ✓      |           ✓           |            ✓            |                   ✓                   |
| `reports`               |     ✓      |     ✓ basic_kpis      | ✓ usage_cost_dashboards | ✓ advanced_forecasting_custom_reports |
| `smart_reorder`         |     ✓      |           —           |   ✓ full_90day_trends   |       ✓ ai_forecast_seasonality       |
| `multi_branch`          |     ✓      |           —           |            ✓            |         ✓ central_purchasing          |
| `receiving_quality`     |     ✓      |   ✓ photos_enabled    |    ✓ quality_scoring    |    ✓ supplier_performance_reports     |
| `disputes_returns`      |     ✓      |           ✓           |            ✓            |                   ✓                   |
| `finance_invoices`      |     ✓      |   ✓ record_payments   |   ✓ expense_analytics   |     ✓ advanced_finance_dashboard      |
| `quick_lists`           |     ✓      |  ✓ automated_weekly   |     ✓ full_schedule     |         ✓ ai_smart_automation         |
| `inventory_management`  |     ✓      |      ✓ real_time      | ✓ multi_branch_tracking |         ✓ lot_expiry_tracking         |
| `waste_tracking`        |     ✓      | ✓ analytics_dashboard |  ✓ analytics_dashboard  |      ✓ cost_percentage_vs_sales       |
| `advanced_roles`        |     ✓      |           —           |            ✓            |                   ✓                   |
| `notifications`         |     ✓      |  ✓ in_app_and_email   |  ✓ email_and_whatsapp   |       ✓ email_whatsapp_webhook        |
| `api_integrations`      |     ✓      |           —           |    ✓ api_key_access     |          ✓ full_api_webhooks          |
| `support_sla`           |     ✓      |    ✓ standard_72h     |     ✓ priority_24h      |         ✓ dedicated_same_day          |
| `custom_branding`       |     ✓      |           —           |      ✓ logo_colors      |         ✓ white_label_domain          |
| `feature_flags_access`  |     ✓      |           —           |     ✓ addon_toggles     |          ✓ all_experimental           |
| `supplier_reviews`      |     ✓      |           ✓           |            ✓            |                   ✓                   |
| `push_notifications`    |     ✓      |           ✓           |            ✓            |                   ✓                   |
| `order_amendments`      |     ✓      |           ✓           |            ✓            |                   ✓                   |
| `tenant_audit_log`      |     ✓      |           —           |            ✓            |                   ✓                   |
| `waitlist_auto_promo`   |     ✓      |           —           |            ✓            |                   ✓                   |
| `supplier_deals`        |     ✓      |           ✓           |            ✓            |                   ✓                   |
| `supplier_deals_redeem` |     ✓      |           ✓           |            ✓            |                   ✓                   |
| `fulfillment_tools`     |     —      |           —           |            —            |                   —                   |
| `ai_platform`           |     ✓      |           —           |            ✓            |                   ✓                   |

> `waste_tracking` on Silver is `analytics_dashboard` per `0145` (overrides `0117` `manual_entry`). `fulfillment_tools` is intentionally off for restaurants on all tiers (`0117`–`0120`).

---

## Supplier feature × plan matrix

| Feature                | Free Trial |          Silver          |          Gold           |               Platinum                |
| ---------------------- | :--------: | :----------------------: | :---------------------: | :-----------------------------------: |
| `chat`                 |     ✓      |     ✓ multi_supplier     |   ✓ group_chat_files    |    ✓ real_time_media_read_receipts    |
| `order_calendar`       |     ✓      |            ✓             |            ✓            |                   ✓                   |
| `reports`              |     ✓      |       ✓ basic_kpis       | ✓ usage_cost_dashboards | ✓ advanced_forecasting_custom_reports |
| `multi_branch`         |     ✓      |            —             |            ✓            |                   ✓                   |
| `warehouses`           |     ✓      |            ✓             |            ✓            |                   ✓                   |
| `multi_warehouse`      |     ✓      |            —             |            ✓            |                   ✓                   |
| `fulfillment_tools`    |     ✓      | ✓ manual_orders_invoices |  ✓ warehouse_pick_pack  |         ✓ routing_full_suite          |
| `fulfillment`          |     ✓      |            ✓             |            ✓            |                   ✓                   |
| `driver_management`    |     ✓      |            —             |            ✓            |                   ✓                   |
| `disputes_returns`     |     ✓      |            ✓             |            ✓            |                   ✓                   |
| `finance_invoices`     |     ✓      |    ✓ record_payments     |   ✓ expense_analytics   |     ✓ advanced_finance_dashboard      |
| `quick_lists`          |     —      |            —             |            —            |                   —                   |
| `inventory_management` |     ✓      |       ✓ real_time        | ✓ multi_branch_tracking |         ✓ lot_expiry_tracking         |
| `advanced_roles`       |     ✓      |            —             |            ✓            |                   ✓                   |
| `notifications`        |     ✓      |    ✓ in_app_and_email    |  ✓ email_and_whatsapp   |       ✓ email_whatsapp_webhook        |
| `api_integrations`     |     ✓      |            —             |    ✓ api_key_access     |          ✓ full_api_webhooks          |
| `support_sla`          |     ✓      |      ✓ standard_72h      |     ✓ priority_24h      |         ✓ dedicated_same_day          |
| `custom_branding`      |     ✓      |            —             |      ✓ logo_colors      |         ✓ white_label_domain          |
| `feature_flags_access` |     ✓      |            —             |     ✓ addon_toggles     |          ✓ all_experimental           |
| `promotions`           |     ✓      |            ✓             |            ✓            |                   ✓                   |
| `push_notifications`   |     ✓      |            ✓             |            ✓            |                   ✓                   |
| `order_amendments`     |     ✓      |            ✓             |            ✓            |                   ✓                   |
| `tenant_audit_log`     |     ✓      |            —             |            ✓            |                   ✓                   |
| `supplier_growth`      |     ✓      |            ✓             |            ✓            |                   ✓                   |

> Free Trial includes `supplier_growth` via Gold parity (`0175`). `quick_lists` is not seeded on supplier plan JSON (key exists in `feature-keys.js` but remains off). `finance_invoices` on Silver+ added by `0144_supplier_finance_invoices_plan_features.sql`.

---

## Enforcement architecture

```mermaid
flowchart TB
  subgraph request [Incoming API request]
    R[Route handler]
  end

  subgraph billing [Account lock — 402]
    BAM[billingAccessMiddleware]
    BAM -->|locked write/sensitive GET| E402[402 Payment Required]
    BAM -->|ok| R
  end

  subgraph feature [Feature gate — 403]
    RF[requireFeature key]
    RF -->|FEATURE_NOT_AVAILABLE| E403F[403 + upgrade payload]
    RF -->|ok| R
  end

  subgraph limit [Limit gate — 403]
    RWL[requireWithinLimit meter]
    RWL -->|LIMIT_EXCEEDED| E403L[403 + upgrade payload]
    RWL -->|ok| R
  end

  subgraph inline [Inline checks]
    CLI[checkLimit / checkAndIncrementUsage]
    CLI -->|daily meters| R
  end

  BAM --> RF
  RF --> RWL
```

### `billingAccessMiddleware` (402)

File: `apps/api/src/middlewares/billingAccess.js`. Mounted globally in `server.js` after auth context, before CSRF.

| Behavior               | Detail                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| **Bypass paths**       | `/api/billing`, `/api/register`, `/auth`, `/health`, `/api/public` |
| **Always-allowed GET** | `/api/subscriptions/entitlements`, `/current`, `/plans`            |
| **Admin**              | Platform `ADMIN` bypasses locks unless **impersonating** a tenant  |
| **Locked account**     | Non-GET → **402** with `buildAccountLockedError`                   |
| **Free Trial expired** | GET allowed (read-only); writes → 402                              |
| **Sensitive GET**      | `/api/reports/*`, any `*/export`, invoice PDF → 402 when locked    |
| **Failure**            | DB error → **503** `BILLING_CHECK_UNAVAILABLE`                     |

### `requireFeature` (403)

File: `apps/api/src/lib/subscription/entitlements.js`.

- Resolves `resolveEffectivePlanFeatures()` (Free → Gold features).
- Applies tenant/global overrides via `resolveFeatureEnabled()` (`feature-flags.js`).
- Feature aliases (e.g. `fulfillment` ↔ `fulfillment_tools`) resolved when primary key is off.
- Response: `FEATURE_NOT_AVAILABLE` + `buildFeatureNotAvailablePayload()` (recommended plans, upgrade URL).
- Records `BLOCKED_FEATURE` conversion event.

**Example mounts** — `disputes.routes.js` → `disputes_returns`; `receiving.routes.js` → `receiving_quality`; `order-amendments.routes.js` → `order_amendments`; `reports.routes.js` → `reports`.

### `requireWithinLimit` (403)

Same file. Calls `checkLimit()` before handler; sets `req.planLimit` on success.

- Response: `LIMIT_EXCEEDED` + `buildLimitExceededPayload()`.
- Records `BLOCKED_LIMIT` conversion event.

**Example mounts** — `branches.routes.js` → `branches`; `warehouses.routes.js` → `warehouses`; `quick-lists.routes.js` → `quick_lists`; `promotions/supplier.js` → `promotions`.

**Atomic daily meters** — `orders_per_day`, `chats_per_day`, `ai_requests_per_day` use `checkAndIncrementUsage()` inside transactions to prevent race overshoot.

### Entitlements API

`GET /api/subscriptions/entitlements` → `getEntitlements()` returns the canonical payload:

- `plan`, `features`, `planFeatures`, `featureSources`, `limits`, `baseLimits`, `usage`, `overrides`, `addons`, `locationLimits`, `freeSandbox`, `smartReorder` (restaurant).

Cached 300s (`entitlements.js`); usage refreshed every 60s on cache hit.

---

## Frontend: `useEntitlements` and `planFeatureGates`

### `useEntitlements`

File: `apps/web/src/hooks/useEntitlements.ts`.

- RTK Query `useGetEntitlementsQuery` → `GET /api/subscriptions/entitlements`.
- Skipped when impersonation context says tenant entitlements should not load (`shouldLoadTenantEntitlements`).
- Returns `{ entitlements, isLoading, error, refetch, user }`.

### `planFeatureGates`

File: `apps/web/src/lib/planFeatureGates.ts`. Thin helpers over `isEntitlementFeatureEnabled()` from `planLimits.ts`:

| Helper                  | Feature key(s)                           |
| ----------------------- | ---------------------------------------- |
| `canUseGlobalReports`   | `reports`                                |
| `canUseFinanceInvoices` | `finance_invoices`                       |
| `canUseSupplierDeals`   | `supplier_deals`                         |
| `canUseFulfillment`     | `fulfillment` **or** `fulfillment_tools` |
| `canUseQuickLists`      | `quick_lists`                            |
| `canUseSupplierGrowth`  | `supplier_growth`                        |

**Resolution rule** (`planLimits.ts`) — checks `entitlements.features[key]` first, then `entitlements.planFeatures[key]` (important for Free Trial where `planFeatures` carries Gold tiers). Matches API `evaluatePlanFeatureValue`.

**UI consumers** — `Sidebar.tsx`, `DashboardWidgetGrid.tsx`, `FulfillmentPage.tsx`, `ReportsPage.tsx`, `InvoicesPage.tsx`, `ProductsPage.tsx`, `BranchDetailPage.tsx`, org overview pages, `BranchContext.tsx`.

When API returns 403/402, RTK base client surfaces monetization errors; `monetization` Redux slice drives upgrade modals.

---

## Subscription lifecycle (brief)

| Concern            | Implementation                                                                       |
| ------------------ | ------------------------------------------------------------------------------------ |
| Default plan       | `ensureTenantSubscription()` creates Free if none (`plans.js`)                       |
| Org billing        | Child branches bill to org root via `resolveOrgBillingTenantId`                      |
| Pending downgrade  | `pending_plan_id` + `pending_effective_at` applied on read                           |
| Cache invalidation | `invalidateTenantSubscriptionCache()` clears sub + entitlements + billing            |
| Recommendations    | `recommendPlan()` — deterministic upsell from blocked limits/features                |
| Bronze alias       | `bronze` → `silver` (`0116_rename_bronze_to_silver.sql`, `LEGACY_PLAN_CODE_ALIASES`) |

---

## Source files (quick index)

| Area                      | Path                                                        |
| ------------------------- | ----------------------------------------------------------- |
| Feature keys              | `apps/api/src/lib/feature-keys.js`                          |
| Limit keys & Free patches | `apps/api/src/lib/limit-resolution.js`                      |
| Plan codes                | `apps/api/src/lib/plan-codes.js`                            |
| Free → Gold features      | `apps/api/src/lib/subscription/free-trial-plan-features.js` |
| Entitlements + middleware | `apps/api/src/lib/subscription/entitlements.js`             |
| Plans & recommendations   | `apps/api/src/lib/subscription/plans.js`                    |
| Billing lock              | `apps/api/src/middlewares/billingAccess.js`                 |
| Feature flag resolution   | `apps/api/src/lib/feature-flags.js`                         |
| Web gates                 | `apps/web/src/lib/planFeatureGates.ts`, `planLimits.ts`     |
| Web hook                  | `apps/web/src/hooks/useEntitlements.ts`                     |
| Migrations                | `0117`, `0119`, `0120`, `0145`, `0167`, `0175`              |
