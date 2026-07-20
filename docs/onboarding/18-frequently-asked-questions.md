# 18 — Frequently Asked Questions

**Audience:** Sales, customer support, onboarding specialists, and developers answering real customer questions.

**Grounding:** Commercial plan names and matrices → [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md). Enforcement details → [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md). RBAC → [09-authentication-rbac.md](./09-authentication-rbac.md), `role-matrix.js`.

---

## Sales & pricing

### What plans does Supplify offer?

Tenant-specific **Growth** and **Scale** plans plus a **30-day Free Trial**. Internal codes stay `free` / `silver` / `gold` / `platinum` for compatibility:

| Tenant     | Public plan       | Code       | Monthly |
| ---------- | ----------------- | ---------- | ------: |
| Restaurant | Restaurant Growth | `silver`   |     $49 |
| Restaurant | Restaurant Scale  | `gold`     |    $149 |
| Supplier   | Supplier Growth   | `gold`     |    $149 |
| Supplier   | Supplier Scale    | `platinum` |    $349 |

Yearly pricing is roughly 10× monthly (two months free). Custom / Enterprise rows are admin-only. See [four-plan-pricing-model.md](../product/four-plan-pricing-model.md).

### What is included in Free Trial?

Free Trial follows the selected **trial target** plan’s features (default Restaurant Growth or Supplier Growth) with trial / Free limit caps and a finite **AI trial pool** — default **30 days** (`free_sandbox_days`, admin 7–90). After sandbox expiry, the account becomes read-only for most GETs; writes return **402** until upgrade.

### Which plan should a single-location restaurant start on?

**Restaurant Growth** for one active branch and core purchasing/receiving/inventory. Upgrade to **Restaurant Scale** for multi-branch (up to 3), richer smart reorder / NL ask, advanced roles, and higher AI/storage.

### Which plan should a regional distributor start on?

**Supplier Growth** for catalog, fulfillment, finance, and 50 active ordering customer locations / month. **Supplier Scale** for multi-warehouse / driver depth, 200 active customer locations / month, and higher AI/ops limits. Add-ons can extend Scale capacity.

### Can a customer mix restaurant and supplier accounts on one login?

**No.** `user_workspace_membership` allows **one** active restaurant **or** supplier workspace per email. Same-organization branch invites are allowed; a second unrelated tenant on the same email is rejected at invite accept.

### Do restaurants and suppliers need separate subscriptions?

**Yes.** Each tenant row has its own `subscription`. A company that is both buyer and seller must register two workspaces (two emails or sequential accounts per policy).

### What happens when they hit a limit mid-month?

API returns **403 LIMIT_EXCEEDED** with upgrade payload (`recommendPlan()` suggests next tier). Daily meters (`orders_per_day`, `chats_per_day`, `ai_requests_per_day`) reset at UTC day boundary. Admins can apply **tenant limit overrides** (increase-only) without changing plan code.

### Is custom branding available on Restaurant Growth / Supplier Growth?

Logo + colors land on Growth where `custom_branding` is `logo_colors`. White-label / custom domain is Scale-tier (`white_label_domain`) where implemented. Confirm the tenant’s plan feature JSON before promising domains.

### Can we quote API access on Growth?

`api_integrations` is plan-gated. Treat developer API / full webhooks as Scale / catalog capabilities — confirm the tenant entitlement before quoting.

### What plan is needed for smart reorder suggestions?

Restaurant **`smart_reorder`** with forecast capability (Restaurant Growth `full_90day_trends` or Scale `ai_forecast_seasonality`). Genuine LLM **explain / ask / ai-recommend** also need `ai_platform`, env AI credentials, and remaining quota (paid: Growth **30**/day, Scale **150**/day; trial: pool). Forecast fallbacks must never be labeled as AI. Details: [../features/ai-smart-reorder.md](../features/ai-smart-reorder.md).

### Can Growth restaurants use multiple branches?

Restaurant Growth is commercially **1 active branch**. Restaurant Scale allows **3** (plus paid branch add-ons). `multi_branch` and the `branches` limit both apply.

---

## Onboarding & activation

### Why can’t the customer save settings or place orders after signup?

New tenants have `lock_reason = pending_activation`. They must complete **`/app/activate`** — either activate Free or complete paid checkout. Until then, `billingAccessMiddleware` blocks writes (**402**).

### What is the difference between pending activation and Free Trial expiry?

| State                | Trigger                                       | Effect                                            |
| -------------------- | --------------------------------------------- | ------------------------------------------------- |
| Pending activation   | Registration complete, no activation checkout | No writes until `/app/activate`                   |
| Free sandbox expired | `free_sandbox_expires_at` passed              | Read-mostly; writes and sensitive exports blocked |

### What data is required to register a supplier vs restaurant?

Both need account type, **business name**, legal acceptance. Phone optional. Supplier registration creates default catalog and warehouse scaffold. Restaurant registration creates org and default branch.

### How long does onboarding take?

