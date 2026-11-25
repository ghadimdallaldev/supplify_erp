# Mobile Parity Checklist

## 2026-11-25 — Restaurant marketplace polish

- [x] Mirror the polished supplier, catalog, and live cart summary UI in both native design worktrees.
- [x] Typecheck ERP and both native worktrees. Run the cart and quantity tests, including the catalog summary regressions.
- [x] Verify both screens on Android, including the live cart dock while scrolling and 135% catalog text.

## 2026-11-25 — Restaurant Suppliers and Supplier Catalog

- [x] Mirror the supplier directory, product catalog, and shopping controls in both design worktrees.
- [x] Typecheck ERP, Android, and iOS. Run the focused native cart, quantity, currency, localization, and Restaurant navigation suites.
- [x] Run both screens on Android and verify supplier discovery, relationships, messaging, catalog filters, quantities, cart, and back navigation.
- [ ] Run the redesigned screens on iOS hardware or simulator.

## 2026-11-24 — V3 account entry

- [x] Mirror native workspace selection, account setup, and invitation review in both clients.
- [x] Apply the mobile V3 theme to the hosted Keycloak client and password reset form.
- [ ] Exercise the Android account workflows in the consolidated Expo pass.

## 2026-11-24 — Figma V3 product, insights, and workflow states

- [x] Mirror supplier product edits, restaurant insights, route activity, checkout and receiving states, and connectivity presentation.
- [x] Reconcile the approval frames with the retired purchasing feature and the legacy placed-order display.
- [x] Mirror restaurant Help & support and its existing permission and entitlement checks in both clients.
- [x] Mirror the workspace team, pending invitations, role permissions, and restricted-access state.
- [x] Mirror the delivered stop proof and long-content layout updates.
- [x] Mirror supplier city and followed filters and warehouse account context.
- [ ] Verify the latest screens and authenticated workflows on Android.

## 2026-11-20 — Figma V3 native migration

- [x] Inventory the 92 numbered Figma frames and both clients' registered routes.
- [x] Apply matching V3 source and bundled assets in the two implementation worktrees.
- [x] Record screen and workflow gaps in the [V3 coverage report](./MOBILE_FIGMA_V3_COVERAGE_2026-11-20.md).
- [x] Build and install a native Android debug APK and review its welcome screen against A01.
- [x] Install and launch the local Android Development APK with an embedded bundle.
- [x] Mirror the V3 kitchen stock count, restaurant and supplier conversations, and reports in both source worktrees.
- [x] Mirror the V3 dispatch queue, route tracking, driver assignment and promotion draft editor.
- [x] Mirror the V3 branch and workspace routes and reuse the existing account switch.
- [x] Apply all migrations and load the demo fixtures in a separate mobile QA database.
- [x] Inspect the local iOS simulator source archive.
- [x] Record the user's decision to defer the iOS build and device checks.
- [x] Run the ERP and mobile typechecks, both native Jest suites, and Expo exports.
- [ ] Finish the screen-specific redesigns and verify each route on available native devices.
- [ ] Verify the production build and authenticated Restaurant, Supplier, Driver and public checkout journeys.

## 2026-11-19 - Supplier calendar cutoffs and order notes

- [x] Web/Android/iOS type optional delivery-resolution metadata.
- [x] Matching native tests preserve selected/requested/resolved calendar days.
- [x] Real SQL covers timezone-dependent pricing, cutoff boundaries, literal/null DTOs and note save/clear.
- [x] Existing administrator draft placement uses one connection for its stock-feature lookup.
- [x] Migration 0237 repair/idempotence verified and applied in the owned local database.
- [x] Final broad API/lint/typecheck and native evidence recorded in the audit (2,771 API tests, 173 SQL tests, 34 mobile tests per client, all three typechecks).
- [ ] Hosted migrations/replay compatibility, full native Business UI and physical-device workflows remain open.

## 2026-11-18 - Checkout quote/replay contracts

- [x] Web mutation types match canonical single/split/manual success data.
- [x] Android/iOS normalize counted restaurant results and reject malformed confirmations.
- [x] Both native manual clients forward quote selectors and stable retry headers.
- [x] Existing quote/order audit fields are typed across all three clients.
- [x] Real HTTP/SQL covers quote snapshots, replay ownership, legacy compatibility, rollback and writer serialization.
- [x] Migration 0236 applied only to the owned disposable audit database.
- [x] Final broad API/lint/typecheck and matching native evidence recorded in the audit (2,758 API tests, 164 SQL tests, 32 mobile tests per platform, all three typechecks).
- [ ] Hosted migration/rollout, native manual-order UI, remaining warehouse/plan/device matrices stay open.

