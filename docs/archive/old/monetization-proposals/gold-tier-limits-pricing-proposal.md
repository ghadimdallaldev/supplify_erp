# Gold Tier Limits & Pricing Proposal

**Status:** **Approved and implemented** in migration `0119_gold_tier_limits_features.sql` (2026-05-28).  
**Scope:** Gold (`gold`) for **RESTAURANT** and **SUPPLIER** only.  
**Out of scope:** Free Trial, Silver, Platinum, Enterprise, deals/promotions **business logic**, pricing implementation.  
**Evidence date:** 2026-05-28 — live catalog via `pnpm run log:tier-limits` (migrations through `0117`; Gold not modified by `0117`).

---

## Executive summary

Gold is positioned in marketing as **“Most Popular”** ($149/mo) and should be the default plan for serious operators. After Silver was tightened in migration `0117`, Gold’s **numeric limits** still carry legacy “unlimited” meters (quick lists, deal redemptions, open conversations, supplier promotions) while **caps** on orders (50/day), users (10), and SKUs (1,000) can feel tight for a 3-branch / 3-warehouse customer. That creates a **lumpy ladder**: Silver → Gold jumps feature gates sharply but sometimes only 2.5× on daily orders, while several meters read like Platinum-lite.

**Recommendation (high level):** Keep Gold’s **feature bundle** largely as-is (automation, analytics, multi-location, API keys, advanced roles, audit log). **Re-tier numeric limits** so every meter is strictly **Silver < Gold < Platinum**, with explicit caps replacing silent “unlimited” on mid-tier meters. Consider **$149/mo unchanged** if caps are added; consider **$169/mo** only if product wants to keep several “unlimited” operational meters on Gold.

---

## 1. Current Gold restaurant features

Source: `subscription_plan` row `code = 'gold'`, `tenant_type = 'RESTAURANT'` (live DB).

| Feature key                                | Current value           | Notes                        |
| ------------------------------------------ | ----------------------- | ---------------------------- |
| `chat`                                     | `group_chat_files`      | vs Silver `multi_supplier`   |
| `order_calendar`                           | on                      |                              |
| `quick_lists`                              | `full_schedule`         | vs Silver `automated_weekly` |
| `inventory_management`                     | `multi_branch_tracking` | vs Silver `real_time`        |
| `waste_tracking`                           | `analytics_dashboard`   | vs Silver `manual_entry`     |
| `receiving_quality`                        | `quality_scoring`       | vs Silver `photos_enabled`   |
| `finance_invoices`                         | `expense_analytics`     | vs Silver `record_payments`  |
| `reports`                                  | `usage_cost_dashboards` | vs Silver `basic_kpis`       |
| `smart_reorder`                            | `full_90day_trends`     | **off on Silver**            |
| `waitlist_auto_promo`                      | on                      | **off on Silver**            |
| `advanced_roles`                           | on                      | **off on Silver**            |
| `tenant_audit_log`                         | on                      | **off on Silver**            |
| `multi_branch`                             | on                      | **off on Silver**            |
| `supplier_deals` / `supplier_deals_redeem` | on                      | also on Silver               |
| `supplier_reviews`                         | on                      | also on Silver               |
| `disputes_returns`                         | on                      | also on Silver               |
| `order_amendments`                         | on                      | all tiers                    |
| `push_notifications`                       | on                      | all tiers                    |
| `notifications`                            | `email_and_whatsapp`    | vs Silver `in_app_and_email` |
| `api_integrations`                         | `api_key_access`        | **off on Silver**            |
| `feature_flags_access`                     | `addon_toggles`         | **off on Silver**            |
| `custom_branding`                          | `logo_colors`           | **off on Silver**            |
| `support_sla`                              | `priority_24h`          | vs Silver `standard_72h`     |
| `fulfillment_tools`                        | `warehouse_pick_pack`   | legacy key on restaurant row |

Route gates (representative): `smart_reorder`, `reports` / `waste_tracking`, `multi_branch`, `advanced_roles`, `tenant_audit_log`, `waitlist_auto_promo`, `receiving_quality`, `finance_invoices`, `supplier_deals`.

---

## 2. Current Gold restaurant limits

