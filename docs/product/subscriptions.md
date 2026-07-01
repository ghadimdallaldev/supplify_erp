# Subscriptions and plan catalogs

Plans are split by **tenant type**: each of Free, Silver, Gold, and Platinum exists as separate rows for **RESTAURANT** and **SUPPLIER** (`subscription_plan.code`). Limit keys are normalized per tenant type.

**Canonical source (live DB):** migrations `0116_rename_bronze_to_silver.sql`, `0117_silver_tier_limits_features.sql`, `0119_gold_tier_limits_features.sql`, `0120_platinum_tier_limits_features.sql`, `0131_free_trial_deal_redemptions.sql`. Verify anytime with `pnpm run log:tier-limits`.

**Platinum catalog-only strings:** Several Platinum feature values are marketing/catalog until implemented — see [PLATINUM_CATALOG_ONLY_FEATURES.md](./PLATINUM_CATALOG_ONLY_FEATURES.md).

## Free Trial (plan code `free`)

- **User-facing name:** Free Trial (not “forever free”).
- **Duration:** `subscription.free_sandbox_expires_at`; default length from `platform_setting.free_sandbox_days` (**30**, admin-configurable **7–90**).
- **During trial:** Broad sandbox features (`0112` parity with Gold feature JSON) with **low plan limits** still enforced.
- **After expiry:** `lock_reason = 'free_sandbox_expired'` — **GET** APIs read-only; **writes 402**; billing/upgrade still available.
- **Admin:** `POST …/extend-free-trial`, unlock extends expiry for expired trials.

Details: [free-trial-expiry.md](../features/free-trial-expiry.md).

## Supplier growth program (referral & sponsorship)

Suppliers can import restaurant customers, send connection requests to existing tenants, invite or sponsor new restaurants, and earn rewards when referrals convert to paid plans. Referred restaurants use the same **30-day Free Trial** plus an admin-configurable **first-paid discount**.

- **Spec:** [supplier-customer-growth.md](../features/supplier-customer-growth.md)
- **Admin config:** `GET/PATCH /api/admin-dashboard/growth-settings` (`referral_program_config`)
- **Migration:** `0169_supplier_growth_program.sql`

## Limit keys (normalized)

### Restaurant (`RESTAURANT`)

`branches`, `users`, `orders_per_day`, `suppliers_per_restaurant`, `restaurant_inventory_skus`, `chats_per_day`, `open_conversations`, `storage_mb`, `quick_lists`, `quick_list_items`, `scheduled_quick_lists`, `deal_redemptions_per_day`, `scheduled_order_grace_per_day` (hidden from entitlements UI).

**Not applicable on restaurants:** `promotions` (supplier-only meter for active deal count). Restaurants use **`deal_redemptions_per_day`** for marketplace deal caps.

### Supplier (`SUPPLIER`)

`branches`, `warehouses`, `users`, `supplier_products_skus`, `chats_per_day`, `open_conversations`, `storage_mb`, `promotions`.

Legacy key `products` was replaced by `restaurant_inventory_skus` / `supplier_products_skus`.

## Silver tier ($49/mo, $490/yr) — current catalog

### Restaurant Silver

| Limit                     | Value |
| ------------------------- | ----: |
| branches                  |     1 |
| users                     |     3 |
| orders_per_day            |    20 |
| suppliers_per_restaurant  |     5 |
| restaurant_inventory_skus |   250 |
| chats_per_day             |    30 |
| open_conversations        |     5 |
| storage_mb                |   500 |
| quick_lists               |    10 |
| quick_list_items          |   100 |
| scheduled_quick_lists     |     3 |
| deal_redemptions_per_day  |    10 |

**Features on:** `chat`, `order_calendar`, `quick_lists` (automated_weekly), `receiving_quality` (photos), `disputes_returns`, `finance_invoices` (record_payments), `inventory_management`, `supplier_deals`, `supplier_reviews`, `order_amendments`, `notifications`, `push_notifications`, `reports` (`basic_kpis` — route gate is boolean; tier strings not differentiated in API yet).

**Features off:** `smart_reorder`, `waitlist_auto_promo`, `advanced_roles`, `tenant_audit_log`, `custom_branding`, `multi_branch`, `api_integrations`, `feature_flags_access`, `fulfillment_tools`.

### Supplier Silver

| Limit                  |            Value |
| ---------------------- | ---------------: |
| branches               |                1 |
| users                  |                3 |
| supplier_products_skus |              250 |
| warehouses             |                1 |
| chats_per_day          |               30 |
| open_conversations     |                5 |
| storage_mb             |              500 |
| promotions             | 3 (active deals) |

