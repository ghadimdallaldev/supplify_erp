# Platinum Tier Limits & Pricing Proposal

**Status:** **Approved and implemented** in migration `0120_platinum_tier_limits_features.sql` (2026-05-28). Catalog-only features documented in [PLATINUM_CATALOG_ONLY_FEATURES.md](./PLATINUM_CATALOG_ONLY_FEATURES.md).  
**Scope:** Platinum (`platinum`) for **RESTAURANT** and **SUPPLIER** only.  
**Out of scope:** Free Trial, Silver, Gold, deals/promotions **business logic**, reservations gating, report route tier differentiation, pricing implementation.  
**Evidence date:** 2026-05-28 — live catalog via `pnpm run log:tier-limits` (migrations through `0119`; Platinum not modified by `0117` / `0119`).

---

## Executive summary

Platinum is the **top self-serve** tier at **$349/mo** and is positioned as “never think about limits.” Operationally it delivers that: almost all canonical meters are **`-1` (unlimited)** with **20 GB** storage as the main finite cap. After Silver (`0117`) and Gold (`0119`) were explicitly re-tiered, Platinum is still largely the **original `0022` seed** plus patch migrations (`0094`, `0099`, `0115`, etc.) — not a cohesive catalog row like Gold.

**The upgrade problem:** Gold now offers most **route-gated** capabilities (smart reorder, advanced roles, audit log, multi-branch, API key string, branding, etc.) with finite but high caps. Platinum’s **+$200/mo** step is justified mainly by **unlimited meters**, **2× storage vs Gold**, and **marketing feature strings** — but many of those strings are **not enforced differently** in code today (reports, smart reorder, finance, receiving, waste on restaurant, webhooks, AI quick lists, central purchasing, chat read receipts).

**Recommendation (high level):** Keep Platinum as the **unlimited operational** tier and **white-label** tier in JSON; run a **`0120`-style full catalog migration** to normalize limits/features, fix **restaurant `waste_tracking` drift** (`0115` overwrote Platinum with Gold’s value), remove legacy limit keys (`restaurants`, `warehouses` on restaurant rows), and **hold $349/mo** until product implements tier-differentiated enforcement for AI, webhooks, and advanced dashboards. Optionally raise storage to **30–50 GB** to widen gap vs Gold **10 GB** without touching Enterprise **100 GB**.

---

## Enforcement model (read this first)

`requireFeature(key)` and `isFeatureEnabled()` use `evaluatePlanFeatureValue()`:

- `true` or any **non-empty string** except `"false"` / `"disabled"` → **enabled**
- Tier-specific strings (e.g. `basic_kpis` vs `advanced_forecasting_custom_reports`) are **not compared** in route handlers — only on/off matters unless separate code reads the string (rare).

