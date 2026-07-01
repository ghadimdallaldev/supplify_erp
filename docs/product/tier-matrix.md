# Final tier matrix (post-migrations)

**Verified:** 2026-05-28  
**Catalog migrations:** `0116` (bronze→silver), `0117` (Silver), `0119` (Gold), `0120` (Platinum)  
**Live check:** `pnpm run log:tier-limits`  
**Related:** [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md), [PLATINUM_CATALOG_ONLY_FEATURES.md](./PLATINUM_CATALOG_ONLY_FEATURES.md), [ENTERPRISE.md](./ENTERPRISE.md)

---

## 1. Final plan names and prices

| Code         | User-facing name |         Monthly |        Yearly | Active |     Self-serve     | Notes                                                                            |
| ------------ | ---------------- | --------------: | ------------: | :----: | :----------------: | -------------------------------------------------------------------------------- |
| `free`       | **Free Trial**   |           $0.00 |             — |  Yes   | Yes (time-limited) | Not “forever free”; see [free-trial-expiry.md](../features/free-trial-expiry.md) |
| `silver`     | **Silver**       |      **$49.00** |   **$490.00** |  Yes   |        Yes         | First paid tier                                                                  |
| `gold`       | **Gold**         |     **$149.00** | **$1,490.00** |  Yes   |        Yes         | Subtitle: “Most Popular”                                                         |
| `platinum`   | **Platinum**     |     **$349.00** | **$3,490.00** |  Yes   |        Yes         | Subtitle: “Unlimited Ops”                                                        |
| `enterprise` | **Enterprise**   | $0.00 (catalog) |             — | **No** |       **No**       | `requires_admin_assignment`; admin-only                                          |

**Bronze:** Removed from DB (`0116`). Legacy API input `bronze` → `silver` (`plan-codes.js`, `planComparison.ts`). UI never shows “Bronze” (`formatPlanDisplayName` maps Bronze → Silver).

**Pricing verification:** Matches DB on verification run (Silver $49/$490, Gold $149/$1490, Platinum $349/$3490).

---

## 2. Restaurant features by tier

Values from live `subscription_plan.features`. **On** = enabled (`evaluatePlanFeatureValue`); **off** = false/disabled.

| Feature key                                | Free Trial            | Silver           | Gold                  | Platinum                            |
| ------------------------------------------ | --------------------- | ---------------- | --------------------- | ----------------------------------- |
| `chat`                                     | group_chat_files      | multi_supplier   | group_chat_files      | real_time_media_read_receipts       |
| `order_calendar`                           | on                    | on               | on                    | on                                  |
| `quick_lists`                              | full_schedule         | automated_weekly | full_schedule         | ai_smart_automation                 |
| `inventory_management`                     | multi_branch_tracking | real_time        | multi_branch_tracking | lot_expiry_tracking                 |
| `waste_tracking`                           | analytics_dashboard   | manual_entry     | analytics_dashboard   | cost_percentage_vs_sales            |
| `receiving_quality`                        | quality_scoring       | photos_enabled   | quality_scoring       | supplier_performance_reports        |
| `finance_invoices`                         | expense_analytics     | record_payments  | expense_analytics     | advanced_finance_dashboard          |
| `reports`                                  | usage_cost_dashboards | basic_kpis       | usage_cost_dashboards | advanced_forecasting_custom_reports |
| `smart_reorder`                            | full_90day_trends     | off              | full_90day_trends     | ai_forecast_seasonality             |
| `ai_platform`                              | off                   | off              | on                    | on                                  |
| `waitlist_auto_promo`                      | on                    | off              | on                    | on                                  |
| `advanced_roles`                           | on                    | off              | on                    | on                                  |
| `tenant_audit_log`                         | on                    | off              | on                    | on                                  |
| `multi_branch`                             | on                    | off              | on                    | central_purchasing                  |
| `supplier_deals` / `supplier_deals_redeem` | on                    | on               | on                    | on                                  |
| `supplier_reviews`                         | on                    | on               | on                    | on                                  |
| `disputes_returns`                         | on                    | on               | on                    | on                                  |
| `order_amendments`                         | on                    | on               | on                    | on                                  |
| `push_notifications`                       | on                    | on               | on                    | on                                  |
| `notifications`                            | email_and_whatsapp    | in_app_and_email | email_and_whatsapp    | email_whatsapp_webhook              |
| `api_integrations`                         | api_key_access        | off              | api_key_access        | full_api_webhooks                   |
| `feature_flags_access`                     | addon_toggles         | off              | addon_toggles         | all_experimental                    |
| `custom_branding`                          | logo_colors           | off              | logo_colors           | white_label_domain                  |
| `support_sla`                              | priority_24h          | standard_72h     | priority_24h          | dedicated_same_day                  |
| `fulfillment_tools`                        | warehouse_pick_pack   | off              | off                   | off                                 |

