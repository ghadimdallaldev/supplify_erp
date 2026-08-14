Mobile parity audit — source of truth for this repo. Native Expo apps live only in the standalone sibling repositories: `C:/myProjects/supplify-mobile` (Android) and `C:/myProjects/supplify-mobile-ios` (iOS).

Web = full cockpit. Mobile v1 = operational app. Driver mobile = complete and simple.

## 2026-08-14 — Supplify Assistant (AI chatbot)

- **API**: New `/api/assistant` tool-calling chatbot (read-only). Migration `0195_assistant_conversations.sql`. Gated by `ai_platform` + `AI_ENABLED`.
- **Web**: Floating Assistant FAB + Sheet (not human Chat). Types in `apps/web/src/types/assistant.ts`.
- **Mobile (Android + iOS)**: Assistant screen with `ai_platform` feature gate; entry from More (restaurant/supplier) and driver Tools. API client + types synced in both repos.
- **Admin mobile skip**: Admin overview tools remain web-only; `AdminNavigator` stays deferred (no mobile admin surface).
- **Docs**: `docs/features/ai-assistant.md`.

## 2026-08-11 — iOS EAS project link and simulator build

- **Auth unblock**: Expo/EAS login completed as `ghadimdallal` (owner on `supplify-team`).
- **EAS project**: Created and linked `@supplify-team/supplify-mobile-ios` (`projectId` `34a9b878-8cde-4fc8-8321-2790db6e8dd4`) in `supplify-mobile-ios/app.json`.
- **Simulator binary**: `ios-simulator` EAS build **FINISHED** and artifact inspected on Windows (`Supplify.app` with Hermes, `main.jsbundle`, Expo Location/Notifications frameworks, bundle id `com.supplify.mobile`): https://expo.dev/accounts/supplify-team/projects/supplify-mobile-ios/builds/60da2790-2544-4161-a928-f7aa3c9897dd
- **Device / TestFlight still blocked**: `preview` / `production` iOS builds need interactive Apple credential setup (`eas credentials -p ios`). No app contract or API change; mobile source parity unchanged.
- **Skip reason for Android**: Distribution/config change is iOS-repo EAS metadata only; `supplify-mobile` Android client behavior is unaffected.

## 2026-08-09 — iOS release gate and mobile entitlement contract

- **Repository parity**: Audited both standalone mobile repositories. Restaurant, supplier, and driver application source remains synchronized; the iOS checkout is an Expo SDK 56 application rather than the obsolete Capacitor scaffold described by its former README.
- **Entitlements contract**: Mobile now unwraps `GET /api/subscriptions/entitlements` from `data.entitlements`. Feature values preserve booleans and tier strings instead of incorrectly assuming a top-level `Record<string, boolean>`.
- **Plan-aware UX**: Added a Plan & features screen and feature gates for chat, receiving, quick lists, finance, inventory, deals, disputes, supplier fulfillment, and push registration. The API remains the enforcement authority; unavailable mobile screens now explain plan access before issuing gated domain requests.
- **Billing deep links**: `SUBSCRIPTION` / `BILLING` events and `/app/settings?tab=subscription` notification payloads route to mobile Plan & features instead of notification preferences.
- **Expo release health**: Aligned `expo`, `expo-image-picker`, `expo-location`, and `expo-notifications` to the SDK 56 compatibility matrix; removed the unsupported Metro `server.host` option; restored `.expo/` ignore coverage in iOS; synchronized the iOS env example and local Keycloak default to port `8180`.
- **Verification**: iOS TypeScript, 18 Jest suites / 60 tests, Expo Doctor 18/18, and production Hermes export pass. Android received the same contract, feature, navigation, dependency, and Metro changes.
- **Native distribution boundary**: Simulator/TestFlight/App Store signing still requires the organization's Expo project link and Apple credentials; those secrets are not stored in source control.

## 2026-08-06 — Standalone mobile repository consolidation