| Feature key            | Routed / used?                                   | Tier string changes behavior today? | Notes                                                                                                                          |
| ---------------------- | ------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `reports`              | Yes (`reports.routes.js`)                        | **No** — boolean gate only          | Gold & Platinum both pass                                                                                                      |
| `smart_reorder`        | Yes (`restaurant-inventory` reorder-suggestions) | **No**                              | `full_90day_trends` vs `ai_forecast_seasonality` identical access                                                              |
| `waste_tracking`       | Yes (`reports.routes.js` waste endpoints)        | **No** — boolean gate only          | Restaurant Platinum DB = `analytics_dashboard` (same as Gold) due to `0115`                                                    |
| `receiving_quality`    | Yes (`receiving.routes.js`)                      | **No**                              | `quality_scoring` vs `supplier_performance_reports` identical access                                                           |
| `finance_invoices`     | Yes (`invoices`, `restaurant-finance`)           | **No**                              | `expense_analytics` vs `advanced_finance_dashboard` identical access                                                           |
| `quick_lists`          | Yes (`quick-lists.routes.js`)                    | **Partial**                         | `isQuickListAutomationEnabled()` — any enabled string allows scheduling; **no AI-specific path** for `ai_smart_automation`     |
| `chat`                 | Chat routes (not tier-string aware)              | **No**                              | `real_time_media_read_receipts` not referenced in app code found                                                               |
| `api_integrations`     | **No dedicated public API route gate**           | **No**                              | `full_api_webhooks` vs `api_key_access` is catalog/marketing only today                                                        |
| `notifications`        | Yes (`notification.service.js`)                  | **Partial**                         | `resolveAllowedChannels`: `email_whatsapp_webhook` adds **in_app, email, whatsapp** only — **webhook channel not implemented** |
| `custom_branding`      | Yes (restaurant/supplier settings PATCH)         | **Partial (UI copy only)**          | `canUseCustomBranding()` is boolean; `white_label_domain` only changes upgrade-card caption, not separate domain product       |
| `multi_branch`         | Yes (branches, org, invitations)                 | **No**                              | `central_purchasing` (Platinum) is truthy like `true` (Gold)                                                                   |
| `multi_warehouse`      | Yes (supplier)                                   | **No**                              | Gold & Platinum both on                                                                                                        |
| `driver_management`    | Yes (supplier)                                   | **No**                              | Gold & Platinum both on                                                                                                        |
| `tenant_audit_log`     | Yes                                              | **No**                              | Gold & Platinum both on                                                                                                        |
| `advanced_roles`       | Yes                                              | **No**                              | Gold & Platinum both on                                                                                                        |
| `feature_flags_access` | Admin / platform                                 | **Unclear for tenants**             | String differs (`addon_toggles` vs `all_experimental`) but no tenant self-serve UI found                                       |
| `fulfillment_tools`    | Supplier fulfillment (alias `fulfillment`)       | **No**                              | `warehouse_pick_pack` vs `routing_full_suite` — boolean via alias                                                              |
| `support_sla`          | **Not enforced in product**                      | **No**                              | Ops/commercial only                                                                                                            |
| `waitlist_auto_promo`  | Yes                                              | **No**                              | Gold & Platinum both on                                                                                                        |

---

## 1. Current Platinum restaurant features

Source: live `subscription_plan` `code = 'platinum'`, `tenant_type = 'RESTAURANT'`.

| Feature key                                | Current value                         | vs Gold (`0119`)                                       |
| ------------------------------------------ | ------------------------------------- | ------------------------------------------------------ |
| `chat`                                     | `real_time_media_read_receipts`       | `group_chat_files`                                     |
| `order_calendar`                           | on                                    | on                                                     |
| `quick_lists`                              | `ai_smart_automation`                 | `full_schedule`                                        |
| `inventory_management`                     | `lot_expiry_tracking`                 | `multi_branch_tracking`                                |
| `waste_tracking`                           | `analytics_dashboard` ⚠️              | same (should be `cost_percentage_vs_sales` per `0022`) |
| `receiving_quality`                        | `supplier_performance_reports`        | `quality_scoring`                                      |
| `finance_invoices`                         | `advanced_finance_dashboard`          | `expense_analytics`                                    |
| `reports`                                  | `advanced_forecasting_custom_reports` | `usage_cost_dashboards`                                |
| `smart_reorder`                            | `ai_forecast_seasonality`             | `full_90day_trends`                                    |
| `multi_branch`                             | `central_purchasing`                  | `true`                                                 |
| `waitlist_auto_promo`                      | on                                    | on                                                     |
| `advanced_roles`                           | on                                    | on                                                     |
| `tenant_audit_log`                         | on                                    | on                                                     |
| `supplier_deals` / `supplier_deals_redeem` | on                                    | on                                                     |
| `supplier_reviews`                         | on                                    | on                                                     |
| `disputes_returns`                         | on                                    | on                                                     |
| `order_amendments`                         | on                                    | on                                                     |
| `push_notifications`                       | on                                    | on                                                     |
| `notifications`                            | `email_whatsapp_webhook`              | `email_and_whatsapp`                                   |
| `api_integrations`                         | `full_api_webhooks`                   | `api_key_access`                                       |
| `feature_flags_access`                     | `all_experimental`                    | `addon_toggles`                                        |
| `custom_branding`                          | `white_label_domain`                  | `logo_colors`                                          |
| `support_sla`                              | `dedicated_same_day`                  | `priority_24h`                                         |
| `fulfillment_tools`                        | `routing_full_suite`                  | `false`                                                |

