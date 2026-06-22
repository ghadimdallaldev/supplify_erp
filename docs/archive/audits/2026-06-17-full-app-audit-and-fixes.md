# Full App Audit And Fixes - 2026-06-17

## Executive Summary

This pass fixed the reported supplier run-sheet 500, hardened delivery/RBAC/socket behavior, repaired Arabic locale corruption, and brought the full CI test command back to green.

The app is in a much better state after this pass, but it is not yet "perfect" by audit standards. The remaining blockers are dependency vulnerabilities, tier-matrix inconsistencies, lint/unused-code backlog, partial full-app Arabic coverage, and build-size warnings.

## What Changed And Why

### Supplier run-sheet 500 fix

- Updated `apps/api/src/services/supplier-run-sheet.service.js`.
- Added isolated section loading for command center, deliveries, receivables, reorder intelligence, pick orders, and shortages.
- A failure in one optional section now logs `supplier.run_sheet.section_failed` and returns an empty section fallback instead of returning HTTP 500 for the whole run sheet.
- Fixed receivables aging to calculate overdue state against the selected run-sheet date instead of server current date.
- Added regression coverage in `apps/api/src/services/supplier-run-sheet.service.test.js`.

Why: `/api/supplier/run-sheet?date=2026-06-17` should stay usable even when one supporting query drifts or fails.

### Delivery system resilience

- Hardened delivery zone join detection in `apps/api/src/lib/delivery-zone-join.js`.
- Hardened route stop loading in `apps/api/src/services/delivery-routes.service.js`.
- These paths now tolerate missing/malformed optional query results and schema drift more safely.

Why: delivery route screens should not fail because optional delivery-zone data is unavailable.

### RBAC hardening

- Updated `apps/api/src/lib/tenant-roles.js` so owner-role checks only pass when the DB explicitly returns `is_owner === true`.
- Updated `apps/api/src/lib/permissions.js` so assignment checks tolerate non-promise/malformed query mocks and fail closed.
- Updated focused RBAC tests.

Why: malformed rows should not accidentally grant owner access.

### Socket/message security

- Updated `apps/api/src/lib/socket.js`.
- Added Socket.IO `maxHttpBufferSize`.
- Added chat message content type/length guard.

Why: reduce oversized realtime payload risk and reject non-string chat content early.

### Arabic and i18n

- Fixed corrupted Arabic labels/locale content in:
  - `apps/web/src/i18n/config.ts`
  - `apps/web/src/i18n/locales/ar/*.json`
  - affected English locale labels
- Rebuilt `apps/web/src/i18n/i18n.test.ts`.
- Added Arabic vs English namespace key parity checks for the existing common/auth/navigation/settings namespaces.

Why: the existing Arabic locale files had mojibake/corrupted text and no parity check.

### Test stability and CI repair

- Fixed stale frontend fulfillment mock for `useOptimizeFulfillmentRouteMutation`.
- Made reservation availability tests deterministic by allowing an injected `now`.
- Updated stale API test mocks after newer runtime dependencies:
  - subscription effective-feature resolution
  - order create effective-feature resolution
  - restaurant delivery-location RBAC middleware
  - email retry payload persistence
  - admin dashboard schema probes and typed activity params
- Updated plan validation tests to current platform free-trial bounds.

Why: CI was red from a mix of real fragility and stale test harness contracts.

## Verification Results

| Check                        | Result                                |
| ---------------------------- | ------------------------------------- |
| `pnpm.cmd test:ci`           | Passed: full API and full web suites  |
| `pnpm.cmd test:web`          | Passed: 104 files, 396 tests          |
| `pnpm.cmd typecheck`         | Passed                                |
| `pnpm.cmd build`             | Passed                                |
| `pnpm.cmd test:coverage-map` | Passed: 14 mapped features have tests |
| Focused run-sheet tests      | Passed                                |
| Focused delivery route tests | Passed                                |
| Focused RBAC tests           | Passed                                |
| Focused i18n tests           | Passed                                |

## Performance Findings