| Limit key                       | Gold (current)   | Silver (0117) | Platinum (current) |
| ------------------------------- | ---------------- | ------------- | ------------------ |
| `branches`                      | 3                | 1             | unlimited          |
| `users`                         | 10               | 3             | unlimited          |
| `orders_per_day`                | 50               | 20            | unlimited          |
| `suppliers_per_restaurant`      | unlimited (-1)   | 5             | unlimited          |
| `restaurant_inventory_skus`     | 1,000            | 250           | unlimited          |
| `chats_per_day`                 | 200              | 30            | unlimited          |
| `open_conversations`            | unlimited (-1)   | 5             | unlimited          |
| `storage_mb`                    | 5,000 (5 GB)     | 500           | 20,000 (20 GB)     |
| `quick_lists`                   | unlimited (-1)   | 10            | unlimited          |
| `quick_list_items`              | unlimited (-1)   | 100           | unlimited          |
| `scheduled_quick_lists`         | unlimited (-1)   | 3             | unlimited          |
| `deal_redemptions_per_day`      | unlimited (-1)\* | 10            | unlimited          |
| `scheduled_order_grace_per_day` | 0 (hidden)       | 0             | 0                  |

\*Gold never received an explicit `deal_redemptions_per_day` in `0117`; live DB shows **unlimited** (explicit `-1` or treated as unbounded in product). Silver now has an explicit **10/day** cap.

---

## 3. Current Gold supplier features

| Feature key            | Current value           | vs Silver                |
| ---------------------- | ----------------------- | ------------------------ |
| `chat`                 | `group_chat_files`      | `multi_supplier`         |
| `order_calendar`       | on                      | on                       |
| `fulfillment`          | on                      | on                       |
| `fulfillment_tools`    | `warehouse_pick_pack`   | `manual_orders_invoices` |
| `warehouses`           | on                      | on                       |
| `multi_warehouse`      | on                      | **off**                  |
| `driver_management`    | on                      | **off**                  |
| `promotions`           | on                      | on                       |
| `reports`              | `usage_cost_dashboards` | `basic_kpis`             |
| `inventory_management` | `multi_branch_tracking` | `real_time`              |
| `advanced_roles`       | on                      | **off**                  |
| `tenant_audit_log`     | on                      | **off**                  |
| `multi_branch`         | on                      | **off**                  |
| `api_integrations`     | `api_key_access`        | **off**                  |
| `notifications`        | `email_and_whatsapp`    | `in_app_and_email`       |
| `custom_branding`      | `logo_colors`           | **off**                  |
| `feature_flags_access` | `addon_toggles`         | **off**                  |
| `support_sla`          | `priority_24h`          | `standard_72h`           |

---

## 4. Current Gold supplier limits

| Limit key                | Gold (current) | Silver (0117)  | Platinum (current) |
| ------------------------ | -------------- | -------------- | ------------------ |
| `branches`               | 3              | 1              | unlimited          |
| `warehouses`             | 3              | 1              | unlimited          |
| `users`                  | 10             | 3              | unlimited          |
| `supplier_products_skus` | 1,000          | 250            | unlimited          |
| `chats_per_day`          | 200            | 30             | unlimited          |
| `open_conversations`     | unlimited (-1) | 5              | unlimited          |
| `storage_mb`             | 5,000          | 500            | 20,000             |
| `promotions`             | unlimited (-1) | 3 active deals | unlimited          |

---

## 5. Current Gold price

| Billing | Amount (DB)                               |
| ------- | ----------------------------------------- |
| Monthly | **$149.00**                               |
| Yearly  | **$1,490.00** (≈2 months free vs monthly) |

Same price row for both RESTAURANT and SUPPLIER plan records. Display: `planComparison.ts` subtitle **“Most Popular”**.

**Upgrade economics today**

| Step            | Monthly delta            | Primary unlock                                                                                         |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Silver → Gold   | **+$100** (~3.0× Silver) | Multi-branch, smart reorder, advanced roles, audit log, API keys, advanced reports, WhatsApp, branding |
| Gold → Platinum | **+$200**                | Unlimited scale, AI/automation tier strings, white-label, webhooks                                     |

---

## 6. What feels too generous (Gold)