Self-serve minimum path: register → activate → profile → first catalog/order — **under 30 minutes** with prepared data. Full production rollout (team, branches, warehouses, integrations) typically **1–2 weeks** depending on catalog size and training.

### Can admins create tenants without self-service signup?

**Suppliers:** yes via `POST /api/suppliers` (admin API). Subscription starts pending activation; owner must still be linked via invite. **Restaurants:** primarily self-service `/register/complete`; confirm latest admin API in `06-admin-onboarding.md`.

### What stub card works in demo/staging billing?

`4242424242424242` when `BILLING_GATEWAY=stub`.

---

## RBAC & team access

### What is the difference between a permission and a plan feature?

**Plan feature** = tenant paid for module (`finance_invoices`). **Permission** = user may act (`INVOICES_VIEW`). Both must pass. Example: Accountant role has invoice permissions, but Free Trial still needs `finance_invoices` enabled (it is, via Gold parity).

### Can a purchaser receive goods?

**Not by default.** **Purchaser** has `ORDERS_CREATE` but not `RECEIVING_MANAGE`. Assign **Receiving Staff** or **Restaurant Manager** for receiving.

### Can a supplier driver see the full supplier portal?

**No.** **Driver** role only has `DRIVER_DELIVERIES_VIEW` and `DRIVER_DELIVERIES_MANAGE`. Sidebar shows **My Deliveries** (`/app/driver-deliveries`) only.

### Who can invite team members?

Restaurant: **Owner** (all permissions); Manager cannot `STAFF_INVITE` per role matrix. Supplier: **Owner** and roles with `STAFF_INVITE` / `STAFF_MANAGE` — Manager lacks staff manage. Custom roles possible with `advanced_roles` (Gold+).

### Can we create custom roles on Growth?

`advanced_roles` is typically off on entry Growth and on for Scale — confirm the tenant’s plan feature JSON. System roles only until the plan enables custom roles.

### What is the Viewer role for?

Read-only audit/training accounts. All `*_VIEW` keys for that tenant type; **no** create/edit/manage. Useful for executives or external accountants who should not mutate data.

### Does Owner bypass permissions in the API?

**Yes** for tenant Owner role in `requirePermission`. **Impersonation does not** automatically grant Owner — admin view-as uses selected role permissions.

### What is Staff Portal vs Team member?

**Staff Portal** (`STAFF_PORTAL`) = scheduling/PTO for hourly staff at `/staff` — separate from procurement RBAC. **Team member** = `tenant_user_roles` with permissions like Purchaser or Receiving Staff.

---

## Restaurants — operations

### How many suppliers can a Free Trial restaurant follow?

Confirm current Free / trial `suppliers_per_restaurant` in entitlements (trial follows Free limit caps). Paid Growth/Scale raise or remove commercial supplier caps per [four-plan-pricing-model.md](../product/four-plan-pricing-model.md).

### Why doesn’t ETA show on tracking?

Common causes: (1) restaurant has not set **delivery coordinates** (lat/long required — address text alone is insufficient); (2) driver has not set status to `out_for_delivery`; (3) supplier lacks `driver_management` (typically Supplier Growth+).

### Can receiving staff create orders?

**No** unless given a role with `ORDERS_CREATE`. **Receiving Staff** is view orders + receive only.

### What plan is needed for disputes?

`disputes_returns` is widely enabled including on trial when the trial target includes it. User still needs appropriate permissions (often Manager or Receiving for restaurant side).

### What plan is needed for smart reorder suggestions?

See **Sales & pricing** above — Restaurant Growth+ with `smart_reorder` forecast capability; LLM paths also need `ai_platform` + quota.

### Are quick lists available to suppliers?

**No.** `quick_lists` is restaurant-only ordering lists.

### Can Growth restaurants use multiple branches?

See **Sales & pricing** above — Restaurant Growth is 1 branch; Restaurant Scale is 3 (+ add-ons).

---

## Suppliers — operations

### How many warehouses on Free Trial?

Limit **`warehouses: 0`** on Free — warehouse feature keys exist via parity but count cap is zero on Free supplier limits table. **Silver** includes 1 warehouse.

### Who can decline orders?

Users with `ORDERS_MANAGE` — typically **Owner**, **Supplier Manager**, **Promotions Manager**. Fulfillment Staff can edit fulfillment progress but not decline at manage level.

### What roles should we assign for warehouse pickers?

**Warehouse Manager** or **Order Fulfillment Staff** — both have `FULFILLMENT_*`; Warehouse Manager also has `WAREHOUSES_EDIT`.

### How do substitutions work?

Supplier reports substitution from order detail → fulfillment issue + chat notification → pending **amendment** if product mapped → restaurant accepts/rejects. Lines do **not** auto-change.

### Can Catalog Manager see receivables?

**No.** Receivables API requires `INVOICES_VIEW`. **Catalog Manager** has catalog/inventory edit only — finance APIs return **403**.

### Is driver management on Supplier Growth?

`driver_management` is plan-gated for suppliers (typically Growth+ where the catalog enables it). Without it, delivery board features for assigning drivers are gated. Confirm entitlements before promising.

---

