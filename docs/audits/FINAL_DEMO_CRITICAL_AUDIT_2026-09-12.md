# Final client-demo critical audit — 2026-09-12 (push follow-up 2026-09-13)

## Scope

Targeted final review of authentication and active-tenant propagation, RBAC, branches/warehouses, inventory/suppliers, notifications, chat, API/database consistency, and ERP-to-mobile integration. Working code outside these high-risk paths was not rewritten.

## High-risk findings fixed

- **Socket permission bypass / staff denial:** chat socket rooms and events previously used incomplete participant checks and could reject invited staff or bypass HTTP feature/permission middleware. All chat socket events now enforce active-tenant participation, chat entitlement, and the appropriate chat permission.
- **Socket/REST inconsistency:** legacy socket sends now persist against the selected tenant, enforce usage limits, and create the same message notification as REST sends. REST message plus attachment writes use one database client transaction.
- **Stale mobile chats:** conversation lists now refresh on focus, poll as a fallback, subscribe to visible rooms, and invalidate on message socket/push events. Users no longer need to enter a conversation through Home notifications before it appears in Chats.
- **Unread discoverability:** restaurant and supplier Chat tabs show aggregate unread badges and opening a thread marks it read.
- **Mobile chat ergonomics:** socket listeners no longer remove other screens' listeners, rooms survive reconnects, failed sends restore the draft, order references respect `ORDERS_VIEW`, and keyboard handling keeps the message field/send action visible.
- **Native entry points:** restaurants can follow/unfollow and message suppliers; suppliers can message connected restaurant customers.
- **Native chat push silently failing:** mobile registration errors were swallowed, device registration could be blocked by tenant context, and notification dispatch did not prove downstream delivery. Both apps now retry and expose registration state; API payloads are Expo-compatible and FCM/APNs receipts determine delivery success.
- **Push account isolation and preference safety:** the same device endpoint could remain assigned to multiple users, logout happened after token loss, and app startup re-enabled explicit opt-outs. Endpoint ownership is now globally unique, logout unregisters while authenticated, and registration preserves preferences.
- **Push audit accuracy:** `push_sent` was susceptible to being set before delivery or overwritten by a later channel update. It now changes only after actual web delivery or a successful native receipt.
- **Delivery map crash:** unsupported/default map providers no longer mount the native map component; device-map fallback remains available.
- **Contract pricing and deal creation:** pricing sheets are keyboard/safe-area safe; deals require a meaningful description and correctly validate all supported deal types.
- **Untranslated legal footer:** legal links load the legal namespace and include safe English defaults, preventing `hub.footerAgreement` from appearing.

## Verification evidence

- Complete API Vitest regression suite passed after adding the new push tests; focused push/notification suite passed 36/36 and feature-gate suite passed 15/15.
- Complete web Vitest suite passed: 128 files / 468 tests. Web production build passed (3,402 modules).
- Monorepo TypeScript check passed. Changed API files lint with 0 errors; warnings are pre-existing unused locals in the notification template module.
- Android mobile: TypeScript passed; 20 suites / 70 tests passed; final Expo Android export passed.
- iOS mobile: TypeScript passed; 20 suites / 70 tests passed; final Expo iOS export passed.
- Physical-device background/terminated delivery remains pending provider credentials and a fresh native build; static exports do not validate FCM/APNs.

## Deployment notes

Migration `0204_push_subscription_endpoint_ownership.sql` must run before deploying this API build. No feature key or permission key was added. Android mobile builds now require the EAS file variable `GOOGLE_SERVICES_JSON`.

Repository checks cannot inspect private EAS credentials. Before the device demo, build fresh binaries and verify Android Firebase client configuration plus EAS FCM V1 credentials, and iOS APNs credentials. Both mobile repos now map `GOOGLE_SERVICES_JSON` into `android.googleServicesFile` and fail Android EAS builds if it is absent. Android remote push remains a release-configuration gate until that file variable and its matching FCM V1 service-account credential are populated.

Redis connection warnings seen in isolated API unit tests are expected when the test Redis service is absent; notification behavior is covered with mocks and the suites pass.
