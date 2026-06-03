# Billing & Activation Regression Audit

**Date:** 2026-05-28 (updated)  
**Scope:** Subscription activation, billing locks, Free Trial expiry, paid plans, impersonation billing, entitlements, admin billing actions.  
**Out of scope:** New features, tier price/limit changes, Deals/Promotions logic, UI redesign.

---

## Summary

| Area                      | Status             | Regression tests                                                                                                            |
| ------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Account activation        | **Covered**        | `subscription-activation.test.js`, free/paid checkout tests, `billingActivationRedirect.test.ts` (Layout uses same helpers) |
| Free Trial expiry job     | **Covered**        | `free-sandbox-expiry.job.test.js`                                                                                           |
| Billing access middleware | **Hardened**       | `billingAccess.test.js` (+ impersonation)                                                                                   |
| Plan / entitlements       | **Covered**        | API `formatPlanDisplayName` on entitlements/current/billing status; `subscription.test.js`, `plan-codes.test.js`            |
| Upgrade / lock UX         | **Covered**        | `BillingOverdueBanner.test.tsx`, `buildAccountLockedError`                                                                  |
| Paid checkout (stub)      | **Covered** (unit) | `billing-paid-checkout.test.js` — not full browser e2e                                                                      |
| Admin actions             | **Covered**        | `admin-dashboard.routes.test.js`                                                                                            |
| Impersonation + billing   | **Hardened**       | Middleware + `billing.routes.test.js` checkout 403                                                                          |

---

## 1. Account activation

| Check                                 | Implementation                                         | Tests                                                          |
| ------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| Pending activation → `/app/activate`  | `Layout.tsx` + `shouldRedirectToActivate`              | `billingActivationRedirect.test.ts`                            |
| Activated tenant accesses app         | `canEnterAppShell` / unlocked access                   | `billingActivationRedirect.test.ts`, `billing-service.test.js` |
| Activation creates/links subscription | `createPendingActivationSubscription`; `applyFreePlan` | `subscription-activation.test.js`                              |
| Free Trial expiry on activate         | `applyFreePlan` sets `free_sandbox_expires_at`         | Free checkout SQL assertion                                    |
| Active paid bypasses activation       | `applyPaidSubscription` after stub charge              | `billing-paid-checkout.test.js`                                |

---

## 2. Free Trial expiry job

**Job:** `apps/api/src/jobs/free-sandbox-expiry.job.js` (`runFreeSandboxExpiryJob`)

| Check                                            | Test                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| Active trial before expiry not locked            | `computeBillingAccessState` with future `free_sandbox_expires_at` |
| Expired trial locked with `free_sandbox_expired` | Job SQL + post-lock access state                                  |
| Paid plans excluded                              | SQL asserts `sp.code = 'free'` only                               |
| Already locked not re-processed                  | SQL `lock_reason IS DISTINCT FROM` / `account_locked_at IS NULL`  |
| Expired trial read-only semantics                | Access flags align with `billingAccessMiddleware` GET vs POST     |

---

## 3. Billing access middleware

| Scenario                          | Expected                    | Test                                                |
| --------------------------------- | --------------------------- | --------------------------------------------------- |
| Active paid subscription          | Allowed                     | `calls next when tenant is not locked`              |
| Free Trial active                 | Allowed                     | `active Free Trial with future expiry`              |
| Free Trial expired                | GET allowed; POST/PATCH 402 | GET + POST trial tests                              |
| Overdue / locked                  | 402 on mutations            | `blocks PATCH when locked for overdue`              |
| Pending activation                | 402 (non-billing paths)     | `returns 402 when tenant billing access is locked`  |
| Admin impersonating locked tenant | 402 on writes               | `enforces billing lock when admin is impersonating` |

---

## 4. Plan display name consistency

**Central formatter (API):** `apps/api/src/lib/plan-codes.js` → `formatPlanDisplayName`

Applied in:

- `getEntitlements()` → `plan.name`
- `GET /api/subscriptions/current` → `plan_name`
- Synthetic Free fallback on `GET /entitlements`
- `getBillingStatus()` → `subscription.planName`

**Frontend:** `apps/web/src/lib/planComparison.ts` → same rules for UI-only paths (upgrade modal, settings).

DB rows remain `name = 'Free'`; API/UI expose **Free Trial**.

---

## 5. Upgrade / lock UX

| Check                   | Tests                               |
| ----------------------- | ----------------------------------- |
| Free Trial expired copy | `BillingOverdueBanner.test.tsx`     |
| Pending activation CTA  | `BillingOverdueBanner.test.tsx`     |
| Payment lock banner     | `BillingOverdueBanner.test.tsx`     |
| Layout redirect         | `billingActivationRedirect.test.ts` |

---

## 6. Paid checkout

| Layer               | Coverage                                                                |
| ------------------- | ----------------------------------------------------------------------- |
| Unit (stub gateway) | `billing-paid-checkout.test.js` — charge succeeds, clears `lock_reason` |
| Browser e2e         | **Not automated** — manual QA below                                     |

### Manual QA: paid checkout (stub provider)

Prerequisites: API `BILLING_GATEWAY=stub` (default), tenant with `pending_activation` or expired trial, at least one payment method on file (or add via billing UI).

1. Log in as restaurant or supplier test account.
2. Open **Settings → Subscription** (or `/app/activate` if pending).
3. Choose **Silver** (or Gold), monthly cycle.
4. Complete checkout — stub should succeed without real card network.
5. Confirm: redirect to app dashboard; `GET /api/billing/status` shows `isLocked: false`, `pendingActivation: false`.
6. Confirm: `GET /api/subscriptions/entitlements` shows paid plan code and `plan.name` not stuck on Free Trial.
7. Place a test order (or supplier mutation) — should **not** return 402.

---

## Remaining manual-only checks

1. **Full Playwright paid checkout** — would need e2e seed scenario + payment method fixture (deferred; unit stub test covers API path).
2. **Free sandbox job scheduler** — job function tested; cron wiring / production schedule not unit-tested.
3. **CANCELLED subscription edge cases** — multiple rows per tenant.
4. **Live Stripe / Wish Money** — out of scope; stub/manual only.

---

## Test commands (non-watch)

```bash
cd apps/api && pnpm test:run \
  src/jobs/free-sandbox-expiry.job.test.js \
  src/middlewares/billingAccess.test.js \
  src/lib/billing/billing-service.test.js \
  src/lib/billing/billing-paid-checkout.test.js \
  src/lib/billing/subscription-activation.test.js \
  src/lib/plan-codes.test.js \
  src/lib/subscription-plan-display.test.js \
  src/routes/subscriptions.routes.test.js \
  src/routes/billing.routes.test.js

cd apps/web && pnpm test:run \
  src/lib/billingActivationRedirect.test.ts \
  src/components/billing/BillingOverdueBanner.test.tsx \
  src/lib/activateFreePlan.test.ts
```
