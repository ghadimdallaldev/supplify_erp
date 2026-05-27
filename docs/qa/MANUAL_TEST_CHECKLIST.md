# Supplify ERP — Full application manual QA checklist

Use this document for **end-to-end manual testing** across **Public**, **Restaurant**, **Supplier**, and **Platform Admin** personas.

**Test order for a fresh database wipe:** Start at Part 0, then Part 1 (restaurant creation), Part 2 (supplier creation), Part 3 (feature gate verification), then Parts 4–12 for full regression.

---

## How to use this checklist

1. **Record results:** Pass / Fail / Blocked / N/A in **Pass?**; add tester name, date, build/branch, and notes in the sign-off table.
2. **Test matrix:** Parts 0–3 must run before anything else on a wiped database. Parts 4–12 can run in parallel across personas once accounts exist.
3. **Deep links:** Many routes work when typed in the address bar even if not in the sidebar — test those once per persona.
4. **Billing stub card:** `4242424242424242` (any future expiry/CVC) when `BILLING_GATEWAY=stub`.

---

## Route map (quick reference)

| Path                                                                            | Persona                                               |
| ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `/login`                                                                        | Public                                                |
| `/register/complete`                                                            | Pending / needs setup                                 |
| `/reserve`, `/reserve/:slug`, `/reserve/confirmation`, `/reserve/manage/:token` | Guest                                                 |
| `/staff`, `/staff/login`, `/staff/dashboard`                                    | Staff portal (operational staff; not `/app`)          |
| `/app/dashboard`, `/`                                                           | Restaurant / Supplier / Admin (impersonating)         |
| `/app/activate`                                                                 | Locked tenant billing activation                      |
| `/app/orders`, `/app/orders/:id`                                                | Restaurant & Supplier                                 |
| `/app/products`, `/app/products/:id`                                            | Both (supplier edits catalog)                         |
| `/app/cart`, `/app/quick-lists`                                                 | Restaurant                                            |
| `/app/restaurant-inventory`                                                     | Restaurant (`INVENTORY_VIEW`)                         |
| `/app/receiving`                                                                | Restaurant                                            |
| `/app/reservations`                                                             | Restaurant (`RESERVATIONS_VIEW`)                      |
| `/app/staff`                                                                    | Restaurant (`STAFF_VIEW`)                             |
| `/app/suppliers`, `/app/suppliers/:id`                                          | Restaurant                                            |
| `/app/restaurants`, `/app/restaurants/:id`                                      | Supplier                                              |
| `/app/fulfillment`                                                              | Supplier                                              |
| `/app/inventory`                                                                | Supplier (not in sidebar — deep link)                 |
| `/app/invoices`                                                                 | Both (`INVOICES_VIEW`)                                |
| `/app/chat`                                                                     | Both                                                  |
| `/app/settings`, `/app/onboarding`                                              | Restaurant → onboarding; Supplier → supplier settings |
| `/app/supplier-settings`                                                        | Supplier (duplicate of settings — deep link)          |
| `/app/admin`, `/app/admin/suppliers`, `/app/admin/restaurants`                  | Platform admin                                        |

---

# Part 0 — Environment: fresh-database setup

> Run this part whenever you wipe the database and want to start from scratch. Every step must succeed before moving to Part 1.

## 0.1 Wipe and rebuild the database

| ID       | Steps                                                                                                                                                          | Expected                                                                                                                                                                                         | Pass? |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| SETUP-01 | Stop all running services (`Ctrl+C` in each terminal or `pnpm run dev` teardown)                                                                               | No API or web process running on ports 3001/5173                                                                                                                                                 | pass  |
| SETUP-02 | Drop and recreate the database: run your project's DB reset script (e.g. `pnpm run db:reset` or `psql -c "DROP DATABASE supplify; CREATE DATABASE supplify;"`) | Clean empty database; no tables                                                                                                                                                                  | pass  |
| SETUP-03 | Run all migrations: `pnpm run db:migrate`                                                                                                                      | All migrations apply (incl. `0104_user_workspace_membership`); no errors                                                                                                                         | pass  |
| SETUP-04 | Seed the subscription plan catalog: `pnpm run seed:tier-catalog`                                                                                               | Free, Bronze, Gold, Platinum plans for RESTAURANT and SUPPLIER in `subscription_plan` table; confirm with `SELECT code, tenant_type FROM subscription_plan ORDER BY tenant_type, display_order;` | pass  |
| SETUP-05 | Verify plan feature patches applied: `SELECT code, tenant_type, features FROM subscription_plan WHERE tenant_type = 'RESTAURANT';`                             | All plans have `order_calendar`, `disputes_returns`, `advanced_roles` present in features JSON                                                                                                   | pass  |
| SETUP-06 | Start the API: `pnpm --filter @supplify/api dev`                                                                                                               | API listening; migrations logged; no crash on startup                                                                                                                                            | pass  |
| SETUP-07 | Start the web: `pnpm --filter @supplify/web dev`                                                                                                               | Dev server running at `http://localhost:5173` (or configured port)                                                                                                                               | pass  |
| SETUP-08 | Health check: `GET /api/health`                                                                                                                                | `{ status: "ok" }`                                                                                                                                                                               | pass  |
| SETUP-09 | Navigate to `/login` in browser                                                                                                                                | Login page loads; no errors in console                                                                                                                                                           | pass  |

## 0.2 Seed the platform admin account

| ID       | Steps                                                                             | Expected                                          | Pass? |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------- | ----- |
| SETUP-10 | Run admin seed: `pnpm run seed:demo-users` (or equivalent Keycloak user creation) | Admin user created in Keycloak with `ADMIN` role  | pass  |
| SETUP-11 | Log in as `admin@supplify.com` / `SupplifyAdmin1!`                                | Redirected to `/app/admin`; admin sidebar visible | pass  |
| SETUP-12 | `GET /api/auth/me`                                                                | Returns `role: "ADMIN"`, no tenantId              | pass  |
| SETUP-13 | Log out                                                                           | Returns to `/login`                               | pass  |

---

# Part 1 — Account creation: Restaurant (fresh start)

> This section walks through the full onboarding journey for a brand-new restaurant account from zero. No pre-seeded demo data.

## 1.1 Registration

| ID      | Steps                                                                                                                      | Expected                                                                                           | Pass? |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----- |
| CRST-01 | Open Keycloak registration (or `/login` → Register link); create a new user with a unique email (e.g. `newresto@test.com`) | User created in Keycloak with `PENDING` role                                                       | Pass  |
| CRST-02 | Log in with the new account                                                                                                | Redirected to `/register/complete` (not the app)                                                   | Pass  |
| CRST-03 | On `/register/complete`: enter restaurant name, select **Restaurant** as tenant type, fill required fields, submit         | Form submits; `POST /api/register/complete` returns 200; user + tenant record created              | Pass  |
| CRST-04 | After submit, check redirect destination                                                                                   | Either `/app/activate` (activation lock ON) or `/app/dashboard` (activation lock OFF) — note which | Pass  |
| CRST-05 | Open a second tab, navigate to `/app/orders`                                                                               | Either loads (if unlocked) or redirects to `/app/activate`                                         | Pass  |

## 1.2 Activation lock & plan selection

| ID      | Steps                                                                                                                                         | Expected                                                                                                        | Pass? |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----- |
| CRST-06 | On `/app/activate`: inspect page                                                                                                              | Activation banner; **Activate free plan** and **Compare plans & pay** visible; no other app sections accessible | Pass  |
| CRST-07 | Click **Activate free plan** (or **Compare plans & pay** → Free → confirm)                                                                    | Subscription Free ACTIVE; `pending_activation` cleared; redirected to dashboard                                 | Pass  |
| CRST-08 | (Alt) Use upgrade modal: **Compare plans & pay** → Free tier **Activate free plan** → confirm (no card)                                       | Same as CRST-07                                                                                                 | pass  |
| CRST-09 | (New session) Repeat CRST-01–CRST-04 with a second account; select **Bronze plan**; enter stub card `4242424242424242`, any future expiry/CVC | Subscription ACTIVE Bronze; redirected to dashboard                                                             | pass  |
| CRST-10 | (New session) Repeat with **Gold plan**                                                                                                       | Subscription ACTIVE Gold; redirected to dashboard                                                               | pass  |
| CRST-11 | Verify `GET /api/subscriptions/entitlements/current` for each account                                                                         | `plan.code` matches the selected plan; `features` object reflects plan tier                                     | pass  |

## 1.3 Post-activation state (Free restaurant)

| ID      | Steps                                         | Expected                                                        | Pass? |
| ------- | --------------------------------------------- | --------------------------------------------------------------- | ----- |
| CRST-12 | Log in as the Free restaurant; open dashboard | Dashboard loads; no crash; limited feature set                  | pass  |
| CRST-13 | Navigate to `/app/orders`                     | Orders list loads (Free allows basic ordering)                  | pass  |
| CRST-14 | Navigate to `/app/chat`                       | **403 or feature-gated paywall** — `chat` is not a Free feature | pass  |
| CRST-15 | Navigate to `/app/quick-lists`                | **403 or paywall** — `quick_lists` gated                        | pass  |
| CRST-16 | Open dashboard → Order calendar widget        | Paywall or upgrade CTA shown; calendar does not load            |       |
| CRST-17 | Navigate to `/app/receiving`                  | **403 or paywall** — `receiving_quality` gated                  |       |
| CRST-18 | Navigate to `/app/invoices`                   | **403 or paywall** — `finance_invoices` gated                   |       |
| CRST-19 | Navigate to `/app/restaurant-inventory`       | **403 or paywall** — `inventory_management` gated               |       |

