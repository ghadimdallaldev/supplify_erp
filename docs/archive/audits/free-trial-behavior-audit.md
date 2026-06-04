# Free Trial behavior audit

**Status:** P0 implemented (2026-05-28)  
**Canonical feature spec:** [../features/free-trial-expiry.md](../features/free-trial-expiry.md)

**Product decision:** DB plan code remains `free`; it is a **time-limited Free Trial / testing sandbox**, not a forever-free production tier. Broad feature access during the trial is **intentional** (`0112` Gold parity). **`0116` not applied.**

---

## P0 implementation summary

### Files changed

| File                                                           | Change                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/api/src/middlewares/billingAccess.js`                    | Read-only GET when `free_sandbox_expired`                                 |
| `apps/api/src/middlewares/billingAccess.test.js`               | Tests for trial GET vs POST                                               |
| `apps/api/src/lib/billing/billing-service.js`                  | Trial 402 message; `extendFreeSandboxTrial`; unlock extends expiry        |
| `apps/api/src/lib/billing/billing-service.test.js`             | Trial-specific error message test                                         |
| `apps/api/src/lib/platform-settings.js`                        | `clampFreeTrialDays`, 3–7 day bounds                                      |
| `apps/api/src/lib/platform-settings.test.js`                   | Clamp unit tests                                                          |
| `apps/api/src/routes/admin-dashboard.routes.js`                | `POST …/extend-free-trial`; unlock `freeTrialDays`; platform settings 3–7 |
| `apps/web/src/services/api.ts`                                 | `extendAdminFreeTrial` mutation                                           |
| `apps/web/src/pages/AdminDashboardPage.tsx`                    | “Extend trial” admin action                                               |
| `apps/web/src/components/admin/AdminPlatformSettingsPanel.tsx` | UI validation 3–7 days                                                    |
| `apps/web/src/components/billing/BillingOverdueBanner.tsx`     | Trial copy aligned with API                                               |

**Not changed:** paid tier catalog, Deals/Promotions business logic, `0116`, restaurant `promotions = 0`, supplier `warehouses = 1`.

### Expired trial read-only behavior

When `billing.access.isLocked` and `lock_reason === 'free_sandbox_expired'` (or `freeSandboxExpired === true`):

- **Allowed:** All tenant **`GET`** routes (orders, products, inventory, etc.).
- **Still allowed:** `/api/billing/*`, `/api/register/*`, `/auth/*`, `/health/*`, subscription entitlements GET allowlist.
- **Admins:** Unrestricted (middleware skips check).

### Blocked methods/actions after expiry

| Method                                                           | Result                   |
| ---------------------------------------------------------------- | ------------------------ |
| `POST`, `PUT`, `PATCH`, `DELETE` on tenant APIs                  | **402** `ACCOUNT_LOCKED` |
| `GET` on non-trial locks (`pending_activation`, payment overdue) | **402** (unchanged)      |

### Trial-specific 402 response

```json
{
  "name": "ACCOUNT_LOCKED",
  "message": "Your Free Trial has expired. Upgrade your plan to continue using Supplify.",
  "details": {
    "lockReason": "free_sandbox_expired",
    "freeSandboxExpired": true,
    "upgradeUrl": "/app/settings?tab=subscription"
  }
}
```

### Admin extend Free Trial flow

1. **`POST /api/admin-dashboard/subscriptions/:id/extend-free-trial`** — optional `{ days }` (3–7); clears lock; sets `free_sandbox_expires_at`.
2. **`POST …/unlock`** — for `free` + `free_sandbox_expired`, also extends trial (optional `{ freeTrialDays }`).
3. **Admin UI:** Subscriptions → **Extend trial** when `lock_reason === 'free_sandbox_expired'`.

### 3–7 day validation

- `FREE_TRIAL_MIN_DAYS = 3`, `FREE_TRIAL_MAX_DAYS = 7` in `platform-settings.js`.
- `getFreeSandboxDays()` clamps reads; `PATCH platform-settings` enforces on write.

---

## Deferred product decisions

| Decision                                             | Status                                  |
| ---------------------------------------------------- | --------------------------------------- |
| Restaurant `promotions` limit = 0 on production Free | Document only                           |
| Supplier `warehouses` limit = 1 on production Free   | Document only                           |
| Apply `0116` narrow Free catalog                     | **Do not apply** until product approves |

---

## Remaining risks

| Risk                              | Notes                                      |
| --------------------------------- | ------------------------------------------ |
| GET-only read path                | Unusual write-via-GET patterns not blocked |
| WebSocket / jobs                  | Not gated by `billingAccessMiddleware`     |
| Legacy DB `free_sandbox_days` > 7 | Clamped on read until admin saves 3–7      |
| Trial start not stored            | Infer from `created_at` / last activation  |
| Paid overdue lock                 | Still blocks GET (unchanged)               |

---

## Manual test: expired Free Trial

1. Lock a free subscription (SQL or wait for job):
   ```sql
   UPDATE subscription
   SET free_sandbox_expires_at = now() - interval '1 day',
       account_locked_at = now(),
       lock_reason = 'free_sandbox_expired'
   WHERE id = '<subscription_id>';
   ```
2. Tenant login → success.
3. **GET** `/api/orders` (or app lists) → **200**.
4. **POST** create order → **402** with trial message; banner on web.
5. Admin **Extend trial** → lock cleared; `free_sandbox_expires_at` ~7 days ahead; writes work.
6. Admin platform settings → only **3–7** days accepted.

Full checklist IDs: **BIL-FT-01 … BIL-FT-12** in [regression-checklist.md](./regression-checklist.md).
