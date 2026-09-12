# Mobile Parity Checklist

Use on every web/API PR that touches orders, auth, fulfillment, tracking, or RBAC.

- [ ] Did API response types change? → Update `supplify-mobile/src/types`
- [ ] Did web route behavior change? → Check mobile screen equivalent
- [ ] Did RBAC / plan gating change? → Update mobile guards/navigation
- [ ] Did order lifecycle change? → Update restaurant/supplier/driver flows
- [ ] Did fulfillment / GPS / ETA / maps change? → Update mobile tracking
- [ ] Does mobile need a screen update?
- [ ] Were mobile tests / typecheck run when mobile-related?
- [ ] Was `MOBILE_FEATURE_PARITY.md` updated if something is deferred?
- [ ] Supplier bulk image import changed? → Web-only; document in parity file (see 2026-06-15 entry).

## 2026-09-12 — Native release audit

- [x] Android and iOS typechecks pass without emulator/Xcode execution.
- [x] Android and iOS Jest suites pass: 19 suites / 65 tests each.
- [x] Expo Doctor passes 18/18 checks on both repos.
- [x] Static Android and iOS Expo exports pass.
- [x] Catalog render path optimized identically in Android and iOS with memoized cart quantity lookup.
- [x] iOS supplier promotions screen restored to Android parity; shared API client test import fixed in both repos.
- [x] Remaining upstream audit findings documented in MOBILE_FEATURE_PARITY.md; no forced breaking upgrades applied.

Mobile repos: `C:/myProjects/supplify-mobile` (Android) and `C:/myProjects/supplify-mobile-ios` (iOS). No Expo workspace belongs inside the ERP.

## 2026-09-12 - ERP/mobile end-to-end audit

- [x] Platform-admin users have a mobile hub linking every admin-console destination.
- [x] Android and iOS chat contracts are synchronized, including Socket.IO join/leave payloads.
- [x] Driver Assistant is reachable from More and remains feature-gated.
- [x] Product CSV parsing and CSV-only startup performance were hardened without changing the API contract.

## 2026-08-14 — Supplify Assistant

- [x] API `/api/assistant` + types added; mobile client/types updated in both repos.
- [x] Feature gate `ai_platform` on Assistant screen (restaurant, supplier, driver).
- [x] Admin assistant overview: web-only; admin mobile skip documented in parity log.
- [x] Human Chat unchanged and separate from Assistant.
- [x] `MOBILE_FEATURE_PARITY.md` dated entry added.

## 2026-08-09 audit record

- [x] API response type checked: mobile entitlement envelope corrected.
- [x] Web/API behavior checked: billing notification route synchronized.
- [x] RBAC and plan gates checked: permissions remain server-aligned; mobile feature keys verified against `feature-keys.js`.
- [x] Order lifecycle checked: no API lifecycle change in this audit.
- [x] Fulfillment, GPS, ETA, and maps checked: no payload change; foreground-only policy retained.
- [x] Mobile screens updated: Plan & features plus feature-unavailable guard.
- [x] Android and iOS source changes synchronized.
- [x] iOS tests, typecheck, Expo Doctor, and production export run.
- [x] `MOBILE_FEATURE_PARITY.md` updated.