## 1.4 Post-activation state (Bronze restaurant)

| ID      | Steps                                                | Expected                            | Pass? |
| ------- | ---------------------------------------------------- | ----------------------------------- | ----- |
| CRST-20 | Log in as Bronze restaurant; navigate to `/app/chat` | Chat UI loads; can send a message   |       |
| CRST-21 | Navigate to `/app/quick-lists`                       | Quick lists load; can create a list |       |
| CRST-22 | Navigate to `/app/receiving`                         | Receiving page loads                |       |
| CRST-23 | Navigate to `/app/invoices`                          | Invoice list loads                  |       |
| CRST-24 | Navigate to `/app/restaurant-inventory`              | Inventory page loads                |       |
| CRST-25 | Dashboard → Order calendar                           | Calendar loads; can filter by date  |       |

## 1.5 Post-activation state (Gold restaurant)

| ID      | Steps                                                              | Expected                                                      | Pass? |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------- | ----- |
| CRST-26 | Log in as Gold restaurant; navigate to Settings → Team → Roles tab | Advanced role management available (`advanced_roles` feature) |       |
| CRST-27 | Navigate to Settings → Activity tab                                | Audit log shows activity (`tenant_audit_log` feature)         |       |
| CRST-28 | Check Settings → Subscription → usage meters                       | Shows orders/day, SKUs, chat messages with plan limits        |       |

---

# Part 2 — Account creation: Supplier (fresh start)

> Mirror of Part 1 for the supplier persona.

## 2.1 Registration

| ID      | Steps                                                              | Expected                                                   | Pass? |
| ------- | ------------------------------------------------------------------ | ---------------------------------------------------------- | ----- |
| CSUP-01 | Open Keycloak registration; create new user `newsupplier@test.com` | User created with `PENDING` role                           |       |
| CSUP-02 | Log in; redirected to `/register/complete`                         | Form loads                                                 |       |
| CSUP-03 | Select **Supplier** as tenant type; fill required fields; submit   | Supplier tenant created; `POST /api/register/complete` 200 |       |
| CSUP-04 | Observe redirect destination                                       | `/app/activate` or `/app/dashboard`                        |       |

## 2.2 Activation lock & plan selection

| ID       | Steps                                                         | Expected                                                                        | Pass? |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----- |
| CSUP-05  | On `/app/activate`: inspect page                              | **Activate free plan** and **Compare plans & pay** visible                      |       |
| CSUP-06  | Click **Activate free plan** (no card required)               | Subscription Free ACTIVE; `pending_activation` cleared; redirected to dashboard |       |
| CSUP-06b | (Alt) **Compare plans & pay** → Free → **Activate free plan** | Same as CSUP-06                                                                 |       |
| CSUP-07  | (New session) Repeat with **Bronze plan** + stub card         | Bronze ACTIVE                                                                   |       |
| CSUP-08  | (New session) Repeat with **Gold plan** + stub card           | Gold ACTIVE                                                                     |       |
| CSUP-09  | `GET /api/subscriptions/entitlements/current` for each        | `plan.code` and `features` correct per plan                                     |       |

## 2.3 Post-activation state (Free supplier)

| ID      | Steps                                            | Expected                                                            | Pass? |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------- | ----- |
| CSUP-10 | Log in as Free supplier; navigate to `/app/chat` | **403 or paywall** — `chat` gated                                   |       |
| CSUP-11 | Navigate to `/app/fulfillment`                   | **403 or paywall** — `fulfillment_tools` gated                      |       |
| CSUP-12 | Navigate to Settings → Warehouses tab            | Single warehouse allowed; adding a second warehouse blocked by plan |       |
| CSUP-13 | Navigate to `/app/invoices`                      | **403 or paywall** — `finance_invoices` gated                       |       |

## 2.4 Post-activation state (Bronze supplier)

| ID      | Steps                                              | Expected                                                                 | Pass? |
| ------- | -------------------------------------------------- | ------------------------------------------------------------------------ | ----- |
| CSUP-14 | Log in as Bronze supplier; navigate to `/app/chat` | Chat UI loads                                                            |       |
| CSUP-15 | Navigate to `/app/fulfillment`                     | Fulfillment page loads; driver dispatch, pick lists, routes tabs visible |       |
| CSUP-16 | Navigate to `/app/invoices`                        | Invoice list loads                                                       |       |
| CSUP-17 | Settings → Warehouses: add a second warehouse      | Blocked or allowed per Bronze plan limit; verify against plan definition |       |

## 2.5 Post-activation state (Gold supplier)

| ID      | Steps                                                                           | Expected                                         | Pass? |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------ | ----- |
| CSUP-18 | Log in as Gold supplier; Settings → Warehouses → enable multi-warehouse routing | Toggle available (`multi_warehouse` feature)     |       |
| CSUP-19 | Settings → Activity tab                                                         | Audit log available (`tenant_audit_log` feature) |       |
| CSUP-20 | Settings → Plan: usage meters                                                   | SKUs, orders/day, warehouses shown with limits   |       |

---

# Part 3 — Feature flag gates & tier progression

> These tests verify that each feature-gated route correctly blocks Free accounts, unblocks on the appropriate paid tier, and that admin overrides work correctly.
>
> **Required accounts:** Free restaurant, Bronze restaurant, Gold restaurant, Free supplier, Bronze supplier, Gold supplier, Admin.

## 3.1 Restaurant feature gates

| ID       | Feature key            | Free account                                                          | Bronze account      | Gold account              | Pass? |
| -------- | ---------------------- | --------------------------------------------------------------------- | ------------------- | ------------------------- | ----- |
| GATE-R01 | `chat`                 | `/app/chat` → 403/paywall                                             | Loads               | Loads                     |       |
| GATE-R02 | `quick_lists`          | `/app/quick-lists` → 403/paywall                                      | Loads               | Loads                     |       |
| GATE-R03 | `receiving_quality`    | `/app/receiving` → 403/paywall                                        | Loads               | Loads                     |       |
| GATE-R04 | `finance_invoices`     | `/app/invoices` → 403/paywall                                         | Loads               | Loads                     |       |
| GATE-R05 | `inventory_management` | `/app/restaurant-inventory` → 403/paywall                             | Loads               | Loads                     |       |
| GATE-R06 | `order_calendar`       | Dashboard calendar widget → paywall; `GET /api/orders/calendar` → 403 | 200 + calendar data | 200 + calendar data       |       |
| GATE-R07 | `disputes_returns`     | `GET /api/disputes` → 403                                             | 200                 | 200                       |       |
| GATE-R08 | `advanced_roles`       | Settings → Team: no role management UI                                | Available           | Available                 |       |
| GATE-R09 | `reports`              | `GET /api/reports` → 403                                              | 403 (Gold+)         | 200                       |       |
| GATE-R10 | `smart_reorder`        | Reorder suggestions API → 403                                         | 403 (Gold+)         | 200 or available          |       |
| GATE-R11 | `approvals_budgets`    | Approval workflow API → 403                                           | 403 (Gold+)         | 200                       |       |
| GATE-R12 | `tenant_audit_log`     | Settings → Activity tab → hidden or 403                               | Blocked (Gold+)     | Visible and loads         |       |
| GATE-R13 | `order_amendments`     | Order amendment API → 403                                             | 403 (Gold+)         | 200                       |       |
| GATE-R14 | `push_notifications`   | Push endpoint → 403                                                   | 403 (Gold+)         | 200                       |       |
| GATE-R15 | `supplier_reviews`     | Reviews API → 403                                                     | 403 (Gold+)         | 200                       |       |
| GATE-R16 | `custom_branding`      | Settings branding section → hidden or locked                          | Locked (Gold+)      | Branding upload available |       |
| GATE-R17 | `multi_branch`         | Settings → Branches: cannot add 2nd branch                            | Limited by plan     | Higher branch limit       |       |
| GATE-R18 | `feature_flags_access` | Tenant flag override API → 403                                        | 403 (Gold+)         | 200 (if UI exposed)       |       |
| GATE-R19 | `supplier_deals`       | `/app/deals` → 403/paywall; `GET /api/promotions/active` → 403        | Loads               | Loads                     |       |

## 3.2 Supplier feature gates