⚠️ Migration `0115_enable_waste_tracking_free_gold.sql` merged `waste_tracking: analytics_dashboard` onto **all** restaurant tiers including Platinum, overwriting `0022`’s `cost_percentage_vs_sales`.

---

## 2. Current Platinum restaurant limits

| Limit key                       | Platinum (current) |  Gold (`0119`) | Silver (`0117`) |
| ------------------------------- | -----------------: | -------------: | --------------: |
| `branches`                      |     unlimited (-1) |              3 |               1 |
| `users`                         |          unlimited |             15 |               3 |
| `orders_per_day`                |          unlimited |            100 |              20 |
| `suppliers_per_restaurant`      |          unlimited |             30 |               5 |
| `restaurant_inventory_skus`     |          unlimited |          3,000 |             250 |
| `chats_per_day`                 |          unlimited |            500 |              30 |
| `open_conversations`            |          unlimited |             30 |               5 |
| `storage_mb`                    | **20,000 (20 GB)** | 10,240 (10 GB) |             500 |
| `quick_lists`                   |          unlimited |             50 |              10 |
| `quick_list_items`              |          unlimited |            500 |             100 |
| `scheduled_quick_lists`         |          unlimited |             15 |               3 |
| `deal_redemptions_per_day`      |          unlimited |             50 |              10 |
| `scheduled_order_grace_per_day` |         0 (hidden) |              0 |               0 |

**Legacy/extra keys still on row:** `restaurants: -1`, `warehouses: -1` (from `0022`; not in `RESTAURANT_LIMIT_KEYS` — ignored by enforcement/UI canonical list).

---

## 3. Current Platinum supplier features

| Feature key            | Current value                         | vs Gold (`0119`)        |
| ---------------------- | ------------------------------------- | ----------------------- |
| `chat`                 | `real_time_media_read_receipts`       | `group_chat_files`      |
| `order_calendar`       | on                                    | on                      |
| `fulfillment`          | on                                    | on                      |
| `fulfillment_tools`    | `routing_full_suite`                  | `warehouse_pick_pack`   |
| `warehouses`           | on                                    | on                      |
| `multi_warehouse`      | on                                    | on                      |
| `driver_management`    | on                                    | on                      |
| `promotions`           | on                                    | on                      |
| `reports`              | `advanced_forecasting_custom_reports` | `usage_cost_dashboards` |
| `inventory_management` | `lot_expiry_tracking`                 | `multi_branch_tracking` |
| `multi_branch`         | on (boolean)                          | on                      |
| `advanced_roles`       | on                                    | on                      |
| `tenant_audit_log`     | on                                    | on                      |
| `api_integrations`     | `full_api_webhooks`                   | `api_key_access`        |
| `notifications`        | `email_whatsapp_webhook`              | `email_and_whatsapp`    |
| `custom_branding`      | `white_label_domain`                  | `logo_colors`           |
| `feature_flags_access` | `all_experimental`                    | `addon_toggles`         |
| `support_sla`          | `dedicated_same_day`                  | `priority_24h`          |
| `waste_tracking`       | `cost_percentage_vs_sales`            | (n/a on supplier)       |
| `quick_lists`          | `ai_smart_automation`                 | (unset)                 |
| `smart_reorder`        | `ai_forecast_seasonality`             | (legacy on row)         |

Supplier Platinum `multi_branch` is **`true`**, not `central_purchasing` (restaurant-only string in `0022`).

---

## 4. Current Platinum supplier limits