**Removed product-wide:** `approvals_budgets` (migration `0114`; hidden in UI via `removedFeatures.ts`).

---

## 3. Restaurant limits by tier

| Limit key                       | Free Trial | Silver |           Gold |       Platinum |
| ------------------------------- | ---------: | -----: | -------------: | -------------: |
| `branches`                      |          1 |      1 |              2 |              3 |
| `users`                         |          1 |      3 |             15 |      unlimited |
| `orders_per_day`                |          3 |     20 |            100 |      unlimited |
| `suppliers_per_restaurant`      |          1 |      5 |             30 |      unlimited |
| `restaurant_inventory_skus`     |         10 |    250 |          3,000 |      unlimited |
| `chats_per_day`                 |          3 |     30 |            500 |      unlimited |
| `open_conversations`            |          1 |      5 |             30 |      unlimited |
| `storage_mb`                    |         50 |    500 | 10,240 (10 GB) | 30,720 (30 GB) |
| `quick_lists`                   |          1 |     10 |             50 |      unlimited |
| `quick_list_items`              |          1 |    100 |            500 |      unlimited |
| `scheduled_quick_lists`         |          1 |      3 |             15 |      unlimited |
| `deal_redemptions_per_day`      |          1 |     10 |             50 |      unlimited |
| `scheduled_order_grace_per_day` |          1 |      0 |              0 |              0 |
| `ai_requests_per_day`           |          0 |      0 |             20 |            100 |

**Not on restaurant plans:** `promotions` (supplier-only). Restaurants use **`deal_redemptions_per_day`** for marketplace deal caps.

**Hidden from entitlements UI:** `scheduled_order_grace_per_day` (Free sandbox overflow only).

**Ladder check:** Silver < Gold < Platinum on every comparable finite meter; Platinum uses `-1` (unlimited) except storage.

---

## 4. Supplier features by tier

| Feature key            | Free Trial            | Silver                 | Gold                  | Platinum                            |
| ---------------------- | --------------------- | ---------------------- | --------------------- | ----------------------------------- |
| `chat`                 | group_chat_files      | multi_supplier         | group_chat_files      | real_time_media_read_receipts       |
| `order_calendar`       | on                    | on                     | on                    | on                                  |
| `fulfillment`          | on                    | on                     | on                    | on                                  |
| `fulfillment_tools`    | warehouse_pick_pack   | manual_orders_invoices | warehouse_pick_pack   | routing_full_suite                  |
| `warehouses`           | on                    | on                     | on                    | on                                  |
| `multi_warehouse`      | on                    | off                    | on                    | on                                  |
| `driver_management`    | on                    | off                    | on                    | on                                  |
| `promotions`           | on                    | on                     | on                    | on                                  |
| `reports`              | usage_cost_dashboards | basic_kpis             | usage_cost_dashboards | advanced_forecasting_custom_reports |
| `inventory_management` | multi_branch_tracking | real_time              | multi_branch_tracking | lot_expiry_tracking                 |
| `multi_branch`         | on                    | off                    | on                    | on                                  |
| `advanced_roles`       | on                    | off                    | on                    | on                                  |
| `tenant_audit_log`     | on                    | off                    | on                    | on                                  |
| `disputes_returns`     | on                    | on                     | on                    | on                                  |
| `order_amendments`     | on                    | on                     | on                    | on                                  |
| `notifications`        | email_and_whatsapp    | in_app_and_email       | email_and_whatsapp    | email_whatsapp_webhook              |
| `api_integrations`     | api_key_access        | off                    | api_key_access        | full_api_webhooks                   |
| `feature_flags_access` | addon_toggles         | off                    | addon_toggles         | all_experimental                    |
| `custom_branding`      | logo_colors           | off                    | logo_colors           | white_label_domain                  |
| `support_sla`          | priority_24h          | standard_72h           | priority_24h          | dedicated_same_day                  |