| ID       | Feature key                         | Free account                                                   | Bronze account      | Gold account     | Pass? |
| -------- | ----------------------------------- | -------------------------------------------------------------- | ------------------- | ---------------- | ----- |
| GATE-S01 | `chat`                              | `/app/chat` → 403/paywall                                      | Loads               | Loads            |       |
| GATE-S02 | `fulfillment_tools` / `fulfillment` | `/app/fulfillment` → 403/paywall                               | Loads               | Loads            |       |
| GATE-S03 | `driver_management`                 | Driver dispatch tab → 403/hidden                               | Available           | Available        |       |
| GATE-S04 | `finance_invoices`                  | `/app/invoices` → 403/paywall                                  | Loads               | Loads            |       |
| GATE-S05 | `order_calendar`                    | Dashboard calendar → paywall; `GET /api/orders/calendar` → 403 | 200                 | 200              |       |
| GATE-S06 | `disputes_returns`                  | `GET /api/disputes` → 403                                      | 200                 | 200              |       |
| GATE-S07 | `warehouses`                        | Settings → Warehouses: single warehouse only                   | Plan limit (e.g. 2) | Higher limit     |       |
| GATE-S08 | `multi_warehouse`                   | Settings → multi-warehouse toggle hidden/locked                | Locked (Gold+)      | Toggle available |       |
| GATE-S09 | `inventory_management`              | `/app/inventory` → 403 or locked                               | 403 (Gold+)         | Loads            |       |
| GATE-S10 | `quick_lists`                       | `/app/quick-lists` → 403                                       | Loads               | Loads            |       |
| GATE-S11 | `advanced_roles`                    | Settings → Team: no role management                            | Locked (Gold+)      | Available        |       |
| GATE-S12 | `reports`                           | Reports API → 403                                              | 403 (Gold+)         | 200              |       |
| GATE-S13 | `promotions`                        | Promotions API → 403                                           | 403 (Gold+)         | 200              |       |
| GATE-S14 | `tenant_audit_log`                  | Settings → Activity tab → hidden                               | Locked (Gold+)      | Visible          |       |
| GATE-S15 | `order_amendments`                  | Order amendment API → 403                                      | 403 (Gold+)         | 200              |       |
| GATE-S16 | `push_notifications`                | Push endpoint → 403                                            | 403 (Gold+)         | 200              |       |
| GATE-S17 | `multi_branch`                      | Settings → Branches: 1 branch only                             | Limited             | Higher limit     |       |
| GATE-S18 | `feature_flags_access`              | Tenant flag override API → 403                                 | 403 (Gold+)         | 200              |       |
| GATE-S19 | `custom_branding`                   | Branding section locked                                        | Locked (Gold+)      | Available        |       |

## 3.3 Admin feature flag overrides (for gated features)

> Test that admin can force-enable a feature for a Free tenant and force-disable it for a Gold tenant.

| ID       | Steps                                                                                                                 | Expected                                                | Pass? |
| -------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----- |
| GATE-A01 | Admin → Features tab → find `chat` global flag → disable it                                                           | `POST /api/feature-flags/global` disables chat globally |       |
| GATE-A02 | Log in as Gold restaurant; navigate to `/app/chat`                                                                    | **403** — global disable overrides plan entitlement     |       |
| GATE-A03 | Admin → re-enable `chat` globally                                                                                     | Restored                                                |       |
| GATE-A04 | Admin → Features tab → Per-tenant override → select Free restaurant → force-enable `chat`                             | `POST /api/feature-flags/tenant-overrides` returns 200  |       |
| GATE-A05 | Log in as Free restaurant; navigate to `/app/chat`                                                                    | **Chat loads** — tenant override beats plan restriction |       |
| GATE-A06 | Admin → remove the override for that tenant                                                                           | Override deleted                                        |       |
| GATE-A07 | Log in as Free restaurant again; navigate to `/app/chat`                                                              | **403/paywall** — back to plan restriction              |       |
| GATE-A08 | Admin → Per-tenant override → select Gold restaurant → force-disable `reports`                                        | Override applied                                        |       |
| GATE-A09 | Log in as Gold restaurant; call `GET /api/reports`                                                                    | **403** — tenant override disables feature even on Gold |       |
| GATE-A10 | Admin → remove the override                                                                                           | Gold restaurant regains `reports` access                |       |
| GATE-A11 | `entitlements_refresh` WebSocket: after admin applies override, logged-in tenant sees toast or UI refresh within ~30s | Entitlements refresh event received                     |       |

## 3.4 Plan upgrade & downgrade flow

| ID       | Steps                                                         | Expected                                                              | Pass? |
| -------- | ------------------------------------------------------------- | --------------------------------------------------------------------- | ----- |
| GATE-U01 | Free restaurant → Settings → Subscription → upgrade to Bronze | Billing modal opens; stub card accepted; subscription becomes Bronze  |       |
| GATE-U02 | After upgrade: navigate to `/app/chat`                        | Chat now loads (feature unlocked by plan upgrade)                     |       |
| GATE-U03 | Admin → Subscriptions → downgrade that tenant back to Free    | Subscription becomes Free; `invalidateTenantSubscriptionCache` called |       |
| GATE-U04 | Log in as that restaurant; navigate to `/app/chat`            | 403/paywall returns (feature re-locked)                               |       |
| GATE-U05 | Free supplier → upgrade to Gold via settings                  | All Gold supplier features now available                              |       |

---

# Part 4 — Cross-cutting (all authenticated tenants)

## 4.1 Authentication & session

| ID      | Steps                                | Expected                                            | Pass? |
| ------- | ------------------------------------ | --------------------------------------------------- | ----- |
| AUTH-01 | Open `/login`, sign in as restaurant | Redirect to app shell; sidebar shows restaurant nav |       |
| AUTH-02 | Sign in as supplier                  | Supplier nav; no restaurant-only items              |       |
| AUTH-03 | Sign in as admin                     | Redirect to `/app/admin` (not tenant dashboard)     |       |
| AUTH-04 | Refresh page while logged in         | Session persists; no login loop                     |       |
| AUTH-05 | Log out (header avatar / logout)     | Returns to login; protected routes blocked          |       |
| AUTH-06 | Open `/app/orders` while logged out  | Redirect to login                                   |       |

## 4.2 Registration & first-time setup

| ID      | Steps                                                        | Expected                                                   | Pass? |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------------- | ----- |
| AUTH-07 | New Keycloak user with `PENDING` role → `/register/complete` | Form loads; complete profile/tenant type                   |       |
| AUTH-08 | Finish registration as **Restaurant**                        | Lands in app or `/app/activate` if activation lock enabled |       |
| AUTH-09 | Finish registration as **Supplier**                          | Same; supplier settings reachable when unlocked            |       |
| AUTH-10 | User with `needsSetup` from `/api/register/status`           | Forced to `/register/complete` until done                  |       |

## 4.3 Account activation lock (new tenants)

| ID     | Steps                                                 | Expected                                                                  | Pass? |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------- | ----- |
| BIL-01 | New restaurant after register — no payment            | `/app/activate`; pending activation banner                                |       |
| BIL-02 | On activate page → **Compare plans & pay**            | Upgrade/payment modal; `/api/billing/`\* works (no 402)                   |       |
| BIL-03 | Navigate to Orders/Dashboard while locked             | Redirect to `/app/activate` or 402 `ACCOUNT_LOCKED` + `pendingActivation` |       |
| BIL-04 | Paid checkout (stub card) for Bronze/Gold             | Unlock; full app access                                                   |       |
| BIL-05 | Admin → Subscriptions → **Activate** on locked tenant | Unlocked without payment                                                  |       |

## 4.4 Billing, subscriptions & overdue

| ID     | Steps                                                 | Expected                                              | Pass? |
| ------ | ----------------------------------------------------- | ----------------------------------------------------- | ----- |
| BIL-06 | Paid tenant → Settings → Plan / subscription tab      | Current plan, usage meters, **Manage billing**        |       |
| BIL-07 | Payment modal → add card → checkout monthly/yearly    | Success; subscription ACTIVE                          |       |
| BIL-08 | Simulate past-due (admin: mark subscription PAST_DUE) | Grace banner; **Pay now**                             |       |
| BIL-09 | Simulate locked overdue (admin: trigger lock)         | Red lock banner; most APIs 402; billing still works   |       |
| BIL-10 | Pay overdue balance                                   | Lock cleared; app usable                              |       |
| BIL-11 | Toggle auto-renew in billing UI                       | Persists; reflected on reload                         |       |
| BIL-12 | Free plan tenant                                      | No payment required; upgrade prompts where applicable |       |

## 4.5 Plan limits & upgrade UX

| ID      | Steps                                               | Expected                                               | Pass? |
| ------- | --------------------------------------------------- | ------------------------------------------------------ | ----- |
| PLN-01  | Free restaurant → Dashboard **Order calendar**      | Paywall + upgrade CTA; no broken URL / "Try again"     |       |
| PLN-02  | Gold restaurant → Order calendar                    | Calendar loads; filters work                           |       |
| PLN-03  | Hit daily order limit (or seed at limit)            | Block message; upgrade modal with limit label          |       |
| PLN-04  | Hit chat limit                                      | Send blocked; upgrade nudge                            |       |
| PLN-05  | Add branch over plan limit                          | Gate message references `multi_branch` / branch limit  |       |
| PLN-06  | Supplier add warehouse over limit                   | Warehouse gate from plan                               |       |
| PLN-06a | Bronze supplier → add 2nd warehouse (if limit is 1) | Blocked or upgrade CTA (`warehouses` limit)            |       |
| PLN-06b | Gold supplier → enable multi-warehouse              | Settings toggle; routing rules API; split order badges |       |
| PLN-06c | Supplier org → add branch over plan limit           | `multi_branch` / branch limit message                  |       |
| PLN-07  | Gold/Platinum → custom branding in settings         | Logo/colors upload (Gold); white-label if Platinum     |       |
| PLN-08  | Header **Plans** button                             | Upgrade/browse modal; plan comparison table            |       |