| Area                                                | Why it’s generous vs Silver / product intent                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unlimited suppliers** (restaurant)                | Silver capped at **5**; Gold `-1` removes upsell pressure for multi-supplier groups while Platinum’s main story is “unlimited everything.”                                |
| **Unlimited quick lists / items / scheduled lists** | Silver has **10 / 100 / 3**; Gold `-1` from `0094`/`0096` makes list automation feel “enterprise” on mid tier.                                                            |
| **Unlimited deal redemptions** (restaurant)         | Silver **10/day**; Gold uncapped — docs/marketing say “unlimited” on Gold ([PLANS.md](./PLANS.md)) but that collapses Platinum differentiation on deal-heavy restaurants. |
| **Unlimited open conversations**                    | Silver **5**; Gold `-1` (`0099`) — weak step between tiers for chat-heavy ops.                                                                                            |
| **Unlimited supplier promotions**                   | Silver **3** active deals; Gold `-1` (`0099`) — supplier on Gold matches Platinum on deal count; only boost monetization remains.                                         |
| **Feature depth vs price**                          | Gold unlocks ~90% of route-gated “serious” features; Platinum mainly adds unlimited meters + AI/white-label strings. Risk: **“buy Gold once, never upgrade.”**            |
| **5 GB storage**                                    | 10× Silver (500 MB) but same as historical “big jump”; still modest vs Platinum 20 GB — acceptable, but paired with unlimited meters feels uneven.                        |

**Not in scope but affects Gold story:** migration `0112` gives **Free Trial the same feature JSON as Gold** (limits only differ). That does not change Gold’s paid value prop but makes **feature marketing** for Gold harder vs trial; out of scope per audit instructions.

---

## 7. What feels too restrictive (Gold)

| Area                                  | Why it’s tight for “3 locations / serious business”                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **50 orders/day**                     | Only **2.5×** Silver (20). A 3-branch group placing lunch + dinner across suppliers can hit 50 quickly; upgrade nudge points to Gold but cap is still low. |
| **10 users**                          | ~3.3 users per branch — tight for GM + chef + purchaser per site.                                                                                          |
| **1,000 inventory SKUs** (restaurant) | **4×** Silver (250) but far below real multi-branch catalogs; product direction asks for “more SKUs” on Gold.                                              |
| **1,000 product SKUs** (supplier)     | Meets “1000+” literally but only **4×** Silver; distributors outgrow quickly.                                                                              |
| **200 chats/day**                     | **6.7×** Silver (30) but with **unlimited open conversations** the mix is odd: many threads, moderate send volume.                                         |
| **3 branches only**                   | Reasonable for Gold positioning, but combined with low orders/day, **branch 3 feels “taxed”** on the same daily order pool.                                |
| **No webhook / full API** (feature)   | Correct vs Platinum, but `api_key_access` without export/webhook tiering should stay clearly below Platinum (`full_api_webhooks`).                         |

---

## 8. Inconsistencies after Silver (`0117`) changes

| Issue                              | Detail                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0117 updated Silver only**       | Gold limits JSON untouched since `0064` / `0099` patches — tier ladder is no longer coherently authored in one migration.                                                                                    |
| **Explicit vs implicit unlimited** | Silver uses explicit caps for `open_conversations`, `deal_redemptions_per_day`, quick-list meters. Gold relies on legacy `-1` / missing keys → **unlimited** on several meters Silver now documents clearly. |
| **Upgrade copy drift**             | `upgradeCopy.ts` tells users to upgrade to **Silver** for `deal_redemptions_per_day` and “unlimited deal redemptions” — live Gold already has unlimited redemptions; copy is wrong for Gold→Silver path.     |
| **SUBSCRIPTIONS.md / PLANS.md**    | Docs describe Gold deal redemptions as unlimited (accurate today) but Silver table in SUBSCRIPTIONS is current while **Gold section in PLANS.md** still reads like pre-0117 narrative in places.             |
| **Supplier branches**              | `0080` once gave Silver 3 branches; `0117` reset Silver to **1** branch / `multi_branch: false`. Gold at **3** branches + `multi_branch: true` is correct — ensure UI copy says Silver is single-location.   |
| **Reports feature strings**        | Silver `basic_kpis` vs Gold `usage_cost_dashboards` — API `requireFeature('reports')` is boolean; **tiers differ in marketing, not in route differentiation** (same as before Silver).                       |
| **Seed patches**                   | `tierDefinitions.js` only patches Gold with `advanced_roles` + calendar/disputes — does not reflect full catalog; migrations + DB are source of truth.                                                       |