| Limit key                | Platinum (current) | Gold (`0119`) | Silver (`0117`) |
| ------------------------ | -----------------: | ------------: | --------------: |
| `branches`               |          unlimited |             3 |               1 |
| `warehouses`             |          unlimited |             3 |               1 |
| `users`                  |          unlimited |            15 |               3 |
| `supplier_products_skus` |          unlimited |         3,000 |             250 |
| `chats_per_day`          |          unlimited |           500 |              30 |
| `open_conversations`     |          unlimited |            30 |               5 |
| `storage_mb`             |         **20,000** |        10,240 |             500 |
| `promotions`             |          unlimited |            25 |               3 |

---

## 5. Current Platinum price

| Billing | Amount (DB)                               |
| ------- | ----------------------------------------- |
| Monthly | **$349.00**                               |
| Yearly  | **$3,490.00** (≈2 months free vs monthly) |

Display subtitle (`planComparison.ts`): **“Unlimited Ops”**.

**Upgrade economics (self-serve)**

| Step            | Monthly delta          | Primary story in product today                                             |
| --------------- | ---------------------- | -------------------------------------------------------------------------- |
| Gold → Platinum | **+$200** (~2.3× Gold) | Unlimited meters, 20 GB storage, white-label string, “AI/advanced” strings |
| vs Silver       | +$300                  | Full platform gates + unlimited                                            |

---

## 6. What feels too generous (Platinum)

| Area                                                                                       | Why                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unlimited everything operational**                                                       | Appropriate for top tier, but with **weak feature enforcement differentiation**, Gold at $149 delivers most workflows; Platinum can feel like “paying for headroom” only. |
| **20 GB storage vs Gold 10 GB**                                                            | Reasonable 2× step; still far below Enterprise **100 GB** — OK.                                                                                                           |
| **Same route access as Gold** for reports, reorder, waste (restaurant), finance, receiving | Paying $200 more does not unlock new **enforced** surfaces today.                                                                                                         |
| **`email_whatsapp_webhook` without webhooks**                                              | Plan promises webhook notifications; `resolveAllowedChannels` does not enable a webhook channel.                                                                          |
| **`full_api_webhooks` without webhook/API product**                                        | No separate integration surface found; same practical access as Gold’s `api_key_access` for tenants.                                                                      |
| **Free Trial feature parity (`0112`)**                                                     | Out of scope to change, but it inflates perceived Platinum feature exclusivity in trials.                                                                                 |

---

## 7. What feels too restrictive (Platinum)

| Area                                             | Why                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **20 GB storage cap**                            | High-volume chains with chat media and images may hit 20 GB before “unlimited” story feels true; Enterprise at 100 GB is the escape hatch.                         |
| **No soft “fair use” visibility**                | Unlimited `-1` meters give no upgrade path within self-serve except storage; abuse or operational spikes are invisible until custom Enterprise.                    |
| **3-branch Gold vs unlimited Platinum branches** | Clear for 4+ locations, but a 4-branch group must jump $200/mo for branch 4 even if daily orders still fit Gold caps.                                              |
| **Reservations / floor-plan tiers (docs only)**  | [PLANS.md](./PLANS.md) markets Platinum reservations (“Guest intelligence”); **not audited in route gates here** — verify separately before selling on that basis. |

---

## 8. Inconsistencies after Silver (`0117`) and Gold (`0119`)

