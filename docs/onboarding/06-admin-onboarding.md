# Platform admin onboarding guide

Guide for **Supplify platform administrators** managing tenants, billing, support, diagnostics, and operational health. UI routes live under `/app/admin*`; APIs under `/api/admin-dashboard` and selected `/api/admin` endpoints.

**Primary persona:** User with `role: ADMIN` and granular `adminPermissions` (`ADMIN_ACCESS`, `ADMIN_TENANTS`, `ADMIN_PLANS`, `ADMIN_FINANCE`, `ADMIN_SUPPORT`, `ADMIN_GROWTH`).

---

## Step 1 — Admin login and permission model

| Field                    | Detail                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Access admin consoles with correct scoped permissions.                                                                                                                                    |
| **Who**                  | Platform admin (seeded e.g. `admin@supplify.com` via `pnpm run seed:demo-users`).                                                                                                         |
| **Navigation path**      | `/login` → `/app/admin` (default landing)                                                                                                                                                 |
| **Required data**        | Admin Keycloak credentials; ADMIN realm role.                                                                                                                                             |
| **Expected result**      | Sidebar shows **ADMIN** section (Admin Dashboard, Supplier Admin, Restaurant Admin, Settings); `GET /api/auth/me` → `role: "ADMIN"`; tabs gated by `canAdminTab` in `AdminDashboardPage`. |
| **Possible errors**      | Missing admin permissions hide tabs (fallback to first allowed tab); non-admin user cannot access `/app/admin`.                                                                           |
| **Validation checklist** | [ ] `/app/admin` loads overview. [ ] Tabs match permission set. [ ] `GET /api/admin-dashboard/overview` returns 200.                                                                      |

**Permission map (UI tabs):**

| Tab                                           | Permission      |
| --------------------------------------------- | --------------- |
| Overview, Activity, Health, Operations, Audit | `ADMIN_ACCESS`  |
| Tenants                                       | `ADMIN_TENANTS` |
| Users                                         | `ADMIN_SUPPORT` |
| Plans, Subscriptions, Usage, Limits           | `ADMIN_PLANS`   |
| Finance                                       | `ADMIN_FINANCE` |
| Features, Deals                               | `ADMIN_GROWTH`  |

---

## Step 2 — Navigate admin portals (platform vs tenant-type)

| Field                    | Detail                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Use the correct portal for cross-tenant vs supplier-only vs restaurant-only work.                                                                                                                 |
| **Who**                  | Admin with `ADMIN_TENANTS` or `ADMIN_ACCESS`.                                                                                                                                                     |
| **Navigation path**      | `/app/admin` (platform) · `/app/admin/suppliers` · `/app/admin/restaurants` · tab deep links e.g. `/app/admin/subscriptions`, `/app/admin/suppliers/audit`                                        |
| **Required data**        | None.                                                                                                                                                                                             |
| **Expected result**      | Platform portal exposes full nav groups (Monitor, Accounts, Billing, Growth). Supplier/restaurant portals limit tabs to **Directory**, **Usage & quotas**, **Audit log** per `adminNavConfig.ts`. |
| **Possible errors**      | Invalid tab segment redirects to default tab for portal.                                                                                                                                          |
| **Validation checklist** | [ ] Portal switcher highlights correct portal. [ ] Supplier portal pins **Tenants** tab to supplier directory. [ ] URL bookmarking restores tab.                                                  |

---

## Step 3 — Platform overview and activity feed

