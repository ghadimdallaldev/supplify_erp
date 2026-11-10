# Supplify Production and Pilot Readiness Audit

| Field                | Value                                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**             | 2026-07-24                                                                                                                                                                                                                        |
| **Branch**           | `dev` (synced with `origin/dev`, 0 ahead / 0 behind)                                                                                                                                                                              |
| **HEAD**             | `b8e43f262af454027aacea7d57c392250c9b0fb7` (`b8e43f26`)                                                                                                                                                                           |
| **Working tree**     | Clean                                                                                                                                                                                                                             |
| **Migrations**       | Through `0192_supplier_sponsorship_lifecycle.sql` (0191 tracked)                                                                                                                                                                  |
| **Inventory source** | [docs/supplify-complete-feature-and-business-logic.md](../supplify-complete-feature-and-business-logic.md) (2026-07-20) — **re-verified**; former “uncommitted” Branch Account / warehouse / org-report work is **now committed** |
| **Method**           | Sequential single-agent audit (no parallel Task subagents); code + migrations + Vitest; Playwright blocked (API unreachable)                                                                                                      |

**Source of truth:** runtime code > migrations > tests > docs.

---

## 1. Executive verdict

### **Controlled pilot ready** (conditional) — **not** general production ready

Supplify on `dev` @ `b8e43f26` supports a **supervised, manual-billing pilot** of core B2B order-to-cash (restaurant order → supplier fulfill/deliver → receive → invoice/dispute) with RBAC, entitlements, and in-app/email notifications.

It is **not** ready for:

- Automated live platform subscription revenue (PSP)
- Unsupervised multi-warehouse / central-purchasing claims
- Broad production without backup/restore drill and inventory UI/API test green

| Verdict option             | Selected                    |
| -------------------------- | --------------------------- |
| Not ready                  |                             |
| Internal testing ready     |                             |
| **Controlled pilot ready** | **Yes (with P0 checklist)** |
| General production ready   | No                          |

**Why not general production:** stub billing gateway in all Railway tiers including prod (`BILLING_GATEWAY=stub` + `PAYMENTS_MODE=live`), no dedicated backup/restore runbook, inventory route/UI tests failing after SoT work, impersonation write scope limited to billing only, foundation features still navigable.

---

## 2. Feature readiness matrix

Status legend: Production Ready | Pilot Ready | Functional but Needs Hardening | Partial | Foundation Only | UI Only | Backend Only | Stubbed or Manual | Broken | Disabled | Planned | Legacy

