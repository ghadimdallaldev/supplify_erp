# Tenant registration & account activation

New users register in Keycloak, complete organization setup in Supplify, then unlock the workspace by choosing a subscription plan (including self-service **Free**).

## Personas

| Role after setup | Signup path                         | Default lock                          |
| ---------------- | ----------------------------------- | ------------------------------------- |
| **RESTAURANT**   | `/register/complete` → Restaurant   | `pending_activation` on Free plan row |
| **SUPPLIER**     | `/register/complete` → Supplier     | Same                                  |
| **PENDING**      | Until `POST /api/register/complete` | No tenant APIs                        |

## Registration flow

1. User opens **Register** on `/login` → Keycloak hosted registration (`GET /auth/register`).
2. On first login, `app_user.role` is **PENDING**; web redirects to `/register/complete`.
3. User selects **Restaurant** or **Supplier**, enters business name and optional phone.
4. `POST /api/register/complete` creates tenant, org, roles, catalog (supplier), default warehouse (supplier), and a subscription row with `lock_reason = pending_activation`.
5. User is redirected to `/app/activate` (billing middleware blocks other app routes until unlocked).

`AuthGuard` sends users with `role === PENDING` or `needsSetup === true` back to `/register/complete`. After complete, the client refetches `GET /auth/me` before navigating into the app shell.

## Activation flow

While `pending_activation` is set (`account_locked_at` + `lock_reason` on `subscription`):

| Action                           | UI                                                                                             | API                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Activate free plan** (no card) | `/app/activate` → **Activate free plan**, or upgrade modal **Activate free plan** on Free tier | `POST /api/billing/checkout` with Free `planId`, no `paymentMethodId` |
| **Paid plan**                    | **Compare plans & pay** → payment modal                                                        | `POST /api/billing/checkout` with card / saved method                 |
| **Admin unlock**                 | Admin console                                                                                  | `POST …/subscriptions/:id/unlock`                                     |
| **Admin extend Free Trial**      | Admin → Subscriptions → **Extend trial** (expired trial)                                       | `POST …/extend-free-trial` (`days` 7–90)                              |

Free checkout calls `applyFreePlan`, which clears `account_locked_at` and `lock_reason`, sets `free_sandbox_expires_at`, and records `account.activated` in `billing_event`. On first activation, `notifyBillingTrialStarted` is sent to the tenant team.

After trial expiry, tenants remain able to **log in and view** data; writes require upgrade or admin extend. See [free-trial-expiry.md](./free-trial-expiry.md).

## Notifications on signup

| Event               | Channel                         | Notes                                                                 |
| ------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Welcome             | Email (`auth.welcome`) + in-app | Direct email to registrant; in-app uses `skipEmail` on duplicate path |
| New tenant (admin)  | In-app + email                  | `notifyAdminNewTenant` to platform admins                             |
| Free trial started  | In-app + email + WhatsApp       | After registration subscription + on `applyFreePlan` activation       |
| Paid plan activated | In-app + email + WhatsApp       | `notifyBillingActivated` on successful checkout                       |
| Plan changed        | In-app + email + WhatsApp       | `notifyBillingPlanChanged` on checkout or admin plan PATCH            |

See [notifications-summary.md](../product/notifications-summary.md).

**Referral signup:** When a restaurant completes registration with `referralToken` (from supplier invite URL `/register?ref=…`), the system records attribution, applies the platform Free Trial, auto-follows the referring supplier, and preserves eligibility for the referral first-paid discount. See [supplier-customer-growth.md](./supplier-customer-growth.md).

## API

| Method | Path                     | Auth    | Notes                                                                                   |
| ------ | ------------------------ | ------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/register/status`   | Session | `{ needsSetup: boolean }`                                                               |
| POST   | `/api/register/complete` | Session | Body: `accountType`, `businessName`, `phone?`, `referralToken?` (from `/register?ref=`) |
| GET    | `/api/billing/status`    | Tenant  | Includes `access.pendingActivation`, `access.isLocked`                                  |
| POST   | `/api/billing/checkout`  | Tenant  | Free plan does not require `paymentMethodId`                                            |

Allowed while locked (activation / payment): `/api/register/*`, `/api/billing/*`, `/api/subscriptions/entitlements` (GET), auth routes.

**Free Trial expired:** all above plus **any tenant GET** (read-only); writes return **402** with trial message.

## Web modules

| File                        | Role                                                           |
| --------------------------- | -------------------------------------------------------------- |
| `RegisterCompletePage.tsx`  | Tenant type + business name form                               |
| `AccountActivationPage.tsx` | Activation gate; free + paid CTAs                              |
| `lib/activateFreePlan.ts`   | One-click free checkout helper                                 |
| `UpgradeModal.tsx`          | Plan compare; pending users get **Activate free plan** on Free |
| `PaymentModal.tsx`          | Skips card when `planCode === free` or charge is $0            |

## Tests

| Layer            | File                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| Unit (API)       | `apps/api/src/lib/register-account.test.js` (restaurant + supplier)        |
| Unit (API)       | `apps/api/src/routes/register.routes.test.js`                              |
| Unit (API)       | `apps/api/src/lib/billing/billing-service.test.js` (free unlock)           |
| Unit (API)       | `apps/api/src/routes/billing.routes.test.js`                               |
| Unit (API)       | `apps/api/src/middlewares/billingAccess.test.js`                           |
| Unit (API)       | `apps/api/src/lib/platform-settings.test.js` (trial days 7–90, default 30) |
| Unit (web)       | `apps/web/src/lib/activateFreePlan.test.ts`                                |
| API (Playwright) | `tests/api/registration-activation.spec.ts`                                |
| Manual QA        | `docs/qa/regression-checklist.md` — CRST-_ / CSUP-_ / **BIL-FT-\***        |

## QA references

- Restaurant: Part 1 (`CRST-01` … `CRST-28`)
- Supplier: Part 2 (`CSUP-01` … `CSUP-13+`)
- Stub card for paid tiers: `4242424242424242` when `BILLING_GATEWAY=stub`
