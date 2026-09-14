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

## 2026-09-13 - Native chat push audit

- [x] API notification, Expo payload, device registration, and deep-link contracts synchronized across ERP, Android, and iOS.
- [x] Android and iOS registration retry/status/logout behavior kept identical.
- [x] Chat alerts invalidate the chat list and open the target conversation on both platforms.
- [x] Push endpoint ownership is globally unique; explicit push opt-out is preserved.
- [x] Focused API and both mobile push/deep-link tests pass.
- [x] Android EAS build fails closed unless the `GOOGLE_SERVICES_JSON` file variable is available; the default `supplify-alerts` channel resolves in both app configs.
- [ ] Physical-device delivery after a new credentialed build: populate Android `GOOGLE_SERVICES_JSON`, verify matching FCM V1 credentials, and verify iOS APNs in EAS before the client demo.

## 2026-09-12 — Native release audit

- [x] Android and iOS typechecks pass without emulator/Xcode execution.
- [x] Android and iOS Jest suites pass: 19 suites / 65 tests each.
- [x] Expo Doctor passes 18/18 checks on both repos.
- [x] Static Android and iOS Expo exports pass.
- [x] Catalog render path optimized identically in Android and iOS with memoized cart quantity lookup.
- [x] iOS supplier promotions screen restored to Android parity; shared API client test import fixed in both repos.
- [x] Remaining upstream audit findings documented in MOBILE_FEATURE_PARITY.md; no forced breaking upgrades applied.

Mobile repos: `C:/myProjects/supplify-mobile` (Android) and `C:/myProjects/supplify-mobile-ios` (iOS). No Expo workspace belongs inside the ERP.

## 2026-09-14 — Deferred defect closure (quotes, driver, cart, dispatch, POD)

- [x] Manual-order open-quote locks auto-applied server-side; restaurant checkout guard unchanged.
- [x] Driver deliver requires prior `SHIPPED` before order `DELIVERED`.
- [x] Web + Android + iOS cart clears quote metadata on catalog re-add; tests added.
- [x] RFQ respond uses `FOR UPDATE` status re-check (TOCTOU closed).
- [x] Dispatch warehouse filter is assignment-leg scoped.
- [x] `supplier.pod_required` + business settings API/UI; driver `podRequired` flag already consumed on mobile.
- [x] `MOBILE_FEATURE_PARITY.md` dated entry; domain docs updated.
- [x] Focused API + cart tests; both mobile typechecks.

## 2026-09-14 — Order workflow and receiving integrity

- [x] API receiving/order/amendment/product contracts synchronized with Android and iOS types and query hooks.
- [x] Order lifecycle updated on both platforms: driver assignment uses `POST`, and receiving is offered only after delivery.
- [x] Catalog pagination, cart count/action, actual receiving fields, amendment rendering, and supplier shortage reporting are identical on Android and iOS.
- [x] Order emails resolve to the relevant web order; no native deep-link contract changed.
- [x] Android and iOS `npx tsc --noEmit` pass.
- [x] `MOBILE_FEATURE_PARITY.md` and affected order, receiving, dispute, and pricing docs updated.

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

## 2026-09-14 - Fulfillment routing hardening

- [x] API order placement, delivery-location, warehouse assignment, and transfer contracts updated in both mobile repositories.
- [x] Android and iOS checkout retain idempotency keys and require an explicit branch when restaurant locations are ambiguous.
- [x] Supplier warehouse assignment/reassignment API types and mutation hooks are synchronized.
- [x] Existing RBAC model extended with FULFILLMENT_TRANSFER; no roles invented.
- [x] Organization catalog views preserve tenant-specific product identity; no fuzzy deduplication.
- [x] API focused routing, location, stock, catalog, and idempotency tests pass.
- [x] Mobile typechecks run for Android and iOS.