## 2026-11-18 - Supplier quote response parity

- [x] Web/Android/iOS preserve line currency, substitute ID and calendar day on edit.
- [x] Both native clients allow open-response edits and reset drafts across requests.
- [x] Price/quantity guards and English/Arabic quantity messages match all clients.
- [x] Real SQL verifies supplier/request/restaurant isolation, effective SKU pricing and response/decline transactions.
- [x] Both native hook suites cover metadata, errors/retries and cache invalidation.
- [x] Final broad regression/lint/typecheck evidence is recorded in the active audit (41 mobile regressions per platform plus quote/Arabic runtime checks; all three typechecks).
- [ ] Precision boundaries, new-request phantoms, hosted and physical-device workflows remain open.

## 2026-11-18 - Rollover transaction and client refresh

- [x] Android/iOS preserve the canonical manual-rollover request and response.
- [x] Both clients refresh dispatch/order/driver/delivery/run-sheet caches on success.
- [x] Matching regressions retain cached work on error and refresh after retry.
- [x] Actual SQL covers calendar/status compatibility, job execution, stale writes and pickup serialization.
- [x] Final typecheck/lint and broad API results recorded in the active audit (32 native tests per platform, all three typechecks).
- [ ] Manual force replay, long-overdue days, route membership and physical devices remain open.

## 2026-11-18 - Direct delivery, route state and warehouse assignment selection

- [x] Android/iOS home and stop screens preserve exact assignment/warehouse selection.
- [x] Explicit stale selectors do not fall back; selector-free navigation prefers active work.
- [x] Both status mutation clients refresh order/detail/board/route caches.
- [x] Web proof completion refreshes after the atomic endpoint without a second delivered write.
- [x] Real SQL covers direct status/POD route synchronization, multi-leg aggregation and rollback.
- [x] Route driver handover preserves completed history and physical stock quantities.
- [x] Final test/typecheck/lint results are recorded in the active audit (28 native tests per platform, all three typechecks).
- [ ] Physical devices, GPS-session transitions and retry/rollover route membership remain open.

## 2026-11-17 - Driver route lifecycle and error parity

- [x] Both native clients POST stop-ID reorders and PATCH the canonical next-stop field.
- [x] Optimization response types and copy reflect estimated distance from `preview`.
- [x] Both clients retain active-route query errors and cached routes on refresh failure.
- [x] Driver home/run-sheet retry rendering and successful null-route controls pass in both clients.
- [x] Route currency types and English/Arabic messages match across Android/iOS.
- [x] Real SQL covers route creation, edits, dispatch/delivery, stale state and reassignment lock ordering.
- [x] Final ERP/Android/iOS typechecks and API regression gate recorded in the active audit.
- [ ] Physical-device route/GPS/offline behavior and hosted workflows remain open.

## 2026-11-17 - Supplier proof assignment and completion parity

- [x] Android/iOS standalone proof clients send an explicit assignment selector when provided.
- [x] Proof response types include the nullable driver assignment ID on web and both native clients.
- [x] Active native atomic proof screens retain their required assignment ID and uploaded-photo retry.
- [x] Matching hook regressions verify explicit/omitted selectors and retry/cache behavior on both platforms.
- [x] ERP, Android and iOS typechecks pass after the proof client/type changes.
- [x] PostgreSQL verifies calendar dates, rollback, leg/tenant isolation, connection reuse and reassignment serialization.
- [ ] Hosted and physical-device camera, offline/reconnect and delivery lifecycle verification remain open.

## 2026-11-17 - Supplier delivery calendar parity

- [x] Delivery calendar field contract documented identically in Android and iOS.
- [x] Both native schedules retain the supplier day when the legacy timestamp is on the previous UTC date.
- [x] Matching driver schedule and run-sheet regressions pass on both platforms.
- [x] ERP, Android and iOS typechecks pass after the delivery calendar changes.
- [x] Server fallback preserves existing response fields and driver/area/status restrictions.
- [ ] Physical-device delivery, offline/reconnect and full lifecycle verification remain open.

## 2026-11-17 - Supplier summary finance authorization

- [x] Android/iOS run sheets require invoice visibility for financial tiles and details.
- [x] Both native regression suites cover an unauthorized user with a cached finance payload.
- [x] Existing driver navigation remains aligned with the tenant-wide run-sheet gate.
- [x] ERP, Android and iOS typechecks pass after the permission guards.
- [x] No new response field, permission/feature key or environment variable needs migration.
- [ ] Full supplier source, feature, role/plan and physical-device audit remains open.