## 4.6 Shell UI (Layout, Header, Sidebar)

| ID     | Steps                                     | Expected                                             | Pass? |
| ------ | ----------------------------------------- | ---------------------------------------------------- | ----- |
| UX-01  | Sidebar: each visible nav item            | Correct route; active state highlight                |       |
| UX-02  | Orders nav badge                          | Shows pending count when pending orders exist        |       |
| UX-03  | Header notifications bell                 | Panel opens; mark read / mark all read               |       |
| UX-04  | Header search (⌘K)                        | Opens search UX if implemented                       |       |
| UX-05  | Header settings icon                      | Navigates to settings                                |       |
| UX-06  | Header avatar → logout                    | Session ends                                         |       |
| UX-07  | **Branch switcher** (multi-branch tenant) | Lists linked accounts; switch updates context        |       |
| UX-07a | Supplier with org → **All branches** link | Navigates to `/app/org` when `multi_branch` on       |       |
| UX-07b | Org Owner → add branch on `/app/org`      | Two-step modal: branch details → invite link copy    |       |
| UX-07c | Branch settings → Invitations tab         | List/revoke/resend; copy link works                  |       |
| UX-07d | Open `/invite/branch?token=…` (valid)     | Signup or accept while logged in; lands on dashboard |       |
| UX-07e | Expired / revoked invite link             | Correct error state; no account created              |       |
| UX-08  | Plan badge in sidebar footer              | Shows plan name for non-free paid tiers              |       |
| UX-09  | Mobile/narrow viewport                    | Sidebar/layout usable; tabs wrap (supplier settings) |       |

## 4.7 Notifications preferences

| ID    | Steps                                                | Expected                                          | Pass? |
| ----- | ---------------------------------------------------- | ------------------------------------------------- | ----- |
| UX-10 | Settings → notifications (restaurant/supplier/admin) | Toggles: email, WhatsApp, in-app, per-event types |       |
| UX-11 | Save preferences → reload                            | Values persisted                                  |       |
| UX-12 | Trigger event (e.g. new order) with in-app on        | Notification appears in header                    |       |

## 4.8 Realtime & impersonation

| ID         | Steps                                          | Expected                                           | Pass? |
| ---------- | ---------------------------------------------- | -------------------------------------------------- | ----- |
| ADM-IMP-01 | Admin starts impersonation on restaurant       | Banner shows impersonation; restaurant nav         |       |
| ADM-IMP-02 | While impersonating, open `/app/admin`         | Redirect to tenant dashboard                       |       |
| ADM-IMP-03 | Stop impersonation                             | Returns to admin context                           |       |
| ADM-IMP-04 | Plan change while logged in (admin or billing) | `entitlements_refresh` toast or refetch updates UI |       |

## 4.9 WebSocket connectivity

| ID    | Steps                                                                         | Expected                                                                                     | Pass? |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----- |
| WS-01 | Log in as restaurant; open browser DevTools → Network → WS                    | Socket.IO connection established; no repeated reconnects                                     |       |
| WS-02 | Send a chat message                                                           | Message appears in real-time on recipient's screen without page refresh                      |       |
| WS-03 | Type in chat input on one session                                             | Typing indicator visible on other session                                                    |       |
| WS-04 | Recipient's typing indicator shows correct user name (not a random socket ID) | Username shown, not a UUID/connection ID                                                     |       |
| WS-05 | Mark message as read on one session                                           | Read receipt updates on sender's session in real-time                                        |       |
| WS-06 | Admin changes a tenant's plan                                                 | Logged-in tenant receives `entitlements_refresh` event (toast or silent refetch) within ~30s |       |
| WS-07 | Network briefly disconnected (DevTools → throttle offline then back)          | Socket reconnects; no duplicate messages; connection restored                                |       |
| WS-08 | Log out                                                                       | WebSocket disconnected cleanly; no 401 errors in console                                     |       |

---

# Part 5 — Public & guest (no tenant login)

## 5.1 Guest reservation portal

| ID     | Steps                                           | Expected                                        | Pass? |
| ------ | ----------------------------------------------- | ----------------------------------------------- | ----- |
| PUB-01 | Open `/reserve` or `/reserve/{restaurant-slug}` | Booking UI loads; restaurant name shown         |       |
| PUB-02 | Complete booking (party size, date, time)       | Confirmation page `/reserve/confirmation`       |       |
| PUB-03 | Copy manage link from confirmation email/UI     | `/reserve/manage/:token` loads reservation      |       |
| PUB-04 | Cancel reservation via manage link              | Status cancelled; reflected on restaurant board |       |
| PUB-05 | Reschedule via manage link                      | New slot saved                                  |       |
| PUB-06 | Invalid/expired token                           | Friendly error; no crash                        |       |

## 5.2 Staff self-service portal

| ID     | Steps                                                                 | Expected                                                            | Pass? |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------- | ----- |
| PUB-07 | Open `/staff/login` (or `/staff`)                                     | Keycloak sign-in + optional magic-link UI                           |       |
| PUB-08 | Manager: `/app/staff` → Team → **Create portal account** for staff    | Account created; status Active; temp password (dev) or invite flow  |       |
| PUB-09 | Staff signs in at `/staff/login` with work email                      | Lands on `/staff/dashboard`; **cannot** open `/app` (redirect back) |       |
| PUB-10 | Staff: clock in/out, view own shifts, submit PTO/swap                 | Only own data; `GET /api/staff/members` returns 403 if forced       |       |
| PUB-11 | Manager: copy login link, send invite, reset, disable portal access   | Link is `/staff/login`; disable blocks login and magic link         |       |
| PUB-12 | Magic link: request link (portal enabled) → `/staff/dashboard?token=` | Legacy session works; scoped to one staff profile                   |       |
| PUB-13 | Session / token expiry                                                | Prompt re-auth at `/staff/login`                                    |       |

---

# Part 6 — Restaurant tenant

**Primary accounts:** `restaurant@supplify.com`, `restaurant-gold@supplify.com`, `restaurant-free@supplify.com`

**Sidebar:** Dashboard, Orders, Products, Quick Lists, Cart, Reservations, Receiving, Suppliers, Invoices, Chat, Staff, Inventory, Settings  
Hidden without RBAC permission or feature gate.

## 6.1 Dashboard (`/app/dashboard`)

| ID     | Steps                        | Expected                                                | Pass? |
| ------ | ---------------------------- | ------------------------------------------------------- | ----- |
| RST-01 | Load dashboard               | KPI cards load (orders, spend, etc.)                    |       |
| RST-02 | **Recent orders** list       | Links to order detail                                   |       |
| RST-03 | **Spend trend** (30 days)    | Chart matches invoice/order data or empty-state message |       |
| RST-04 | **Reorder alerts**           | Suggestions; add to quick list works                    |       |
| RST-05 | **Order calendar** (Bronze+) | Calendar events; filters                                |       |
| RST-06 | **Order calendar** (Free)    | Upgrade paywall only                                    |       |

## 6.2 Orders (`/app/orders`, `/app/orders/:id`)

| ID     | Steps                                                      | Expected                             | Pass? |
| ------ | ---------------------------------------------------------- | ------------------------------------ | ----- |
| RST-07 | Orders list tabs: All, New, Processing, Shipped, Completed | Correct filtering                    |       |
| RST-08 | Open order detail                                          | Details, Items tabs load             |       |
| RST-09 | Place order from cart (see 6.4)                            | New order appears in list            |       |
| RST-10 | Cancel or update order (if permitted)                      | Status updates; supplier sees change |       |
| RST-11 | Order reminders / notifications                            | Trigger where applicable             |       |

## 6.3 Products & catalog (`/app/products`, `/app/products/:id`)

| ID     | Steps                    | Expected                           | Pass? |
| ------ | ------------------------ | ---------------------------------- | ----- |
| RST-12 | Browse supplier products | List, search, filters              |       |
| RST-13 | Product detail           | SKU, price, pack size, add to cart |       |
| RST-14 | Categories/tags if shown | Navigation works                   |       |

## 6.4 Cart (`/app/cart`)

| ID     | Steps                            | Expected                                  | Pass? |
| ------ | -------------------------------- | ----------------------------------------- | ----- |
| RST-15 | Add items from products          | Cart persists after navigation            |       |
| RST-16 | Update quantities / remove lines | Totals recalculate                        |       |
| RST-17 | Submit order                     | Success; redirects to orders; cart clears |       |
| RST-18 | Empty cart checkout              | Validation prevents submit                |       |

## 6.5 Quick lists (`/app/quick-lists`) — requires `quick_lists` feature

| ID     | Steps                                         | Expected                       | Pass? |
| ------ | --------------------------------------------- | ------------------------------ | ----- |
| RST-19 | Free account → navigate to `/app/quick-lists` | 403 or paywall; not accessible |       |
| RST-20 | Bronze+ account → create quick list           | Saved with name                |       |
| RST-21 | Add/remove SKUs                               | Persists                       |       |
| RST-22 | Order from quick list                         | Creates order with lines       |       |
| RST-23 | Scheduled quick list (if UI filter)           | Scheduled vs unscheduled views |       |