- **Repository boundary**: Removed the retired Capacitor `com.supplify.driver` shell, generated Android project, native bridge, Gradle release plumbing, and old APK/AAB outputs from `apps/web`. No native mobile application source remains in the ERP.
- **Android**: The complete operational app is `C:/myProjects/supplify-mobile`.
- **iOS**: The independent parity app is `C:/myProjects/supplify-mobile-ios`.
- **ERP retained**: API contracts, browser/PWA driver UI, browser geolocation, dispatch, tracking sessions, maps, and telemetry storage remain shared backend/web functionality.
- **Permission policy**: Both native apps request foreground location only; persistent background tracking, microphone recording, and Android system-overlay access are not requested.

## 2026-07-01 — Recipe Costing (web-only)

- **Scope**: Restaurant purchasing-linked recipe costing at `/app/recipes`, `/app/recipe-costing`, `/app/recipe-costing/price-impact`. APIs at `/api/recipes` and `/api/recipe-costing`. Plan feature `recipe_costing` (Gold+ restaurant tiers).
- **Reason**: Menu profitability and supplier price impact are finance/operations workflows suited to the web cockpit. Kitchen staff can view instructions via `RECIPES_VIEW` without costs unless granted `RECIPES_VIEW_COSTS`. Supplier users have no access.
- **Migration**: Run `0186_recipe_costing.sql` and `npm run db:sync-roles` before use.
- **Types**: `apps/web/src/types/recipes.ts` for future mobile.

- **Scope**: Emil design-eng motion pass on ERP shell (supplier, admin, fulfillment, staff, login): shared Sheet/Tooltip/Popover/Command primitives, Sonner toasts, motion tokens, skeleton unification.
- **Reason**: Visual polish and perceived performance on web; no API or behavioral changes. Consumer B2C polish deferred to a follow-up pass. Mobile unchanged.

- **Quote requests / RFQ**: Implemented on web only (`/app/quote-requests`). API at `/api/quote-requests`. Types in `apps/web/src/types/index.ts` for future mobile.
- **Supplier mini-store**: Public page `/supplier/:slug` + public API. Mobile not in scope for v1.
- **Reason**: Operational procurement RFQ and public catalog browsing are web-first; mobile can adopt APIs later without blocking web release.

## 2026-06-15 — Bulk product image import (web-only)

- **Scope**: Supplier bulk catalog image import (ZIP by SKU, ZIP + mapping CSV, and `image_url` via product CSV) on `/app/products` → **Import Product Images**. API at `/api/supplier/products/images/import/*`.
- **Reason**: Large ZIP uploads, multi-step preview/confirm, and background job polling are supplier catalog-management workflows suited to the web cockpit. Mobile v1 focuses on operational ordering and fulfillment; suppliers can manage images on web. APIs and types exist in `apps/web` for a future mobile catalog-admin pass if needed.
- **Migration**: Run `0168_catalog_image_import.sql` before using Import Product Images in deployed environments.
- **Docs**: [bulk-product-image-import.md](../features/bulk-product-image-import.md)

## 2026-07-23 — Branch accounts / org / central purchasing foundation (web-first)

- **Scope**: Branch Account link invitations (`bal`), org lifecycle (deactivate/reactivate/unlink), org reports overview, central purchasing draft foundation, warehouse stock overlay + fail-closed reserve. Migration `0191_branch_account_link_invitations.sql`.
- **Reason**: Org admin and multi-location billing workflows are web cockpit surfaces. Mobile can consume APIs later; document before shipping UI-only org features to mobile.
- **Central purchasing**: Foundation only (drafts + submit) — not full line-item catalog UX.

## 2026-07-23 — Supplier-paid sponsorship lifecycle (web-only)

- **Scope**: Offer → restaurant plan select/accept → supplier `billing_invoice` charge (stub/manual gateway) → schedule after trial → activate → complete → restaurant-funded renewal. APIs under `/api/supplier/growth/sponsorships*`, `/api/restaurant/growth/sponsorship-offers*`, admin reconcile/manual-pay/refund. Migration `0192_supplier_sponsorship_lifecycle.sql`.
- **Reason**: Financial consent, invoice payment, and admin reconciliation are web cockpit workflows. Mobile remains metrics/invite-capable later; no mobile sponsorship accept/pay UI in this release.
- **Honesty**: Not PSP-live until a real payment gateway replaces stub/manual.