---

## 5. Supplier limits by tier

| Limit key                | Free Trial | Silver |           Gold |       Platinum |
| ------------------------ | ---------: | -----: | -------------: | -------------: |
| `branches`               |          1 |      1 |              2 |              3 |
| `warehouses`             |          0 |      1 |              3 |              5 |
| `users`                  |          1 |      3 |             15 |      unlimited |
| `supplier_products_skus` |         10 |    250 |          3,000 |      unlimited |
| `chats_per_day`          |          3 |     30 |            500 |      unlimited |
| `open_conversations`     |          1 |      5 |             30 |      unlimited |
| `storage_mb`             |         50 |    500 | 10,240 (10 GB) | 30,720 (30 GB) |
| `promotions`             |          1 |      3 |             25 |      unlimited |

**Supplier-only:** `promotions` = count of **active** supplier deals (not deal-boost checkout).

**Restaurants:** no `warehouses` limit (supplier operational locations only).

---

## 5b. Branch & warehouse add-ons (Gold / Platinum)

Branches are **org location accounts** (each branch is nearly a full account). Warehouses are **supplier fulfillment locations** under the org, not separate accounts. Branch entitlements use the **parent org main-branch subscription** (`resolveOrgBillingTenantId`); branch rows may still have a pending Free subscription row for activation only.

**Effective limit** = plan included limit (+ tenant/plan limit overrides, increase-only) + **active add-on quantity**.

| Add-on key                 | Tenant     | Gold (USD/mo per unit) | Platinum (USD/mo per unit) |
| -------------------------- | ---------- | ---------------------- | -------------------------- |
| `restaurant_extra_branch`  | Restaurant | $39                    | $49                        |
| `supplier_extra_branch`    | Supplier   | $49                    | $69                        |
| `supplier_extra_warehouse` | Supplier   | $19                    | $25                        |

**Rules**

- **Silver / Free Trial:** cannot purchase add-ons; upgrade to Gold (branches) or Silver+ (first warehouse).
- **Enterprise:** custom limits; self-serve add-ons disabled.
- **Hard cap:** more than **6 total branch accounts** → contact sales for Enterprise (even if add-ons would allow more).
- **Grandfathering:** existing branches/warehouses are never deleted; tenants over the new included limit stay readable but cannot create more until upgrade or admin-granted add-ons.

Storage: `tenant_subscription_addon` (admin PUT `/api/admin-dashboard/tenants/:tenantType/:id/subscription-addons/:addonKey`). No automated billing yet.

---

## 6. What is enforced today

### Limits (`checkLimit` / `requireWithinLimit`)

- Enforced on create/send paths (orders, chat messages, branches, warehouses, SKUs, quick lists, deals, etc.).
- **`-1` or missing effective limit** → treated as **unlimited** for enforcement (`resolveEffectiveLimit`).
- **Restaurant `promotions` meter** → `notApplicable` (never unlimited-by-missing-key).
- **Daily meters** reset at midnight UTC (`orders_per_day`, `chats_per_day`, `deal_redemptions_per_day`).
- **Storage (`storage_mb`):** tracked; product docs note grace period before hard block.