**Features on:** `chat`, `order_calendar`, `fulfillment`, `fulfillment_tools` (manual), `warehouses`, `promotions`, `disputes_returns`, `inventory_management`, `order_amendments`, `notifications`, `push_notifications`, `reports` (`basic_kpis`).

**Features off:** `driver_management`, `multi_warehouse`, `advanced_roles`, `tenant_audit_log`, `custom_branding`, `api_integrations`, `feature_flags_access`.

## Gold tier ($149/mo, $1490/yr) — current catalog

### Restaurant Gold

| Limit                     |          Value |
| ------------------------- | -------------: |
| branches                  |              2 |
| users                     |             15 |
| orders_per_day            |            100 |
| suppliers_per_restaurant  |             30 |
| restaurant_inventory_skus |          3,000 |
| chats_per_day             |            500 |
| open_conversations        |             30 |
| storage_mb                | 10,240 (10 GB) |
| quick_lists               |             50 |
| quick_list_items          |            500 |
| scheduled_quick_lists     |             15 |
| deal_redemptions_per_day  |             50 |
| ai_requests_per_day       |             20 |

**Features on:** `smart_reorder` (`full_90day_trends`), `ai_platform`, `waitlist_auto_promo`, `advanced_roles`, `tenant_audit_log`, `multi_branch`, `reports` (`usage_cost_dashboards`), `api_integrations` (`api_key_access`), `waste_tracking` (`analytics_dashboard`), `custom_branding` (`logo_colors`), `notifications` (`email_and_whatsapp`), plus Silver-equivalent deals/calendar/disputes.

**Smart reorder (Gold):** Deterministic 30/90-day forecasts + `POST /reorder-assistance/explain` (LLM when `ai_platform` + env enabled; else heuristic). No `ask` endpoint (403).

**Features off:** `fulfillment_tools` (restaurant), `feature_flags_access` beyond addon toggles (Platinum: experimental).

### Supplier Gold

| Limit                  |             Value |
| ---------------------- | ----------------: |
| branches               |                 2 |
| warehouses             |                 3 |
| users                  |                15 |
| supplier_products_skus |             3,000 |
| chats_per_day          |               500 |
| open_conversations     |                30 |
| storage_mb             |            10,240 |
| promotions             | 25 (active deals) |

**Features on:** `multi_warehouse`, `driver_management`, `fulfillment_tools` (`warehouse_pick_pack`), `advanced_roles`, `tenant_audit_log`, `multi_branch`, `reports` (`usage_cost_dashboards`), `api_integrations` (`api_key_access`), `custom_branding` (`logo_colors`).

## Platinum tier ($349/mo, $3490/yr) — current catalog

Top self-serve tier: most operational meters **unlimited** (`-1`), but **branches are capped at 3** (add-ons available). **30 GB** storage (`30720` MB). Pricing unchanged.

### Restaurant Platinum

| Limit                         |          Value |
| ----------------------------- | -------------: |
| branches                      |              3 |
| Most other restaurant meters  | unlimited (-1) |
| storage_mb                    | 30,720 (30 GB) |
| scheduled_order_grace_per_day |              0 |
| ai_requests_per_day           |            100 |

**Smart reorder (Platinum):** `smart_reorder` = `ai_forecast_seasonality` — Gold forecasts plus weekday seasonality and 7d/30d trend adjustment; adds `POST /reorder-assistance/ask` for natural-language product matching. LLM gated by `ai_platform` + env; metered via `ai_requests_per_day`.

**Feature strings (see [PLATINUM_CATALOG_ONLY_FEATURES.md](./PLATINUM_CATALOG_ONLY_FEATURES.md)):** Platinum **smart quick lists**, **notification webhooks**, and **custom catalog domains** are enforced (see feature docs). Still catalog-only: `advanced_forecasting_custom_reports`, `full_api_webhooks`, `central_purchasing`, etc. Smart reorder tier strings **are** enforced — see [ai-smart-reorder.md](../features/ai-smart-reorder.md).

### Supplier Platinum

| Limit                                              |          Value |
| -------------------------------------------------- | -------------: |
| branches                                           |              3 |
| warehouses                                         |              5 |
| users, SKUs, chats, open conversations, promotions | unlimited (-1) |
| storage_mb                                         |         30,720 |

**Same catalog-only note** for AI, webhooks, advanced reports, white-label.

## Restaurant plan matrix (summary)

| Plan     | branches | users | orders/day | suppliers |  SKUs | chats/day | open chats | storage |
| -------- | -------: | ----: | ---------: | --------: | ----: | --------: | ---------: | ------: |
| Free     |        1 |     1 |          3 |         1 |    10 |         3 |          1 |   50 MB |
| Silver   |        1 |     3 |         20 |         5 |   250 |        30 |          5 |  500 MB |
| Gold     |        2 |    15 |        100 |        30 | 3,000 |       500 |         30 |   10 GB |
| Platinum |        3 |     ∞ |          ∞ |         ∞ |     ∞ |         ∞ |          ∞ |   30 GB |