## 6.6 Restaurant inventory (`/app/restaurant-inventory`) — requires `inventory_management` feature

| ID     | Steps                                                  | Expected                              | Pass? |
| ------ | ------------------------------------------------------ | ------------------------------------- | ----- |
| RST-24 | Free account → navigate to `/app/restaurant-inventory` | 403 or paywall                        |       |
| RST-25 | Bronze+ → Tab: Current inventory                       | SKU levels, par levels                |       |
| RST-26 | Tab: Movement history                                  | Events listed                         |       |
| RST-27 | Tab: Totals & sources                                  | Aggregates correct                    |       |
| RST-28 | Adjust stock (if UI)                                   | Quantity updates; audit in history    |       |
| RST-29 | User without `INVENTORY_VIEW`                          | Nav hidden; direct URL blocked or 403 |       |

## 6.7 Receiving (`/app/receiving`) — requires `receiving_quality` feature

| ID      | Steps                                                                           | Expected                                                                              | Pass? |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----- |
| RST-30  | Free account → navigate to `/app/receiving`                                     | 403 or paywall                                                                        |       |
| RST-31  | Bronze+ — supplier marks order **Mark Delivered** (`DELIVERED`)                 | Restaurant pending list shows order; green “Supplier marked as delivered” message     |       |
| RST-32  | **Receive Now** on pending order — full quantities                              | Order leaves pending; appears in **History** tab; order status `RECEIVED_FULL`        |       |
| RST-33  | Partial receive / discrepancies                                                 | `RECEIVED_PARTIAL` or report status `PARTIAL`; inventory reflects received qty only   |       |
| RST-34  | Tab: History                                                                    | Past `receiving_report` rows listed (orders not received do not appear here)          |       |
| RECV-01 | Order detail (DELIVERED) → **Receive this order** → `/app/receiving?order={id}` | Receive dialog opens for that order when still pending                                |       |
| RECV-02 | Order timeline tab (DELIVERED, not yet received)                                | Delivery step completed; **Confirm receipt** current (not “Order placed” in progress) |       |
| RECV-03 | Supplier order detail after SHIPPED                                             | Button reads **Mark Delivered** (not “Complete Order”); sets `DELIVERED`              |       |

## 6.8 Reservations (`/app/reservations`)

| ID     | Steps                               | Expected                                 | Pass? |
| ------ | ----------------------------------- | ---------------------------------------- | ----- |
| RST-35 | Reservation board for selected date | Tables + reservations + waitlist         |       |
| RST-36 | Create reservation (drawer)         | Appears on board                         |       |
| RST-37 | Seat / confirm / cancel from board  | Status transitions                       |       |
| RST-38 | **Table builder**                   | Add/edit floor plan tables               |       |
| RST-39 | Analytics panel (day/week/month)    | Metrics load                             |       |
| RST-40 | Guest intelligence panel            | Guest stats load                         |       |
| RST-41 | Copy public **booking link**        | Link works in incognito (`/reserve/...`) |       |
| RST-42 | User without `RESERVATIONS_VIEW`    | Nav hidden                               |       |

## 6.9 Staff HR (`/app/staff`)

| ID     | Steps                                           | Expected                            | Pass? |
| ------ | ----------------------------------------------- | ----------------------------------- | ----- |
| RST-43 | Tab: Team — list members                        | Roles shown; portal access status   |       |
| RST-44 | Add staff + create portal account / send invite | Staff record + portal controls work |       |
| RST-45 | Tab: Schedule & time                            | Shifts; clock events                |       |
| RST-46 | Tab: PTO & availability                         | Request/approve PTO                 |       |
| RST-47 | Tab: Announcements & swaps                      | Post announcement; shift swap flow  |       |
| RST-48 | Tab: Docs & incidents                           | Upload/view document; log incident  |       |
| RST-49 | Tab: Payroll & insights                         | Reports load                        |       |
| RST-50 | User without `STAFF_VIEW`                       | Nav hidden                          |       |

## 6.10 Suppliers directory (`/app/suppliers`, `/app/suppliers/:id`)

| ID     | Steps                                              | Expected                                   | Pass? |
| ------ | -------------------------------------------------- | ------------------------------------------ | ----- |
| RST-51 | List suppliers                                     | Search/filter                              |       |
| RST-52 | Supplier detail                                    | Catalog preview, follow/block if available |       |
| RST-53 | Start chat from supplier (requires `chat` feature) | Opens conversation if Bronze+              |       |

## 6.11 Invoices (`/app/invoices`) — requires `finance_invoices` feature

| ID     | Steps                                      | Expected              | Pass? |
| ------ | ------------------------------------------ | --------------------- | ----- |
| RST-54 | Free account → navigate to `/app/invoices` | 403 or paywall        |       |
| RST-55 | Bronze+ → Invoice list                     | Filter by status/date |       |
| RST-56 | Open invoice → Details tab                 | Line items, totals    |       |
| RST-57 | Payments tab                               | Payment history       |       |
| RST-58 | Related order tab                          | Links to order        |       |
| RST-59 | Download PDF (if offered)                  | PDF opens             |       |
| RST-60 | User without `INVOICES_VIEW`               | Nav hidden            |       |

## 6.12 Chat (`/app/chat`) — requires `chat` feature

| ID     | Steps                                  | Expected                                | Pass? |
| ------ | -------------------------------------- | --------------------------------------- | ----- |
| RST-61 | Free account → navigate to `/app/chat` | 403 or paywall                          |       |
| RST-62 | Bronze+ → Conversation list            | Suppliers/restaurants shown             |       |
| RST-63 | Send message                           | Delivered; appears in thread            |       |
| RST-64 | Receive message (second browser/user)  | Real-time or refresh shows message      |       |
| RST-65 | Unread state / read receipts           | Updates correctly                       |       |
| RST-66 | Typing indicator                       | Shows other user's name (not socket ID) |       |

## 6.14 Deals & promotions (`/app/deals`) — requires `supplier_deals` feature

| ID     | Steps                             | Expected                                                        | Pass? |
| ------ | --------------------------------- | --------------------------------------------------------------- | ----- |
| RST-74 | Free account → `/app/deals`       | 403 or paywall                                                  |       |
| RST-75 | Bronze+ → Deals feed loads        | Cards from followed suppliers; sort/filter works                |       |
| RST-76 | Sponsored deal visible            | Badge "Sponsored" on boosted deal from non-followed supplier    |       |
| RST-77 | **Order now** CTA                 | Navigates to products; place order; discount on order detail    |       |
| RST-78 | **Use coupon** CTA                | Coupon copied; apply at cart checkout; discount applied         |       |
| RST-79 | **Message supplier** CTA          | Chat opens with prefilled deal interest message                 |       |
| RST-80 | **View products** CTA             | Supplier catalog filtered; eligible products highlighted        |       |
| RST-81 | Order detail shows promotion name | `GET /api/orders/:id` returns `appliedPromotion` with deal name |       |

## 6.15 Settings & onboarding (`/app/settings`, `/app/onboarding`)

| ID     | Steps                                         | Expected                                                             | Pass? |
| ------ | --------------------------------------------- | -------------------------------------------------------------------- | ----- |
| RST-67 | Tab: Profile — edit name, address, logo       | Saves via API                                                        |       |
| RST-68 | Tab: Team — invite users, assign tenant roles | RBAC roles applied                                                   |       |
| RST-69 | Tab: Branches — add/switch linked accounts    | Respects plan branch limit                                           |       |
| RST-70 | Tab: Subscription — plan, usage, billing CTA  | Matches entitlements                                                 |       |
| RST-71 | Tab: Notifications                            | Same as UX-10                                                        |       |
| RST-72 | Tab: Activity (Gold+, `tenant_audit_log`)     | Rows show after live actions; Free account sees tab hidden or locked |       |
| RST-73 | Tab: Activity — Action / Resource dropdowns   | Human-readable labels; filter narrows list                           |       |
| RST-74 | Tab: Activity — Clear filters / date range    | Full day included on **To** date                                     |       |
| RST-75 | Custom branding (Gold+)                       | Logo/colors; preview                                                 |       |
| RST-76 | `/app/onboarding`                             | Same flows as settings (duplicate entry)                             |       |

## 6.14 Restaurant RBAC spot checks

| ID      | Steps                                                                  | Expected                                      | Pass? |
| ------- | ---------------------------------------------------------------------- | --------------------------------------------- | ----- |
| RBAC-R1 | Log in as `RESTAURANT_STAFF` (limited role)                            | Only permitted nav items; APIs 403 otherwise  |       |
| RBAC-R2 | `RESTAURANT_MANAGER`                                                   | Broader access than staff; less than owner    |       |
| RBAC-R3 | `RESTAURANT_OWNER`                                                     | Full restaurant permissions                   |       |
| RBAC-R4 | Gold restaurant — Settings → Team → role assignment (`advanced_roles`) | Can assign/modify roles for team members      |       |
| RBAC-R5 | Free restaurant — no role management section                           | Section hidden or locked                      |       |
| RBAC-R6 | Invite user already linked to another restaurant/supplier              | Invitation or accept returns clear conflict   |       |
| RBAC-R7 | Creator after `/register/complete`                                     | Owner role; `user_workspace_membership` row   |       |
| RBAC-R8 | Manager cannot assign role with permissions they lack (API/UI)         | 403 on assign; UI hides over-privileged roles |       |
| RBAC-R9 | Cannot remove/downgrade last Owner in org                              | 400 with clear message                        |       |