---

## 9. Recommended Gold limits

Design rules used:

- Every comparable meter: **Silver (0117) < Gold (proposed) < Platinum (unlimited)**.
- Replace `-1` on Gold with **large but finite** caps unless meter is intentionally Platinum-only.
- Do **not** change deals/promotions **logic** — only `subscription_plan.limits` JSON.

### Restaurant (recommended)

| Limit key                       |        Recommended | vs Silver | vs current Gold |
| ------------------------------- | -----------------: | --------: | --------------- |
| `branches`                      |              **3** |        +2 | same            |
| `users`                         |             **15** |       +12 | +5              |
| `orders_per_day`                |            **100** |       +80 | +50             |
| `suppliers_per_restaurant`      |             **30** |       +25 | cap unlimited   |
| `restaurant_inventory_skus`     |          **3,000** |    +2,750 | +2,000          |
| `chats_per_day`                 |            **500** |      +470 | +300            |
| `open_conversations`            |             **30** |       +25 | cap unlimited   |
| `storage_mb`                    | **10,240** (10 GB) |    +9,740 | +5,240          |
| `quick_lists`                   |             **50** |       +40 | cap unlimited   |
| `quick_list_items`              |            **500** |      +400 | cap unlimited   |
| `scheduled_quick_lists`         |             **15** |       +12 | cap unlimited   |
| `deal_redemptions_per_day`      |             **50** |       +40 | cap unlimited   |
| `scheduled_order_grace_per_day` |              **0** |      same | same            |

### Supplier (recommended)

| Limit key                |         Recommended | vs Silver | vs current Gold |
| ------------------------ | ------------------: | --------: | --------------- |
| `branches`               |               **3** |        +2 | same            |
| `warehouses`             |               **3** |        +2 | same            |
| `users`                  |              **15** |       +12 | +5              |
| `supplier_products_skus` |           **3,000** |    +2,750 | +2,000          |
| `chats_per_day`          |             **500** |      +470 | +300            |
| `open_conversations`     |              **30** |       +25 | cap unlimited   |
| `storage_mb`             |          **10,240** |    +9,740 | +5,240          |
| `promotions`             | **25** active deals |       +22 | cap unlimited   |

---

## 10. Recommended Gold feature access

**Keep on Gold (no change recommended)** — aligns with product direction:

| Capability                 | Feature keys / values                                          |
| -------------------------- | -------------------------------------------------------------- |
| Smart reorder              | `smart_reorder`: `full_90day_trends`                           |
| Waste analytics            | `waste_tracking`: `analytics_dashboard`                        |
| Waitlist auto-promotion    | `waitlist_auto_promo`: true                                    |
| Advanced roles             | `advanced_roles`: true                                         |
| Activity log               | `tenant_audit_log`: true                                       |
| Advanced reports           | `reports`: `usage_cost_dashboards`                             |
| API / export access        | `api_integrations`: `api_key_access` (not `full_api_webhooks`) |
| Multi-branch               | `multi_branch`: true + `branches` limit 3                      |
| Better notifications       | `notifications`: `email_and_whatsapp`                          |
| Custom branding            | `custom_branding`: `logo_colors`                               |
| Multi-supplier chat        | `chat`: `group_chat_files`                                     |
| Full quick-list scheduling | `quick_lists`: `full_schedule`                                 |
| Receiving quality scoring  | `receiving_quality`: `quality_scoring`                         |
| Expense analytics          | `finance_invoices`: `expense_analytics`                        |
| Multi-branch inventory     | `inventory_management`: `multi_branch_tracking`                |
| Supplier deals & reviews   | `supplier_deals`, `supplier_reviews` (parity with Silver)      |
| Addon feature flags        | `feature_flags_access`: `addon_toggles`                        |
| Support                    | `support_sla`: `priority_24h`                                  |

**Supplier-only — keep on Gold**

| Capability           | Feature keys                                                    |
| -------------------- | --------------------------------------------------------------- |
| Multi-warehouse      | `multi_warehouse`: true, `warehouses`: true                     |
| Driver management    | `driver_management`: true                                       |
| Advanced fulfillment | `fulfillment_tools`: `warehouse_pick_pack`, `fulfillment`: true |