| Feature                                    | Current status                                 | Backend                       | Frontend                | Tests                                                     | Security                              | Billing dependency             | Known gaps                                                                                      | Pilot recommendation                       | Production blocker                    | Evidence                                                   |
| ------------------------------------------ | ---------------------------------------------- | ----------------------------- | ----------------------- | --------------------------------------------------------- | ------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------- | ---------------------------------------------------------- |
| Auth / Keycloak OIDC + register            | Pilot Ready                                    | Complete                      | AuthGuard / Register    | Strong unit                                               | Cookies, CSRF, prod config validation | pending_activation             | Demo email → role shortcuts in `upsertUser`                                                     | Enable                                     | Demo emails in prod                   | `auth.routes.js`, `rbac.js` ~194                           |
| Tenant isolation / switch                  | Pilot Ready                                    | Complete                      | BranchSwitcher          | `tenant-switch.test.js`                                   | `userCanAccessTenant`                 | `multi_branch`                 | Tenant cache TTL 180s                                                                           | Enable                                     | —                                     | `tenant-switch.js`, `rbac.js`                              |
| Permissions / RBAC                         | Pilot Ready                                    | Complete                      | `usePermissions`        | Many rbac tests                                           | Route guards                          | `advanced_roles`               | Dual legacy+named roles; web `ADMIN_FALLBACK_PERMISSIONS`                                       | Enable; seed real admin roles              | Fallback-only admins                  | `role-matrix.js`, `usePermissions.ts`                      |
| Admin impersonation                        | Functional but Needs Hardening                 | Complete                      | Banner                  | Unit tests                                                | **Billing mutations only** blocked    | —                              | Orders/catalog/staff writes allowed                                                             | Internal, read-only policy                 | Support writes                        | `impersonation-guards.js`, `billing.routes.js` only        |
| Restaurant order lifecycle                 | Pilot Ready                                    | Complete                      | Cart / Orders           | orders tests                                              | Tenant scoped                         | `orders_per_day`               | MOQ not enforced at create                                                                      | Enable                                     | —                                     | `orders/create.js`, no MOQ in create service               |
| Supplier `COMPLETED` shortcut              | Functional but Needs Hardening                 | Present                       | Status UX               | Partial                                                   | —                                     | —                              | `handleOrderDelivery` **adds restaurant_inventory** then sets `DELIVERED` before formal receive | Force DELIVERED→receive; avoid COMPLETED   | Double inventory if receive also adds | `orders.helpers.js` 569–610                                |
| Receiving + auto-invoice                   | Pilot Ready                                    | Complete                      | ReceivingPage           | invoice+receiving tests                                   | `receiving_quality`                   | `receiving_quality`            | Accepts `DELIVERED`/`COMPLETED`                                                                 | Enable (Silver+)                           | Mid-flow 403 if ungated UI            | `receiving.routes.js`                                      |
| Disputes / credits / replacement           | Pilot Ready                                    | Complete                      | Disputes UI             | Strong service tests                                      | `disputes_returns`                    | `disputes_returns`             | Refund = offline ledger                                                                         | Enable                                     | —                                     | `disputes.service.js`                                      |
| Supplier fulfillment / pick / driver / POD | Pilot Ready                                    | Complete                      | Fulfillment             | Many service tests                                        | `fulfillment`, `driver_management`    | Plan features                  | Decline = `CANCELLED` not `REJECTED`                                                            | Enable                                     | —                                     | `fulfillment/`, `orders-driver`                            |
| Warehouse stock SoT                        | Pilot Ready (API) / Needs Hardening (tests+UI) | Single path warehouse\|legacy | Inventory pages         | **9 inventory route tests fail**; web InventoryPage fails | Fail-closed WH                        | `multi_warehouse`              | Test/UI contract drift after SoT                                                                | Pilot legacy suppliers first; heal WH rows | Shipping WH mode with red tests       | `supplier-order-stock.service.js`, commit `788e82f2`       |
| Warehouse operational transfers            | Planned                                        | Merge-on-delete only          | —                       | Partial                                                   | —                                     | —                              | No day-to-day WH↔WH transfer API                                                               | Hide                                       | —                                     | `transferWarehouseInventory`                               |
| Invoices / B2B payments / credits          | Pilot Ready                                    | Ledger complete               | Invoice UI              | Strong; 1 invoice panel fail                              | Tenant list scoping                   | `finance_invoices`             | `STRIPE` label is bookkeeping                                                                   | Manual payment recording only              | Treating STRIPE as capture            | `invoice.service.js`, payments routes                      |
| Platform subscription billing              | Stubbed or Manual                              | `stub` + `manual` only        | Billing UI              | checkout mock incomplete                                  | —                                     | `BILLING_GATEWAY`              | Prod: live mode + stub gateway                                                                  | Manual / admin unlock                      | Live PSP revenue                      | `gateway-registry.js`, `deploy/railway/production/api.env` |
| Branch Accounts / org / 0191               | Pilot Ready                                    | Committed                     | Org pages               | org route tests                                           | Unlink billing policy                 | `multi_branch`                 | Invitation tests thinner                                                                        | Beta for multi-branch clients              | —                                     | `0191`, commits `76ca3082`+                                |
| Central purchasing                         | Foundation Only                                | Drafts + per-branch submit    | `CentralPurchasingPage` | Thin                                                      | Plan gate                             | `central_purchasing`           | Explicit “not complete”                                                                         | **Hide from nav**                          | Claiming full CP                      | `central-purchasing.service.js`                            |
| Staff / schedule / PTO / swaps / portal    | Pilot Ready                                    | Complete                      | Staff + portal          | staff.routes.test                                         | RBAC only                             | —                              | Not legal payroll/HRMS                                                                          | Enable if in pilot scope                   | —                                     | `/api/staff`                                               |
| Reservations / waitlist                    | Pilot Ready                                    | Complete                      | Reservations + public   | Strong                                                    | RBAC                                  | `waitlist_auto_promo`          | Guest WhatsApp off                                                                              | Enable                                     | —                                     | `reservations.routes.js`                                   |
| Promotions / deals                         | Pilot Ready                                    | Complete                      | PromotionsPage          | Strong + e2e gates file                                   | Supplier security tests               | `promotions` / deals           | Boost `waivePayment=true` default                                                               | Enable deals; disable boosts               | Paid boost honesty                    | `deal-promotions.service.js`                               |
| Customer growth / sponsorship              | Pilot Ready                                    | Complete + `0192`             | Growth page             | Service tests                                             | —                                     | `supplier_growth`              | Charges via stub/manual                                                                         | Beta                                       | PSP                                   | `0192`, sponsorship billing                                |
| Reorder heuristics / forecast              | Pilot Ready                                    | Complete                      | Assistance panel        | Strong                                                    | Quotas                                | `smart_reorder`                | —                                                                                               | Enable                                     | —                                     | reorder-forecast / assistance                              |
| Reorder LLM (explain/ask/recommend)        | Disabled                                       | Gated                         | Panel                   | LLM unit tests                                            | `ai_platform`                         | `AI_ENABLED` default **false** | Not set in railway api.env                                                                      | Internal only                              | Accidental OpenAI spend               | `env.js` `AI_ENABLED`                                      |
| Notifications in-app + email               | Pilot Ready                                    | Complete                      | Prefs                   | Channel tests                                             | —                                     | `notifications`                | —                                                                                               | Enable                                     | —                                     | notification + email jobs                                  |
| WhatsApp                                   | Disabled                                       | Wired                         | —                       | Service tests                                             | —                                     | Env                            | All railway `WHATSAPP_ENABLED=false`                                                            | Keep disabled                              | —                                     | railway `api.env`                                          |
| Admin console / flags / health             | Pilot Ready                                    | Complete                      | Admin UI                | Partial                                                   | Admin RBAC                            | —                              | Impersonation write policy                                                                      | Enable for ops                             | —                                     | `admin-dashboard/`                                         |
| Crons (20 in-process)                      | Functional but Needs Hardening                 | Advisory locks                | Admin health            | Cron test **expects 19, got 20**                          | Locks                                 | `CRONS_ENABLED`                | Multi-replica fragility; stale test                                                             | Enable + monitor                           | Silent miss                           | `register-cron-jobs.js`                                    |
| Files / uploads                            | Pilot Ready                                    | Presign                       | Upload UI               | —                                                         | Auth on download                      | `storage_mb`                   | ClamAV Planned                                                                                  | Accept pilot risk                          | Malware scan                          | storage providers                                          |
| Consumer B2C                               | Pilot Ready                                    | Complete                      | Consumer pages          | smoke suite exists                                        | Separate JWT                          | Setup                          | Out of core B2B pilot                                                                           | Optional                                   | —                                     | consumer routes                                            |
| Mobile sibling                             | Partial                                        | API largely ready             | N/A in monorepo         | Separate repo                                             | —                                     | —                              | Parity checklist                                                                                | Out of scope                               | —                                     | `docs/mobile/`                                             |
| Backup / restore / rollback                | Partial                                        | Railway mentions              | —                       | —                                                         | —                                     | —                              | **No dedicated runbook**                                                                        | Block first client until drill             | No restore proof                      | `railway-environments.md` only                             |