---

# Part 7 — Supplier tenant

**Primary accounts:** `supplier@supplify.com`, `supplier-gold@supplify.com`, `supplier-free@supplify.com`

**Sidebar:** Dashboard, Orders, Products, Fulfillment, Restaurants, Invoices, Chat, Settings  
**Deep links:** `/app/inventory`, `/app/supplier-settings`

## 7.1 Dashboard (`/app/dashboard`)

| ID     | Steps                                       | Expected                                      | Pass? |
| ------ | ------------------------------------------- | --------------------------------------------- | ----- |
| SUP-01 | Load dashboard                              | Supplier KPIs                                 |       |
| SUP-02 | **Low stock** column (not "Reorder alerts") | Lists SKUs below threshold; link to inventory |       |
| SUP-03 | Recent orders                               | Links work                                    |       |
| SUP-04 | Order calendar (Bronze+, `order_calendar`)  | Same gating as restaurant; paywall on Free    |       |

## 7.2 Orders (`/app/orders`, `/app/orders/:id`)

| ID     | Steps                                         | Expected                                   | Pass? |
| ------ | --------------------------------------------- | ------------------------------------------ | ----- |
| SUP-05 | List tabs                                     | Filter by status                           |       |
| SUP-06 | Accept/processing workflow                    | Status moves New → Processing              |       |
| SUP-07 | Mark shipped → **Mark Delivered**             | Restaurant sees `DELIVERED`; can receive   |       |
| SUP-08 | **Manual order** creation (if UI/API exposed) | Order created for restaurant               |       |
| SUP-09 | Order detail — supplier tabs                  | Picking notes, Delivery info, Packing slip |       |
| SUP-10 | Invoice tab on order (if present)             | Linked invoice                             |       |

## 7.3 Products & pricing (`/app/products`, `/app/products/:id`)

| ID     | Steps                                    | Expected                            | Pass? |
| ------ | ---------------------------------------- | ----------------------------------- | ----- |
| SUP-11 | Create product                           | Appears in list                     |       |
| SUP-12 | Edit product (name, SKU, category, tags) | Saves                               |       |
| SUP-13 | Deactivate/delete (if supported)         | Removed from catalog                |       |
| SUP-14 | Manage **prices** per SKU                | Price rows CRUD                     |       |
| SUP-15 | Product images/upload (files API)        | Image displays                      |       |
| SUP-16 | Plan SKU limit                           | Block at limit with upgrade message |       |

## 7.4 Fulfillment (`/app/fulfillment`) — requires `fulfillment_tools` feature

| ID     | Steps                                         | Expected                       | Pass? |
| ------ | --------------------------------------------- | ------------------------------ | ----- |
| SUP-17 | Free account → navigate to `/app/fulfillment` | 403 or paywall                 |       |
| SUP-18 | Bronze+ → Tab: Driver dispatch                | Assign driver / dispatch list  |       |
| SUP-19 | Tab: Pick lists                               | Generate pick list from orders |       |
| SUP-20 | Tab: Routes                                   | Route planning UI              |       |
| SUP-21 | Tab: Delivery tracking                        | Status updates                 |       |
| SUP-22 | Tab: Exceptions                               | Log/resolve exception          |       |
| SUP-23 | Proof of delivery capture                     | Notes/signature fields save    |       |

## 7.5 Supplier inventory (`/app/inventory`) — requires `inventory_management` feature

| ID     | Steps                                       | Expected              | Pass? |
| ------ | ------------------------------------------- | --------------------- | ----- |
| SUP-24 | Free/Bronze → `GET /api/supplier/inventory` | 403 (Gold+ feature)   |       |
| SUP-25 | Gold+ → Open `/app/inventory` (deep link)   | Stock by warehouse    |       |
| SUP-26 | Low-stock alerts                            | Aligns with dashboard |       |
| SUP-27 | Stock adjustment                            | Quantity changes      |       |

## 7.6 Restaurants (customers) (`/app/restaurants`, `/app/restaurants/:id`)

| ID     | Steps                               | Expected                                       | Pass? |
| ------ | ----------------------------------- | ---------------------------------------------- | ----- |
| SUP-28 | Restaurant list                     | Stats render; **no currency format crash**     |       |
| SUP-29 | Restaurant detail                   | Order history, negotiated pricing if shown     |       |
| SUP-30 | **Restaurant pricing** / menu tiers | Create/edit tier; restaurant sees "my pricing" |       |

## 7.7 Invoices & payments (`/app/invoices`) — requires `finance_invoices` feature

| ID     | Steps                                            | Expected                  | Pass? |
| ------ | ------------------------------------------------ | ------------------------- | ----- |
| SUP-31 | Free account → navigate to `/app/invoices`       | 403 or paywall            |       |
| SUP-32 | Bronze+ → Issue invoice from order (if workflow) | Invoice created           |       |
| SUP-33 | Record **full payment**                          | Balance zero              |       |
| SUP-34 | Record **partial payment**                       | Remaining balance correct |       |
| SUP-35 | Apply **credit**                                 | Balance adjusted          |       |
| SUP-36 | Payment history tab                              | All payments listed       |       |

## 7.8 Chat (`/app/chat`) — requires `chat` feature

| ID     | Steps                                         | Expected          | Pass? |
| ------ | --------------------------------------------- | ----------------- | ----- |
| SUP-37 | Free account → navigate to `/app/chat`        | 403 or paywall    |       |
| SUP-38 | Bronze+ → List conversations with restaurants | Loads             |       |
| SUP-39 | **Quick replies** (if enabled)                | Insert template   |       |
| SUP-40 | Send/receive messages                         | Same as RST-63–66 |       |

## 7.9 Supplier settings (`/app/settings` — 9 tabs)

| ID      | Steps                                     | Expected                                                 | Pass? |
| ------- | ----------------------------------------- | -------------------------------------------------------- | ----- |
| SUP-41  | Tab: Profile                              | Company info saves                                       |       |
| SUP-42  | Tab: Contacts                             | Contact persons CRUD                                     |       |
| SUP-43  | Tab: Business                             | Tax, terms, policies                                     |       |
| SUP-44  | Tab: Warehouses                           | Add/edit warehouse; plan limit gate                      |       |
| SUP-44a | Bronze+ → add warehouse within plan limit | Warehouse created                                        |       |
| SUP-44b | Exceed warehouse plan limit               | Block with upgrade CTA                                   |       |
| SUP-44c | Gold+ → multi-warehouse routing toggle    | Toggle available; routing rules configurable             |       |
| SUP-45  | Tab: Delivery                             | Zones, lead times, fees                                  |       |
| SUP-46  | Tab: Branches                             | Multi-account linking; branch limit respected            |       |
| SUP-47  | Tab: Notifications                        | Preferences save                                         |       |
| SUP-48  | Tab: Plan & billing                       | Subscription + payment modal                             |       |
| SUP-49  | Tab: Activity (Gold+, `tenant_audit_log`) | Product/order events; filters work; Free sees tab hidden |       |
| SUP-50  | All tabs visible without overlap          | Tabs wrap on narrow screens                              |       |
| SUP-51  | `/app/supplier-settings`                  | Same as `/app/settings`                                  |       |

## 7.10 Supplier RBAC spot checks

| ID      | Steps                                                                | Expected                                 | Pass? |
| ------- | -------------------------------------------------------------------- | ---------------------------------------- | ----- |
| RBAC-S1 | `SUPPLIER_STAFF`                                                     | Fulfillment-focused; restricted settings |       |
| RBAC-S2 | `SUPPLIER_MANAGER`                                                   | Catalog + orders                         |       |
| RBAC-S3 | `SUPPLIER_OWNER`                                                     | Full supplier access                     |       |
| RBAC-S4 | Gold supplier — Settings → Team → role assignment (`advanced_roles`) | Can assign/modify roles                  |       |
| RBAC-S5 | Free/Bronze supplier — no role management                            | Section hidden or locked                 |       |
| RBAC-S6 | Settings → **Team & roles** tab (Bronze+, `advanced_roles`)          | `TeamRolesPanel` + branch invite panel   |       |
| RBAC-S7 | Invite email already on another supplier account                     | Blocked at invite or accept              |       |

## 7.11 Deals & promotions (`/app/promotions`) — requires `promotions` feature

| ID     | Steps                                        | Expected                                           | Pass? |
| ------ | -------------------------------------------- | -------------------------------------------------- | ----- |
| SUP-52 | Free account → `/app/promotions`             | 403 or paywall                                     |       |
| SUP-53 | Create deal draft with **product targeting** | Select specific products; save draft               |       |
| SUP-54 | Create deal with **category targeting**      | Select categories; save draft                      |       |
| SUP-55 | Activate deal                                | Status active (or pending approval if configured)  |       |
| SUP-56 | **Boost** active deal                        | Boost dialog; pricing tier; campaign active        |       |
| SUP-57 | Deal analytics                               | Views, clicks, orders, messages, coupon uses shown |       |
| SUP-58 | Pause / resume deal                          | Status toggles correctly                           |       |