**Keep off Gold (reserve for Platinum)**

| Capability                        | Platinum value                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| AI quick lists / forecast         | `quick_lists`: `ai_smart_automation`, `smart_reorder`: `ai_forecast_seasonality`               |
| White-label                       | `custom_branding`: `white_label_domain`                                                        |
| Webhooks / full API               | `api_integrations`: `full_api_webhooks`                                                        |
| Real-time chat media              | `chat`: `real_time_media_read_receipts`                                                        |
| Central purchasing / lot tracking | `multi_branch`: `central_purchasing`, `inventory_management`: `lot_expiry_tracking`            |
| Advanced finance / waste          | `finance_invoices`: `advanced_finance_dashboard`, `waste_tracking`: `cost_percentage_vs_sales` |
| Experimental flags                | `feature_flags_access`: `all_experimental`                                                     |
| Dedicated support                 | `support_sla`: `dedicated_same_day`                                                            |

**Optional tightening (not recommended in v1):** differentiate `reports` route behavior between `basic_kpis` and `usage_cost_dashboards` — requires code, not JSON-only.

---

## 11. Recommended Gold price

| Option              |  Monthly |     Yearly | When to use                                                                                                          |
| ------------------- | -------: | ---------: | -------------------------------------------------------------------------------------------------------------------- |
| **A (recommended)** | **$149** | **$1,490** | Adopt **recommended limits** (finite caps). Value story = features + 3–5× Silver meters, not unlimited mid-tier.     |
| B                   |     $169 |     $1,690 | Keep **some** unlimited meters (e.g. suppliers + quick lists) if product insists on “unlimited deals/lists on Gold.” |
| C                   |     $129 |     $1,290 | Aggressive growth — only if limits stay generous; risks undermining Silver at $49.                                   |

**Recommendation:** **Option A — hold $149/mo** while applying finite caps. The Silver→Gold **+$100** step is already meaningful; raising price without caps feels hard to justify, while lowering price erodes Silver.

**Do not implement pricing in this pass** — document only until approval.

---

## 12. Reasons for each recommendation

| Recommendation                  | Reason                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **orders_per_day → 100**        | Clear “serious daily ops” headroom (5× Silver) without Platinum’s unlimited story.                                      |
| **users → 15**                  | Supports purchaser/manager per branch + HQ admin on 3 locations.                                                        |
| **suppliers → 30** (restaurant) | Multi-supplier groups get room; Platinum keeps unlimited for chains.                                                    |
| **SKUs → 3,000**                | Matches “larger catalog” positioning; 12× Silver, still finite for Platinum upsell.                                     |
| **chats 500 / open conv 30**    | High-volume comms without unlimited threads (Platinum differentiation).                                                 |
| **storage 10 GB**               | 2× current Gold, 20× Silver; Platinum stays 20 GB.                                                                      |
| **Quick list caps**             | Silver users feel upgrade; Gold power users unlikely to hit 50/500/15.                                                  |
| **deal_redemptions 50/day**     | 5× Silver; unlimited reserved for Platinum marketing.                                                                   |
| **promotions 25** (supplier)    | “Meaningful cap” per product direction; unlimited on Platinum.                                                          |
| **Keep feature bundle**         | Gold remains the **automation + analytics + multi-site** tier; Platinum stays **scale + AI + white-label + unlimited**. |
| **Hold $149**                   | Feature unlock already justifies +$100 over Silver; limit fixes reduce Platinum leakage.                                |

---

## 13. Risks of each recommendation

