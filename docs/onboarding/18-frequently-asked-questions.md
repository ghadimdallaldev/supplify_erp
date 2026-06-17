# 18 — Frequently Asked Questions

**Audience:** Sales, customer support, onboarding specialists, and developers answering real customer questions.

**Grounding:** Answers reflect current plan matrices (`10-subscriptions-and-plans.md`), RBAC (`09-authentication-rbac.md`, `role-matrix.js`), and registration/billing flows verified against the repository.

---

## Sales & pricing

### What plans does Supplify offer?

Four self-serve tiers for **both** restaurant and supplier workspaces: **Free Trial** (`free`), **Silver** ($49/mo), **Gold** ($149/mo), and **Platinum** ($349/mo). Yearly pricing is available at roughly 10× monthly. Legacy **Enterprise** was removed; `enterprise` codes normalize to `platinum` for comparisons only.

### What is included in Free Trial?

Free Trial uses **Gold feature gates** with **Free limit caps** — prospects can explore nearly the full product surface for ~7 days (configurable `free_sandbox_days`), not a crippled demo. After sandbox expiry, the account becomes read-only for most GETs; writes return **402** until upgrade.

### Which plan should a single-location restaurant start on?

**Silver** if they need paid support and modest volume (20 orders/day, 5 suppliers, 1 branch). **Gold** if they need multi-branch (3 branches), smart reorder, advanced roles, API keys, or higher daily order volume (100/day). **Platinum** removes most numeric caps and adds advanced reporting/AI forecast tiers.

### Which plan should a regional distributor start on?

**Silver** enables one warehouse and basic fulfillment. **Gold** adds multi-warehouse (3 warehouses, 3 branches), driver management, and warehouse pick/pack fulfillment tools. **Platinum** adds routing suite and unlimited warehouses/branches/SKUs.

### Can a customer mix restaurant and supplier accounts on one login?

**No.** `user_workspace_membership` allows **one** active restaurant **or** supplier workspace per email. Same-organization branch invites are allowed; a second unrelated tenant on the same email is rejected at invite accept.

### Do restaurants and suppliers need separate subscriptions?

**Yes.** Each tenant row has its own `subscription`. A company that is both buyer and seller must register two workspaces (two emails or sequential accounts per policy).

### What happens when they hit a limit mid-month?

API returns **403 LIMIT_EXCEEDED** with upgrade payload (`recommendPlan()` suggests next tier). Daily meters (`orders_per_day`, `chats_per_day`, `ai_requests_per_day`) reset at UTC day boundary. Admins can apply **tenant limit overrides** (increase-only) without changing plan code.

### Is custom branding available on Silver?

**No.** `custom_branding` is off on Silver for both tenant types. Gold enables logo/colors; Platinum adds white-label domain tier string.

### Can we quote API access on Silver?

**No.** `api_integrations` is disabled on Silver. Gold grants `api_key_access`; Platinum grants `full_api_webhooks`.

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

### Can we create custom roles on Silver?

**No.** `advanced_roles` is off on Silver for both tenant types. System roles only until Gold upgrade.

### What is the Viewer role for?

Read-only audit/training accounts. All `*_VIEW` keys for that tenant type; **no** create/edit/manage. Useful for executives or external accountants who should not mutate data.

### Does Owner bypass permissions in the API?

**Yes** for tenant Owner role in `requirePermission`. **Impersonation does not** automatically grant Owner — admin view-as uses selected role permissions.

### What is Staff Portal vs Team member?

**Staff Portal** (`STAFF_PORTAL`) = scheduling/PTO for hourly staff at `/staff` — separate from procurement RBAC. **Team member** = `tenant_user_roles` with permissions like Purchaser or Receiving Staff.

---

## Restaurants — operations

### How many suppliers can a Free Trial restaurant follow?

**One** (`suppliers_per_restaurant` limit on Free). Gold allows 30; Platinum unlimited.

### Why doesn’t ETA show on tracking?

Common causes: (1) restaurant has not set **delivery coordinates** (lat/long required — address text alone is insufficient); (2) driver has not set status to `out_for_delivery`; (3) supplier lacks `driver_management` (Gold+).

### Can receiving staff create orders?

**No** unless given a role with `ORDERS_CREATE`. **Receiving Staff** is view orders + receive only.

### What plan is needed for disputes?

`disputes_returns` is enabled on **all tiers** including Free Trial (Gold feature parity). User still needs appropriate permissions (often Manager or Receiving for restaurant side).

### What plan is needed for smart reorder suggestions?

`smart_reorder` — **off on Silver**; full on Gold (`full_90day_trends`); AI forecast on Platinum. Gold also enables `ai_platform` with `ai_requests_per_day` limit (20 on Gold, 100 on Platinum).

### Are quick lists available to suppliers?

**No.** `quick_lists` is not enabled on supplier plan JSON — restaurant-only ordering lists feature.

### Can Silver restaurants use multiple branches?

**No.** `multi_branch` is off on Silver (limit still 1 branch). Gold enables multi-branch up to 3 branches; Platinum unlimited.

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

### Is driver management on Silver?

**No.** `driver_management` requires **Gold+**. Without it, delivery board features for assigning drivers are gated.

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
