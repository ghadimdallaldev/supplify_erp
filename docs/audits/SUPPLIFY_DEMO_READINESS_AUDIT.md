# Supplify Demo-Readiness Audit

**Date:** 2026-06-10 · **Branch:** `refactoring-dev` · **Scope:** full-stack pass ahead of supplier/restaurant demos next week.

---

## 1. Executive summary

Supplify is in good shape for a guided demo. The codebase is deep and mostly coherent: all four core journeys (admin, supplier, restaurant, driver) are implemented end-to-end, plan/tier gating is enforced on both frontend and backend with matching keys, RBAC is comprehensively tested, and the seed system produces a rich, realistic environment in one command.

The audit found **no demo blockers in the product**. The worst issues were: a broken sidebar-adjacent link on the supplier dashboard, a feature-locked Deals page that looked broken instead of locked, two Supplier Settings tabs that **fake success** (Delivery Zones and Contacts show "saved!" toasts without any API call), 17 failing unit tests (all stale test mocks, fixed), and a red lint gate (148 warnings, reduced to 46). All safe issues were fixed in this pass; the rest are catalogued below with honest classifications.

## 2. Demo readiness verdict

**READY — with a scripted demo path and the known-gaps list below.** Do not free-roam into Supplier Settings → Delivery Zones / Contacts (not wired to a backend), the restaurant finance statement opening balance (hardcoded 0), or the dashboard 7d/30d/90d period selector (visual only).

## 3. Journey classification

| Flow                                           | Verdict                     | Notes                                                                                                                                                                                        |
| ---------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin: login → Platform Command Center         | READY                       | 14 tabs, lazy-loaded, per-tab queries with `skip`, loading/empty/error states throughout                                                                                                     |
| Admin: suppliers/restaurants directories       | READY                       | `/app/admin/suppliers`, `/app/admin/restaurants` pin the Tenants tab                                                                                                                         |
| Admin: Plans, edit Free Trial length           | READY                       | `AdminPlansTab` — trial days **7–90** validated (default **30**); `PATCH /api/admin-dashboard/plans/:id`; per-subscription trial extension also exists                                       |
| Admin: Growth program settings                 | READY                       | `AdminGrowthSettingsPanel` — referral discount, validity, supplier reward type; `GET/PATCH /api/admin-dashboard/growth-settings`                                                             |
| Admin: usage/quotas, limits, overrides         | READY                       | `promotions` shown as "Active deals", `deal_redemptions_per_day` as "Deal redemptions per day" (`adminLimitLabels.ts`, now unit-tested)                                                      |
| Admin: deals & boosts review                   | READY                       | Approve/reject/pause with filters, insights KPIs, empty/loading states                                                                                                                       |
| Supplier: login → dashboard                    | READY                       | Skeleton, error retry, empty-state CTAs                                                                                                                                                      |
| Supplier: catalog/products                     | READY                       | CRUD + CSV import (`image_url` column) + **Import Product Images** (ZIP async job); migration `0168` required                                                                                |
| Supplier: create deal, limits, boost           | READY (fixed)               | Locked state now uses `FeatureLockedCard`; limit gate `promotions` enforced FE+BE; note: new deals need admin approval before going active — pre-approve demo deals                          |
| Supplier: orders inbox                         | READY                       | 60s polling, decline-with-reason, manual orders                                                                                                                                              |
| Supplier: fulfillment/dispatch                 | READY                       | Dispatch board, pick lists, routes, tracking, exceptions                                                                                                                                     |
| Supplier: invoices/payments                    | READY                       | Receivables, record payment, credit notes                                                                                                                                                    |
| Supplier: settings → Delivery Zones / Contacts | NOT IMPLEMENTED / NOT WIRED | Dialogs existed with fake success toasts; toasts now say honestly that saving isn't available yet. Avoid in demo                                                                             |
| Restaurant: browse/follow suppliers, products  | READY                       |                                                                                                                                                                                              |
| Restaurant: cart → order → receive             | READY                       | Draft save/load, contract pricing, deal/coupon redemption check, limit-exceeded upgrade CTA                                                                                                  |
| Restaurant: deals & coupon redemption          | READY                       | `deal_redemptions_per_day` gate with daily counter banner; filtered empty states handled                                                                                                     |
| Restaurant: invoices/finance                   | BUG (documented)            | Statement `openingBalance` hardcoded to `0` (`restaurant-finance.routes.js:746`, TODO). Avoid the period-statement view or expect 0 opening balance                                          |
| Restaurant: inventory expiry                   | READY                       | Expiry tab + dashboard summary, feature-gated                                                                                                                                                |
| Restaurant: quick lists / smart reorder        | READY                       | Tier-gated (`basic_manual_only` on Free), FE+BE agree                                                                                                                                        |
| Chat (both sides)                              | READY                       | Realtime, typing, files, order linking                                                                                                                                                       |
| Driver: deliveries & status updates            | READY                       | Status flow validated by zod enum; route building; proof of delivery                                                                                                                         |
| GPS tracking + staleness                       | READY                       | 5-min stale threshold, "last seen" badge, polling stops on terminal status. Note: globally config-gated (`GPS_TRACKING_ENABLED`), not plan-gated — by design, but know it for plan questions |