| Issue                                                                  | Detail                                                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Platinum never got a full-catalog migration**                        | Gold has `0119` idempotent JSON; Platinum is accumulated patches.                                                                 |
| **Restaurant `waste_tracking` wrong on Platinum**                      | `0115` set `analytics_dashboard` on all restaurant tiers — **Platinum matches Gold**, not `cost_percentage_vs_sales` from `0022`. |
| **Tier ladder on storage only**                                        | Gold 10 GB → Platinum 20 GB is clear; all other restaurant meters jump from finite Gold to `-1`.                                  |
| **Legacy limit keys on restaurant Platinum**                           | `restaurants`, `warehouses` in JSON — confusing in admin UI; not enforced via `RESTAURANT_LIMIT_KEYS`.                            |
| **Marketing vs code for AI / webhooks / advanced reports**             | Strings differ by tier; **enforcement does not** — undermines Gold → Platinum narrative.                                          |
| **Supplier `multi_branch` boolean vs restaurant `central_purchasing`** | Asymmetric feature values for same capability family.                                                                             |
| **SUBSCRIPTIONS.md / PLANS.md**                                        | Matrix shows Platinum unlimited but does not document enforcement gaps or `0115` waste drift.                                     |
| **Upgrade copy**                                                       | Some limits still point at Gold for headroom; Platinum story under-articulated in `upgradeCopy.ts`.                               |

---

## 9. Recommended Platinum limits

**Principle:** Platinum = **unlimited operational scale** (explicit `-1` on all canonical keys) + **higher storage** than Gold; optional **very high soft caps** only if product wants abuse guardrails (not recommended for v1).

### Restaurant (recommended)

| Limit key                       |                                   Recommended | vs Gold (`0119`) |
| ------------------------------- | --------------------------------------------: | ---------------- |
| `branches`                      |                            **-1** (unlimited) | ↑                |
| `users`                         |                                        **-1** | ↑                |
| `orders_per_day`                |                                        **-1** | ↑                |
| `suppliers_per_restaurant`      |                                        **-1** | ↑                |
| `restaurant_inventory_skus`     |                                        **-1** | ↑                |
| `chats_per_day`                 |                                        **-1** | ↑                |
| `open_conversations`            |                                        **-1** | ↑                |
| `storage_mb`                    | **30,720** (30 GB) or keep **20,480** (20 GB) | ↑                |
| `quick_lists`                   |                                        **-1** | ↑                |
| `quick_list_items`              |                                        **-1** | ↑                |
| `scheduled_quick_lists`         |                                        **-1** | ↑                |
| `deal_redemptions_per_day`      |                                        **-1** | ↑                |
| `scheduled_order_grace_per_day` |                                         **0** | same             |

**Remove from JSON:** `restaurants`, `warehouses` (legacy; not canonical for restaurants).

### Supplier (recommended)

| Limit key                |                      Recommended | vs Gold (`0119`) |
| ------------------------ | -------------------------------: | ---------------- |
| `branches`               |                           **-1** | ↑                |
| `warehouses`             |                           **-1** | ↑                |
| `users`                  |                           **-1** | ↑                |
| `supplier_products_skus` |                           **-1** | ↑                |
| `chats_per_day`          |                           **-1** | ↑                |
| `open_conversations`     |                           **-1** | ↑                |
| `storage_mb`             | **30,720** (30 GB) or **20,480** | ↑                |
| `promotions`             |                           **-1** | ↑                |

**Optional alternative (not recommended now):** “Unlimited” with fair-use monitoring only — e.g. 10,000 orders/day soft cap — adds complexity without self-serve upgrade path.

---

## 10. Recommended Platinum feature access

Keep Platinum as the **marketing + catalog** superset. Split into **enforced today** vs **catalog-only until built**.

### Enforced today (keep on Platinum; same binary access as Gold unless noted)

- `advanced_roles`, `tenant_audit_log`, `waitlist_auto_promo`, `multi_branch`, `supplier_deals`, `supplier_reviews`, `disputes_returns`, `order_calendar`, `order_amendments`, `push_notifications`
- `reports`, `smart_reorder`, `waste_tracking`, `receiving_quality`, `finance_invoices` (boolean — **implement tier-specific behavior later**)
- Supplier: `fulfillment`, `warehouses`, `multi_warehouse`, `driver_management`, `promotions`
- `custom_branding`: **`white_label_domain`** (keep string for UI/upgrade modal; **build** custom domain product separately)

### Catalog strings to keep (justify Platinum; **requires engineering** to enforce)

