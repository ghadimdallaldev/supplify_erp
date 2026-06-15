# Admin tier editing — safety audit

> **Archive note (2026-06):** Free Trial admin range is now **7–90 days** (default **30**). References to **3–7 days** below are historical. See [../../features/free-trial-expiry.md](../../features/free-trial-expiry.md).

**Date:** 2026-05-28  
**Scope:** Admin plan catalog editing (`POST/PATCH /api/admin-dashboard/plans`), plan limit overrides, subscription assignment.  
**Out of scope (unchanged):** Tier JSON values in DB, pricing, Deals/Promotions routes, Free Trial runtime behavior.  
**Reference:** [FINAL_TIER_MATRIX.md](./FINAL_TIER_MATRIX.md)

---

## 1. Current admin edit behavior

| Surface                | API                                  | Behavior                                                                   |
| ---------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| **Plans tab**          | `GET /plans`, `PATCH /plans/:id`     | Admin edits full `limits` and `features` JSON per RESTAURANT/SUPPLIER row  |
| **Create plan**        | `POST /plans`                        | Rare; validates catalog keys before insert                                 |
| **Plan limit boost**   | `POST /plans/:planId/override-limit` | Increase-only override per limit key (`plan_limit_override`)               |
| **Tenant limit boost** | Limit overrides panel                | Increase-only (`tenant_limit_override`) — unchanged                        |
| **Feature flags**      | Global + tenant overrides            | Separate from plan JSON; `approvals_budgets` hidden in web UI              |
| **Assign plan**        | `PATCH /subscriptions/:id`           | Tenant type must match; downgrade blocked unless `force` + `reason`        |
| **Enterprise**         | Catalog row `enterprise`             | `is_active = false`, `requires_admin_assignment`; not in self-serve picker |

**Web:** `AdminDashboardPage.tsx` saves plan metadata via `PATCH /plans`; uses `getLimitLabel()` for display. Surfaces API `validationWarnings` and validation errors via `adminPlanSaveFeedback` toasts (see §7).

**Enforcement at runtime:** Unchanged — `resolveEffectiveLimit` (tenant > plan override > plan default, increase-only) and `requireFeature` / `checkLimit` on routes.

---

## 2. Validations added / strengthened

Implemented in `apps/api/src/lib/plan-admin-validation.js`, wired from `admin-dashboard.routes.js`.

### Limits

| Rule                                                                                         | Enforcement                              |
| -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `limits` must be a plain JSON object                                                         | **Reject** (Zod + validator)             |
| Only canonical keys for tenant type                                                          | **Reject** unknown keys                  |
| Restaurant cannot use `promotions`                                                           | **Reject** (unknown key + applicability) |
| Supplier cannot use restaurant-only keys (`deal_redemptions_per_day`, quick list keys, etc.) | **Reject**                               |
| Values must be **integer ≥ 0** or **`-1`** (unlimited)                                       | **Reject** `null`, floats, strings       |
| `storage_mb` must be **≥ 1**                                                                 | **Reject** `0`, negative, `-1`           |
| `users` numeric must be **≥ 1** (or `-1` unlimited)                                          | **Reject** `0`                           |
| Supplier `warehouses` may be **0**                                                           | Allowed                                  |

### Features

| Rule                                                    | Enforcement                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `features` must be a plain JSON object                  | **Reject**                                                                 |
| Only canonical keys per tenant type (`feature-keys.js`) | **Reject** unknown keys (no ad-hoc custom keys)                            |
| `approvals_budgets`                                     | **Reject** if key present (removed product)                                |
| Feature values                                          | **Reject** nested objects/arrays; allow boolean, string tier label, number |

### Free Trial catalog

| Rule                     | Enforcement                                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| `free` plan `trial_days` | **Reject** unless **3–7** (`FREE_TRIAL_MIN_DAYS` / `FREE_TRIAL_MAX_DAYS`) |

### Enterprise

| Rule                                   | Enforcement                                           |
| -------------------------------------- | ----------------------------------------------------- |
| `POST` plan `code=enterprise`          | **Reject** unless `confirmEnterpriseActivation: true` |
| `PATCH` `isActive: true` on enterprise | **Reject** unless `confirmEnterpriseActivation: true` |

### Tier ladder (non-blocking)

| Rule                                        | Enforcement                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| Lower tier limit > higher tier for same key | **Warn** in `data.validationWarnings`; save still allowed; logged server-side |

### Plan limit override POST

| Rule                                                   | Enforcement                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `limit_type` must be applicable for plan `tenant_type` | **Reject** e.g. `promotions` on restaurant via `isLimitKeyApplicable` |

---

## 3. Risks (remaining)

| Risk                                                         | Severity       | Notes                                                                      |
| ------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------- |
| **Partial limit PATCH replaces entire JSON**                 | Medium         | Pre-existing: saving plan sends full limits object from editor state       |
| **Tier feature strings still not differentiated at runtime** | High (product) | Validator allows tier labels; routes use binary on/off                     |
| **Free Trial feature parity (`0112`)**                       | High (GTM)     | Validator does not block Gold-level features on `free` plan                |
| **Price edits not blocked**                                  | Low            | Intentionally out of scope; pricing changes are operational                |
| **No automatic migration rollback**                          | Low            | Bad admin edit is audited but not versioned                                |
| **Enterprise sparse catalog**                                | Low            | Inactive row may have incomplete JSON; assignment is admin-only            |
| **Override routes**                                          | Low            | Tenant/plan overrides still increase-only; not re-validated against ladder |