---

## 3. Launch blockers

### P0 — blocks pilot onboarding

| ID   | Finding                                                                                  | Action                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| P0-1 | Platform billing is stub in prod (`BILLING_GATEWAY=stub` with `PAYMENTS_MODE=live`)      | Operate pilot on **manual** gateway + admin unlock; do not sell “auto-charge”                            |
| P0-2 | `COMPLETED` path updates `restaurant_inventory` before receiving (`handleOrderDelivery`) | SOP: suppliers use status path to `DELIVERED` only; or fix before pilot with inventory-sensitive clients |
| P0-3 | No backup/restore runbook or restore drill                                               | Document Railway Postgres backup + restore steps; run one drill                                          |
| P0-4 | Impersonation allows non-billing writes                                                  | Policy: read-only support, or extend `rejectImpersonationMutation`                                       |
| P0-5 | Inventory API/UI tests red after warehouse SoT (9 API + InventoryPage web)               | Do not onboard **warehouse-mode** suppliers until green or explicitly validated heal                     |

### P1 — before broader production

| ID   | Finding                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| P1-1 | No live PSP provider registered                                                  |
| P1-2 | MOQ/pack not enforced at checkout                                                |
| P1-3 | Central purchasing foundation still routed                                       |
| P1-4 | Deal boost payment stub (`waivePayment` default true)                            |
| P1-5 | Demo email role shortcuts + web admin permission fallback                        |
| P1-6 | Cron registry test stale (19 vs 20); in-process cron ops risk                    |
| P1-7 | WhatsApp/AI UI honesty if copy implies live channels                             |
| P1-8 | Cross-tenant IDOR suite still thin vs full surface                               |
| P1-9 | Billing paid-checkout unit test broken (mock missing `getReferralProgramConfig`) |