| Key                            | Recommended value                     | Build needed                                                     |
| ------------------------------ | ------------------------------------- | ---------------------------------------------------------------- |
| `quick_lists`                  | `ai_smart_automation`                 | AI scheduling / suggestions beyond `full_schedule`               |
| `smart_reorder`                | `ai_forecast_seasonality`             | Model tier above 90-day heuristics                               |
| `reports`                      | `advanced_forecasting_custom_reports` | Custom report builder / forecast APIs                            |
| `waste_tracking` (restaurant)  | **`cost_percentage_vs_sales`**        | Fix DB + cost-vs-sales UI                                        |
| `receiving_quality`            | `supplier_performance_reports`        | Supplier scorecards in receiving                                 |
| `finance_invoices`             | `advanced_finance_dashboard`          | Advanced finance widgets                                         |
| `inventory_management`         | `lot_expiry_tracking`                 | Lot/expiry fields and reports                                    |
| `api_integrations`             | `full_api_webhooks`                   | Public API keys + outbound webhooks                              |
| `notifications`                | `email_whatsapp_webhook`              | Implement webhook channel in `resolveAllowedChannels` + delivery |
| `chat`                         | `real_time_media_read_receipts`       | Read receipts / rich media in chat                               |
| `multi_branch` (restaurant)    | `central_purchasing`                  | Central purchasing workflows                                     |
| `fulfillment_tools` (supplier) | `routing_full_suite`                  | Full routing vs pick/pack                                        |
| `feature_flags_access`         | `all_experimental`                    | Tenant-visible experimental toggles (if desired)                 |

### Keep off Platinum JSON

- `approvals_budgets` — removed product-wide (`0114`); do not reintroduce.

---

## 11. Recommended Platinum price

| Option              |  Monthly |     Yearly | When                                                                        |
| ------------------- | -------: | ---------: | --------------------------------------------------------------------------- |
| **A (recommended)** | **$349** | **$3,490** | Catalog normalization only; unlimited limits; fix waste string              |
| B                   |     $379 |     $3,790 | If storage raised to 30 GB **and** 1–2 enforced Platinum-only features ship |
| C                   |     $399 |     $3,990 | After webhooks + AI reorder differentiation ship                            |

**Recommendation:** **Option A — hold $349** until enforced differentiation exists; otherwise price increase risks churn without new capability.

**Gold → Platinum justification at $349 (honest):**

| Buyer gets today (enforced)                                   | Buyer does _not_ get yet (strings only)          |
| ------------------------------------------------------------- | ------------------------------------------------ |
| Unlimited orders, users, SKUs, suppliers, chats, lists, deals | AI forecast, custom reports, webhooks            |
| 20 GB (or 30 GB if adopted) storage vs 10 GB Gold             | White-label domain hosting                       |
| White-label branding flag in settings                         | Read receipts / real-time chat                   |
| Same core feature gates as Gold                               | Central purchasing, lot/expiry, advanced finance |

---

## 12. Reasons for each recommendation

| Recommendation                                                | Reason                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Keep unlimited `-1` meters                                    | Matches “Unlimited Ops” subtitle and Platinum positioning                 |
| Fix restaurant `waste_tracking` to `cost_percentage_vs_sales` | Restores intended Platinum vs Gold differentiation in catalog             |
| Remove legacy `restaurants` / `warehouses` limit keys         | Reduces admin confusion; enforcement ignores them                         |
| Full JSON migration (`0120` style)                            | Same maintainability win as `0117` / `0119`                               |
| Hold $349 until code catches up                               | Avoid charging premium for strings without behavior                       |
| Optional 30 GB storage                                        | Clearer material benefit vs Gold without competing with Enterprise 100 GB |
| Document enforcement gaps                                     | Sales and support must not promise webhooks/AI until built                |
| Defer soft caps                                               | Self-serve Platinum should feel unlimited; Enterprise handles contracts   |

---

## 13. Risks of each recommendation