| Field                    | Detail                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Monitor signups, conversions, and recent platform events.                                                                                                        |
| **Who**                  | `ADMIN_ACCESS`.                                                                                                                                                  |
| **Navigation path**      | `/app/admin` or `/app/admin/overview` → **Overview**; **Activity** → `/app/admin/activity`                                                                       |
| **Required data**        | Date filters on activity as exposed in UI.                                                                                                                       |
| **Expected result**      | `GET /api/admin-dashboard/overview` returns KPI metrics; `GET /api/admin-dashboard/activity` returns feed (tenant creation, subscriptions, impersonation, etc.). |
| **Possible errors**      | Empty feed on fresh environment (expected).                                                                                                                      |
| **Validation checklist** | [ ] Overview cards render counts. [ ] Activity shows events after test tenant signup. [ ] Conversion stats load via `GET /api/admin-dashboard/conversion-stats`. |

---

## Step 4 — Tenant directory (suppliers and restaurants)

| Field                    | Detail                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Search, filter, and act on any tenant row.                                                                                                                         |
| **Who**                  | `ADMIN_TENANTS`.                                                                                                                                                   |
| **Navigation path**      | `/app/admin/tenants` or `/app/admin/suppliers` or `/app/admin/restaurants`                                                                                         |
| **Required data**        | Search string; status filter (ACTIVE, TRIALING, PAST_DUE, SUSPENDED, CANCELLED, NONE).                                                                             |
| **Expected result**      | `GET /api/admin-dashboard/tenants/suppliers` and `.../tenants/restaurants` paginate with plan, revenue/spend, subscription id; client-side filter on loaded pages. |
| **Possible errors**      | `403` without `ADMIN_TENANTS`; empty list if DB not seeded.                                                                                                        |
| **Validation checklist** | [ ] Search matches name/email. [ ] Status filter works. [ ] Row actions visible (impersonate, change plan, diagnostics, password reset).                           |

**API:** `GET /api/admin-dashboard/tenants/suppliers`, `GET /api/admin-dashboard/tenants/restaurants`, `GET /api/admin-dashboard/tenants/search?q=`.

---

## Step 5 — Create supplier tenant (admin API)

| Field                    | Detail                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Provision supplier without self-service registration (migrations, demos, enterprise onboarding).                                                                                                 |
| **Who**                  | `ADMIN` role (API-only today — `POST /api/suppliers` admin route).                                                                                                                               |
| **Navigation path**      | API: `POST /api/suppliers` (no first-class wizard in tenants UI; use API client or internal tooling)                                                                                             |
| **Required data**        | `name`, `slug`, `contactEmail`, optional `vatNo`, `phone`, `address`.                                                                                                                            |
| **Expected result**      | `201` with `supplier` row; `createPendingActivationSubscription` (free, `pending_activation`); `ensureTenantSystemRoles`. Owner must still be linked via separate user invite/workspace binding. |
| **Possible errors**      | Duplicate slug; validation `400`; missing admin auth `403`.                                                                                                                                      |
| **Validation checklist** | [ ] Supplier appears in admin tenants list. [ ] Subscription row exists with pending activation. [ ] Tenant searchable via `tenants/search`.                                                     |

**Note:** Restaurant admin create may follow self-service `/register/complete` or future admin API — supplier create is explicitly in `apps/api/src/routes/suppliers/admin.js`.

---

## Step 6 — Subscriptions list and filters

| Field                    | Detail                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Goal**                 | View all subscription rows across tenants for billing operations.                                                                                          |
| **Who**                  | `ADMIN_PLANS`.                                                                                                                                             |
| **Navigation path**      | `/app/admin/subscriptions`                                                                                                                                 |
| **Required data**        | Optional query filters `status`, `tenantType` (SUPPLIER                                                                                                    | RESTAURANT). |
| **Expected result**      | `GET /api/admin-dashboard/subscriptions` returns deduped active/trialing preference per tenant with plan metadata.                                         |
| **Possible errors**      | Large lists slow without filters.                                                                                                                          |
| **Validation checklist** | [ ] Suspended/past-due counts in summary strip. [ ] Tenant name/email columns populated. [ ] Row links to change-plan dialog when subscription id present. |

---

## Step 7 — Unlock pending activation accounts