## 2026-06-15 — Supplier customer growth (web-only)

- **Scope**: Supplier customer import, referral invites, sponsored onboarding, and growth dashboard at `/app/customer-growth`. APIs at `/api/supplier/growth/*`, `/api/growth/referral/:token`, `/api/restaurant/growth/connection-requests`.
- **Reason**: CRM-style bulk import, invite link sharing, and admin growth configuration are web-first supplier acquisition workflows. Mobile can consume metrics API later.
- **Migration**: Run `0169_supplier_growth_program.sql` before using customer growth features.
- **Platform trial**: Free trial default raised to **30 days** platform-wide (admin range 7–90).

## 2026-06-17 — Supplier Ops Wave 2 (web-first)

- **Run sheet**: `/app/run-sheet` — daily ops brief (pick queue, deliveries, receivables, shortages). API `GET /api/supplier/run-sheet`.
- **Pick lists / waves**: Fulfillment → Pick lists tab; API `/api/fulfillment/waves/*`.
- **Collections reminders**: Receivables panel + cron `collections-reminders`; migration `0176_invoice_reminder_log.sql`.
- **POD photo + signature**: `ProofOfDeliveryDialog`, presign upload, restaurant confirm.
- **Excel import**: `.xlsx` on product bulk upload (server-side SheetJS).
- **Warehouse delivery zones**: Settings → Warehouses → Manage zones.
- **Quote price lock**: `QUOTE_PRICE` on checkout from RFQ compare; migration `0178_quote_price_lock.sql`.
- **Accounting export**: Supplier invoice/payment CSV + QuickBooks from `/api/supplier/invoices/export*`.
- **Route optimization**: `POST /api/fulfillment/routes/:id/optimize` (nearest-neighbor; Mapbox optional later).

**Mobile**: Run sheet, pick lists, POD capture, and route optimize are **high priority** for `supplify-mobile` driver/warehouse flows. Excel import and zones remain web-first.

**Migrations**: `0176`–`0179` before deployed use.

## 2026-06-17 — Arabic localization (web-only)

- **Scope**: English + Arabic UI via i18next on web — language switcher in header, RTL `dir` on `<html>`, eager `common`/`navigation` bundles, lazy `auth`/`settings`, locale persistence in `localStorage` (`supplify.locale`), Arabic-aware `Intl` formatting for dates/currency/numbers.
- **Docs**: [ARABIC_LOCALIZATION_I18N.md](../features/ARABIC_LOCALIZATION_I18N.md)

## 2026-06-17 — Restaurant payables, relationship UX, multi-supplier checkout (web-first)

- **Payables panel**: `GET /api/restaurant-finance/payables` + `RestaurantPayablesPanel` on restaurant Invoices (mirror supplier receivables).
- **Connection requests**: Restaurant inbox on `/app/suppliers` — `GET/POST /api/restaurant/growth/connection-requests/*`.
- **Block supplier**: `POST/DELETE /api/suppliers/:id/block` on supplier detail; `is_blocked` on supplier profile.
- **Multi-supplier cart preview**: Checkout shows N orders before confirm (backend already split per supplier).
- **Quote price lock hardening**: Checkout rejects stale quote locks with clear validation error.
- **Reason**: Accountant/purchaser workflows and supplier relationship management are web cockpit features. Mobile can consume payables API and connection-request endpoints in a later restaurant finance pass.

## 2026-06-18 — Mobile v1 parity release (supplify-mobile)

- **Scope**: Full acceptance-criteria parity for driver, restaurant, and supplier roles in `supplify-mobile` — chat, quick lists, invoices/statement, inventory, disputes, run sheet, pick lists, fulfillment dispatch (assign/reassign/rollover), photo POD, route optimize, branch picker, entitlements, offline banner, toast errors.
- **Native push**: `POST/DELETE /api/push/devices` for Expo push tokens (extends existing VAPID web subscribe in `push.routes.js`). Mobile registers via `expo-notifications`; delivery fan-out may require ops configuration.
- **QA**: [MOBILE_QA_CHECKLIST.md](../../supplify-mobile/docs/mobile/MOBILE_QA_CHECKLIST.md) in mobile repo; EAS `preview` profile for internal TestFlight / Play testing.
- **Still web-only**: Arabic i18n, admin, bulk CSV import, loyalty program setup, accounting export, delivery zone CRUD.