## 4. Bugs found

1. **Broken link** — supplier dashboard "At-risk expected orders → Command center" pointed to non-existent `/app/supplier/command-center` (`DashboardPage.tsx`). **FIXED** → `/app/command-center`.
2. **Fake success toasts** — Supplier Settings Delivery Zones / Contacts / bulk-contact upload showed "saved successfully!" with `// TODO: Implement API call` and `console.log` of the form data. **FIXED** (honest info toast, console.logs removed). Real fix (backend wiring or hiding the tabs) is a product decision.
3. **Locked Deals page looked broken** — bare grey card instead of the standard `FeatureLockedCard` upgrade UI used elsewhere. **FIXED** + regression test.
4. **17 failing unit tests** (11 web, 5 API + 1 uncollected file) — all stale test mocks/expectations after recent intentional changes (persona-based sidebar, batch review fetching, SMTP-only email, Keycloak config inlining, inventory feature gating, one mock-leak isolation bug). **ALL FIXED — test-only changes; zero product code touched.** Both suites fully green now.
5. **Opening balance hardcoded to 0** in restaurant finance statements (`apps/api/src/routes/restaurant-finance.routes.js:746`). **NOT FIXED** — accounting logic change, out of safe scope. Documented.
6. **Confusing CSV-upload error copy** on Products import. **FIXED.**
7. **Dashboard period selector (7d/30d/90d) is visual-only** — doesn't refilter the spend trend (`DashboardPage.tsx` spend trend is fixed 30d). **NOT FIXED** (behavior change). Avoid clicking it in the demo or narrate "30-day trend".
8. **`deal_redemptions_per_day` metering** — limit is checked at redemption time but the audit could not conclusively trace the usage-increment path; verify manually that the counter increments (one redemption → banner shows 1/N). Flagged for manual QA.

## 5. Fixes applied (all low-risk)

| Area                                               | Change                                                                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/pages/DashboardPage.tsx`             | Fixed broken command-center link                                                                                                                                                                                                           |
| `apps/web/src/pages/promotions/PromotionsPage.tsx` | Locked state now renders `FeatureLockedCard` with plan name + upgrade CTA                                                                                                                                                                  |
| `apps/web/src/pages/SupplierSettingsPage.tsx`      | Removed 3 fake success toasts + debug `console.log`s; honest "not available yet" messaging                                                                                                                                                 |
| `apps/web/src/pages/ProductsPage.tsx`              | Clear CSV-upload error copy                                                                                                                                                                                                                |
| 8 web test files                                   | Removed stale `useWorkspaceRole` mocks (real hook + real persona resolution now exercised); added missing API-hook mocks (`useRolloverAssignmentToTomorrowMutation`, `useGetOrderTrackingQuery`)                                           |
| 6 API test files                                   | Updated stale expectations/mocks (WEB_ORIGIN domain, SMTP_PASS, Keycloak config inlining, inventory `requireFeature`/`getSupplierIdForRequest`, suppliers batch review mocks); fixed a `mockResolvedValueOnce` leak in subscriptions tests |
| ~34 web source files                               | Lint cleanup: all 98 `no-unused-vars` warnings removed; 2 "unnecessary dependency" + 2 "wrap in useMemo" hook warnings fixed per ESLint's own suggestion                                                                                   |
| New tests                                          | `apps/web/src/lib/adminLimitLabels.test.ts` (7 tests: "Active deals" / "Deal redemptions per day" labels, plan-code labels, tenant-type filtering); `apps/web/src/pages/promotions/PromotionsPage.locked.test.tsx`                         |

## 6. Tests run

| Command                             | Before                                          | After                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` (web tsc)          | PASS                                            | PASS                                                                                                                                                                    |
| `pnpm --filter @supplify/web build` | PASS                                            | PASS (re-verify before demo)                                                                                                                                            |
| Web unit tests (`vitest run`)       | **11 failed** / 339 passed                      | **all passing** (incl. 8 new tests)                                                                                                                                     |
| API unit tests (`vitest run`)       | **5 failed + 1 file uncollected** / 1001 passed | **172 files / 1008 tests, all passing**                                                                                                                                 |
| `pnpm lint`                         | FAIL — 148 warnings (max 0)                     | FAIL — **46 warnings** (22 behavior-sensitive `exhaustive-deps`, 24 structural `react-refresh/only-export-components`); pre-existing debt, deliberately not force-fixed |
| `pnpm verify:tier-matrix`           | not run (requires live DB)                      | covered by `tier-matrix-verify.test.js` in the green API suite                                                                                                          |