### Features (`requireFeature` / `isFeatureEnabled`)

Binary on/off per key (non-empty string = on). **Tier strings are not compared** on most routes.

| Area                     | Enforcement                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Branches                 | `plan-enforcement` + org-wide count + add-ons + Enterprise cap (6)                                                                 |
| Warehouses               | `limits.warehouses` + add-ons (supplier org-wide count) + `warehouses` feature                                                     |
| Smart reorder            | `smart_reorder` on/off; tier via `resolveSmartReorderCapabilities()` (see below)                                                   |
| AI platform (LLM assist) | `ai_platform` + env `AI_ENABLED`; `ai_requests_per_day` on LLM calls only                                                          |
| Reports / waste reports  | `reports` / `waste_tracking` on/off                                                                                                |
| Advanced roles           | `advanced_roles`                                                                                                                   |
| Activity log             | `tenant_audit_log`                                                                                                                 |
| Waitlist auto-promo      | `waitlist_auto_promo`                                                                                                              |
| Supplier promotions CRUD | `promotions` feature + `promotions` limit                                                                                          |
| Restaurant deal redeem   | `supplier_deals` + `deal_redemptions_per_day`                                                                                      |
| Notifications            | `resolveAllowedChannels(notifications)` → in-app, email, WhatsApp; Platinum `email_whatsapp_webhook` adds outbound webhook channel |
| Custom branding PATCH    | `custom_branding` on/off; Platinum `white_label_domain` adds custom hostname via `resolveBrandingCapabilities()`                   |

**`smart_reorder` capabilities** (`resolveSmartReorderCapabilities()`):

| Plan value / tier                | Assistance | Forecast (30/90d) | Explain endpoint | Ask endpoint | Seasonality / trend |
| -------------------------------- | :--------: | :---------------: | :--------------: | :----------: | :-----------------: |
| off / Silver                     |     —      |         —         |        —         |      —       |          —          |
| `full_90day_trends` (Gold)       |     ✓      |         ✓         |        ✓         |      —       |          —          |
| `ai_forecast_seasonality` (Plat) |     ✓      |         ✓         |        ✓         |      ✓       |          ✓          |

**`quick_lists` capabilities** (`resolveQuickListCapabilities()`):

| Plan value / tier            | Scheduling | Full schedule | Smart quantities | Suggest items |
| ---------------------------- | :--------: | :-----------: | :--------------: | :-----------: |
| off / manual                 |     —      |       —       |        —         |       —       |
| `automated_weekly` (Silver)  |     ✓      |       —       |        —         |       —       |
| `full_schedule` (Gold)       |     ✓      |       ✓       |        —         |       —       |
| `ai_smart_automation` (Plat) |     ✓      |       ✓       |        ✓         |       ✓       |

See [ai-quick-lists.md](../features/ai-quick-lists.md).

### Free Trial behavior (unchanged)

- Time-limited sandbox; expiry → read-only lock (`free_sandbox_expired`).
- **Limits** remain low (see section 3).
- **Features:** migration `0112` copied Gold feature JSON onto Free — trial tenants get **Gold-equivalent feature flags** with Free limits (intentional sandbox; do not market as production parity).

---

## 7. Catalog-only / not fully enforced yet

See [PLATINUM_CATALOG_ONLY_FEATURES.md](./PLATINUM_CATALOG_ONLY_FEATURES.md) for the live backlog.

### Enforced Platinum strings (2026-07)

- **Smart quick lists** — [ai-quick-lists.md](../features/ai-quick-lists.md)
- **Notification webhooks** — migration `0182`, `GET/PUT /api/notifications/webhook`
- **Custom catalog domain** — [custom-domains.md](../operations/custom-domains.md)
- **Smart reorder** — [ai-smart-reorder.md](../features/ai-smart-reorder.md)

### Cross-tier (string labels ≠ behavior) — still open