**Also (restaurant):** `deal_redemptions_per_day` **1** on Free (migration `0131`), **10** on Silver, **50** on Gold; quick_lists **50**, quick_list_items **500**, scheduled_quick_lists **15** on Gold — see [PLANS.md](./PLANS.md).

**Branches** = org-wide active location accounts (main + linked). **Add-ons** (Gold/Platinum only): see [FINAL_TIER_MATRIX.md](./FINAL_TIER_MATRIX.md) §5b. Effective limit = included + add-ons + overrides. Hard cap: **6 branches** → Enterprise.

**Warehouses (supplier):** org-wide active warehouse count; restaurants have no warehouse limit.

**chats_per_day** = messages **sent** per day (`POST …/messages`).

## Supplier plan matrix (summary)

| Plan     | branches | warehouses | users |  SKUs | chats/day | promotions (active deals) | storage |
| -------- | -------: | ---------: | ----: | ----: | --------: | ------------------------: | ------: |
| Free     |        1 |          0 |     1 |    10 |         3 |                         1 |   50 MB |
| Silver   |        1 |          1 |     3 |   250 |        30 |                         3 |  500 MB |
| Gold     |        2 |          3 |    15 | 3,000 |       500 |                        25 |   10 GB |
| Platinum |        3 |          5 |     ∞ |     ∞ |         ∞ |                         ∞ |   30 GB |

## Tier logger / admin display

- **Explicit `-1`** in plan JSON → unlimited.
- **Missing key** on a plan row → tier logger shows **`n/a`** (not unlimited). Restaurant plans do not include `promotions` in limits JSON.
- **Admin plan cards** show only keys present in `subscription_plan.limits` JSON.

## Enforcement

- **Feature entitlements:** `requireFeature(featureKey)` → **403** `FEATURE_NOT_AVAILABLE` when disabled on plan (and not overridden).
- **Limits:** `checkLimit()` / `requireWithinLimit()` → **403** `LIMIT_EXCEEDED`. Non-applicable meters (e.g. `promotions` on restaurants) return `notApplicable` without treating as unlimited.
- **Permissions:** RBAC on routes (see [FEATURE_CATALOG.md](../product/FEATURE_CATALOG.md)).
- **Subscription cache:** 30s TTL; invalidated on plan/checkout/admin changes.

Gated feature keys include: `chat`, `quick_lists`, `receiving_quality`, `finance_invoices`, `inventory_management`, `reports`, `disputes_returns`, `promotions` (supplier), `supplier_deals` (restaurant), `tenant_audit_log`, `push_notifications`, `supplier_reviews`, `order_amendments`, `fulfillment`, `driver_management`, `warehouses`, `multi_warehouse`, `order_calendar`, `advanced_roles`, `waitlist_auto_promo`, `smart_reorder`, `waste_tracking`, etc.

## Enterprise plan

Separate `enterprise` plan; `requires_admin_assignment = true`. See [ENTERPRISE.md](./ENTERPRISE.md).

## Admin

- **Plans tab:** Filter RESTAURANT vs SUPPLIER. Plan **code** for paid entry tier is **`silver`** (legacy API alias `bronze` → `silver` in `plan-codes.js`).
- **Subscriptions:** Target plan `tenant_type` must match subscription.

## Deal boost monetization (add-on)

Supplier **deal promotion boosts** (paid visibility) use `promotion_pricing_config` / `deal_promotions` — separate from plan `promotions` limit (active deal count). Boost checkout may be stubbed (`waivePayment: true`) for testing.

## Entitlements endpoint

**GET /api/subscriptions/entitlements/current** — plan, features, limits (with overrides), usage, `usageWindowMeta`.

## Plan change preview

**POST /api/admin-dashboard/subscriptions/:id/preview-change** — `willExceed`, `featureDiff`. **PATCH** with `planId` applies change; `allowExceedance` optional.

## Migration notes

- **0044** — `tenant_type`, per-type catalogs.
- **0116** — plan code `bronze` renamed to **`silver`** (display Silver).
- **0117** — Silver limits/features tightened (first paid tier positioning).
- **0119** — Gold limits/features rebalanced (finite caps; feature bundle unchanged vs pre-0119 marketing).
- **0120** — Platinum limits/features normalized (30 GB storage, unlimited meters, waste_tracking fix, legacy keys removed).
- **0169** — Supplier customer growth (import, referrals, sponsorship, billing credits); platform `free_sandbox_days` default **30** (range **7–90**).
- **0063 / 0064** — historical Gold/Silver limit rebalances (superseded for Silver by 0117, Gold by 0119).