### P2 — after pilot

- Operational WH↔WH transfers
- ClamAV / malware scan on uploads
- Delivery rollover (off by default)
- Full org invitation reject HTTP polish
- Playwright critical_e2e in CI against stable stack

### P3 — enhancement

- One-click reorder from history
- Max stock API/UI
- Stock count sessions beyond COUNT_CORRECTION
- Aggregated driver “my deliveries” API

---

## 4. Critical end-to-end scenarios

| ID  | Scenario                                                                                      | Result                                           | Evidence                                                                        |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| E1  | Restaurant: login → cart → place → supplier fulfill → DELIVERED → receive → invoice → dispute | **Partial pass (code path)**                     | Routes/services wired; unit/route tests; live Playwright **blocked** (API down) |
| E2  | Supplier: catalog → ACK → pick → dispatch/driver → POD → record payment                       | **Partial pass**                                 | Fulfillment + driver services + tests; payment = ledger record                  |
| E3  | Admin impersonate → stop; billing mutation blocked                                            | **Pass (billing)** / **Gap (other writes)**      | `rejectImpersonationMutation` only on billing routes                            |
| E4  | Org Branch Account create/switch/link (0191)                                                  | **Pass (committed)**                             | Migrations 0191 + org routes; CP still foundation                               |
| E5  | Warehouse reserve/commit vs legacy                                                            | **Pass (service)** / **Needs Hardening (tests)** | `supplier-order-stock.service.js`; inventory route tests failing                |
| E6  | Billing 402/403 + stub checkout                                                               | **Pass (gates)** / **Stubbed (charge)**          | `billingAccess`, entitlements; gateway stub                                     |
| E7  | Staff schedule → clock → PTO/swap                                                             | **Partial pass**                                 | `staff.routes.test.js`; no live e2e this run                                    |

**Playwright:** probe found web at `http://localhost:5173`; API **not** reachable → full `pnpm e2e:playwright` **not run**.

---

## 5. Feature-flag recommendation

| Mode                                | Features                                                                                                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enabled for pilot**               | Auth, RBAC, tenant switch, catalog, orders, fulfillment (single-WH or legacy), receiving, disputes, invoices (manual pay), entitlements, in-app + email notifications, reservations (if FOH in scope), staff (if in scope), deals browse/redeem |
| **Enabled only for internal users** | Admin impersonation (read-only), AI LLM (`AI_ENABLED` + `ai_platform`), sponsorship paid experiments, multi-WH suppliers after heal                                                                                                             |
| **Disabled**                        | WhatsApp (`WHATSAPP_ENABLED=false`), live PSP checkout claims, delivery rollover unless configured                                                                                                                                              |
| **Marked beta**                     | Branch Account link invitations / org multi-branch, smart reorder heuristics at Scale, supplier growth program                                                                                                                                  |
| **Hidden from navigation**          | Central purchasing, deal **boost** purchase UI, any Stripe “pay now” that implies card capture for B2B invoices                                                                                                                                 |

---

## 6. Infrastructure readiness

