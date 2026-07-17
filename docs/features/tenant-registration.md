# Tenant Registration And Account Activation

New users register in Keycloak, complete organization setup in Supplify, then unlock the workspace by starting a 30-day trial of a selected paid plan or by activating a paid subscription.

## Personas

| Role after setup | Signup path                         | Default lock                                                |
| ---------------- | ----------------------------------- | ----------------------------------------------------------- |
| **RESTAURANT**   | `/register/complete` -> Restaurant  | `pending_activation` on the internal trial subscription row |
| **SUPPLIER**     | `/register/complete` -> Supplier    | Same                                                        |
| **PENDING**      | Until `POST /api/register/complete` | No tenant APIs                                              |

## Registration Flow

1. User opens **Register** on `/login` -> Keycloak hosted registration (`GET /auth/register`).
2. On first login, `app_user.role` is **PENDING**; web redirects to `/register/complete`.
3. User selects **Restaurant** or **Supplier**, enters business name and optional phone.
4. `POST /api/register/complete` creates tenant, org, roles, catalog (supplier), default warehouse (supplier), and a subscription row with `lock_reason = pending_activation`.
5. User is redirected to `/app/activate` (billing middleware blocks other app routes until unlocked).

`AuthGuard` sends users with `role === PENDING` or `needsSetup === true` back to `/register/complete`. After complete, the client refetches `GET /auth/me` before navigating into the app shell.

## Activation Flow

While `pending_activation` is set (`account_locked_at` + `lock_reason` on `subscription`):

| Action                 | UI                                                                             | API                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Start 30-day trial** | `/app/activate` or upgrade modal -> choose Growth or Scale for the tenant type | `POST /api/billing/checkout` with the internal trial/free `planId`, selected `trialTargetPlanId`, and no `paymentMethodId` |
| **Paid plan**          | **Compare plans & pay** -> payment modal                                       | `POST /api/billing/checkout` with card / saved method                                                                      |
| **Admin unlock**       | Admin console                                                                  | `POST .../subscriptions/:id/unlock`                                                                                        |
| **Admin extend trial** | Admin -> Subscriptions -> **Extend trial** (expired trial)                     | `POST .../extend-free-trial` (`days` 7-90)                                                                                 |

Trial checkout calls the existing free/trial activation path, clears `account_locked_at` and `lock_reason`, sets `free_sandbox_expires_at`, stores the selected paid target plan, and records `account.activated` in `billing_event`. On first activation, `notifyBillingTrialStarted` is sent to the tenant team.

After trial expiry, tenants remain able to **log in and view** data; writes require paid activation or admin extension. See [free-trial-expiry.md](./free-trial-expiry.md).

## Notifications On Signup

| Event               | Channel                         | Notes                                                                 |
| ------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Welcome             | Email (`auth.welcome`) + in-app | Direct email to registrant; in-app uses `skipEmail` on duplicate path |
| New tenant (admin)  | In-app + email                  | `notifyAdminNewTenant` to platform admins                             |
| Trial started       | In-app + email + WhatsApp       | After registration subscription + trial activation                    |
| Paid plan activated | In-app + email + WhatsApp       | `notifyBillingActivated` on successful checkout                       |
| Plan changed        | In-app + email + WhatsApp       | `notifyBillingPlanChanged` on checkout or admin plan PATCH            |

See [notifications-summary.md](../product/notifications-summary.md).

**Referral signup:** When a restaurant completes registration with `referralToken` (from supplier invite URL `/register?ref=...`), the system records attribution, starts the platform trial, auto-follows the referring supplier, and preserves eligibility for the referral first-paid discount. See [supplier-customer-growth.md](./supplier-customer-growth.md).

## API

| Method | Path                     | Auth    | Notes                                                                                                    |
| ------ | ------------------------ | ------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/api/register/status`   | Session | `{ needsSetup: boolean }`                                                                                |
| POST   | `/api/register/complete` | Session | Body: `accountType`, `businessName`, `phone?`, `referralToken?` (from `/register?ref=`)                  |
| GET    | `/api/billing/status`    | Tenant  | Includes `access.pendingActivation`, `access.isLocked`, plan, trial target, add-ons, and recurring total |
| POST   | `/api/billing/checkout`  | Tenant  | Trial activation does not require `paymentMethodId`; paid activation does                                |

Allowed while locked (activation / payment): `/api/register/*`, `/api/billing/*`, `/api/subscriptions/entitlements` (GET), auth routes.

**Trial expired:** all above plus **any tenant GET** (read-only); writes return **402** with trial message.

## Web Modules

| File                        | Role                                                                             |
| --------------------------- | -------------------------------------------------------------------------------- |
| `RegisterCompletePage.tsx`  | Tenant type + business name form                                                 |
| `AccountActivationPage.tsx` | Activation gate; trial + paid CTAs                                               |
| `lib/activateFreePlan.ts`   | Compatibility helper for internal trial/free checkout                            |
| `UpgradeModal.tsx`          | Tenant-specific plan compare; pending users can start a trial of Growth or Scale |
| `PaymentModal.tsx`          | Skips card when the internal trial/free path or a zero-dollar admin flow is used |

## Tests

| Layer            | File                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| Unit (API)       | `apps/api/src/lib/register-account.test.js` (restaurant + supplier)        |
| Unit (API)       | `apps/api/src/routes/register.routes.test.js`                              |
| Unit (API)       | `apps/api/src/lib/billing/billing-service.test.js` (trial unlock)          |
| Unit (API)       | `apps/api/src/routes/billing.routes.test.js`                               |
| Unit (API)       | `apps/api/src/middlewares/billingAccess.test.js`                           |
| Unit (API)       | `apps/api/src/lib/platform-settings.test.js` (trial days 7-90, default 30) |
| Unit (web)       | `apps/web/src/lib/activateFreePlan.test.ts`                                |
| API (Playwright) | `tests/api/registration-activation.spec.ts`                                |
| Manual QA        | `docs/qa/regression-checklist.md` - CRST-_ / CSUP-_ / **BIL-FT-\***        |

## QA References

- Restaurant: Part 1 (`CRST-01` ... `CRST-28`)
- Supplier: Part 2 (`CSUP-01` ... `CSUP-13+`)
- Stub card for paid tiers: `4242424242424242` when `BILLING_GATEWAY=stub`