All failures were **pre-existing on the branch**, not caused by the uncommitted admin refactor.

## 7. Performance observations

- The uncommitted admin refactor is a **net performance win**: `AdminDashboardPage` went 3,553 → ~300 lines, 14 tabs lazy-loaded via per-tab dynamic imports, `AdminTabMount` returns `null` for inactive tabs, and queries use `skip` when inactive — no duplicate or eager hidden-tab fetching detected. Admin chunk: ~25 kB (7.6 kB gzip).
- Orders pages poll at 60s — reasonable.
- Prior perf pass (bundle split −41% eager JS, nginx keepalive) still intact.
- Remaining: 22 `exhaustive-deps` warnings are potential stale-closure/re-render footguns but each needs individual judgment — wrong to batch-fix before a demo.

## 8. Plan/RBAC observations

- **Feature/limit keys match across FE/BE** (canonical: `feature-keys.js`, `limit-resolution.js`; web `planLimits.ts`). Tier ladder Free < Silver < Gold < Platinum is monotonic; overrides are increase-only; `verify-tier-matrix` + `plan-catalog-audit` tests guard it.
- **RBAC is enforced server-side everywhere sampled**; viewer/accountant/driver isolation verified by the (now green) `test:rbac` suites. Frontend `_MANAGE`-wildcard logic matches backend.
- Free Trial intentionally ships **Gold-feature JSON with Free limits** — script your narrative ("trial shows everything, limits nudge upgrade") or it looks inconsistent.
- Free Trial expiry → read-only lockout exists (`free_sandbox_expired`).
- Edge cases (non-blocking): org-less tenant owner can demote themselves (last-owner guard only runs with an organization); role-change audit logging is thin.

## 9. Demo data status

`pnpm run seed:full` (after `pnpm local:infra` + `pnpm db:migrate`) produces: ~56 suppliers / ~16 restaurants across Free/Silver/Gold/Platinum, ~2,000 products, ~1,500 orders in mixed statuses, ~500 invoices (incl. overdue), chats, quick lists, reservations, staff/shifts, disputes + credit notes, active deals (percentage / free-shipping / buy-x-get-y) with images, and ~70 Keycloak logins (`admin@supplify.com` / `restaurant@supplify.com` / `supplier@supplify.com`, plan-tier accounts `*-{free,silver,gold,platinum}@supplify.com`, business-demo pairs).

Gaps (not seeded): driver/delivery-route records, receiving line items, inventory expiry/alert items, smart-reorder demand history, redeemable coupon-code examples, multi-warehouse stock, near-limit/over-limit tenant examples. **Recommend Gold-tier accounts as primary demo logins** (multi-branch, advanced roles, audit log all on). If you want a "tenant near limits" admin story, create one deal short of the Free supplier's 1-deal limit manually before the demo.

## 10. Remaining manual QA checklist

- [ ] `pnpm local:infra` → `pnpm db:migrate` → `pnpm run seed:full`; verify Keycloak users created
- [ ] Login as admin → Platform Command Center loads, Overview KPIs non-empty
- [ ] Supplier Control Center (`/app/admin/suppliers`) and Restaurant Control Center show directories
- [ ] Plans tab: edit Free Trial length (**7–90**, default 30), save, re-open
- [ ] Plans tab: Growth program settings — referral discount, supplier reward type
- [ ] Supplier: `/app/customer-growth` — import CSV, invite link, metrics widget
- [ ] Usage & Quotas: limits show "Active deals" / "Deal redemptions per day" labels
- [ ] Login as `supplier-gold@supplify.com`: create product; create deal → **approve it as admin** → see it active
- [ ] Try the coupon deal flow end-to-end; verify redemption counter increments (see Bugs §4.8)
- [ ] Supplier orders / fulfillment dispatch / assign driver
- [ ] Login as `restaurant-gold@supplify.com`: browse products, browse deals, place order, apply deal
- [ ] View invoice (skip the period-statement opening balance)
- [ ] Chat both directions; check typing indicator
- [ ] Driver login → update delivery status → restaurant sees tracking; let GPS go stale ≥5 min and confirm "last seen" badge
- [ ] Mobile-width pass on sidebar, orders, driver pages
- [ ] DevTools console + network: no errors on the demo path
- [ ] **Commit the admin refactor** (currently uncommitted working-tree changes) once you're satisfied

## 11. Top 3 next tasks before demo

1. **Run the seeded end-to-end rehearsal** (checklist above) on the exact environment you'll demo, especially deal creation → admin approval → restaurant redemption, and the coupon counter.
2. **Decide on Supplier Settings Delivery Zones/Contacts**: hide the two tabs for the demo build or wire the backend — a visible-but-honest "not available yet" is acceptable but not great.
3. **Seed the missing wow-data**: one inventory item expiring tomorrow, one coupon-code deal, one near-limit Free-tier supplier — three small script additions that make the admin and restaurant stories land.