| Item                      | Status                            | Notes                                                              |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| Environment configuration | Ready                             | Railway tiered `api.env`; `validate-config` for prod               |
| Secrets                   | Ready (process)                   | `secrets.env.example` refs; **values not audited in report**       |
| Database migrations       | Ready                             | Through 0192; `RUN_MIGRATIONS_ON_START=true`                       |
| Redis                     | Required / configured via secrets | Test run fell back to memory cache (local Redis down)              |
| Object storage            | Ready                             | `STORAGE_DRIVER=s3` on railway                                     |
| Keycloak                  | Ready                             | Per-env realm docs/deploy                                          |
| Cron jobs                 | Ready with ops caveat             | 20 jobs + advisory locks; in-process on API                        |
| Queue processing          | N/A / light                       | Recipe recalc + jobs; not separate worker fleet                    |
| Logging                   | Ready                             | Structured logs                                                    |
| Error monitoring          | Partial                           | `SENTRY_ENVIRONMENT` set; DSN via secrets                          |
| Health checks             | Ready                             | `/health`, `/ready`, admin health                                  |
| Database backup           | **Gap**                           | Mentions only; no runbook                                          |
| Restore procedure         | **Gap**                           | Checklist item only                                                |
| Deployment rollback       | Partial                           | Promote scripts + Keycloak notes; no unified app rollback playbook |

**Non-secret railway flags (all tiers unless noted):** `BILLING_GATEWAY=stub`; `WHATSAPP_ENABLED=false`; `WHATSAPP_LOG_ONLY=true`; `CRONS_ENABLED=true`; `COOKIE_SECURE=true`; `STORAGE_DRIVER=s3`; `PAYMENTS_MODE` = mock / test / **live** (prod).

---

## 7. Test results

### Commands run

| Command                                                        | Exit    | Result                                                                            |
| -------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `pnpm --filter @supplify/api exec vitest run --reporter=basic` | 1       | **1471 passed, 16 failed**, 0 skipped reported; 265 files passed / 5 failed; ~89s |
| `pnpm --filter @supplify/web exec vitest run --reporter=basic` | 1       | **439 passed, 9 failed**; 115 files passed / 6 failed; ~85s                       |
| `pnpm verify:tier-matrix`                                      | 0       | **SKIP** — PostgreSQL unavailable locally                                         |
| `node tests/scripts/probe-urls.mjs`                            | 0       | Web reachable (`5173`); **API not reachable**                                     |
| `pnpm e2e:playwright`                                          | Not run | Blocked by API probe                                                              |
| `pnpm test:rbac` / `pnpm test:billing`                         | Not run | Covered partially inside API suite; billing paid-checkout failed inside API run   |

Logs: `docs/audits/_tmp-api-test.log`, `docs/audits/_tmp-web-test.log`.

### Failed tests (API — 16)

- `inventory.routes.test.js` — **9 failures** (list/status/PATCH → 500 / assertion drift)
- `invitation-role-assignment.test.js` — 4 failures (Viewer/Accountant/Manager assign)
- `register-cron-jobs.test.js` — expects 19 jobs, got **20**
- `tier-binding.test.js` — 1 failure (FREE_TIER_LIMIT_PATCHES coverage)
- `billing-paid-checkout.test.js` — mock missing `getReferralProgramConfig`

### Failed tests (Web — 9)

- `InventoryPage.test.tsx` — 3 (stock status labels)
- `inventoryShared.test.ts` — 1 (`LOW_STOCK` vs `IN_STOCK`)
- `AdminTenantUsageTable.test.tsx` — 2
- `FulfillmentTrackingTab.test.tsx` — 1
- `TeamRolesPanel.test.jsx` — 1
- `InvoiceListPanel.test.tsx` — 1

### Flaky

- Not isolated this run. Historical note: email dedup flake in older baseline docs.

### Coverage gaps

- Live mutation smoke for `POST /api/orders`
- Impersonation route integration (start/stop) beyond mocks
- Systematic cross-tenant IDOR suite
- Playwright critical_e2e against API+web
- Backup/restore drill (ops, not unit)

---

## 8. Final pilot checklist (go / no-go)

Check **all** before first test client. Unchecked = **NO-GO**.