## 2026-06-18 — Restaurant inventory bulk import (web-only)

- **Scope**: Restaurant CSV bulk stock import on `/app/restaurant-inventory` — template download, preview, confirm. API `POST /api/restaurant-inventory/import/preview` and `/import` (`restaurant-inventory-import.service.js`).
- **Reason**: Multi-step CSV preview/validation and desktop file workflows match the web cockpit. Mobile v1 has no equivalent bulk-import UI; restaurants can adjust stock on web or use per-line add/adjust flows on mobile when parity is added.

## 2026-06-18 — Supplier B2B loyalty program page (web-only)

- **Scope**: Supplier loyalty configuration stub at `/app/loyalty` (`LoyaltyProgramPage`); APIs at `/api/loyalty/supplier/program` and balance endpoints. RTK types in `apps/web/src/services/api/endpoints/loyalty.ts`.
- **Reason**: B2B loyalty program setup and balance review are supplier catalog/CRM cockpit workflows (web-first). Consumer-facing loyalty remains separate (`/app/consumer-loyalty`). Mobile can adopt supplier loyalty APIs in a later supplier CRM pass.

## 2026-07-15 — AI-assisted restaurant Smart Reorder (web-first, additive API)

- **API additive only**: New `POST /api/restaurant-inventory/reorder-assistance/ai-recommend` (batch LLM decisions with forecast fallback) and `POST .../feedback`. `GET /reorder-assistance` is unchanged in behavior (no LLM in the list path). Response fields on suggestions (`leadTimeDays`, `moq`, etc.) are additive.
- **Mobile**: Can ignore `ai-recommend` / feedback and new AI source labels until a later pass. Existing mobile reorder flows that consume `suggested_reorder_qty` / assistance suggestions remain valid. Document-only deferral — no mobile change required for this release.

## 2026-07-01 — Reorder correctness, WhatsApp + webhook plumbing, AI fixes (server-first)

- **Reorder suggestions (server is source of truth — no mobile change needed)**: Unified the reorder-quantity math behind `apps/api/src/lib/reorder-quantity.js` (order-up-to over lead time + 14-day buffer, minus on-hand, MOQ/pack rounding). Fixed a real bug in `GET /api/restaurant-inventory` (`avg_daily_usage` was averaged per movement row instead of per day). `GET /reorder-suggestions` and `/reorder-assistance` now agree. Quantities may shift for existing items; **mobile consumes the server `suggested_reorder_qty` value directly, so it inherits the fix automatically.** Additive fields on the inventory list rows: `lead_time_days`, `moq`, `order_multiple`.
- **WhatsApp (server-side delivery, no mobile UI)**: `whatsapp.service.js` is now a real Meta Cloud API client gated by `WHATSAPP_ENABLED` + credentials (log-only + not-configured modes mirror email). New `whatsapp_sent` column on `notification_log` (was recorded in the repurposed `sms_sent`). Delivery is server-side; **no mobile change** — mobile just sees the extra `whatsapp_sent` flag on notification rows (additive).
- **Notification webhooks (Platinum tier, server + web-only config UI)**: `email_whatsapp_webhook` plan now dispatches HMAC-signed outbound webhooks (`notification/webhook.js`). Config API `GET/PUT /api/notifications/webhook`; web settings card in restaurant/supplier notification settings. **Mobile not in scope** — webhook management is a cockpit/admin workflow.
- **AI reorder assistant fixes (server-side)**: quota now only counts successful LLM calls (refund on failure), `explain` filters hallucinated product IDs, env `AI_MAX_REQUESTS_PER_TENANT_PER_DAY` is enforced, and `ask` degrades to a heuristic on limit (previously threw). Ask result gains an optional `usageLimited` flag (additive). Behavior only differs when `AI_ENABLED=true`; **no mobile change required**.
- **Migrations**: `0181_whatsapp_delivery.sql`, `0182_notification_webhook.sql` before deployed use.
- **Env**: `WHATSAPP_ENABLED`, `WHATSAPP_LOG_ONLY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION` (see `apps/api/.env.example`).