## 2026-11-17 - Supplier receivables workflow audit

- [x] Canonical supplier receivables response types mirrored in Android and iOS.
- [x] Both native screens display API invoice fields, currency groups and supplier overdue flags.
- [x] Full open-invoice count retained when the invoice preview is capped at 100 rows.
- [x] Matching rendering/currency regressions and both native typechecks pass.
- [x] Export endpoint usage inspected in both native clients; neither calls these accounting exports.
- [x] Dated parity entry, supplier operations and regression documentation updated.

## 2026-11-16 - Supplier run sheet and accounting audit

- [x] Nullable run-sheet KPI/collection amounts and currency groups mirrored in Android and iOS.
- [x] Both native run sheets show invoice and aggregate currencies without combining balances.
- [x] Matching mixed/single/missing-currency and legacy-payload display regressions pass.
- [x] Both native typechecks pass; root typecheck and web production build pass.
- [x] Accounting CSV downloads retain their opaque-file handling; no new parser, dependency or env var.
- [x] Dated parity entry and supplier operations/capability documentation updated.

## 2026-11-16 - Restaurant checkout audit

- [x] Nullable restaurant-order supplier display projection mirrored in Android and iOS.
- [x] Concurrent checkout keys/payloads and late replay responses covered identically in both native stores.
- [x] Existing native supplier labels and order-currency formatting retained.
- [x] Server-only waste/expiry corrections preserve existing fields and action semantics.
- [x] Dated parity entry and ordering/inventory domain documentation updated.
- [x] Both native typechecks pass; checkout regressions pass 11 tests per platform.

## 2026-11-15 - All-role mobile design transformation

- [x] Shared design system, controls, role navigation, and screen migration mirrored.
- [x] English/Arabic copy and locale-aware presentation mirrored.
- [x] Reservation date/time, details, table assignment, and existing status contracts preserved.
- [x] Existing read-only Assistant and reorder protections retained.
- [x] No new backend/auth/RBAC/feature/notification contract or environment variable.
- [x] Native source/dependency parity and dated implementation documentation.
- [x] Android and iOS regression suites pass (34 suites / 125 tests each).
- [x] Android and iOS typechecks, ERP root typecheck, and Expo compatibility checks pass.
- [x] Rendered route review passes 137 cases using isolated fixtures.
- [x] Forty additional responsive cases pass; calendar/time selection, search, and Arabic draft retention verified on phone/tablet layouts.
- [x] Android dev APK downloaded, checksummed, installed, and cold-launched; development identity handoff and native sign-in responsive layouts checked. See transformation record for scope and artifact.
- [ ] Native iOS/device validation deferred at the user's request.

Use on every web/API PR that touches orders, auth, fulfillment, tracking, or RBAC.

## 2026-11-13 - iPad and guest-flow repair

- [x] Promotion response parsing, error handling, refresh, and discount labels match in Android and iOS.
- [x] Optional server `idempotencyKey` contract mirrored in both native public-checkout request helpers and tests.
- [x] Existing invoice and product response shapes preserved; compatible native clients inspected.
- [x] Web public booking/menu/rewards UI changes recorded as web-only; native administration contracts remain compatible.
- [x] Migration `0232` and API-before-web release order documented.
- [x] Dated parity entry and domain documentation updated.

## 2026-11-11 — Public demo campaign API

- [x] Public lead/event payloads and response types mirrored in Android and iOS.
- [x] Anonymous client helpers avoid ERP authentication state and cookies.
- [x] Native operational screens remain unchanged; QR/video/walkthrough presentation stays on the web.
- [x] Campaign lead administration uses existing admin auth and ADMIN_GROWTH on web only.
- [x] Main-web entry, API migration and release URLs documented in `docs/features/demo-experience.md`.

## 2026-09-29 - Supplier public shopping and personal consumers

- [x] `CONSUMER` role, registration, auth types, and role navigation synchronized on Android and iOS.
- [x] Logged-out root enters native supplier discovery while Sign In/Create Account remain reachable.
- [x] Guest public calls explicitly omit auth and cannot trigger refresh/session clearing.
- [x] Shared storefront, isolated cart, preview, delivery/pickup checkout, receipt, and SecureStore tracking implemented in both apps.
- [x] Consumer saved addresses, authenticated orders, notifications, current-price reorder, and account screens implemented in both apps.
- [x] Supplier public-sales settings, native sharing, public-order customer details, and actions implemented in both apps.
- [x] Storefront/order/tracking deep-link resolution and HTTPS app-link declarations added to both apps.
- [x] Automated parity tests and typechecks are part of the verification gate.
- [ ] Physical-device verification remains required for universal/app links, share sheet, permissions, SecureStore restore, offline retry, and push opens.