| Field                    | Detail                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Clear `pending_activation` when tenant cannot self-activate (support scenario).                                                             |
| **Who**                  | `ADMIN_PLANS`.                                                                                                                              |
| **Navigation path**      | `/app/admin/subscriptions` → row action **Unlock**                                                                                          |
| **Required data**        | `subscription_id`; optional reason in audit.                                                                                                |
| **Expected result**      | `POST /api/admin-dashboard/subscriptions/:id/unlock` calls `unlockSubscriptionAccount`; tenant can write immediately.                       |
| **Possible errors**      | Subscription not found; not in lockable state.                                                                                              |
| **Validation checklist** | [ ] Tenant user reaches `/app` without `/app/activate` redirect. [ ] `GET /api/billing/status` shows unlocked. [ ] Audit log entry created. |

**Classification:** **Safe** support action (reversible by re-lock only through billing rules; no data deletion).

---

## Step 8 — Extend free trial / sandbox

| Field                    | Detail                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Extend expired or expiring free sandbox for a tenant.                                                                             |
| **Who**                  | `ADMIN_PLANS`.                                                                                                                    |
| **Navigation path**      | `/app/admin/subscriptions` → **Extend trial** (expired trial rows)                                                                |
| **Required data**        | `days` between 7–90 (`clampFreeTrialDays` platform settings).                                                                     |
| **Expected result**      | `POST /api/admin-dashboard/subscriptions/:id/extend-free-trial` calls `extendFreeSandboxTrial`; writes restored until new expiry. |
| **Possible errors**      | Not on free/trial plan; days out of range.                                                                                        |
| **Validation checklist** | [ ] Trial end date updated in UI. [ ] Tenant writes succeed after expiry had blocked them. [ ] Event in admin activity feed.      |

**Classification:** **Safe** — extends timeboxed access; audited.

---

## Step 9 — Change plan (preview and apply)

| Field                    | Detail                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Move tenant between Free/Silver/Gold/Platinum/Enterprise with impact preview.                                                                                                             |
| **Who**                  | `ADMIN_PLANS`.                                                                                                                                                                            |
| **Navigation path**      | Tenants or Subscriptions tab → **Change plan** (`AdminChangePlanDialog`)                                                                                                                  |
| **Required data**        | Target `planId`; optional `force`, `reason`, `applyAtPeriodEnd`, `allowExceedance` for over-limit tenants.                                                                                |
| **Expected result**      | `POST /api/admin-dashboard/subscriptions/:id/preview-change` shows usage vs limits diff; `PATCH /api/admin-dashboard/subscriptions/:id` applies change and invalidates entitlement cache. |
| **Possible errors**      | Downgrade blocked by usage unless `force: true`; enterprise validation failures.                                                                                                          |
| **Validation checklist** | [ ] Preview lists feature/limit deltas. [ ] Tenant nav reflects new entitlements after cache refresh. [ ] `GET /api/admin-dashboard/tenants/:type/:id/entitlements` matches.              |

**Classification:** **Moderate** — `force: true` is **dangerous** (can leave tenant over limits or remove critical features mid-operation).

---

## Step 10 — Impersonate tenant (support)

| Field                    | Detail                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Goal**                 | Reproduce tenant issues in-app as their workspace.                                                                                                                                                                                                                                              |
| **Who**                  | `ADMIN_SUPPORT` / tenants actions.                                                                                                                                                                                                                                                              |
| **Navigation path**      | `/app/admin/suppliers` or `/app/admin/restaurants` → row **Impersonate**                                                                                                                                                                                                                        |
| **Required data**        | `tenantId`, `tenantType` (`RESTAURANT`                                                                                                                                                                                                                                                          | `SUPPLIER`); `acknowledgeSuspended: true` if tenant suspended. |
| **Expected result**      | `POST /api/admin-dashboard/impersonate` sets signed cookie; redirect to `/app/dashboard`; banner shows impersonation; `GET /api/admin-dashboard/impersonate` returns status. Effective tenant from `getEffectiveTenant(req)` — billing lock **still applies** when impersonating locked tenant. |
| **Possible errors**      | `TENANT_SUSPENDED` requires confirmation; cannot impersonate admin email; `403` forbidden.                                                                                                                                                                                                      |
| **Validation checklist** | [ ] Banner visible while impersonating. [ ] Sidebar matches tenant type. [ ] `POST /api/admin-dashboard/impersonate/stop` ends session. [ ] Actions audited in audit log.                                                                                                                       |