| Keys                          | Issue                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `reports`                     | `basic_kpis` vs `usage_cost_dashboards` vs `advanced_forecasting_custom_reports` — same route gate |
| `smart_reorder`               | **Enforced** — see §6 capability table                                                             |
| `quick_lists`                 | **Enforced** — see §6 capability table                                                             |
| `notifications`               | **Enforced** for outbound webhooks (`email_whatsapp_webhook`)                                      |
| `custom_branding`             | **Enforced** for custom domain (`white_label_domain`); logo/colors shared with Gold                |
| `finance_invoices`            | `record_payments` / `expense_analytics` / `advanced_finance_dashboard` — same gate                 |
| `receiving_quality`           | photos / scoring / `supplier_performance` — same gate                                              |
| `waste_tracking` (restaurant) | `manual_entry` / `analytics_dashboard` / `cost_percentage_vs_sales` — same waste route gate        |
| `api_integrations`            | `api_key_access` vs `full_api_webhooks` — no differentiated API product gate                       |

### Reservations

[PLANS.md](./PLANS.md) describes tiered reservations; **not re-verified in this pass** — treat as separate from subscription limit migrations.

---

## 8. Admin-configurable tier / limit items

Via **Admin Dashboard** (`/api/admin-dashboard`):

| Control                                  | Effect                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| **GET/PATCH `/plans`**                   | Edit `subscription_plan.limits` and `.features` JSON per RESTAURANT/SUPPLIER row |
| **POST `/plans/:planId/override-limit`** | Plan-level limit boost (`plan_limit_override`)                                   |
| **Tenant limit overrides**               | Per-tenant boost (`tenant_limit_override`)                                       |
| **Feature flag global override**         | `feature_flag.global_override` force on/off                                      |
| **Tenant feature override**              | `feature_flag_override` per tenant                                               |
| **Change subscription plan**             | Assign tier; Enterprise requires admin                                           |
| **Extend Free Trial**                    | `extend-free-trial`                                                              |

**Tier logger** documents canonical keys; admin cards show keys present in plan JSON.

---

## 9. Tenant override behavior

Resolution order (`limit-resolution.js`):

1. Plan default (`subscription_plan.limits`)
2. **Plan override** (`plan_limit_override`) — increase only
3. **Tenant override** (`tenant_limit_override`) — increase only

Rules:

- Overrides **cannot reduce** below plan default (`applyIncreaseOnly`).
- Expired or `is_active = false` overrides ignored.
- Explicit **`-1`** in plan JSON = unlimited.
- Missing key on plan row: logger shows `n/a`; enforcement treats missing numeric cap as unlimited for that meter when resolved (restaurant `promotions` excluded via `notApplicable`).

Feature overrides: tenant `feature_flag_override` and global `feature_flag.global_override` layered in `feature-flags.js`.

---

## 10. Known risks

| Risk                                             | Severity               | Notes                                                                                                                        |
| ------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Free Trial feature parity with Gold (`0112`)** | High (GTM)             | Trial unlocks same feature flags as Gold; only limits differ — can confuse upgrade story                                     |
| **Tier feature strings not enforced**            | Medium (Platinum/Gold) | Remaining catalog items: full API platform, advanced reports strings — see §7                                                |
| **Webhook notification label**                   | Low (mitigated)        | Outbound notification webhooks shipped (`0182`)                                                                              |
| **Storage soft enforcement**                     | Low                    | Documented grace; tenants may exceed before block                                                                            |
| **Legacy `bronze` in API**                       | Low                    | Normalized to silver; stale clients safe                                                                                     |
| **Enterprise catalog incomplete**                | Low                    | Inactive; sparse flags; not self-serve                                                                                       |
| **Free `scheduled_order_grace_per_day: 1`**      | Low                    | Hidden meter; sandbox order overflow                                                                                         |
| **Supplier Free high feature set**               | Medium                 | Same `0112` copy pattern as restaurant Free                                                                                  |
| **Platinum `multi_branch` tier string**          | Low (mitigated)        | Frontend uses `featureEnabled` / `isEntitlementFeatureEnabled` + `planFeatures` on entitlements; API still resolves booleans |

