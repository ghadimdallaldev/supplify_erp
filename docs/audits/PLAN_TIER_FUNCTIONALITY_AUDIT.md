# Plan / Tier Functionality Audit

**Date:** 2026-06-09  
**Scope:** Restaurant + Supplier tiers (Free Trial, Silver, Gold, Platinum) — DB catalog, backend gates, limits, admin updates, frontend entitlements, tests.

---

## 1. Summary

End-to-end audit and fixes align the subscription plan catalog with intended product behavior. Key outcomes:

- **Migration `0145_plan_catalog_audit_sync.sql`** re-syncs Free features from Gold, restores Gold/Platinum branch limits (reverts `0121` caps), keeps Free **`chats_per_day: 3`** (per `0101`, not `0094`'s 10).
- **Migration `0144`** (prior) restores `finance_invoices` on supplier paid tiers.
- **Backend:** Fixed `driver_management` / `fulfillment` alias bypass when plan explicitly sets `false`; gated supplier inventory writes, order amendment accept/reject, restaurant inventory SKU limit.
- **Admin → Plans:** Limits/features JSON editing wired in edit modal; Usage tab reads limits from plan catalog instead of hardcoded tier names.
- **Frontend:** Sidebar plan-gates for invoices, quick lists, fulfillment; branch/warehouse add-on logic uses entitlements not hardcoded Gold/Platinum codes.

**Pricing (unchanged):** Silver $49/$490, Gold $149/$1490, Platinum $349/$3490.

---

## 2. Files inspected

| Area                                | Paths                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations                          | `0094`, `0101`, `0112`, `0115`, `0117`, `0119`, `0120`, `0121`, `0131`, `0144`, `0145`                                                   |
| Feature resolution                  | `apps/api/src/lib/feature-flags.js`, `feature-keys.js`, `subscription.js`                                                                |
| Limits                              | `apps/api/src/lib/limit-resolution.js`, `plan-enforcement.js`                                                                            |
| Admin                               | `apps/api/src/routes/admin-dashboard.routes.js`, `plan-admin-validation.js`, `apps/web/src/pages/AdminDashboardPage.tsx`                 |
| Routes (~66 `requireFeature` sites) | invoices, reports, promotions, fulfillment, inventory, restaurant-inventory, quick-lists, chat, etc.                                     |
| Frontend                            | `planLimits.ts`, `planFeatureGates.ts`, `Sidebar.tsx`, `adminPlanJsonParse.ts`, `adminPlanLimitLookup.ts`                                |
| Tests                               | `plan-catalog-audit.test.js`, `feature-flags.test.js`, `limit-resolution.test.js`, `admin-dashboard.routes.test.js`, web plan gate tests |

---

## 3. Current DB / migration source of truth

Effective catalog after **`0145`** (last writer wins):

| Item                             | Value                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Free features                    | Copied from Gold (`0112` pattern, post-`0119`) + `waste_tracking: analytics_dashboard` (restaurant) |
| Free `chats_per_day`             | **3** (restaurant + supplier) — aligns with `0101`                                                  |
| Gold `branches`                  | **3** (reverts `0121` → 2)                                                                          |
| Platinum `branches`              | **-1** (reverts `0121` → 3)                                                                         |
| Platinum supplier `warehouses`   | **-1** (reverts `0121` → 5)                                                                         |
| Supplier paid `finance_invoices` | Restored via `0144`                                                                                 |

Run locally: `pnpm run log:tier-limits`, `pnpm verify:tier-matrix`.

---

## 4. Restaurant plan status

| Tier     | Limits                                   | Status          |
| -------- | ---------------------------------------- | --------------- |
| Free     | Sandbox caps; **chats 3**                | OK after `0145` |
| Silver   | Per `0117`                               | OK              |
| Gold     | branches 3, features per `0119`          | OK after `0145` |
| Platinum | Unlimited meters except storage 30720 MB | OK after `0145` |

Features: `fulfillment_tools: false` on all restaurant paid tiers (intentional). `waste_tracking: analytics_dashboard` on free+.

---

## 5. Supplier plan status

| Tier                    | Limits                                | Status          |
| ----------------------- | ------------------------------------- | --------------- |
| Free                    | chats **3**, warehouses 0             | OK after `0145` |
| Silver/Gold/Platinum    | Per `0117`/`0119`/`0120` + branch fix | OK after `0145` |
| Paid `finance_invoices` | Silver/Gold/Platinum tier strings     | OK via `0144`   |

---

## 6. Feature gate findings

| Finding                                                                   | Classification                         | Action                                           |
| ------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| Supplier invoices 403 on Gold                                             | Gate exists, plan missing key          | **Fixed** (`0144`)                               |
| `driver_management: false` bypassed via `fulfillment_tools` alias         | Runtime bug                            | **Fixed** (`shouldResolveFeatureAlias`)          |
| Sidebar showed Invoices without `finance_invoices`                        | Frontend/backend mismatch              | **Fixed**                                        |
| Supplier inventory writes ungated                                         | FEATURE IMPLEMENTED BUT NOT PLAN-GATED | **Fixed** (`inventory_management` gate)          |
| Order amendment accept/reject ungated                                     | Partial gate                           | **Fixed**                                        |
| Reservations module                                                       | FEATURE IMPLEMENTED BUT NOT PLAN-GATED | Documented; no catalog key                       |
| Reports / smart_reorder tier strings                                      | PLAN ENABLED BUT NOT WIRED             | Same API for all tiers; strings are display-only |
| `notifications`, `api_integrations`, `support_sla`                        | Catalog keys                           | RBAC or marketing; not route-gated               |
| Restaurant `fulfillment_tools` in DB but not in `RESTAURANT_FEATURE_KEYS` | Admin validation gap                   | **Fixed** (key added)                            |

---

## 7. Limit enforcement findings

| Limit                       | Status                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `restaurant_inventory_skus` | **Fixed** — enforced on new SKU add (`/add`)                                           |
| `chats_per_day`             | Defined; runtime uses `open_conversations` for conversation cap — document dual meters |
| `-1` unlimited              | Verified in `limit-resolution` + tests                                                 |
| Tenant-type scoping         | Verified (`isLimitKeyApplicable`)                                                      |
| Admin overrides             | Unchanged; compose via existing override APIs                                          |

---

## 8. Admin update findings

| Item                  | Before                | After                                                          |
| --------------------- | --------------------- | -------------------------------------------------------------- |
| PATCH limits/features | API supported         | Unchanged                                                      |
| Admin → Plans UI      | Metadata only         | **JSON editors for limits + features**                         |
| Usage tab limits      | Hardcoded `plan_name` | **Reads from plan catalog**                                    |
| Type preservation     | API validates         | Client `adminPlanJsonParse.ts` preserves -1, booleans, strings |

---

## 9. Frontend findings

- **Fixed:** Invoices, Quick Lists, Fulfillment nav gated by entitlements.
- **Fixed:** `canBuyBranchAddons` / warehouse add-on use multi-branch limits, not `gold`/`platinum` code checks.
- **Remaining (copy only):** `upgradeCopy.ts`, some onboarding strings still mention tier names — cosmetic.

---

## 10. Bugs found

1. Free features stale after `0119` (only `0112` snapshot).
2. `0121` capped Platinum branches/warehouses vs unlimited spec.
3. Supplier paid plans missing `finance_invoices`.
4. Feature alias overrode explicit `false`.
5. Admin Plans could not edit limits/features.
6. Usage tab ignored DB plan limits.
7. `RESTAURANT_FEATURE_KEYS` missing `fulfillment_tools`, `supplier_deals_redeem`.

---

## 11. Fixes applied

| File                                               | Change                                      |
| -------------------------------------------------- | ------------------------------------------- |
| `0145_plan_catalog_audit_sync.sql`                 | Catalog sync; Free chats **3**              |
| `0144_supplier_finance_invoices_plan_features.sql` | Supplier paid finance (prior commit)        |
| `limit-resolution.js`                              | `FREE_TIER_LIMIT_PATCHES.chats_per_day = 3` |
| `feature-flags.js`                                 | `shouldResolveFeatureAlias`                 |
| `feature-keys.js`                                  | Restaurant keys + supplier finance          |
| `inventory.routes.js`                              | `inventory_management` gate on writes       |
| `restaurant-inventory.routes.js`                   | `restaurant_inventory_skus` limit           |
| `order-amendments.routes.js`                       | Gate accept/reject/cancel                   |
| `orders.routes.js`                                 | Remove unused import                        |
| `AdminDashboardPage.tsx`                           | Plan JSON edit + usage limits               |
| `Sidebar.tsx`                                      | Plan-gated nav                              |
| `planLimits.ts`                                    | Entitlement-based branch/warehouse addons   |
| `planFeatureGates.ts`                              | Fulfillment + quick list helpers            |
| `adminPlanJsonParse.ts`, `adminPlanLimitLookup.ts` | Admin helpers                               |

---

## 12. Tests added/updated

| Test file                        | Coverage                                 |
| -------------------------------- | ---------------------------------------- |
| `plan-catalog-audit.test.js`     | Audit matrices, chats=3, tier strings    |
| `feature-flags.test.js`          | Alias behavior, `logger.warn` mock       |
| `limit-resolution.test.js`       | Tenant-type scoping                      |
| `admin-dashboard.routes.test.js` | PATCH limits `-1`, features tier strings |
| `adminPlanJsonParse.test.ts`     | JSON type preservation                   |
| `adminPlanLimitLookup.test.ts`   | Catalog limit lookup                     |
| `planFeatureGates.test.ts`       | Fulfillment, quick lists                 |

Run: `cd apps/api && npm run test:billing`, `cd apps/web && pnpm exec vitest run src/lib/planLimits.test.ts src/lib/planFeatureGates.test.ts src/lib/adminPlanJsonParse.test.ts src/lib/adminPlanLimitLookup.test.ts`

---

## 13. Remaining risks / manual QA checklist

### Risks

- **Deploy migrations:** Apply `0144` + `0145` on Railway dev → preprod → prod (API startup migrate or manual). Full checklist: [../releases/2026-06-09-pre-deploy-checklist.md](../releases/2026-06-09-pre-deploy-checklist.md).
- **Reservations** still not plan-gated.
- **Reports tier differentiation** not implemented at API level.
- **`chats_per_day` vs `open_conversations`:** two meters; confirm product intent.
- **0121 revert:** Platinum unlimited branches may conflict with Enterprise add-on docs — confirm with product.

### Manual QA

- [ ] Login as admin → Admin → Plans
- [ ] Filter Restaurant / Supplier
- [ ] Edit Silver feature (tier string) → Save → Refresh → persisted
- [ ] Edit Gold limit (e.g. `orders_per_day`) → Save → Refresh → persisted
- [ ] Assign restaurant tenant: Free → Silver → Gold → Platinum → Silver
- [ ] Assign supplier tenant through same tiers
- [ ] Free tier: confirm **3 chats/day** cap behavior
- [ ] Access invoices, reports, promotions, fulfillment, warehouses, quick lists per tier
- [ ] Confirm 403 when feature off (plan) or permission missing (RBAC)
- [ ] Confirm 403 when limit exceeded
- [ ] Confirm Platinum unlimited (`-1`) for branches/SKUs where configured
- [ ] Supplier Gold: `/api/invoices` returns 200 with `INVOICES_VIEW` + `finance_invoices`