**Classification:** **Moderate** — read/write as tenant; stop impersonation when done. Not a blank check — permissions use effective tenant RBAC.

---

## Step 11 — Stop impersonation

| Field                    | Detail                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Return to platform admin context.                                                                                                     |
| **Who**                  | Impersonating admin.                                                                                                                  |
| **Navigation path**      | Impersonation banner → **Stop** (or API)                                                                                              |
| **Required data**        | Active impersonation cookie.                                                                                                          |
| **Expected result**      | `POST /api/admin-dashboard/impersonate/stop` clears cookie; redirect admin shell; platform stats on `GET /api/admin/dashboard` again. |
| **Possible errors**      | Already stopped — idempotent.                                                                                                         |
| **Validation checklist** | [ ] Admin sidebar returns. [ ] `/app/admin` accessible. [ ] Audit entry for stop.                                                     |

---

## Step 12 — User support and password reset

| Field                    | Detail                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Help users who cannot log in (Keycloak password reset).                                                                    |
| **Who**                  | `ADMIN_SUPPORT`.                                                                                                           |
| **Navigation path**      | `/app/admin/users` → user row → reset dialog (`AdminResetPasswordDialog`)                                                  |
| **Required data**        | Target user id/email; new temporary password per policy.                                                                   |
| **Expected result**      | `POST /api/admin-dashboard/users/reset-password` via `adminResetUserPassword`; user can log in at `/login`.                |
| **Possible errors**      | User not found; Keycloak admin API failure.                                                                                |
| **Validation checklist** | [ ] User confirms login with new password. [ ] Audit log records reset. [ ] User changes password in Keycloak if required. |

**Classification:** **Moderate** — security-sensitive; verify identity out-of-band before reset.

---

## Step 13 — Tenant diagnostics drawer

| Field                    | Detail                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Read-only operational snapshot before deep support.                                                                                                                                                                                                                                                                                                                                        |
| **Who**                  | Admin on tenants tab.                                                                                                                                                                                                                                                                                                                                                                      |
| **Navigation path**      | Tenants row → **Diagnostics** (stethoscope) → `AdminTenantDiagnosticsDrawer`                                                                                                                                                                                                                                                                                                               |
| **Required data**        | `tenantId`, `tenantType`.                                                                                                                                                                                                                                                                                                                                                                  |
| **Expected result**      | `GET /api/admin-dashboard/tenants/:tenantType/:id/operational-snapshot` plus entitlements and usage endpoints show: subscription status, trial end, `writeBlocked`, effective feature flags, supplier GPS today counts / fulfillment issues / pending deals, restaurant expiry & quick list stats & tracking privacy flags, email provider health, recent email failures, usage vs limits. |
| **Possible errors**      | Drawer loading timeout on large tenant.                                                                                                                                                                                                                                                                                                                                                    |
| **Validation checklist** | [ ] Subscription section matches subscriptions tab. [ ] Write blocked flag matches tenant complaint. [ ] Links to Limits/Features tabs work.                                                                                                                                                                                                                                               |

**API:** `GET .../operational-snapshot`, `GET .../entitlements`, `GET .../tenants/suppliers/:id/usage`, `GET .../tenants/restaurants/:id/usage`.

---

## Step 14 — Operations panel (email, inventory, fulfillment, GPS)