| Change                                      | Risk                                                           | Mitigation                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Cap unlimited suppliers (30)                | Tenants on Gold today with 30+ suppliers blocked on new orders | Grandfather via `tenant_limit_override` or comms before migration; preview in admin plan-change |
| Cap deal redemptions (50/day)               | Deal-heavy restaurants may complain vs today’s unlimited       | 50 >> Silver 10; monitor usage; Platinum unlimited                                              |
| Cap quick lists / scheduled                 | Power users with many schedules hit walls                      | Limits generous vs Silver; upgrade path to Platinum                                             |
| Cap promotions (25)                         | Active suppliers with many deals must archive                  | Align messaging with “active deals” meter; boost pricing unchanged                              |
| Lower SKUs than “unlimited” expectation     | Sales promised “1000 SKUs on Gold”                             | 3,000 **raises** SKU cap vs today — low risk                                                    |
| orders_per_day 100 vs 50                    | Some current Gold tenants gain headroom                        | Low risk                                                                                        |
| orders_per_day 100 vs unlimited expectation | Very high-volume groups may still want Platinum                | Position Platinum for 10+ branches / unlimited orders                                           |
| **No price change**                         | If caps feel tight, churn to competitors                       | Pair launch with “Gold 2026 limits” email highlighting higher caps than old 50 orders           |
| **Price increase to $169**                  | Sticker shock on “Most Popular” tier                           | Only if keeping multiple unlimited meters                                                       |
| Finite caps enforcement                     | `checkLimit` starts blocking where `-1` did not                | Staged rollout + admin overrides                                                                |
| Docs / upgrade copy                         | Stale UX copy (Silver for deals)                               | Update `upgradeCopy.ts` + PLANS in same release as migration (separate PR)                      |

---

## 14. Exact DB JSON changes (do not apply)

Proposed migration: `0118_gold_tier_limits_features.sql` (name illustrative). **Full replace** of `limits` and optional `features` merge — mirror `0117` style for idempotency.

### RESTAURANT Gold

```sql
UPDATE subscription_plan
SET
  limits = '{
    "branches": 3,
    "users": 15,
    "orders_per_day": 100,
    "suppliers_per_restaurant": 30,
    "restaurant_inventory_skus": 3000,
    "chats_per_day": 500,
    "open_conversations": 30,
    "storage_mb": 10240,
    "quick_lists": 50,
    "quick_list_items": 500,
    "scheduled_quick_lists": 15,
    "deal_redemptions_per_day": 50,
    "scheduled_order_grace_per_day": 0
  }'::jsonb,
  features = '{
    "chat": "group_chat_files",
    "order_calendar": true,
    "quick_lists": "full_schedule",
    "receiving_quality": "quality_scoring",
    "disputes_returns": true,
    "finance_invoices": "expense_analytics",
    "inventory_management": "multi_branch_tracking",
    "supplier_deals": true,
    "supplier_deals_redeem": true,
    "supplier_reviews": true,
    "order_amendments": true,
    "notifications": "email_and_whatsapp",
    "push_notifications": true,
    "reports": "usage_cost_dashboards",
    "multi_branch": true,
    "custom_branding": "logo_colors",
    "tenant_audit_log": true,
    "smart_reorder": true,
    "waste_tracking": "analytics_dashboard",
    "waitlist_auto_promo": true,
    "advanced_roles": true,
    "api_integrations": "api_key_access",
    "feature_flags_access": "addon_toggles",
    "fulfillment_tools": false,
    "support_sla": "priority_24h",
    "approvals_budgets": false
  }'::jsonb,
  -- price_per_month = 149.00,  -- unchanged
  -- price_per_year = 1490.00,  -- unchanged
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type = 'RESTAURANT'
  AND is_active = true;
```

### SUPPLIER Gold

```sql
UPDATE subscription_plan
SET
  limits = '{
    "branches": 3,
    "warehouses": 3,
    "users": 15,
    "supplier_products_skus": 3000,
    "chats_per_day": 500,
    "open_conversations": 30,
    "storage_mb": 10240,
    "promotions": 25
  }'::jsonb,
  features = '{
    "chat": "group_chat_files",
    "order_calendar": true,
    "fulfillment": true,
    "fulfillment_tools": "warehouse_pick_pack",
    "warehouses": true,
    "promotions": true,
    "disputes_returns": true,
    "inventory_management": "multi_branch_tracking",
    "order_amendments": true,
    "notifications": "email_and_whatsapp",
    "push_notifications": true,
    "reports": "usage_cost_dashboards",
    "multi_branch": true,
    "multi_warehouse": true,
    "custom_branding": "logo_colors",
    "tenant_audit_log": true,
    "driver_management": true,
    "advanced_roles": true,
    "api_integrations": "api_key_access",
    "feature_flags_access": "addon_toggles",
    "support_sla": "priority_24h"
  }'::jsonb,
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true;
```

