# Manual test checklist — Billing, activation lock, calendar & dashboard

Use after `pnpm run db:migrate` and with API + web running (`pnpm run dev`).

Record **Pass / Fail** and notes in the right column.

---

## A. New account activation lock

| #   | Steps                                                                                | Expected result                                                                                     | Pass? |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----- |
| A1  | Register a **new** user in Keycloak, complete `/register/complete` as **Restaurant** | Redirect to `/app/activate`; banner “Account pending activation”                                    |       |
| A2  | On activate page, click **Compare plans & pay**                                      | Upgrade modal opens; billing APIs work (no 402 on `/api/billing/*`)                                 |       |
| A3  | Try opening **Orders** or **Dashboard** while still locked                           | Redirect back to `/app/activate` or API returns 402 `ACCOUNT_LOCKED` with `pendingActivation: true` |       |
| A4  | Complete **paid checkout** (stub card `4242424242424242`) for Bronze/Gold            | Payment succeeds; redirect to app; full access to Orders/Dashboard                                  |       |
| A5  | Register another new user as **Supplier**, do **not** pay                            | Stays locked; supplier settings/billing still reachable via activate flow                           |       |
| A6  | As **Admin** → Subscriptions → find locked tenant → **Activate**                     | Tenant unlocked without payment; user can use app normally                                          |       |

---

## B. Billing & overdue (paid tenants)

| #   | Steps                                                                                                                       | Expected result                                                                  | Pass? |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----- |
| B1  | Log in as **restaurant-gold@supplify.com** (or seeded Gold, password `Supplify1!`) → Settings/Onboarding → **Plan & usage** | Shows plan; **Manage billing & payment** visible for paid plan                   |       |
| B2  | Open payment modal → add card → checkout yearly/monthly                                                                     | Success toast; subscription active; no lock                                      |       |
| B3  | Seed/run `pnpm run seed:billing` on demo Gold restaurant (past due)                                                         | Overdue banner with grace period; **Pay now** opens modal                        |       |
| B4  | After grace expires (or locked seed tenant)                                                                                 | Red “Account locked — payment required”; most API calls 402; billing still works |       |
| B5  | Pay overdue invoice                                                                                                         | Lock cleared; banner gone; app usable                                            |       |

---

## C. Order calendar (plan gating)

| #   | Steps                                                                                  | Expected result                                                                                   | Pass? |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----- |
| C1  | **Free** restaurant (e.g. `restaurant-free@supplify.com`) → Dashboard calendar section | Paywall: “Order calendar is not on Free”, **Compare plans & upgrade**; no “Try again” / URL error |       |
| C2  | **Gold** restaurant → Dashboard calendar                                               | Calendar loads events (or empty state if no data); filters work                                   |       |
| C3  | Free account: entitlements show `order_calendar: false`                                | Settings subscription reflects disabled calendar                                                  |       |

---

## D. Dashboard & UI polish

| #   | Steps                                                                | Expected result                                                                                                              | Pass? |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----- |
| D1  | **Restaurant** with orders but no recent invoices → Spend trend card | Chart from orders OR message explaining no 30-day invoice data; footer label **Last 30 days** not mismatched “all-time” only |       |
| D2  | **Supplier** dashboard third column                                  | **Low stock** (not “Reorder alerts for restaurants”)                                                                         |       |
| D3  | **Supplier** → Settings → all 8 tabs                                 | Tabs wrap on one/two rows; no overlapping labels                                                                             |       |
| D4  | **Supplier** → Restaurants page                                      | Page loads; currency stats show **no** `maximumFractionDigits` crash                                                         |       |
| D5  | Large totals on Restaurants (`maximumFractionDigits: 0`)             | Whole-dollar format e.g. `$1,070,909`                                                                                        |       |

---

## E. Admin

| #   | Steps                                             | Expected result                                       | Pass? |
| --- | ------------------------------------------------- | ----------------------------------------------------- | ----- |
| E1  | Admin creates new restaurant via API/UI           | New tenant has locked subscription until activate/pay |       |
| E2  | Admin changes subscription plan on pending tenant | **Activate** or plan change unlocks account           |       |
| E3  | Admin **Unlock** on past-due subscription         | Lock cleared; status ACTIVE                           |       |

---

## F. Regression (existing demo accounts)

| #   | Steps                                                                | Expected result                                                   | Pass? |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------- | ----- |
| F1  | `restaurant@example.com` / `supplier@example.com` (golden fork seed) | Still work; calendar if Gold features enabled                     |       |
| F2  | `restaurant-1@test.com` prod-like (may be multi-subscription)        | App loads; plan shown matches active row; no spurious URL errors  |       |
| F3  | Admin impersonation                                                  | Can access tenant app; billing rules apply to impersonated tenant |       |

---

## G. Automated tests (CI parity)

| #   | Command                                | Expected result          | Pass? |
| --- | -------------------------------------- | ------------------------ | ----- |
| G1  | `pnpm --filter @supplify/api test:run` | All API unit tests green |       |
| G2  | `pnpm --filter @supplify/web test:run` | All web unit tests green |       |

---

## Demo credentials (local)

| Account                        | Password     | Notes                |
| ------------------------------ | ------------ | -------------------- |
| `restaurant-free@supplify.com` | `Supplify1!` | Free, calendar gated |
| `restaurant-gold@supplify.com` | `Supplify1!` | Gold, full features  |
| `supplier-free@supplify.com`   | `Supplify1!` | Supplier free tier   |
| `admin@supplify.com`           | (Keycloak)   | Admin unlock / plans |

---

_Generated for billing + activation + calendar release on `dev`._