| Field                    | Detail                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Platform-wide operational triage.                                                                                                                                                        |
| **Who**                  | `ADMIN_ACCESS`.                                                                                                                                                                          |
| **Navigation path**      | `/app/admin/operations` with sub-tabs: summary, email, inventory, fulfillment, gps                                                                                                       |
| **Required data**        | None; optional filters per sub-panel.                                                                                                                                                    |
| **Expected result**      | `GET /api/admin-dashboard/operational-summary`; `.../operational/email-logs`; `.../operational/fulfillment-issues`; `.../operational/active-deliveries` populate `AdminOperationsPanel`. |
| **Possible errors**      | Email provider misconfiguration surfaces as danger alerts.                                                                                                                               |
| **Validation checklist** | [ ] Summary shows actionable counts. [ ] Email failures list recent rows. [ ] Active deliveries map data consistent with supplier fulfillment.                                           |

---

## Step 15 — Health check and platform settings

| Field                    | Detail                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Verify API dependencies and tune global trial defaults.                                                                                                            |
| **Who**                  | `ADMIN_ACCESS` (settings patch); health read for all admin access.                                                                                                 |
| **Navigation path**      | `/app/admin/health`; platform settings on overview or dedicated settings surfaces                                                                                  |
| **Required data**        | For patch: `freeTrialDays` (7–90), other keys in platform settings schema.                                                                                         |
| **Expected result**      | `GET /api/admin-dashboard/health` returns component status; `GET/PATCH /api/admin-dashboard/platform-settings` for defaults; growth settings under `ADMIN_GROWTH`. |
| **Possible errors**      | Validation on out-of-range trial days.                                                                                                                             |
| **Validation checklist** | [ ] Health page not degraded in prod. [ ] Trial default matches new registrations after patch.                                                                     |

**Classification:** **Moderate** — platform settings affect all new tenants.

---

## Step 16 — Plans catalog management

| Field                    | Detail                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Maintain `subscription_plan` rows (limits, features, pricing).                                                                                                                       |
| **Who**                  | `ADMIN_PLANS`.                                                                                                                                                                       |
| **Navigation path**      | `/app/admin/plans`                                                                                                                                                                   |
| **Required data**        | Plan code, tenant type, limits JSON, features JSON, prices; enterprise activation rules.                                                                                             |
| **Expected result**      | `GET /api/admin-dashboard/plans`; `POST /api/admin-dashboard/plans`; `PATCH /api/admin-dashboard/plans/:id` with validation (`validatePlanLimitsAndFeatures`, tier ladder warnings). |
| **Possible errors**      | Invalid limit keys; enterprise plan validation failure.                                                                                                                              |
| **Validation checklist** | [ ] `pnpm run seed:tier-catalog` baseline present. [ ] Edit reflects in tenant entitlements after cache invalidation. [ ] Tier ladder warnings shown in UI when applicable.          |

**Classification:** **Dangerous** — misconfigured plan affects all subscribers on that plan.

---

## Step 17 — Limits and overrides

| Field                    | Detail                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Temporarily raise caps or set per-tenant limit exceptions.                                                                                                                       |
| **Who**                  | `ADMIN_PLANS`.                                                                                                                                                                   |
| **Navigation path**      | `/app/admin/limits` (`AdminLimitsTab`)                                                                                                                                           |
| **Required data**        | Tenant or plan id, `limitKey`, `override_value`, **reason** (required in UI).                                                                                                    |
| **Expected result**      | `POST /api/admin-dashboard/tenants/:tenantType/:id/override-limit`; plan-level `POST .../plans/:planId/override-limit`; effective value via `GET .../effective-limit/:limitKey`. |
| **Possible errors**      | Unknown limit key for tenant type; missing reason.                                                                                                                               |
| **Validation checklist** | [ ] Override appears in list. [ ] Tenant can perform action previously blocked. [ ] Delete override restores plan default.                                                       |