---

## 4. Manual QA checklist

### Plan PATCH (RESTAURANT)

- [ ] Set `limits.promotions` → **400** (unknown / not applicable)
- [ ] Set `limits.storage_mb` to `0` or `-1` → **400**
- [ ] Set `limits.orders_per_day` to `"20"` → **400**
- [ ] Add `features.approvals_budgets` → **400**
- [ ] Lower Gold `orders_per_day` below Silver → **200** with `validationWarnings` array non-empty
- [ ] Set `free` plan `trialDays` to `14` → **400**

### Plan PATCH (SUPPLIER)

- [ ] Set `limits.promotions` to valid integer → **200**
- [ ] Set `limits.deal_redemptions_per_day` → **400**
- [ ] `warehouses: 0` on Silver → **200**

### Enterprise

- [ ] `PATCH` enterprise `isActive: true` without confirm → **400**
- [ ] Same with `confirmEnterpriseActivation: true` → **200** (if used intentionally)

### Overrides (unchanged behavior)

- [ ] Tenant override increases cap only
- [ ] Plan override on restaurant cannot use `promotions` key

### Regression

```bash
cd apps/api
npm run test:run -- src/lib/plan-admin-validation.test.js src/routes/admin-dashboard.routes.test.js src/lib/limit-resolution.test.js src/lib/subscription.test.js

cd apps/web
npm run test:run -- src/lib/adminPlanSaveFeedback.test.ts
```

---

## 5. Tests added

| File                                                 | Coverage                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/lib/plan-admin-validation.test.js`     | Unit: limits/features, storage, users, promotions split, removed features, trial days, enterprise, ladder warnings |
| `apps/api/src/routes/admin-dashboard.routes.test.js` | Integration: POST rejections, PATCH JSON/approvals/ladder warnings/enterprise                                      |
| `apps/web/src/lib/adminPlanSaveFeedback.test.ts`     | Web: normalize PATCH payload; error message formatting                                                             |

---

## 6. Files changed (implementation)

| File                                                   | Change                                                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/lib/plan-admin-validation.js`            | **New** — shared validation + ladder warnings                                                                         |
| `apps/api/src/lib/plan-admin-validation.test.js`       | **New** — unit tests                                                                                                  |
| `apps/api/src/routes/admin-dashboard.routes.js`        | Use validator; Zod JSON object refine; enterprise/trial guards; `validationWarnings` on PATCH; override applicability |
| `apps/api/src/routes/admin-dashboard.routes.test.js`   | Extended plan safety tests                                                                                            |
| `apps/web/src/lib/adminPlanSaveFeedback.ts`            | Normalize PATCH result; format validation errors                                                                      |
| `apps/web/src/lib/adminPlanSaveFeedback.tsx`           | Success/warning and error toasts                                                                                      |
| `apps/web/src/lib/adminPlanSaveFeedback.test.ts`       | Web unit tests (normalize + error format)                                                                             |
| `apps/web/src/pages/AdminDashboardPage.tsx`            | Plan save UX, Enterprise confirm, Free trial hint                                                                     |
| `apps/web/src/services/api.ts`                         | `updateAdminPlan` returns `validationWarnings`                                                                        |
| `docs/monetization/ADMIN_TIER_EDITING_SAFETY_AUDIT.md` | **This document**                                                                                                     |

---

## 7. Admin UI — plan save feedback (2026-05-28)

| Behavior                                | UX                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Save succeeds, no warnings              | Green toast: `Plan “{name}” saved`                                                |
| Save succeeds with `validationWarnings` | Amber custom toast: **Saved with warnings** + bulleted ladder messages (12s)      |
| Validation error (400)                  | Red custom toast: **Plan save failed** + full API message and Zod `details` lines |
| Enterprise `isActive`                   | Amber inline panel + checkbox → sends `confirmEnterpriseActivation: true`         |
| Free `trial_days`                       | Inline hint: 3–7 days; API rejects out-of-range on save                           |

**Files:** `apps/web/src/lib/adminPlanSaveFeedback.ts`, `adminPlanSaveFeedback.tsx`, `AdminDashboardPage.tsx`, `updateAdminPlan` mutation `transformResponse`.

## 8. Unsafe gaps still open

1. **No server-side ladder enforcement** — warnings only; deliberate admin override possible.
2. **Free plan feature set not constrained** — only limits/trial_days hardened.
3. **Pricing / `code` / `tenant_type` changes** — not part of this hardening pass.
4. **Bulk import / raw SQL** — bypasses API validation.
5. **Limits/features JSON editor** — not in admin UI yet; wire same notify helpers when added.

### Plan save UI QA

- [ ] PATCH with ladder warnings → amber **Saved with warnings** toast (bulleted list), modal closes
- [ ] PATCH validation error → red toast with API message (trial days, enterprise, invalid limits)
- [ ] Enterprise Active without checkbox → error toast mentions `confirmEnterpriseActivation`

---

## 9. Tenant & plan override behavior (preserved)

- `plan_limit_override` / `tenant_limit_override`: **increase-only** vs plan default (`applyIncreaseOnly` in `limit-resolution.js`).
- Expired or inactive overrides ignored.
- Subscription assignment: tenant type match, usage check on downgrade, `force` + `reason` escape hatch.
- Cache invalidation on subscription change unchanged.