---

# Part 8 — Platform admin

**Primary account:** `admin@supplify.com`

**Sidebar:** Admin Dashboard, Supplier Admin, Restaurant Admin, Settings

## 8.1 Admin dashboard — main (`/app/admin`)

### Overview tab

| ID     | Steps                            | Expected                                    | Pass? |
| ------ | -------------------------------- | ------------------------------------------- | ----- |
| ADM-01 | Open `/app/admin`                | Overview KPIs load                          |       |
| ADM-02 | Past-due / trial alerts banner   | Shows when any tenant is past-due or locked |       |
| ADM-03 | Charts: orders, revenue, signups | Render or empty state                       |       |

### Activity tab

| ID     | Steps         | Expected                                                     | Pass? |
| ------ | ------------- | ------------------------------------------------------------ | ----- |
| ADM-04 | Activity feed | Recent platform events (registrations, plan changes, logins) |       |

### Tenants tab

| ID     | Steps                            | Expected                                           | Pass? |
| ------ | -------------------------------- | -------------------------------------------------- | ----- |
| ADM-05 | List all tenants                 | Restaurants + suppliers with plan and status shown |       |
| ADM-06 | Search/filter tenants            | Results update                                     |       |
| ADM-07 | Create new **restaurant** tenant | Tenant + locked subscription created               |       |
| ADM-08 | Create new **supplier** tenant   | Same                                               |       |
| ADM-09 | Open tenant detail               | Profile, subscription summary, plan                |       |

### Subscriptions tab

| ID     | Steps                                                                     | Expected                                                         | Pass? |
| ------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----- |
| ADM-10 | List subscriptions                                                        | Status, plan, lock state                                         |       |
| ADM-11 | Change plan (upgrade/downgrade)                                           | Preview + apply; cache invalidated; entitlements_refresh emitted |       |
| ADM-12 | **Activate** pending-activation subscription                              | Tenant unlocked immediately                                      |       |
| ADM-13 | **Unlock** past-due locked subscription                                   | Lock cleared; tenant can log in to full app                      |       |
| ADM-14 | Cancel / extend trial (if UI)                                             | Status updated                                                   |       |
| ADM-15 | After plan change: logged-in tenant receives `entitlements_refresh` event | UI updates features without manual reload                        |       |

### Plans tab

| ID     | Steps                                                         | Expected                                                                            | Pass? |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----- |
| ADM-16 | List plans by tenant type                                     | Free, Bronze, Gold, Platinum for RESTAURANT and SUPPLIER                            |       |
| ADM-17 | Edit plan limits (e.g. daily order limit, SKU limit)          | Saves; tenants reflect on next entitlements fetch                                   |       |
| ADM-18 | Edit plan features (enable/disable a feature for a plan tier) | Saves; affects all tenants on that plan                                             |       |
| ADM-19 | Create plan version (if supported)                            | Appears in catalog                                                                  |       |
| ADM-20 | Verify plan features JSON contains expected keys              | All 23 restaurant / 22 supplier feature keys present with correct true/false values |       |

### Finance tab

| ID     | Steps                 | Expected                        | Pass? |
| ------ | --------------------- | ------------------------------- | ----- |
| ADM-21 | MRR / revenue metrics | Load                            |       |
| ADM-22 | Past-due amounts      | Match any seeded billing states |       |

### Usage tab

| ID     | Steps                          | Expected                                                     | Pass? |
| ------ | ------------------------------ | ------------------------------------------------------------ | ----- |
| ADM-23 | Tenant usage meters            | Orders/day, SKUs, chats, warehouses per tenant               |       |
| ADM-24 | **Limit overrides** per tenant | Override applies over plan; visible in tenant's entitlements |       |

### Features tab — global flags

| ID     | Steps                                                                         | Expected                                                                          | Pass? |
| ------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----- |
| ADM-25 | Global feature flags list                                                     | All 23/22 feature keys listed with current state                                  |       |
| ADM-26 | Disable a feature **globally** (e.g. `chat`)                                  | `POST /api/feature-flags/global` 200; all tenants lose feature regardless of plan |       |
| ADM-27 | Verify: Gold restaurant hits `/app/chat` after global disable                 | 403 — global flag overrides plan                                                  |       |
| ADM-28 | Re-enable feature globally                                                    | Tenants restore feature per plan                                                  |       |
| ADM-29 | **Per-tenant override** — force enable on Free tenant                         | Override record created; tenant gains feature                                     |       |
| ADM-30 | Verify: Free tenant can now use the force-enabled feature                     | Feature accessible                                                                |       |
| ADM-31 | **Per-tenant override** — force disable on Gold tenant                        | Override record created; Gold tenant loses that feature                           |       |
| ADM-32 | Remove tenant override                                                        | Tenant returns to plan-defined entitlement                                        |       |
| ADM-33 | After any flag change, check logged-in tenant receives `entitlements_refresh` | WebSocket event delivered; UI updates                                             |       |
| ADM-34 | Audit log records every flag change                                           | Action logged under admin actor                                                   |       |

### Deals tab — approvals & boost pricing

| ID     | Steps                              | Expected                                     | Pass? |
| ------ | ---------------------------------- | -------------------------------------------- | ----- |
| ADM-35 | Open **Deals** tab on `/app/admin` | Pending deals list + pricing tiers load      |       |
| ADM-36 | Approve pending deal               | Deal status → active; visible to restaurants |       |
| ADM-37 | Reject pending deal                | Deal returns to draft                        |       |
| ADM-38 | Edit boost pricing tier amount     | Saves via PATCH; suppliers see updated price |       |

### Health tab

| ID     | Steps                    | Expected                     | Pass? |
| ------ | ------------------------ | ---------------------------- | ----- |
| ADM-35 | System health indicators | API/DB/Redis status or stubs |       |

### Audit tab

| ID     | Steps                             | Expected                                                                    | Pass? |
| ------ | --------------------------------- | --------------------------------------------------------------------------- | ----- |
| ADM-36 | Audit log entries                 | Admin actions recorded (plan change, flag change, impersonation start/stop) |       |
| ADM-37 | Filter by actor/action/date       | Works correctly                                                             |       |
| ADM-38 | Export or paginate (if supported) | Loads without timeout on large log                                          |       |

## 8.2 Supplier admin (`/app/admin/suppliers`)

| ID     | Steps                              | Expected               | Pass? |
| ------ | ---------------------------------- | ---------------------- | ----- |
| ADM-39 | Directory tab — supplier-only list | Suppliers only         |       |
| ADM-40 | Usage & quotas tab                 | Per-supplier meters    |       |
| ADM-41 | Audit logs tab                     | Supplier-scoped events |       |

## 8.3 Restaurant admin (`/app/admin/restaurants`)

| ID     | Steps                                | Expected                 | Pass? |
| ------ | ------------------------------------ | ------------------------ | ----- |
| ADM-42 | Directory tab — restaurant-only list | Restaurants only         |       |
| ADM-43 | Usage & quotas tab                   | Per-restaurant meters    |       |
| ADM-44 | Audit logs tab                       | Restaurant-scoped events |       |

## 8.4 Admin support tools

| ID     | Steps                                                    | Expected                                                    | Pass? |
| ------ | -------------------------------------------------------- | ----------------------------------------------------------- | ----- |
| ADM-45 | **Impersonate** restaurant from tenant detail            | Tenant app as restaurant; impersonation banner visible      |       |
| ADM-46 | While impersonating restaurant: navigate to `/app/admin` | Redirect to tenant dashboard; admin routes inaccessible     |       |
| ADM-47 | **Stop impersonation**                                   | Returns to admin context; banner gone                       |       |
| ADM-48 | **Impersonate** supplier                                 | Tenant app as supplier                                      |       |
| ADM-49 | Impersonation is audit-logged                            | Audit entry: admin actor, impersonate action, target tenant |       |
| ADM-50 | Join chat as admin (if exposed)                          | Moderation/support view                                     |       |
| ADM-51 | Admin settings (`/app/settings`)                         | Profile + notification prefs only; no tenant data           |       |

## 8.5 Admin RBAC (if multiple admin users)

| ID      | Steps           | Expected                                 | Pass? |
| ------- | --------------- | ---------------------------------------- | ----- |
| RBAC-A1 | `SUPPORT_ADMIN` | Tenants + impersonation; no finance tab  |       |
| RBAC-A2 | `FINANCE_ADMIN` | Finance + subscriptions; no features tab |       |
| RBAC-A3 | `GROWTH_ADMIN`  | Analytics-focused tools                  |       |
| RBAC-A4 | `SUPER_ADMIN`   | All admin tabs                           |       |

---

# Part 9 — End-to-end business flows (multi-persona)