**Optional seed follow-up** (not DB): extend `RESTAURANT_PLAN_FEATURE_PATCHES.gold` / `SUPPLIER_PLAN_FEATURE_PATCHES.gold` in `apps/api/scripts/seed/tierDefinitions.js` so seed runs match migration (patches are merge-only today).

**Verify after apply:**

```bash
pnpm run log:tier-limits
```

---

## Comparison matrices (Gold vs Silver vs Platinum)

### Restaurant limits (current → recommended)

| Meter                | Silver | Gold now | Gold proposed | Platinum |
| -------------------- | -----: | -------: | ------------: | -------: |
| orders/day           |     20 |       50 |       **100** |        ∞ |
| users                |      3 |       10 |        **15** |        ∞ |
| suppliers            |      5 |        ∞ |        **30** |        ∞ |
| SKUs                 |    250 |    1,000 |     **3,000** |        ∞ |
| chats/day            |     30 |      200 |       **500** |        ∞ |
| open chats           |      5 |        ∞ |        **30** |        ∞ |
| branches             |      1 |        3 |         **3** |        ∞ |
| storage              | 500 MB |     5 GB |     **10 GB** |    20 GB |
| deal redemptions/day |     10 |        ∞ |        **50** |        ∞ |

### Restaurant features (Silver vs Gold vs Platinum)

| Capability          | Silver     | Gold                  | Platinum           |
| ------------------- | ---------- | --------------------- | ------------------ |
| Smart reorder       | off        | on                    | AI forecast        |
| Waitlist auto-promo | off        | on                    | on                 |
| Advanced roles      | off        | on                    | on                 |
| Activity log        | off        | on                    | on                 |
| Multi-branch        | off        | on                    | central purchasing |
| Reports             | basic KPIs | usage/cost dashboards | advanced/custom    |
| API                 | off        | API keys              | full + webhooks    |
| Branding            | off        | logo + colors         | white-label        |
| Notifications       | email      | email + WhatsApp      | + webhooks         |

### Supplier limits (current → recommended)

| Meter               | Silver | Gold now | Gold proposed | Platinum |
| ------------------- | -----: | -------: | ------------: | -------: |
| SKUs                |    250 |    1,000 |     **3,000** |        ∞ |
| warehouses          |      1 |        3 |         **3** |        ∞ |
| promotions (active) |      3 |        ∞ |        **25** |        ∞ |
| users               |      3 |       10 |        **15** |        ∞ |
| chats/day           |     30 |      200 |       **500** |        ∞ |

### Supplier features (Silver vs Gold vs Platinum)

| Capability             | Silver            | Gold                | Platinum        |
| ---------------------- | ----------------- | ------------------- | --------------- |
| Multi-warehouse        | off               | on                  | on              |
| Driver management      | off               | on                  | on              |
| Fulfillment tools      | manual + invoices | warehouse pick/pack | routing suite   |
| Advanced roles / audit | off               | on                  | on              |
| API                    | off               | API keys            | full + webhooks |

---

## Does Gold justify +$100 over Silver?

**Yes, on features today** — multi-branch, smart reorder, waste analytics, advanced roles, audit log, API keys, WhatsApp, branding, and supplier multi-warehouse/drivers are credible for $149.

**Weaker on limits alone** — 2.5× orders and unlimited side meters don’t tell a clean story next to Silver’s newly explicit caps. **Recommended limits** fix the ladder while keeping Gold the obvious upgrade for operators outgrowing single-location Silver.

**Platinum still defensible** — unlimited meters, 20 GB storage, AI/automation feature strings, white-label, webhooks, central purchasing, and enterprise support remain exclusive if Gold finite caps are adopted.

---

## Approval checklist (for product)

- [ ] Accept recommended limits (section 9) or mark per-meter overrides
- [ ] Confirm price **Option A / B / C** (section 11)
- [ ] Approve SQL in section 14 (or edited values)
- [ ] Schedule follow-up PRs: docs (`PLANS.md`, `SUBSCRIPTIONS.md`), `upgradeCopy.ts`, upgrade modal comparison
- [ ] Excluded: Free Trial parity (`0112`), Silver (`0117`), Platinum, deals logic

---

_Generated from live `subscription_plan` catalog. Re-run `pnpm run log:tier-limits` after any migration to refresh numbers._