**Safe actions:** Read effective limits; add small temporary override with documented reason.

**Dangerous actions:** Large or permanent overrides without expiry; deleting overrides during active billing dispute.

---

## Step 18 — Feature flags (global and per-tenant)

| Field                    | Detail                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Toggle platform features without code deploy.                                                                                                                                        |
| **Who**                  | `ADMIN_GROWTH` (features tab); tenant overrides may need `ADMIN_PLANS` + features routes.                                                                                            |
| **Navigation path**      | `/app/admin/features`                                                                                                                                                                |
| **Required data**        | `featureKey`, enabled boolean; tenant override path includes tenant id.                                                                                                              |
| **Expected result**      | `GET /api/admin-dashboard/feature-flags`; `PATCH /api/admin-dashboard/feature-flags/:featureKey`; per-tenant `PUT/DELETE .../tenants/:tenantType/:id/feature-overrides/:featureKey`. |
| **Possible errors**      | Unknown feature key rejected by `getAllowedFeatureKeys`.                                                                                                                             |
| **Validation checklist** | [ ] Global flag toggles behavior in staging. [ ] Tenant override wins over global in diagnostics drawer. [ ] Clear override restores inheritance.                                    |

**Classification:** **Dangerous** — enabling experimental flags in production; always verify in impersonation session first.

---

## Step 19 — Finance overview

| Field                    | Detail                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| **Goal**                 | Monitor MRR, overdue amounts, and billing health.                                                |
| **Who**                  | `ADMIN_FINANCE`.                                                                                 |
| **Navigation path**      | `/app/admin/finance`                                                                             |
| **Required data**        | None.                                                                                            |
| **Expected result**      | `GET /api/admin-dashboard/financial-overview` returns aggregates for executive summary.          |
| **Possible errors**      | Stripe/gateway misconfig shows zeros or errors.                                                  |
| **Validation checklist** | [ ] KPIs load. [ ] Overdue count tone danger when &gt;0. [ ] Cross-check with subscriptions tab. |

---

## Step 20 — Deals moderation and growth

| Field                    | Detail                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Approve/reject supplier deals requiring platform moderation.                                                                                |
| **Who**                  | `ADMIN_GROWTH`.                                                                                                                             |
| **Navigation path**      | `/app/admin/deals` (`AdminDealsPanel`)                                                                                                      |
| **Required data**        | Deal id; approve/reject/pause actions.                                                                                                      |
| **Expected result**      | Admin promotion routes e.g. `POST /api/promotions/admin/:id/approve`, `reject`, `pause`; pending queue `GET /api/promotions/admin/pending`. |
| **Possible errors**      | Deal already terminal state.                                                                                                                |
| **Validation checklist** | [ ] Pending queue matches supplier submissions. [ ] Approve makes deal visible on restaurant `/app/deals`. [ ] Reject notifies supplier.    |

**Classification:** **Safe** approve/reject with audit; **moderate** pause active paid deals.

---

## Step 21 — Audit log (compliance)

| Field                    | Detail                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Immutable trace of admin actions.                                                                                          |
| **Who**                  | `ADMIN_ACCESS`.                                                                                                            |
| **Navigation path**      | `/app/admin/audit`                                                                                                         |
| **Required data**        | Filters: actor, action, resource, date range.                                                                              |
| **Expected result**      | `GET /api/admin-dashboard/audit-logs` (paginated); legacy `GET /api/admin/audit` on `admin_audit_log` table.               |
| **Possible errors**      | Large date range slow — use filters.                                                                                       |
| **Validation checklist** | [ ] Impersonation events tagged. [ ] Plan changes include actor. [ ] Password resets logged without exposing new password. |

---

## Step 22 — Safe vs dangerous actions (reference)

### Generally safe (read or low blast radius)