## Finance & billing

### Which roles can record payments?

**Accountant** on either side (`PAYMENTS_MANAGE`). Restaurant Manager and Supplier Manager have invoice **view** only, not payment manage per matrix.

### When are invoices created?

Typically from delivered/fulfilled orders via supplier finance workflow (see product guide). Requires `finance_invoices` — enabled Silver+ with `record_payments` tier; Free Trial has feature via parity.

### What does “aging” show?

Open receivable buckets by days outstanding on supplier finance dashboards — available when finance feature tier includes analytics (Gold `expense_analytics` / Platinum `advanced_finance_dashboard`).

### Can accountants change subscription plan?

Restaurant/supplier **Accountant** has `SUBSCRIPTIONS_VIEW` only — **not** `SUBSCRIPTIONS_MANAGE`. Owner handles plan changes.

### Why does export return 402 on expired Free Trial?

`billingAccessMiddleware` treats sensitive GETs (`/api/reports/*`, `*/export`, invoice PDF) as blocked when account locked — even though ordinary reads work.

---

## Support & admin

### How does support impersonate a customer?

Admin with `ADMIN_SUPPORT` → tenant row → impersonate → `impersonation_token` cookie. Session respects view-as role. All impersonation should be audit-logged. Stop via impersonate stop endpoint or logout.

### Can support upgrade a tenant without payment?

Admins with `ADMIN_PLANS` can change plan in admin dashboard / subscription APIs. Use for comps and escalations; document reason in audit.

### Why does admin see 402 while impersonating?

**By design.** Impersonating admins **do not** bypass billing lock — they experience what the tenant experiences for monetization enforcement.

### Where are audit logs?

Platform: `/app/admin` → Audit (`ADMIN_ACCESS`). Tenant activity log: Settings when `tenant_audit_log` enabled (Gold+).

### How do we reset a user password?

Admin **Users** tab (`ADMIN_SUPPORT`) or Keycloak admin console — not tenant Owner action for another user’s Keycloak password.

---

## Developers & technical

### Where is the permission list defined?

`apps/api/src/lib/permission-keys.js` — 52 keys. Role defaults in `role-matrix.js`. Tests: `tenant-role-matrix.test.js`.

### Where are plan features defined?

DB seeds in migrations `0117`, `0119`, `0120`, `0145`; runtime keys in `feature-keys.js`; Free → Gold override in `free-trial-plan-features.js`.

### How do I gate a new API route?

1. `requireAuth` + `requireRole` + `resolveTenantContext`
2. `requirePermission('DOMAIN_ACTION')`
3. `requireFeature('feature_key')` if module is plan-gated
4. `requireWithinLimit('limit_key')` if creating countable resource
5. Ensure route listed in route inventory audit

### How does frontend check entitlements?

`useEntitlements()` + helpers in `planFeatureGates.ts` / `planLimits.ts`. Check `planFeatures` **and** `features` for Free Trial parity.

### Is there a mobile app?

**supplify-mobile** (sibling repo) for native parity. Web is PWA-capable; drivers often use mobile browser or PWA.

### What auth cookies exist?

`access_token`, `refresh_token`, optional `impersonation_token`, `active_tenant`, session cookie for OAuth state.

### How long are permissions cached?

~180 seconds Redis (`perm:…`). Invalidate on role assignment via `invalidateUserPermissionCache()`.

### Where is tenant ID resolved?

`apps/api/src/lib/tenant-resolve.js` — impersonation → active branch cookie → workspace membership → primary contact fallback. **Do not** resolve only by contact email.

---

## Troubleshooting quick reference

| Symptom                   | Likely cause                                | Fix                                   |
| ------------------------- | ------------------------------------------- | ------------------------------------- |
| 402 on POST               | Pending activation or expired Free Trial    | `/app/activate` or upgrade            |
| 403 FEATURE_NOT_AVAILABLE | Plan lacks feature                          | Upgrade tier or admin override        |
| 403 LIMIT_EXCEEDED        | Plan cap hit                                | Upgrade or admin limit override       |
| 403 permission            | Role lacks key                              | Change role or custom role (Gold+)    |
| Empty driver board        | Not linked in `drivers` table or wrong role | Supplier admin links driver user      |
| Invite accept fails       | Email mismatch or second workspace          | Use invited email; one workspace rule |
| Sidebar missing Finance   | Feature off or `can()` false                | Check entitlements + permissions      |
| CSRF error on POST        | Missing `X-CSRF-Token`                      | Frontend base query must send header  |

---

## Related docs

- [17-glossary.md](./17-glossary.md) — term definitions
- [19-onboarding-checklists.md](./19-onboarding-checklists.md) — printable checklists
- [03-supplier-onboarding.md](./03-supplier-onboarding.md) — supplier steps
- [04-restaurant-onboarding.md](./04-restaurant-onboarding.md) — restaurant steps
- [06-admin-onboarding.md](./06-admin-onboarding.md) — platform admin
- [10-subscriptions-and-plans.md](./10-subscriptions-and-plans.md) — full matrices