| ID      | Steps                                                                                                              | Expected                                            | Pass? |
| ------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----- |
| E2E-01  | Restaurant places order → Supplier accepts → Ships → Restaurant receives                                           | Happy path all statuses                             |       |
| E2E-02  | Order → Invoice issued → Payment recorded                                                                          | Invoice paid; balances correct                      |       |
| E2E-03  | Restaurant chats supplier about order (both Bronze+)                                                               | Message thread linked contextually                  |       |
| E2E-04  | Guest books table → Restaurant board updates → Guest cancels via link                                              | Public + internal sync                              |       |
| E2E-05  | Staff portal account clocks in on `/staff/dashboard` → Manager sees on `/app/staff`                                | Time event recorded; staff cannot access `/app`     |       |
| E2E-05b | Staff portal user navigates to `/app` or `GET /api/orders`                                                         | Redirect or 403 `STAFF_PORTAL_FORBIDDEN`            |       |
| E2E-06  | Restaurant quick list scheduled order → Appears on supplier orders                                                 | Scheduled metadata preserved                        |       |
| E2E-07  | Supplier low stock → Dashboard alert → Adjust inventory                                                            | Stock corrected                                     |       |
| E2E-08  | Free restaurant blocked on calendar → Upgrades to Bronze → Calendar works                                          | Feature gate lifted; subscription cache invalidated |       |
| E2E-09  | Admin impersonates → places test order → stops impersonation                                                       | Audit trail; no data leak across tenants            |       |
| E2E-10  | Admin disables `chat` globally → Both tenants lose chat → Admin re-enables → Chat restored                         | Feature gate toggles for all tenants consistently   |       |
| E2E-11  | Supplier creates product → Restaurant browses catalog → Restaurant adds to cart → Places order → Supplier fulfills | Full order lifecycle from catalog to delivery       |       |
| E2E-12  | Tenant subscription goes PAST_DUE (simulated) → Grace period timer → Account locked → Tenant pays → Unlocked       | Full billing lifecycle                              |       |

---

# Part 10 — API smoke tests (optional for QA leads)

| ID     | Steps                                                                       | Expected                                                               | Pass? |
| ------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----- |
| API-01 | `GET /api/auth/me` with session                                             | User + tenant + permissions                                            |       |
| API-02 | `GET /api/subscriptions/entitlements/current`                               | Plan, limits, usage, features object                                   |       |
| API-03 | `GET /api/orders/calendar` (Bronze+ restaurant)                             | 200 + events                                                           |       |
| API-04 | `GET /api/orders/calendar` (Free restaurant)                                | 403 feature error                                                      |       |
| API-05 | `POST /api/billing/checkout` (stub card, Bronze plan)                       | 200 + active subscription                                              |       |
| API-06 | `GET /api/billing/status`                                                   | Plan, status, next billing date                                        |       |
| API-07 | `PATCH /api/billing/auto-renew` `{ autoRenew: false }`                      | 200; auto_renew updated                                                |       |
| API-08 | `GET /api/public/reservations/...`                                          | No auth required; 200                                                  |       |
| API-09 | Locked tenant `POST /api/orders`                                            | 402 ACCOUNT_LOCKED                                                     |       |
| API-10 | `POST /api/files` (file upload presign)                                     | Presigned URL returned; upload succeeds                                |       |
| API-11 | `GET /api/chat/conversations` (Free tenant)                                 | 403 `FEATURE_DISABLED`                                                 |       |
| API-12 | `GET /api/quick-lists` (Free tenant)                                        | 403 `FEATURE_DISABLED`                                                 |       |
| API-13 | `GET /api/receiving` (Free restaurant)                                      | 403 `FEATURE_DISABLED`                                                 |       |
| API-14 | `GET /api/invoices` (Free tenant)                                           | 403 `FEATURE_DISABLED`                                                 |       |
| API-15 | `GET /api/restaurant-inventory` (Free restaurant)                           | 403 `FEATURE_DISABLED`                                                 |       |
| API-16 | `GET /api/fulfillment` (Free supplier)                                      | 403 `FEATURE_DISABLED`                                                 |       |
| API-17 | `GET /api/feature-flags/global` (admin)                                     | 200 + list of all global flags                                         |       |
| API-18 | `POST /api/feature-flags/global` (non-admin)                                | 403                                                                    |       |
| API-19 | `GET /api/subscriptions/entitlements/current` — call 3× in quick succession | All return same data (cache hit); response time < 100ms on 2nd and 3rd |       |
| API-20 | `GET /api/promotions/active` (Bronze+ restaurant)                           | 200 + deals array                                                      |       |
| API-21 | `GET /api/promotions/active` (Free restaurant)                              | 403 `FEATURE_DISABLED`                                                 |       |
| API-22 | `GET /api/promotions/admin/pending` (admin)                                 | 200 + pending deals                                                    |       |
| API-23 | `GET /api/orders/:id` after deal-applied order                              | 200 + `appliedPromotion` on order object                               |       |
| API-24 | `POST /api/orders` with `promotionId` + `couponCode`                        | Discount applied; `promotion_usages` recorded                          |       |

---

# Part 11 — Automated tests (CI parity)

| ID    | Command                                                                             | Expected                                                 | Pass? |
| ----- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- | ----- |
| CI-01 | `pnpm --filter @supplify/api test:run`                                              | All API unit tests pass                                  |       |
| CI-02 | `pnpm --filter @supplify/web test:run`                                              | All web unit tests pass                                  |       |
| CI-03 | `pnpm test:ci` (root)                                                               | Both packages green                                      |       |
| CI-04 | `pnpm run e2e:playwright` (if configured)                                           | E2E suite pass                                           |       |
| CI-05 | Deals/promotions unit + API gates (see `docs/features/promotions-deals.md` § Tests) | Vitest + `tests/api/promotions-deals-gates.spec.ts` pass |       |

---

# Part 12 — Non-functional & browser matrix

| ID     | Area           | Steps                                      | Expected                               | Pass? |
| ------ | -------------- | ------------------------------------------ | -------------------------------------- | ----- |
| NFR-01 | Browser        | Chrome latest                              | Full pass on critical paths            |       |
| NFR-02 | Browser        | Firefox / Safari                           | Layout acceptable                      |       |
| NFR-03 | Responsive     | Tablet width                               | Sidebar usable                         |       |
| NFR-04 | Performance    | Dashboard with prod-like data              | Loads < 5s                             |       |
| NFR-05 | Error handling | Stop API mid-request                       | Toast/error boundary; no white screen  |       |
| NFR-06 | Security       | Access other tenant ID in URL              | 403/404                                |       |
| NFR-07 | Cache          | Subscription entitlements: call 3× rapidly | Same data; no N+1 to DB                |       |
| NFR-08 | WebSocket      | 10-minute idle, then send chat message     | Socket reconnects; message delivers    |       |
| NFR-09 | Migration      | Run `db:migrate` on empty DB               | All 90+ migrations apply without error |       |
| NFR-10 | Concurrency    | Two users submit orders simultaneously     | Both orders created; no duplicates     |       |

---

## Demo credentials (for seeded environments)

| Account                                                           | Password               | Role / notes                                    |
| ----------------------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| `admin@supplify.com`                                              | `SupplifyAdmin1!`      | Platform admin                                  |
| `restaurant@supplify.com`                                         | `SupplifyRestaurant1!` | Golden Fork (demo restaurant)                   |
| `supplier@supplify.com`                                           | `SupplifySupplier1!`   | Fresh Foods Co. (demo supplier)                 |
| `restaurant-free@supplify.com`                                    | `Supplify1!`           | Free plan — calendar and chat gated             |
| `restaurant-bronze@supplify.com`                                  | `Supplify1!`           | Bronze tier                                     |
| `restaurant-gold@supplify.com`                                    | `Supplify1!`           | Gold — full features                            |
| `restaurant-platinum@supplify.com`                                | `Supplify1!`           | Platinum tier                                   |
| `supplier-free@supplify.com`                                      | `Supplify1!`           | Supplier free tier                              |
| `supplier-gold@supplify.com`                                      | `Supplify1!`           | Supplier Gold                                   |
| `restaurant-gold-manager@supplify.com`                            | `Supplify1!`           | Gold restaurant — Manager (`seed:tier-catalog`) |
| `restaurant-gold-purchaser@supplify.com`                          | `Supplify1!`           | Gold restaurant — Purchaser                     |
| `restaurant-silver@supplify.com` / `supplier-silver@supplify.com` | `Supplify1!`           | Silver tier (`tier-restaurant-silver` slugs)    |
| `restaurant-1@test.com` … `restaurant-10@test.com`                | (Keycloak)             | Prod-like seed (`seed:prodlike`)                |

---

## Sign-off

| Role                               | Tester | Date | Build/branch | Open defects |
| ---------------------------------- | ------ | ---- | ------------ | ------------ |
| Fresh DB setup (Part 0)            |        |      |              |              |
| Restaurant creation (Part 1)       |        |      |              |              |
| Supplier creation (Part 2)         |        |      |              |              |
| Feature gate verification (Part 3) |        |      |              |              |
| Cross-cutting / Auth (Part 4)      |        |      |              |              |
| Public / guest flows (Part 5)      |        |      |              |              |
| Restaurant tenant flows (Part 6)   |        |      |              |              |
| Supplier tenant flows (Part 7)     |        |      |              |              |
| Platform admin flows (Part 8)      |        |      |              |              |
| E2E business flows (Part 9)        |        |      |              |              |
| API smoke tests (Part 10)          |        |      |              |              |
| Automated tests (Part 11)          |        |      |              |              |
| Non-functional (Part 12)           |        |      |              |              |

---

_Full-application checklist for Supplify ERP. For fresh-DB testing start at Part 0 and proceed in order through Part 3 before running any other section._