| Change                              | Risk                                             | Mitigation                                                                       |
| ----------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| Unlimited meters                    | Abuse, noisy neighbors, support load             | Monitor usage; Enterprise + overrides for outliers                               |
| Fix waste_tracking string           | UI may expose cost-vs-sales before backend ready | Gate widgets on string value in frontend when implementing                       |
| Remove legacy keys                  | External integrations reading raw plan JSON      | Grep consumers; migration only removes unused keys                               |
| Raise storage to 30 GB              | Infra cost                                       | Still << Enterprise 100 GB                                                       |
| Keep $349 with weak differentiation | Low Gold → Platinum conversion                   | Roadmap enforcement; interim sales focus on unlimited + storage + white-label UI |
| Implement webhooks later            | Customers expect immediately if marketed         | Update PLANS.md after ship; don’t market until live                              |
| `central_purchasing` string         | Implies feature not built                        | Rename to `true` until built, or build purchasing hub                            |

---

## 14. Exact DB JSON changes needed (do not apply)

Proposed migration: `0120_platinum_tier_limits_features.sql` (illustrative). Full replace; idempotent `WHERE code = 'platinum'`. **Pricing lines included for pinning only** — user asked not to change pricing yet.

### RESTAURANT Platinum

```sql
UPDATE subscription_plan
SET
  limits = '{
    "branches": -1,
    "users": -1,
    "orders_per_day": -1,
    "suppliers_per_restaurant": -1,
    "restaurant_inventory_skus": -1,
    "chats_per_day": -1,
    "open_conversations": -1,
    "storage_mb": 20480,
    "quick_lists": -1,
    "quick_list_items": -1,
    "scheduled_quick_lists": -1,
    "deal_redemptions_per_day": -1,
    "scheduled_order_grace_per_day": 0
  }'::jsonb,
  features = '{
    "chat": "real_time_media_read_receipts",
    "order_calendar": true,
    "quick_lists": "ai_smart_automation",
    "receiving_quality": "supplier_performance_reports",
    "disputes_returns": true,
    "finance_invoices": "advanced_finance_dashboard",
    "inventory_management": "lot_expiry_tracking",
    "supplier_deals": true,
    "supplier_deals_redeem": true,
    "supplier_reviews": true,
    "order_amendments": true,
    "notifications": "email_whatsapp_webhook",
    "push_notifications": true,
    "reports": "advanced_forecasting_custom_reports",
    "multi_branch": "central_purchasing",
    "custom_branding": "white_label_domain",
    "tenant_audit_log": true,
    "smart_reorder": "ai_forecast_seasonality",
    "waste_tracking": "cost_percentage_vs_sales",
    "waitlist_auto_promo": true,
    "advanced_roles": true,
    "api_integrations": "full_api_webhooks",
    "feature_flags_access": "all_experimental",
    "fulfillment_tools": false,
    "support_sla": "dedicated_same_day"
  }'::jsonb,
  price_per_month = 349.00,
  price_per_year = 3490.00,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type = 'RESTAURANT'
  AND is_active = true;
```

### SUPPLIER Platinum

```sql
UPDATE subscription_plan
SET
  limits = '{
    "branches": -1,
    "warehouses": -1,
    "users": -1,
    "supplier_products_skus": -1,
    "chats_per_day": -1,
    "open_conversations": -1,
    "storage_mb": 20480,
    "promotions": -1
  }'::jsonb,
  features = '{
    "chat": "real_time_media_read_receipts",
    "order_calendar": true,
    "fulfillment": true,
    "fulfillment_tools": "routing_full_suite",
    "warehouses": true,
    "promotions": true,
    "disputes_returns": true,
    "inventory_management": "lot_expiry_tracking",
    "order_amendments": true,
    "notifications": "email_whatsapp_webhook",
    "push_notifications": true,
    "reports": "advanced_forecasting_custom_reports",
    "multi_branch": true,
    "multi_warehouse": true,
    "custom_branding": "white_label_domain",
    "tenant_audit_log": true,
    "driver_management": true,
    "advanced_roles": true,
    "api_integrations": "full_api_webhooks",
    "feature_flags_access": "all_experimental",
    "support_sla": "dedicated_same_day",
    "waste_tracking": "cost_percentage_vs_sales"
  }'::jsonb,
  price_per_month = 349.00,
  price_per_year = 3490.00,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true;

-- Strip approvals_budgets if reappeared
UPDATE subscription_plan
SET features = features - 'approvals_budgets', updated_at = now()
WHERE code = 'platinum'
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER')
  AND features ? 'approvals_budgets';
```