- Production build passes.
- Large chunk warnings remain:
  - `vendor-DlqjIIkd.js`: 556.53 kB minified, 175.54 kB gzip.
  - `index-BZaifLTs.js`: 357.38 kB minified, 91.27 kB gzip.
  - `charts-BhG-yn5F.js`: 321.33 kB minified, 81.55 kB gzip.
  - `calendar-D7SYa3sF.js`: 267.99 kB minified, 78.31 kB gzip.
- Vite reports mixed static/dynamic imports that prevent some code splitting from taking effect.
- Browser data is stale: Browserslist/caniuse-lite and baseline-browser-mapping warnings remain.

## Security Findings

Fixed in this pass:

- Safer RBAC owner-role check.
- Safer permission assignment check.
- Socket.IO payload limit and chat content guard.

Still failing:

- `pnpm.cmd audit --prod --audit-level high` fails with 55 vulnerabilities:
  - 3 low
  - 27 moderate
  - 25 high
- Major high-risk packages include:
  - `xlsx@0.18.5` in API import flows, with SheetJS prototype pollution/ReDoS advisories and no patched npm version in the current line.
  - `axios@1.13.5`, patched by audit at `>=1.16.0`.
  - `socket.io-parser@4.2.4` and `ws@8.17.1`.
  - `express@4.21.2 > path-to-regexp@0.1.12`.
  - transitive build tooling such as `glob`, `minimatch`, and `picomatch`.

## Product And Feature Findings

Delivery:

- Focused delivery route tests pass.
- Supplier run-sheet is resilient to optional-section failures.

Hospitality/restaurants:

- Reservation availability tests are now deterministic and pass.
- Restaurant delivery-location route tests pass.
- Existing "coming soon" or incomplete flows still need product decisions before claiming perfection.

Reordering and AI:

- Existing focused reorder/AI tests pass in CI.
- No full manual UX validation was performed in this pass.

RBAC:

- Focused RBAC tests pass.
- Full CI RBAC-related suites pass.
- Owner-role check is stricter after this pass.

Arabic:

- Existing locale namespaces are no longer corrupted and now have key parity tests.
- Full-app Arabic coverage is still incomplete because many UI strings remain hardcoded English outside i18n.

## Remaining Blockers

### Lint and unused code

`pnpm.cmd lint` still fails:

- 2372 total problems.
- 7 errors.
- 2365 warnings.
- The dominant issue is unused imports/vars, especially in split admin-dashboard modules and web API endpoint/type files.

### Tier matrix

`pnpm.cmd verify:tier-matrix` still fails:

- RESTAURANT/silver missing `ai_platform`.
- RESTAURANT `scheduled_order_grace_per_day` decreases from free to silver.
- Multiple features enabled on free but disabled on silver.
- SUPPLIER free/silver/gold/platinum missing `quick_lists`.
- SUPPLIER free-to-silver feature ladder regressions.
- Extra non-canonical keys remain, including `approvals_budgets` and some `smart_reorder` supplier entries.

### Security audit

Dependency vulnerabilities remain as listed above. The biggest decisions are how to replace or isolate `xlsx`, upgrade axios/socket/express-related packages, and handle build-tool transitive advisories.

### TODO and incomplete work

Known unfinished markers from the audit:

- Malware scanning TODOs in storage providers.
- Inventory navigation TODO.
- Several "coming soon" UI paths still exist for calendar event creation, consumer menu availability, loyalty API wiring, manual inventory product add, and bulk upload UX.

### UI and docs

- Build and tests pass, but no Playwright visual sweep was run in this pass.
- Documentation was audited at a high level only; this report is the created audit artifact.
- React Router future-flag warnings and missing i18next test-provider warnings remain in web test output.

## Recommended Next Steps

1. Fix `verify:tier-matrix` by normalizing seeded plan features/limits and removing removed feature keys.
2. Tackle dependency security:
   - replace or sandbox `xlsx` import paths,
   - upgrade axios to a patched version,
   - upgrade Socket.IO/ws-related packages,
   - evaluate Express/path-to-regexp exposure.
3. Reduce lint backlog, starting with generated/split admin-dashboard modules and web endpoint type barrels.
4. Continue Arabic migration by moving hardcoded UI strings into namespaces feature by feature.
5. Add a Playwright smoke pass for supplier run-sheet, delivery routes, restaurant reservations, hospitality add-ons, RBAC navigation, and Arabic layout.