## 2026-07-17 — Orders list laptop density (web-only)

- **Scope**: Denser `/app/orders` table layout (`OrdersResponsiveList`): compact type/padding, `#ID` nowrap, horizontal action row, table from `lg`.
- **Reason**: Visual density for web laptop cockpits; no API or order lifecycle changes. Mobile order lists unchanged.

## 2026-07-31 — Keycloak email OTP login

- **Interactive login**: Mobile continues to use the hosted Keycloak OIDC pages. Password login may be followed by the localized six-digit email OTP page.
- **Refresh parity**: POST /auth/mobile/refresh never invokes OTP. Rotation, transient refresh handling, and token expiry behavior are unchanged.
- **Signup**: Hosted registration may show the same email verification required action before the API accepts tenant completion.
- **Unverified recovery** (2026-08-03): Unverified users no longer get a dual login+signup OTP; login defers to the signup required action only. API callback clears Keycloak SSO and re-enters hosted login when `email_verified` is false. Mobile still uses the same hosted pages.
- **Silent SSO clear** (2026-08-05): Web stores `id_token` cookie and passes `id_token_hint` on Keycloak logout so signup/recovery does not show "Do you want to log out?". Mobile passes `id_token_hint` via `endKeycloakSession(idToken)` on logout (implemented in `keycloakAuth.ts`). The `id_token` is persisted alongside `access_token` and `refresh_token` in secure storage.
- **Driver OTP bypass**: Drivers with an active supplier assignment skip email MFA. The API sets the Keycloak attribute `supplify_driver_login=true` via `setKeycloakUserDriverLogin()` when a driver is assigned; it is cleared on unassignment. The OTP step is controlled by `AUTH_EMAIL_OTP_DRIVER_BYPASS` (default `true`). Mobile clients need no change — the bypass is server-side only.
- **Mobile branch switch**: `POST /api/branches/switch` returns `{ activeTenantToken: "<jwt>" }` in the JSON response body for bearer-authenticated requests (mobile path). Clients must store this token and send it as `X-Active-Tenant-Token` on subsequent requests. Web clients continue to use the `HttpOnly` cookie and receive no `activeTenantToken` field.
- **Out of scope**: B2C consumer JWT and staff magic-link flows do not use this OTP feature.

## 2026-08-05 — Driver auth hardening & Android smoke automation

- **Driver identity hardening** (`fix(auth): preserve driver identity metadata`, `feat(android): harden driver auth and release builds`): Driver Keycloak attribute `supplify_driver_login=true` is now preserved across token refresh and re-login flows. The attribute is set on driver assignment via `setKeycloakUserDriverLogin()` in `keycloak-admin.js` and cleared on unassignment. This prevents the OTP bypass being lost on session rotation.
- **Android emulator smoke test** (`test(android): automate driver auth smoke flow`): Auth smoke flow is now automated for the Android build pipeline. The emulator redirect URI `exp://10.0.2.2:8081/--/auth/callback` must be in the Keycloak client's Valid redirect URIs for dev builds — see `KEYCLOAK_MOBILE_CLIENT.md`.
- **Mobile**: Driver flows in both standalone mobile repositories inherit the identity fix automatically (server-side). No mobile code change required.

## 2026-08-05 — Billing trial notification deep link (web)

- **Scope**: Trial/billing in-app + email CTAs pointed at dead `/app/billing`. Now use `/app/settings?tab=subscription` (or `?tab=plan` for suppliers). Web `resolveNotificationUrl` honors `metadata.ctaUrl` / remaps legacy `/app/billing`.
- **Reason**: Web cockpit settings hosts billing; no dedicated billing route. Mobile inherits corrected API `ctaUrl`/`link` on new notifications if it navigates from metadata; no mobile UI change required for this fix.