| Action                              | API / UI                                              |
| ----------------------------------- | ----------------------------------------------------- |
| View overview, health, diagnostics  | GET overview, health, operational-snapshot            |
| Search tenants                      | `GET .../tenants/search`                              |
| Impersonate read-only investigation | Impersonate + navigate (avoid writes unless intended) |
| Unlock pending activation           | `POST .../subscriptions/:id/unlock`                   |
| Extend free trial (7–90 days)       | `POST .../extend-free-trial`                          |
| Audit log export/review             | `GET .../audit-logs`                                  |
| Approve/reject pending deals        | promotions admin routes                               |

### Moderate (requires ticket + confirmation)

| Action                    | Risk                               |
| ------------------------- | ---------------------------------- |
| Password reset            | Account takeover if misdirected    |
| Impersonation with writes | Changes attributed to tenant users |
| Plan change without force | May fail — use preview first       |
| Per-tenant limit override | Billing/usage skew                 |
| Platform settings patch   | Affects new signups globally       |

### Dangerous (dual control / change window)

| Action                                      | Risk                                                    |
| ------------------------------------------- | ------------------------------------------------------- |
| `PATCH` subscription with `force: true`     | Downgrade removing features mid-order; data over limits |
| Plan catalog edit on live plans             | All tenants inherit bad limits/features                 |
| Global feature flag enable                  | Unvetted behavior platform-wide                         |
| Tenant feature override delete              | Unexpected feature loss                                 |
| `POST /api/suppliers` without owner linkage | Orphan tenant rows                                      |
| Suspend/cancel subscription without comms   | Production outage for tenant                            |

**Billing impersonation note:** Admins **not** impersonating skip billing middleware; impersonating **does** enforce tenant lock (`billingAccess.test.js`) — unlock or extend trial before expecting writes on locked tenant.

---

## Step 23 — Support workflow (end-to-end)

| Field                    | Detail                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Standard triage path from ticket to resolution.                                                                                                                                                             |
| **Who**                  | Support admin (`ADMIN_SUPPORT` + `ADMIN_TENANTS`).                                                                                                                                                          |
| **Navigation path**      | Tenants search → Diagnostics → (optional) Impersonate → Subscriptions/limits → Stop impersonate → Audit                                                                                                     |
| **Required data**        | Tenant name/email, issue type, order id if logistics, screenshots, `requestId` from API errors.                                                                                                             |
| **Expected result**      | Issue classified: activation, plan limit, feature flag, logistics (escalate to supplier), auth (password reset). Document resolution in external ticket with audit reference id.                            |
| **Possible errors**      | Skipping diagnostics leads to wrong plan changes.                                                                                                                                                           |
| **Validation checklist** | [ ] Tenant identified in search. [ ] Diagnostics `writeBlocked` explains 402. [ ] Impersonation reproduces issue. [ ] Fix verified under tenant context. [ ] Impersonation stopped. [ ] Audit entry exists. |

---

## API mount reference

| Prefix                 | Router                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| `/api/admin-dashboard` | `apps/api/src/routes/admin-dashboard/index.js`                            |
| `/api/admin`           | `apps/api/src/routes/admin.routes.js` (audit, role-aware dashboard stats) |

## Web route reference

| Path                          | Purpose                                                |
| ----------------------------- | ------------------------------------------------------ |
| `/app/admin`                  | Platform dashboard                                     |
| `/app/admin/:tab`             | Tab deep link (overview, tenants, subscriptions, …)    |
| `/app/admin/suppliers`        | Supplier tenant portal                                 |
| `/app/admin/suppliers/:tab`   | Supplier portal tab                                    |
| `/app/admin/restaurants`      | Restaurant tenant portal                               |
| `/app/admin/restaurants/:tab` | Restaurant portal tab                                  |
| `/app/settings`               | Admin personal settings (notifications, Keycloak link) |

**QA cross-reference:** `docs/qa/regression-checklist.md` Part 0 (setup), admin sections; stub card `4242424242424242` for billing tests.