| #   | Item                                                                                                      | Go? |
| --- | --------------------------------------------------------------------------------------------------------- | --- |
| 1   | Deploy target is `dev`/`preprod` build at known SHA (`b8e43f26` or later approved)                        | [ ] |
| 2   | Migrations through **0192** applied; verify 0191 link-invitation tables                                   | [ ] |
| 3   | `BILLING_GATEWAY=manual` (or documented stub) and sales/ops briefed: **no auto card capture**             | [ ] |
| 4   | Pilot plans include `receiving_quality`, `disputes_returns`, `fulfillment` as needed                      | [ ] |
| 5   | SOP: supplier terminal status = **DELIVERED** then restaurant receive (no `COMPLETED` inventory shortcut) | [ ] |
| 6   | Pilot suppliers are **legacy inventory** OR warehouse rows healed + stock smoke-tested                    | [ ] |
| 7   | Central purchasing + deal boosts + live Stripe invoice pay **hidden**                                     | [ ] |
| 8   | `AI_ENABLED=false`, `WHATSAPP_ENABLED=false` unless internal experiment                                   | [ ] |
| 9   | Impersonation policy = read-only (or mutation guards extended)                                            | [ ] |
| 10  | Demo email role shortcuts disabled or impossible in prod IdP                                              | [ ] |
| 11  | Admin users have real DB permissions (do not rely on web fallback)                                        | [ ] |
| 12  | Redis URL set on every API replica; crons monitored via admin health                                      | [ ] |
| 13  | Postgres backup enabled + **one restore drill** documented                                                | [ ] |
| 14  | Inventory SoT regressions reviewed (API inventory 500s / UI stock labels) for pilot suppliers             | [ ] |
| 15  | Seed pilot tenants; smoke E1 receive→invoice on that environment                                          | [ ] |
| 16  | Support runbook: lock/unlock subscription, mark invoice paid, stop impersonation                          | [ ] |

**Gate decision:** If any P0 row above is unchecked → **NO-GO** for first client. If all checked → **GO** for controlled pilot only.

---

## Appendix A — Inventory doc delta (2026-07-20 → HEAD)

Former “uncommitted” items now **tracked on `dev`**: `0191`, `0192`, central purchasing service/page, branch-account link invitations, org reports, supplier-stock / order-stock SoT, warehouse heal commit `b8e43f26`.

## Appendix B — Cron jobs registered (20)

SCHEDULED_ORDERS, INVOICE_OVERDUE, COLLECTIONS_REMINDERS, SUBSCRIPTION_BILLING, WAITLIST_OFFERS, PROMOTIONS_EXPIRY, INVITATION_EXPIRY, FREE_SANDBOX_EXPIRY, TRIAL_ENDING_SOON, FULFILLMENT_EXCEPTIONS, DELIVERY_ROLLOVER, OPERATIONAL_REMINDERS, DRIVER_LOCATION_RETENTION, EMAIL_RETRY, EMAIL_DIGEST, STALE_GPS_ALERTS, LOG_RETENTION, REORDER_FORECAST, RECIPE_RECALC, GROWTH_PROGRAM_MAINTENANCE.

---

## Amendment — P0 clearance (2026-07-24, same day)

Code fixes landed on working tree (not necessarily committed):

| P0   | Status  | Change                                                                                                                       |
| ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| P0-2 | Cleared | `handleOrderDelivery` no longer bumps `restaurant_inventory`; inventory only on receiving                                    |
| P0-5 | Cleared | Inventory route tests mock WH SoT services; `getStockStatus` coerces numbers; RTL cleanup; InventoryPage tests use card list |
| P0-4 | Cleared | `assertImpersonationAllowsMutation` in `requireAuth` blocks all non-GET mutations (allowlist: stop impersonation, logout)    |
| P0-1 | Cleared | Reject `stub`+`live`; prod `BILLING_GATEWAY=manual`; live default gateway `manual`                                           |
| P0-3 | Cleared | [backup-and-restore.md](../operations/backup-and-restore.md); local dump→restore drill PASS                                  |

Playwright: still **blocked** locally (API needs reachable Postgres on host; probe web=true api=false). Re-run when API `/health` is up.

**Pilot posture after P0s:** suitable for **2–3 controlled pilot clients** with `BILLING_GATEWAY=manual`, incomplete features hidden — still **not** general production (no live PSP, foundation CP, etc.).