**No catalog bugs found** requiring migration changes on this verification (prices, ladder, promotions key split, approvals removed, Enterprise inactive).

---

## 11. Manual QA checklist

### Naming & pricing (UI)

- [ ] Upgrade modal / Settings → Subscription shows **Free Trial** (not “Free” or “Bronze”)
- [ ] Silver **$49/mo**, Gold **$149/mo**, Platinum **$349/mo**
- [ ] No **Bronze** label anywhere in app or admin plan cards
- [ ] **Approvals / Budgets** absent from plan features and feature-flag admin lists

### Restaurant limits

- [ ] Entitlements: **no `promotions`** row; **deal redemptions (today)** present on Silver+
- [ ] Silver: block 21st order/day; 11th deal redemption
- [ ] Gold: block at 101 orders/day, 51 deal redemptions, 31st supplier (if applicable)
- [ ] Platinum: operational meters uncapped; storage shows **30 GB** cap

### Supplier limits

- [ ] **Promotions** limit visible (active deals), not on restaurant tenant
- [ ] Silver: 4th active promotion blocked
- [ ] Gold: 26th active promotion blocked
- [ ] Silver: cannot add 2nd warehouse; Gold max 3

### Features (smoke)

- [ ] Silver: no smart reorder, no advanced roles, no audit log
- [ ] Gold: multi-branch, smart reorder, audit log, logo branding
- [ ] Platinum: unlimited branch create (within reason), white-label caption in upgrade UI
- [ ] Free Trial expired → read-only (writes 402)

### Admin

- [ ] Plans tab: RESTAURANT vs SUPPLIER catalogs match tables above
- [ ] Enterprise plan **inactive**, not in self-serve picker
- [ ] Tenant limit override increases cap (does not decrease)

### Regression commands

```bash
pnpm run log:tier-limits
cd apps/api && npm run test:run -- src/lib/limit-resolution.test.js src/lib/subscription.test.js
cd apps/web && npm run test:run -- src/lib/planComparison.test.ts src/lib/planLimits.test.ts src/lib/upgradeCopy.test.ts
```

---

## Appendix: Final tier logger output (2026-05-28)

```
Tiers: enterprise, free, gold, platinum, silver

RESTAURANT — prices & storage
  free      $0/mo    storage 50 MB
  silver    $49/mo   storage 500 MB
  gold      $149/mo  storage 10240 MB (10 GB)
  platinum  $349/mo  storage 30720 MB (30 GB), all operational limits unlimited

SUPPLIER — prices & storage
  free      $0/mo    storage 50 MB, warehouses 0, promotions 1
  silver    $49/mo   storage 500 MB, promotions 3
  gold      $149/mo  storage 10240 MB, promotions 25
  platinum  $349/mo  storage 30720 MB, promotions unlimited

enterprise  inactive $0/mo  storage 100000 MB (100 GB)
```

Full output: run `pnpm run log:tier-limits` from `apps/api`.

---

## Verification summary (2026-05-28)

| Check                            | Result                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Bronze user-facing               | **Pass** (alias only)                                                               |
| Free → Free Trial display        | **Pass**                                                                            |
| Silver $49 / $490                | **Pass**                                                                            |
| Gold $149 / $1490                | **Pass**                                                                            |
| Platinum $349 / $3490            | **Pass**                                                                            |
| Restaurant no `promotions` limit | **Pass**                                                                            |
| Supplier `promotions` limit      | **Pass**                                                                            |
| No approvals_budgets in UI       | **Pass**                                                                            |
| Platinum catalog-only documented | **Pass** ([PLATINUM_CATALOG_ONLY_FEATURES.md](./PLATINUM_CATALOG_ONLY_FEATURES.md)) |
| Enterprise inactive/custom       | **Pass**                                                                            |
| API tests (22)                   | **Pass**                                                                            |
| Web plan tests (21)              | **Pass**                                                                            |