## Remediation pass (parallel agents)

**2026-06-18 follow-up.** Up to 16 parallel agents (Wave 0 scaffold → Wave 1 security/features/i18n → Wave 2 integration/docs). Addresses audit blockers: `xlsx`, axios/socket advisories, five “coming soon” flows, and Arabic namespaces for touched features.

### Security and dependencies

| Item                  | Change                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SheetJS CE 0.20.3     | Vendored at `vendor/sheetjs/xlsx-0.20.3.tgz`; `apps/api/package.json` pins `file:../../vendor/sheetjs/xlsx-0.20.3.tgz` (replaces npm `0.18.5`). See `vendor/sheetjs/README.md`.                                          |
| Import hardening      | `product-import.service.js`: OOXML ZIP magic check, max buffer/rows/cols/sheets, parse timeout, formula rejection, single-sheet enforcement. Regression tests in `product-import.service.test.js`.                       |
| axios                 | `apps/api` → `^1.16.0` (patched advisory line).                                                                                                                                                                          |
| socket.io             | API + web → `^4.8.3` / `socket.io-client@^4.8.3`.                                                                                                                                                                        |
| ws / qs / transitives | Root `pnpm.overrides`: `ws>=8.21.0`, `qs>=6.14.2`, `socket.io-parser>=4.2.6`, `path-to-regexp>=0.1.13`, `glob>=10.5.0`, `minimatch>=9.0.7`, `picomatch>=2.3.2`, `lodash>=4.18.0`, `fast-uri>=3.1.2`, `form-data>=4.0.6`. |
| `audit:prod`          | Root script `pnpm audit --prod --audit-level high`; wired into `qa`.                                                                                                                                                     |

**Note:** Run `pnpm install` to refresh the lockfile so audit reflects vendored `xlsx` and upgraded direct deps. Express/path-to-regexp and build-tool transitive advisories remain out of scope for this pass.

### Completed “coming soon” features

| Feature                   | Change                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restaurant inventory add  | Manual add dialog wired in `InventoryTab.tsx` (`useAddRestaurantInventoryMutation`).                                                                      |
| Restaurant inventory bulk | CSV preview/import API (`restaurant-inventory-import.service.js`, `/import/preview`, `/import`); `InventoryBulkImportPanel` on restaurant inventory page. |
| Consumer menu gating      | `ConsumerMenuPage` ordering-hours modes (LIVE / PREORDER_ONLY / CLOSED) via `orderingStatusFromBranch`; unavailable items skipped.                        |
| Calendar scheduled orders | `CalendarView` date-select CTA → `/app/cart?scheduledAt=…`; `CartPage` reads `scheduledAt` query param.                                                   |
| Supplier loyalty page     | `/app/loyalty` — full `LoyaltyProgramPage` (program form + balances table), sidebar nav, RTK slice in `services/api/endpoints/loyalty.ts`.                |

### Arabic i18n

- Lazy namespaces added: `inventory`, `consumer`, `loyalty`, `calendar` (`apps/web/src/i18n/config.ts`).
- en/ar JSON under `apps/web/src/i18n/locales/{en,ar}/`.
- `i18n.test.ts` extended with namespace key parity for all lazy namespaces.

### Verification commands run

| Check                                                   | Result                                                                                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` + `pnpm audit --prod --audit-level high` | Passed: 0 high (9 moderate/low); additional root overrides for `socket.io-parser`, `path-to-regexp`, `glob`, `minimatch`, `picomatch`, `lodash`, `fast-uri`, `form-data`, `ws>=8.21.0` |
| `pnpm test:ci`                                          | Passed                                                                                                                                                                                 |
| `pnpm typecheck`                                        | Passed                                                                                                                                                                                 |
| `pnpm build`                                            | Passed                                                                                                                                                                                 |
| Focused API import tests                                | Passed: 16 tests                                                                                                                                                                       |
| Focused web i18n + calendar tests                       | Passed: 16 tests                                                                                                                                                                       |

**Still open from original audit:** `pnpm lint`, `verify:tier-matrix`, full `test:ci` gate, Playwright smoke, and hardcoded English outside new namespaces.