**Optional:** set `storage_mb` to `30720` in both JSON blocks if adopting 30 GB.

**Verify after apply:**

```bash
pnpm run log:tier-limits
```

---

## Comparison matrices

### Restaurant limits (Silver → Gold → Platinum)

| Meter                | Silver |  Gold | Platinum (current) | Platinum (recommended) |
| -------------------- | -----: | ----: | -----------------: | ---------------------: |
| orders/day           |     20 |   100 |                  ∞ |                      ∞ |
| users                |      3 |    15 |                  ∞ |                      ∞ |
| suppliers            |      5 |    30 |                  ∞ |                      ∞ |
| SKUs                 |    250 | 3,000 |                  ∞ |                      ∞ |
| chats/day            |     30 |   500 |                  ∞ |                      ∞ |
| open chats           |      5 |    30 |                  ∞ |                      ∞ |
| storage              | 500 MB | 10 GB |              20 GB |               20–30 GB |
| deal redemptions/day |     10 |    50 |                  ∞ |                      ∞ |

### Gold → Platinum: what actually changes in code today

| Capability          | Gold          | Platinum (enforced?)                 |
| ------------------- | ------------- | ------------------------------------ |
| Daily order cap     | 100           | Unlimited ✅                         |
| User cap            | 15            | Unlimited ✅                         |
| SKU cap             | 3,000         | Unlimited ✅                         |
| Storage             | 10 GB         | 20 GB ✅                             |
| Reports route       | On            | On (same)                            |
| Smart reorder route | On            | On (same)                            |
| Branding settings   | Logo + colors | Enabled (same gate; caption differs) |
| Outbound webhooks   | No            | **No** (string only)                 |

---

## Enterprise (inactive) — future split

`enterprise` plan: **`is_active = false`**, `requires_admin_assignment = true`, **$0** in catalog.

| Dimension                   | Platinum (self-serve)    | Enterprise (documented intent)                                                                                |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Storage                     | 20 GB (recommended keep) | **100 GB** in catalog                                                                                         |
| Limits                      | Unlimited `-1`           | Unlimited / contract overrides                                                                                |
| Pricing                     | $349 public              | Custom / off-catalog                                                                                          |
| Onboarding                  | Self-serve               | Admin-assigned ([ENTERPRISE.md](./ENTERPRISE.md))                                                             |
| Feature JSON                | Relatively complete      | Partial / sparse flags (many unset)                                                                           |
| Belongs on Enterprise later | —                        | SSO, dedicated infra, custom SLA, data residency, bespoke limits, manual billing, success manager, legal MSAs |

**Do not** fold Enterprise-only needs into Platinum to avoid a “super-Platinum” with no upsell path.

---

## Approval checklist

- [ ] Accept recommended limits (section 9) or adjust storage (20 vs 30 GB)
- [ ] Accept feature JSON (section 10) including `waste_tracking` fix for restaurant
- [ ] Confirm price **Option A / B / C** (section 11)
- [ ] Approve SQL in section 14 (or edited values)
- [ ] Separate engineering epic: enforce tier strings (webhooks, AI, reports, finance, chat)
- [ ] Excluded: Free, Silver, Gold, Enterprise implementation, deals logic, reservations, report routes

---

_Generated from live `subscription_plan` catalog. Re-run `pnpm run log:tier-limits` after any migration._
