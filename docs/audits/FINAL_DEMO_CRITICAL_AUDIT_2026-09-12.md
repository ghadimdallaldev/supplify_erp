# Final client-demo critical audit — 2026-09-12

## Scope

Targeted final review of authentication and active-tenant propagation, RBAC, branches/warehouses, inventory/suppliers, notifications, chat, API/database consistency, and ERP-to-mobile integration. Working code outside these high-risk paths was not rewritten.

## High-risk findings fixed

- **Socket permission bypass / staff denial:** chat socket rooms and events previously used incomplete participant checks and could reject invited staff or bypass HTTP feature/permission middleware. All chat socket events now enforce active-tenant participation, chat entitlement, and the appropriate chat permission.
- **Socket/REST inconsistency:** legacy socket sends now persist against the selected tenant, enforce usage limits, and create the same message notification as REST sends. REST message plus attachment writes use one database client transaction.
- **Stale mobile chats:** conversation lists now refresh on focus, poll as a fallback, subscribe to visible rooms, and invalidate on message socket/push events. Users no longer need to enter a conversation through Home notifications before it appears in Chats.
- **Unread discoverability:** restaurant and supplier Chat tabs show aggregate unread badges and opening a thread marks it read.
- **Mobile chat ergonomics:** socket listeners no longer remove other screens' listeners, rooms survive reconnects, failed sends restore the draft, order references respect `ORDERS_VIEW`, and keyboard handling keeps the message field/send action visible.
- **Native entry points:** restaurants can follow/unfollow and message suppliers; suppliers can message connected restaurant customers.
- **Delivery map crash:** unsupported/default map providers no longer mount the native map component; device-map fallback remains available.
- **Contract pricing and deal creation:** pricing sheets are keyboard/safe-area safe; deals require a meaningful description and correctly validate all supported deal types.
- **Untranslated legal footer:** legal links load the legal namespace and include safe English defaults, preventing `hub.footerAgreement` from appearing.

## Verification evidence

- API focused chat/notification/RBAC tests: 58 passed.
- Web focused chat/notification/legal tests: 17 passed.
- Android mobile: TypeScript passed; 19 suites / 65 tests passed; Expo Android production export passed.
- iOS mobile: TypeScript passed; 19 suites / 65 tests passed; Expo iOS production export passed.
- Final monorepo typecheck, build, and full API/web suites are recorded in the task handoff after execution.

## Deployment notes

No migration, new environment variable, feature key, or permission key is required. Redis connection warnings seen in isolated API unit tests are expected when the test Redis service is absent; notification behavior is covered with mocks and the suites pass.