## 2026-09-25 - Branch and warehouse scoping hardening

- [x] Server-only fail-closed org and warehouse scoping. No API contract, RBAC key, or mobile type change.
- [x] Skip documented in `MOBILE_FEATURE_PARITY.md`.

## 2026-09-25 - Featured review, supplier comparison, and chat attachments

- [x] Featured placement package selection opens a payment sheet on web, Android, and iOS; payment leaves the request pending until an admin approves it.
- [x] Admin approval/rejection API and audit fields added; no new permission or feature key was introduced.
- [x] Common-product best-price API, types, query hooks, and restaurant supplier-directory panel synchronized across web, Android, and iOS.
- [x] Assistant followed-supplier and comparison tools use the same tenant/organization-scoped data as the product UI.
- [x] Assistant and ordinary human chat accept image/PDF attachments on web, Android, and iOS through the authenticated upload gateway.
- [x] Android and iOS dependencies and types are synchronized; both native typechecks pass.
- [x] ERP focused tests and root typecheck recorded in the parity log after verification.

- [ ] Did API response types change? → Update `supplify-mobile/src/types`
- [ ] Did web route behavior change? → Check mobile screen equivalent
- [ ] Did RBAC / plan gating change? → Update mobile guards/navigation
- [ ] Did order lifecycle change? → Update restaurant/supplier/driver flows
- [ ] Did fulfillment / GPS / ETA / maps change? → Update mobile tracking
- [ ] Does mobile need a screen update?
- [ ] Were mobile tests / typecheck run when mobile-related?
- [ ] Was `MOBILE_FEATURE_PARITY.md` updated if something is deferred?
- [ ] Supplier bulk image import changed? → Web-only; document in parity file (see 2026-06-15 entry).

## 2026-09-16 - POD atomic completion + compact mobile foundation

- [x] POD uploads use the authenticated tokenized API gateway, with actual captured blob MIME/byte validation before presigning.
- [x] Android and iOS send the active driver assignment and optional warehouse leg to the idempotent atomic completion endpoint.
- [x] Retry state distinguishes upload from completion; photos are retained and GPS is explicitly best-effort.
- [x] `out_for_delivery` synchronizes the parent lifecycle from `PROCESSING` to `SHIPPED`.
- [x] Shared compact semantic theme, operational rows, status domains, and role labels were mirrored in both native repositories.
- [x] Targeted API tests, POD utility tests, web typecheck, and Android/iOS typechecks were run.
- [ ] Physical-device validation still required: camera permission, denied GPS, flaky-network retry, invalid/oversized image, repeated confirmation, and final delivery completion on Android and iOS.

## 2026-09-13 - Native chat push audit

- [x] API notification, Expo payload, device registration, and deep-link contracts synchronized across ERP, Android, and iOS.
- [x] Android and iOS registration retry/status/logout behavior kept identical.
- [x] Chat alerts invalidate the chat list and open the target conversation on both platforms.
- [x] Push endpoint ownership is globally unique; explicit push opt-out is preserved.
- [x] Focused API and both mobile push/deep-link tests pass.
- [x] Android config maps the EAS `GOOGLE_SERVICES_JSON` file variable; the default `supplify-alerts` channel resolves in both app configs. Current config warns when the file is missing, so a successful APK build alone does not prove push readiness. Production file-variable presence was verified on 2026-11-13.
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
- [x] 2026-09-21 — Supplier product category contract (category `supplier_id` plus list/create/delete clients) synchronized in Android and iOS; full catalog management remains web-linked in the current mobile product screen.

## 2026-11-14 read-only assistance

- [x] Additive Assistant evidence and history contracts mirrored in Android/iOS.
- [x] Conversation restoration/pagination, PDF input, role-specific starters, Arabic,
      source status, and share/copy controls mirrored.
- [x] Shared reorder snapshot and Inventory guidance mirrored; wait/review purchases disabled.
- [x] Existing ai_assistant and domain permission/feature gates retained; no driver Assistant.
- [x] Dated parity entry and Assistant/reorder/roadmap documentation updated.
