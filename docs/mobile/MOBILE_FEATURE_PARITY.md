Mobile parity audit — source of truth for this repo. Native Expo apps live only in the standalone sibling repositories: `C:/myProjects/supplify-mobile` (Android) and `C:/myProjects/supplify-mobile-ios` (iOS).

Web = full cockpit. Mobile v1 = operational app. Driver mobile = complete and simple.

## 2026-09-18 - Authenticated upload gateway and malware-scan parity

- **API contract:** File presign responses retain `presignedUrl` and `url`, but both now point to authenticated API gateway PUT endpoints. Direct S3/browser PUTs and bucket fields are no longer part of the client contract.
- **Security boundary:** Uploads are single-use database sessions, scanned in private quarantine by ClamAV, checked against magic signatures, and promoted only after a clean verdict. POD, product, chat, logo, import, and dispute attachments use the same boundary.
- **Mobile:** Android and iOS send bearer and active-tenant tokens on gateway PUTs. Malware responses clear the rejected POD key and prompt a replacement; scanner-unavailable responses retain the selected photo and allow retry.
- **Verification:** Android/iOS POD helper tests and typechecks pass.

## 2026-09-16 - Driver POD reliability repair and compact mobile foundation

- **POD transport:** Android and iOS read the captured image blob before presigning, send its real MIME type and byte count to the authenticated API upload gateway, and no longer depend on an S3 `Content-Length` signature or public storage reachability.
- **Atomic completion:** both driver apps send the active `driver_assignment_id` (and warehouse leg when present) to `POST /api/orders/:id/complete-delivery`. The service upserts proof and completes that exact leg in one transaction; a lost response is safe to retry.
- **Recovery and GPS:** a failed upload keeps the photo; a completion failure reuses uploaded media and offers a confirmation-only retry. GPS denial, timeout, or unavailable location is shown as best-effort and never blocks delivery.
- **Lifecycle:** moving a leg to `out_for_delivery` promotes a `PROCESSING` order to `SHIPPED` in the same transaction, preventing a valid delivery confirmation from failing with "must be shipped first".
- **Design parity:** Android and iOS are source-equivalent for the POD flow, semantic light-theme tokens, compact grouped operational rows, role tab labels, and lifecycle-domain status badges.
- **Verification:** targeted API route/service tests, Android and iOS POD utility tests, web typecheck, and Android/iOS typechecks were run.

---

## 2026-09-15 — Fix Railway API deploy: migration 0207 `min(uuid)` (server-only)

**Change:** `0207_ordering_multibranch_hardening.sql` supplier-org backfill used `MIN(supplier_id)` on a UUID column, which Postgres rejects (`function min(uuid) does not exist`). Replaced with `(array_agg(supplier_id))[1]` under the existing single-supplier `HAVING` guard. Unblocks API boot on Development / preprod / production.

**Mobile:** Skipped — migration/startup-only fix; no API contract, payload, or client flow change.

---

## 2026-09-14 — Route-stop advancement is atomic (server-only)

**Change:** `updateRouteStop` now advances linked driver assignment legs, the `route_stop` row, and optional `delivery_route` completion inside a single DB transaction. `updateDeliveryStatus` accepts an optional shared client so multi-leg updates cannot partially commit. Notifications and dispatch-cache invalidation run only after commit (same post-commit pattern as scheduled orders).

**Mobile:** Skipped — no API contract, payload, or client flow change. Drivers still call the same route-stop / delivery-status endpoints.

**Docs:** `docs/features/drivers-and-gps-tracking.md` (transaction boundary).

---

## 2026-09-14 — Ordering Lists manual Order now empties cart (web fix)

**Symptom:** On web Ordering Lists, **Order** / **Order now** showed a success toast and navigated to cart, but no lines appeared.

**Root cause:** `handleOrderFromList` resolved products only from `catalogProducts` (`useGetProductsQuery` with `skip: !showProductDialog`). With the product picker closed that cache is empty, so every list line was skipped silently while the toast still used `list.items.length`.

**Fix (web):** Build cart lines from quick-list API item joins via `cartItemsFromQuickList` / `quickListItemToProduct` (`apps/web/src/lib/quickListCart.ts`). Prefer catalog product when present; fail the toast when zero lines map. Scheduled/cron auto-create path unchanged.

**Mobile:** Skipped — Android/iOS already map list items with `itemToProduct` and load the cart on list tap (`QuickListsScreen.tsx`). No API/contract change.

---

## 2026-09-14 — Driver feature hardening: pick waves, GPS sharing, delivery confirmation, ETAs

Six defects across the driver/fulfillment path, with root causes:

- **Pick wave generation always failed (500).** `resolveEligibleOrderIds` emitted
  `SELECT DISTINCT o.id … ORDER BY o.created_at`, which Postgres rejects (42P10), so every
  auto-generated wave failed. Survived because the service tests mock `lib/db.js`, so no SQL
  was ever executed. Fixed by selecting `o.created_at`; added a test asserting the
  DISTINCT/ORDER BY invariant over every statement the service emits, plus a repo-wide sweep
  (no other instances).
- **Driver location never shared on web / web-mobile.** Four compounding causes:
  `webDriverLocationProvider` did `void onPoint(point)`, swallowing every upload failure while
  the header still read “Location active”; the provider never throttled (`watchPosition` fires
  continuously and `getGpsUpdateIntervalMs` was unused), so the API's
  `GPS_MIN_SEND_INTERVAL_SECONDS` dropped nearly everything; `gpsState` was set to
  `TRACKING_ACTIVE` before any fix arrived; and `useDriverLocationTracking` used
  `Promise.all(...).unwrap()`, so one rejected order discarded the fix for all of them.
  `isTrackableDeliveryStatus` also treated `pending` (no driver assignment — the endpoint
  rejects it) as trackable, which guaranteed those rejections.
- **Oversized driver action bar overlapping content.** Two stacked full-width buttons stood
  ~130px tall against `pb-28` (112px) reserved. Now one compact row that also names the
  delivery it acts on; page padding uses `calc(7rem + env(safe-area-inset-bottom))`.
- **“I’m on the way” delivering the order.** The web sent no `driver_assignment_id` /
  `warehouse_assignment_id`, so multi-warehouse orders were rejected as ambiguous; `delivered`
  fired immediately with no confirmation and no proof capture, so once the first action resolved
  the “Delivered” button sat under the driver’s finger; and the board collapsed `picked_up` into
  `out_for_delivery`, making “Delivered” the primary action for a delivery the driver had never
  departed on. `rescheduled`/`pending` also offered buttons that always errored. The board's
  row order (`COALESCE(da.id, o.id)`) meant “next delivery” was effectively arbitrary.
- **Delivery confirmation failing in both mobile apps.** `DeliveryProofScreen` called
  `updateStatus('delivered')` **before** `submitPod`, but the API rejects `delivered` until a
  proof row exists whenever the supplier sets `pod_required` — so confirmation failed every
  time for those suppliers, and when it did pass it could leave an order delivered with no
  proof. Now ordered proof-first via shared `confirmDeliveryWithProof`.
- **Inaccurate ETAs.** The board advertised `etaAvailable` for `assigned` while the ETA service
  refused it as `assignment_not_active`; both now use the service's own
  `isEtaEligibleAssignmentStatus`. A GPS fix of any age produced a confident ETA — now withheld
  past `DELIVERY_ETA_MAX_LOCATION_AGE_SECONDS` (900s) with `locationRecordedAt` /
  `locationAgeSeconds` exposed. Route legs were each rounded to 0.1km before summing
  (measured 0.2km drift over 8 legs); only the total is rounded now. `route_stop.actual_arrival`
  was being stamped on departure (`IN_TRANSIT`) — migration `0206` adds `departed_at` and
  `actual_arrival` is now set on completion.

- **Mobile:** implemented in **both** `supplify-mobile` and `supplify-mobile-ios` —
  proof-before-delivered ordering, `picked_up` keeps the departure step, no actions for
  `pending`/`rescheduled`, `pending` no longer trackable, GPS pings every active delivery
  (previously only the first, so other stops' restaurants saw no location) tolerating per-order
  failure, and `warehouse_assignment_id` threaded through proof/problem screens.
  Typecheck clean and 80/80 tests pass in both.
- **API contract changes:** `deliveryStatus` on the delivery board can now be `picked_up`
  (previously collapsed); `stats.pickedUp` added while `stats.outForDelivery` still counts both
  as in transit; ETA payloads gained `locationRecordedAt` / `locationAgeSeconds` and the
  `driver_location_stale` reason; route stops expose `departedAt` / `actualArrival` /
  `estimatedArrival`.
- Docs: `docs/features/driver-deliveries.md`, `docs/guides/environment-variables.md`,
  `docs/architecture/rbac-overview.md` (unchanged — no new permission keys).

## 2026-09-14 — Invited staff wrongly sent to organization setup

- **Bug:** After accepting any supplier/restaurant team invite (Driver, Manager, etc.), web AuthGuard redirected to `/register/complete` (“set up organization”).
- **Root cause:** `userNeedsTenantSetup` only checked whether the user’s email was a tenant `contact_email` (owner). Invited members join via `user_workspace_membership` and are never contact_email, so `needsSetup` stayed `true`.
- **Fix:** `userNeedsTenantSetup` returns `false` when an active workspace membership exists; AuthGuard prefers `needsSetup` over bare `PENDING`; RegisterComplete “already set up” escape goes to `/app`.
- **Mobile:** skipped — mobile apps do not use `/api/register/status` / RegisterComplete org-setup gate (no `needsSetup` client). API contract change is additive/corrective for web session routing only.
- Docs: `docs/features/tenant-registration.md`.

## 2026-09-14 — Mobile order crash: permission-gated nav + safe amendment/status render

- **Symptom:** Tapping order-related actions (order detail Receive/Dispute, catalog Cart, quick-list → cart) could hard-close the app when the target stack screen was not registered for the user’s RBAC, or when amendment `change_type` / order `status` was null.
- **Fix (both `supplify-mobile` and `supplify-mobile-ios`):**
  - Gate Cart / Receive / CreateDispute UI and navigation with the same permissions used to register those screens (`ORDERS_CREATE`, `RECEIVING_*`, `ORDERS_MANAGE`).
  - Harden amendment labels (`change_type` / `changeType` fallback) on restaurant and supplier order detail.
  - Null-safe `StatusPill` / `statusTone` / `prettyStatus` and supplier order search status filter.
- **Mobile:** implemented in both repos. No ERP API contract change.

## 2026-09-14 — Admin UI i18n (Limits, Health, Audit, Platform settings, Deals filters)

- Wired remaining hard-coded English on `AdminLimitsTab`, `AdminHealthTab`, `AdminAuditTab`, `AdminPlatformSettingsPanel`, and `AdminDealsPanel` clear-filters/empty states to `useTranslation('admin')`; added matching EN/AR keys under `limits.*`, `health.*`, `audit.*`, `platformSettings.*`, `addonKeys.*`, and `common.*`.
- **Mobile:** skipped — platform-admin web UI only; no API/auth/type contract change.

## 2026-09-14 — Admin UI i18n + token polish (Features, Finance, Operations, Placements, Growth)

- Wired `useTranslation('admin')` on Feature Flags, Finance, Operations, Featured Placements, and Growth Settings panels; added EN/AR keys under `features.*`, `finance.*`, `operations.*`, `placements.*`, and `growth.*`. Replaced light-only Tailwind palette (`bg-emerald-50`, `bg-amber-50`, `bg-sky-50`, etc.) with design tokens (`--mint-pale`, `--amber-pale`, `--brand-ultra`, etc.).
- **Mobile:** skipped — platform-admin surface only; no API/auth/type contract change.

## 2026-09-14 — Admin UI polish + i18n (web-only)

- Dense ops-console polish on admin Overview / Subscriptions / Plans / Limits: token-based status badges, AppPanel vocabulary on overview extras, humanized subscription statuses and limit/feature keys, fixed hard-coded English on high-traffic panels.
- **Mobile:** skipped — platform-admin surface only; no mobile admin app or client contract change.

## 2026-09-14 — Railway preprod outage: API crash loop + web build break

- **Symptom:** `supplify-api-preprod` CRASHED (502); `supplify-web-preprod` / `supplify-web-dev` FAILED builds. Prod/dev API stayed healthy. Preprod API recovered after restart.
- **API root cause:** On listen, ~21 crons fired immediately in parallel with `RUN_MIGRATIONS_ON_START`, stampeding the Postgres pool (`connectionTimeoutMillis=5000`) → `Database migration failed after listen — shutting down` → restart storm.
- **API fix:** register crons only after `markStartupMigrationsReady()` via `startCronsAfterMigrations`.
- **Web root cause:** `PushEnableBanner.tsx` imported `../../ui/button` (and wrong hooks/i18n depth) → Vite `Could not resolve "../../ui/button"`.
- **Web fix:** correct relative imports to `../ui/button`, `../../hooks/...`, `../../i18n`.
- **Mobile skipped:** Railway deploy / web-only push banner imports; no mobile API contract change.
- **Deploy:** promote/redeploy **API + Web** on Railway `dev` and `preprod`.

## 2026-09-14 — Org child branches inherit main unlock (no fake activate)

- Bug: Creating a supplier/restaurant org Branch Account wrote a locked Free `pending_activation` subscription on the child. Switching into that branch made `GET /api/billing/status` read the child row → `/app/activate` (“Trial activation is not available”) even when Scale showed 2/3 branches included.
- Fix: org create uses unlocked `createOrgCoveredBranchSubscription`; billing status / `getSubscriptionForBilling` resolve the main org billing tenant for access; web skips activate redirect when `usesOrgBilling`.
- **Mobile skipped**: branch create/switch and activation gate are web cockpit; mobile opens org/settings on web where needed. No mobile API client contract change.
- Docs: `supplier-branches.md`.

## 2026-09-14 — Supplier team invites: auto-link missing org (Railway preprod)

- Team invites failed on some Railway preprod suppliers with `Organization context required` when `supplier.organization_id` was null (backfill lag / seed accounts). UI looked broken or showed a vague permission error.
- Fix: `ensureSupplierOrganizationLinked` creates + links an org on demand during `/api/org/invitations*`. Workspace membership conflicts return **409** with a clear message. Invite modal surfaces real API errors and prefers the **Driver** role when present.
- **Mobile skipped**: team invites remain web-only.
- **Deploy:** promote/redeploy **API + Web** on Railway `preprod` for this to take effect.

## 2026-09-14 — Supplier team invites no longer require multi_branch

- Bug: Settings → Team → Invite (including **Driver**) hit `/api/org/invitations`, which was gated by `requireFeature('multi_branch')`. Growth plans have `driver_management` but not `multi_branch`, so invites failed with `FEATURE_NOT_AVAILABLE` and the modal swallowed errors (appeared broken).
- Fix: remove `multi_branch` from supplier invitation routes (align with restaurant member invites). Seed system roles on `GET /roles`. Surface invite/role errors in `BranchInviteModal`.
- **Mobile skipped**: team invites remain web-only (`OpenOnWebRow` → supplier settings); no mobile invite API client change.
- Docs: `tenant-roles.md`, `03-supplier-onboarding.md`.

## 2026-09-14 — Web push Enable hung on missing service worker

- Clicking **Enable** for browser push awaited `navigator.serviceWorker.ready` without registering a worker first. In local/dev the SW is intentionally not auto-registered (HMR), so the promise never resolved and the button appeared dead.
- Fix: `ensureServiceWorkerForPush()` registers `/sw.js` on demand (including dev), times out instead of hanging, and pins the SW so the dev cleanup path does not unregister it mid-enable. Enable/Disable buttons show a spinner while busy.
- Shared `PushEnableBanner` popup now shows a spinner + inline error (failures were easy to miss on the floating prompt).
- **Mobile skipped**: native push uses Expo device tokens, not Web Push / service workers.

## 2026-09-14 — Order short-id display consistency

- Orders list/detail/packing on web used the **last** 8 UUID characters while notifications and most other surfaces used the **first** 8, so acknowledge alerts looked like a different order number (`#486DB23D` vs `#28EDEA5F` for the same UUID).
- Canonical short ref is now first 8 chars, uppercase (`orderShortId` / `formatOrderRef`) across API notifications, web orders UI, and both mobile chat order tags.
- **Android + iOS:** chat order picker/chips updated; shared `orderShortId` / `formatOrderRef` helpers added under `src/utils/format.ts`.
- No API contract, env var, feature key, or permission key change.

## 2026-09-14 — Deferred defect closure (quotes, driver, cart, dispatch, POD)

- **Supplier manual orders** auto-apply open quote locks for the supplier’s products (same quote price precedence as restaurant checkout; qty capped to quoted qty). Optional client `quoteLocks` still accepted.
- **Driver deliver** may promote `customer_order` to `DELIVERED` only from `SHIPPED` (or leave already-`DELIVERED`); earlier statuses reject with “must be shipped first”.
- **Cart quote stickiness:** catalog re-add of the same SKU clears quote lock metadata on web + Android + iOS so checkout does not reuse stale RFQ prices.
- **RFQ respond TOCTOU:** `submitQuoteResponse` re-checks `quote_requests.status = 'open'` under `FOR UPDATE` inside the write transaction.
- **Dispatch warehouse filter:** assignment-mode filter scopes to `da.warehouse_assignment_id` so multi-WH sibling legs are hidden; unassigned bucket stays order-level.
- **Tenant POD required:** migration `0205_supplier_pod_required.sql` adds `supplier.pod_required`; `PATCH /api/suppliers/me/business` + web Supplier Business settings toggle; `isPodRequiredForSupplier` reads the column and `assertPodPresentWhenRequired` enforces on deliver.
- **Android + iOS:** cart store clears quote locks on catalog re-add (tests added). Driver apps already honor `podRequired` from delivery-status responses — no new mobile settings screen (supplier business settings remain web).
- Docs: `quote-requests.md`, `drivers-and-gps-tracking.md`, this parity log.
- Verification: focused API suites (driver, quotes, pricing locks, POD, warehouse filter) + cart tests + mobile `tsc`.

## 2026-09-14 — Order workflow and receiving integrity

- API/web fixes keep list item counts and product details aligned across order cards, detail, receiving, and packing documents; product/SKU search and paginated product selection no longer stop at an arbitrary first page.
- Shipping and delivery status changes now require an active driver assignment. The legacy `COMPLETED` input maps to delivery only from `SHIPPED`.
- Invite login and signup retain the validated `/invite?token=...&type=...` return URL through Keycloak, so authenticated users return to the acceptance screen.
- Order-related email notifications infer a direct order CTA for placement/status, shortages, amendments, disputes, invoices, and receiving completion. Receiving completion status alerts target the **supplier** (restaurant already knows).
- Contract prices can explicitly be saved as **Forever (no expiry)**; clearing a prior end date sends `null`. Contract product picker supports name/SKU search and pagination (no first-page hard cap).
- Shortage/substitution creation and amendment responses are rejected after `PROCESSING`; replacement suggestions continue through the counterparty amendment approval flow.
- Receiving requires every line and normalizes both web snake-case and mobile camel-case fields from authoritative order data. Short or non-accepted lines create/extend one active dispute inside the same transaction as the report, inventory, order status, and invoice.
- **Android + iOS:** identical catalog infinite pagination and live cart CTA, corrected `POST` driver assignment client, editable actual receiving quantity/quality/notes for every line, safe amendment history rendering, receive action only after delivery, and supplier per-line shortage reporting in mutable stages.
- No new environment variable, feature key, or permission key was introduced.
- Verification: focused API regression suites, root/web typecheck, and `npx tsc --noEmit` in both mobile repositories pass.

## 2026-09-14 — Admin console shell revamp (web)

- Reworked the platform-admin shell in `apps/web`: collapsible icon-rail sidebar (persisted per browser), vertical workspace switcher, sticky translucent top bar with breadcrumb, light/dark theme toggle wired to `PATCH /auth/admin-preferences`, account menu (settings + sign out) replacing the avatar-as-logout button, skip-to-content link, Escape/scroll-lock on the mobile drawer, and tab-panel enter animation. `.dark` now overrides the Supplify hex tokens so the admin dark theme actually darkens.
- No new endpoint, env var, feature key, or permission key. The preferences endpoint and `AdminUserPreferences` type are unchanged.
- **Mobile skipped**: admin-only. The native apps have no admin surface (the mobile admin hub deep-links into this web console).
- Docs: `docs/ui/ADMIN_SHELL_REVAMP.md`, `docs/ui/README.md`, `docs/admin/admin-guide.md`.

## 2026-09-14 — Contract pricing, fulfillment, and quotation correctness audit

- Audited and fixed critical/high business-logic defects across contract pricing, fulfillment, and quotations in the API/web monorepo; both mobile apps updated for client-contract changes.
- **Contract pricing:** recipe cost hooks on contract PATCH now scoped to the contract restaurant; create/bulk require commercial relationship; validity uses calendar/`CURRENT_DATE` (not UTC `toISOString`); amendments re-resolve prices; discount % can derive price when price omitted (discount-only PATCH fires recipe hook); checkout uses delivery date for as-of validity; bulk dedupes productIds; Active badge respects date windows; order currency from resolved prices.
- **Fulfillment:** receiving requires all order lines; order status transition matrix enforced (restaurant cancel only early statuses); cancel restores dispatched stock when allowed; all-rejected receive → `RECEIVED_WITH_DISPUTE` without false `RECEIVED_FULL`; multi-WH driver updates require assignment IDs; order `DELIVERED` only when all WH legs delivered; route planning syncs all pending WH legs; supplier delivery + fulfillment dispatch boards expose one row per driver assignment; board exposes real `driver_id` / `assignmentId`; POD policy helper (optional until a setting exists).
- **Quotations:** quote locks required when an open responded quote exists; locks require RFQ `open`; close/cancel API + UI; cart merge preserves quote locks; duplicate `productId` lines rejected; supplier inbox filters own products; to-cart validates supplier row ownership; declined cannot re-respond; fail-fast ineligible suppliers; qty capped to quoted qty; notification dedup per supplier-row; substitutes flow into cart; promos skip `QUOTE_PRICE` lines; checkout no longer auto-closes whole RFQ; supplier response uses `defaultCurrency`.
- **Mobile (Android + iOS):** cart quote-lock merge overwrite; quote close/cancel on detail; supplier response respects `canRespond`/closed RFQ + defaultCurrency; driver board rows keyed by `assignmentId` for multi-leg; delivery-status passes `driver_assignment_id` when known. Contract pricing mobile UI remains intentional subset (price/notes). Restaurant cancel UI absent on mobile (API enforces). Receiving already submits all lines.
- **Deferred (continue next session):** deep E2E lifecycle coverage still smoke-level.
- Docs updated: `docs/features/quote-requests.md`, `docs/features/contract-pricing.md`, `docs/features/drivers-and-gps-tracking.md`, `docs/onboarding/13-acceptance-criteria.md` §25.
- Verification: focused API suites for pricing/quotes/receiving/transitions/driver/routes/invoices/orders/board/POD passed; mobile `tsc --noEmit` on both apps.

## 2026-09-14 — Supplier catalog empty despite seeded products (web)

- Web `ProductsPage` filtered supplier results by `product.supplier_email === user.email`, but `GET /api/products` list payloads do not include `supplier_email`, so every supplier saw an empty catalog while pagination still reported the real total (e.g. “0 of 500”).
- Fixed by trusting API tenant scoping (`p.supplier_id = active supplier`) and removing the client email filter.
- **Mobile skipped**: mobile supplier product list does not apply this email filter.

## 2026-09-14 — Legal pack version sync (signup unblock)

- Web had bumped `LEGAL_PACK_VERSION` to `2026-09-12` while API still validated `2026-06-09`, so `POST /api/register/complete` rejected every new signup with “Legal document versions have been updated…”.
- Fixed by aligning `apps/api/src/lib/legal-documents.js` to `2026-09-12` (must always match web). Existing users on the old pack will see one-time `/legal/reaccept` after API deploy — expected.
- **Mobile skipped**: signup/legal pack acceptance for tenant creation is web-only; mobile apps do not own `LEGAL_PACK_VERSION` for registration.

## 2026-09-13 - Native chat push reliability hardening

- Updated the API plus both `C:/myProjects/supplify-mobile` and `C:/myProjects/supplify-mobile-ios`; Android and iOS implementations remain identical.
- Mobile device registration now runs for every authenticated native session, retries transient failures (15 seconds, 60 seconds, 5 minutes), retries when the app returns to the foreground, and exposes registration health plus a manual retry in Notification settings.
- Expo tokens are persisted securely, unregistered before authenticated logout, and transferred safely when the same device signs into another account. Registration no longer re-enables a user's explicit push opt-out.
- iOS registration accepts authorized, provisional, and ephemeral notification permission states as required by Expo SDK 56. Android creates the `supplify-alerts` channel before requesting a token.
- Chat push payloads carry both camelCase and snake_case notification/reference fields. Tapping a chat alert opens its conversation; foreground alerts invalidate chat and notification queries immediately.
- The API now sends only supported Expo payload fields, validates tokens, checks downstream FCM/APNs receipts, removes `DeviceNotRegistered` tokens, and marks `notification_log.push_sent` only after confirmed delivery. Migration `0204_push_subscription_endpoint_ownership.sql` prevents one endpoint from remaining attached to multiple users.
- Added build-only EAS file variable `GOOGLE_SERVICES_JSON` to both mobile `.env.example` files. Shared `app.config.js` injects it into `android.googleServicesFile`. Missing the file warns during Android EAS builds instead of failing them, so installable APKs still ship; remote Android push registration still requires the Firebase file plus FCM V1 credentials. No feature key, permission key, or API response contract changed.
- Release prerequisite: populate `GOOGLE_SERVICES_JSON` in EAS and attach the matching FCM V1 service-account credential; iOS device builds require a valid APNs key. These private EAS credentials cannot be verified from the repository and must be checked before the device demo.
- Verification: focused API push/notification tests and focused Android/iOS registration/deep-link tests pass; full regression results are recorded in the final audit report.

## 2026-09-12 — Client-demo critical mobile hardening

- Applied the same chat, notification, deal, contract-pricing, supplier-directory, and delivery-map fixes to both `C:/myProjects/supplify-mobile` and `C:/myProjects/supplify-mobile-ios`.
- Chat lists now refresh on focus and every 15 seconds, join visible conversation rooms, and invalidate immediately for socket/push message notifications. Restaurant and supplier tabs show aggregate unread badges.
- Chat sockets now send the active-tenant token, retain room subscriptions across reconnects, and use reference-counted listeners so leaving one screen cannot detach another screen's live updates.
- Chat threads mark conversations read, preserve unsent drafts on API failure, hide order attachment actions without `ORDERS_VIEW`, and keep the composer above the keyboard (`adjustResize` on Android and keyboard avoidance on iOS).
- Restaurants can follow/unfollow and message suppliers from the native supplier directory; suppliers can start/open chats from the native customer list. All actions retain API permission and feature gates.
- Supplier deal creation now requires a description of what the deal is about and supports percentage, fixed-value, and free-delivery deal types with matching validation.
- Contract-pricing create/edit sheets are safe-area aware, scrollable, and keyboard-safe. Active-delivery and order-tracking maps now avoid mounting an unsupported native provider and provide a reliable device-maps fallback.
- No new endpoint, environment variable, feature key, or permission key was introduced.
- Verification: both mobile TypeScript checks, both 65-test Jest suites, Android Expo production export, and iOS Expo production export passed.

## 2026-09-12 - End-to-end audit hardening

- API product CSV import now lazy-loads XLSX only for spreadsheet files and correctly handles quoted commas, escaped quotes, UTF-8 BOMs, multiline fields, and unterminated-quote validation.
- Android and iOS chat clients are synchronized with the API contract for order references and Socket.IO conversation join/leave payloads; shared supplier query exports are restored on both platforms.
- Driver More exposes the existing feature-gated Assistant route.
- Platform-admin mobile users now have a functional hub linking all admin monitor, account, billing, growth, and tenant-portal destinations into the authenticated web console. Dense admin editors remain web-hosted.

## 2026-09-12 — Full operational mobile↔web parity pass (goal)

### Verified against web sidebar + RBAC

- **Driver notification settings**: More → Notification settings (root stack); prefs `PATCH` is self-service (no `SETTINGS_*`).
- **System push bar**: Expo push not gated on VAPID; `priority: high` + Android channel `supplify-alerts`; `configurePushPresentation()` at app start; drivers get milestone pushes via linked `drivers.user_id`.
- **Reservations / Host desk**: Host tab + board/create/waitlist under `RESERVATIONS_*`; FOH-only users land on Host.
- **Sidebar coverage**: All restaurant/supplier/driver operational web nav items are **Native** or **Hybrid** (native hub + open-on-web for dense editors). Platform `/app/admin/*` is reachable through the mobile admin hub and remains web-hosted for dense editors.
- **Speed**: default React Query `staleTime` 60s; entitlements/prefs 5m; FlashList + 30s host-desk polling where live.
- **Both apps**: `supplify-mobile` and `supplify-mobile-ios` typecheck clean (`npx tsc --noEmit`).

### Still hybrid (deep edit on web)

Recipe authoring, full loyalty rule builders, warehouse zones, team invites/payroll, bulk import, org billing profile — listed in-app with open-on-web footers.

## 2026-09-12 — Supplier loyalty, customer growth, inventory (mobile)

### SupplierLoyaltyScreen + CustomerGrowthScreen + SupplierInventoryScreen

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added types: `src/types/loyalty.ts`, `src/types/growth.ts`, `src/types/supplierInventory.ts`.
- Added queries: `loyalty.ts` → `GET /api/loyalty/supplier/program`, `GET /api/loyalty/supplier/balances`; `growth.ts` → `GET /api/supplier/growth/metrics`, `GET /api/supplier/growth/customers/prospects`; `supplierInventory.ts` → `GET /api/inventory`, `PATCH /api/inventory/product/:productId` (`availableQty`).
- Added `src/utils/supplierStockStatus.ts` (ported from web supplier stock helpers).
- Added `canViewSupplierGrowth()` to `src/hooks/usePermissions.ts` (owners always; else `GROWTH_VIEW` | `CUSTOMERS_MANAGE`).
- **SupplierLoyaltyScreen**: program status + earn/redeem rules summary; restaurant balances FlashList when `ORDERS_VIEW`; open-on-web footer for program edit (`/app/loyalty`).
- **CustomerGrowthScreen**: metrics stat cards + sponsorship funnel summary; prospects FlashList; open-on-web footer for import/invite/sponsor actions.
- **SupplierInventoryScreen**: stat cards (SKUs, low stock, out of stock); FlashList stock rows with status pills; tap-to-set quantity sheet when `INVENTORY_EDIT` | `INVENTORY_MANAGE` (simple PATCH).
- **Gates**: `SupplierLoyalty` when `CATALOG_VIEW` (matches web `/app/loyalty` sidebar); balances query additionally requires `ORDERS_VIEW` (matches API). `CustomerGrowth` when plan feature `supplier_growth` + `canViewSupplierGrowth`. `SupplierInventory` when plan feature `inventory_management` + `INVENTORY_VIEW`.
- **Discoverability**: More → Operations native rows **Loyalty program**, **Inventory**, **Customer growth**; removed open-on-web rows for inventory and customer growth.
- Program edit, CSV import, prospect invite/connect/sponsor, and inventory adjustments/settings remain web-first (open-on-web footers).
- No API contract changes.

## 2026-09-12 — Recipes list, recipe costing dashboard, guest rewards (mobile)

### Restaurant `RecipesScreen` + `RecipeCostingScreen`

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added `src/types/recipes.ts` and `src/services/api/queries/recipes.ts`:
  - `GET /api/recipes` (active list, optional search)
  - `GET /api/recipe-costing/dashboard`
  - `GET /api/recipe-costing/alerts`
- **RecipesScreen**: FlashList of active recipes (name, category, calc status, cost per portion and food cost % when `RECIPES_VIEW_COSTS`); debounced search; pull-to-refresh; open-on-web footer for create/edit.
- **RecipeCostingScreen**: stat cards (active, above target, missing cost, recently impacted); portfolio food cost when costs visible; active alerts list; top highest-cost recipes when `RECIPES_VIEW_COSTS`; link to native recipes list; open-on-web footer for price impact.
- **Gates**: stack routes `Recipes` and `RecipeCosting` when plan feature `recipe_costing` + permission `RECIPES_VIEW` (matches web sidebar + API feature gate).
- **Discoverability**: More → **Recipes & costing** native rows **Recipes** and **Recipe costing**; removed open-on-web **Recipes** row from Also on web.

### Restaurant `ConsumerLoyaltyScreen` (guest rewards)

- **Mobile implemented** in both mobile repos.
- Extended `src/types/consumer.ts` and `src/services/api/queries/consumer.ts`:
  - `GET /api/loyalty/consumer/program`
  - `PUT /api/loyalty/consumer/program` (enable/disable toggle)
- **ConsumerLoyaltyScreen**: program status stat cards; earn/redeem rules summary; fulfillment multiplier summary; enable/disable toggle when `CATALOG_EDIT` | `CATALOG_MANAGE`; read-only hint otherwise; open-on-web footer for full rule editing.
- **Gates**: stack route `ConsumerLoyalty` when `CATALOG_VIEW` (matches web `consumer-loyalty` nav).
- **Discoverability**: More → Guest ordering native **Guest rewards**; removed open-on-web **Guest rewards** row.
- No API contract changes.

## 2026-09-12 — Supplier warehouses + drivers lists (mobile)

### SupplierWarehousesScreen + SupplierDriversScreen

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added `src/types/supplierSettings.ts` with `SupplierWarehouse`, `SupplierDriver`, address formatting, and status/linked-user helpers.
- Added `src/services/api/queries/warehouses.ts` → `GET /api/warehouses`.
- Added `src/services/api/queries/drivers.ts` → `GET /api/drivers?active=false` (includes inactive drivers).
- **SupplierWarehousesScreen**: FlashList of warehouses (name, address, default badge, active/inactive pill); pull-to-refresh; footer open-on-web rows for add/edit and zones.
- **SupplierDriversScreen**: FlashList of drivers (name, phone, active pill, linked-user hint, warehouse name); pull-to-refresh; footer open-on-web for add/edit.
- **Gates**: `SupplierWarehouses` when plan feature `warehouses` + `WAREHOUSES_VIEW` (matches web supplier-settings warehouses tab); `SupplierDrivers` when plan feature `driver_management` + `FULFILLMENT_VIEW` (matches drivers API/list intent).
- **Discoverability**: More → **Supplier settings** native rows **Warehouses** and **Drivers**; removed open-on-web **Supplier settings**; **Zones & rules on web** retained (`/app/supplier-settings?tab=delivery`); team invites open-on-web now deep-links `?tab=team`.
- Create/edit deferred to web (list + open-on-web footers) — driver user linking and warehouse zones remain web-only.
- No API contract changes.

## 2026-09-12 — Supplier contract pricing + restaurant guest ordering (mobile)

### Supplier `ContractPricingScreen`

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added `src/services/api/queries/contractPricing.ts` → `GET/POST/PATCH/DELETE /api/restaurant-pricing` (list with `status`/`q` filters, create upsert, update price, deactivate).
- Extended `src/types/contractPricing.ts` with supplier `ContractPriceRow` types.
- **ContractPricingScreen**: FlashList of restaurant × product contract rows; debounced search; active/all/inactive filters; tap-to-edit price modal; long-press deactivate; create modal (restaurant + product pickers + price) when `CATALOG_EDIT` or `CATALOG_MANAGE`.
- **Gates**: stack route `ContractPricing` when `CATALOG_VIEW` (matches web sidebar); write actions inside screen require `CATALOG_EDIT` | `CATALOG_MANAGE`.
- **Discoverability**: More → Operations **Contract pricing**; removed open-on-web **Contract pricing** row.

### Restaurant guest hospitality admin

- **Mobile implemented** in both mobile repos.
- Added `src/services/api/queries/consumer.ts` and `src/types/consumer.ts`.
- **ConsumerMenuScreen** (`GET /api/consumer/menu`, `POST/PATCH /api/consumer/menu/items`): category sections + item FlashList; stat cards; pull-to-refresh; tap edit name/price; 86 toggle via `isAvailable`; quick add item when categories exist; open-on-web footer for modifiers/QR/import.
- **ConsumerOrdersScreen** (`GET /api/consumer/orders`, `PATCH /api/consumer/orders/:id/status`): status filter chips; order cards with lines and totals; advance status when `ORDERS_MANAGE`.
- Added `src/utils/consumerOrder.ts` for status labels and next-status helpers.
- **Gates**: `ConsumerMenu` when `CATALOG_VIEW`; `ConsumerOrders` when `ORDERS_VIEW` (matches web `sidebarNavConfig` hospitality add-ons).
- **Discoverability**: More → **Guest ordering** section with native **Guest menu**, **Guest orders**, and **Guest rewards**; recipe costing under **Recipes & costing**.
- No API contract changes — uses existing ERP consumer and restaurant-pricing routes.

## 2026-09-12 — Dispute detail screens (mobile)

### DisputeDetailScreen (restaurant + supplier)

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Extended `src/services/api/queries/disputes.ts` with `useDispute(id)` plus mutations: `useReviewDispute`, `useResolveDispute`, `useRejectDispute`, `useCancelDispute` — wired to existing ERP routes (`GET /api/disputes/:id`, `POST .../review|resolve|reject|cancel`).
- Expanded `src/types/disputes.ts` with detail response types and camelCase/snake_case field helpers.
- Added shared `src/features/disputes/DisputeDetailScreen.tsx`: summary, description, line items, credit notes, replacement-order link; supplier actions when `FULFILLMENT_MANAGE`; restaurant cancel when `ORDERS_CREATE` and status `open`.
- **Navigation**: stack route `DisputeDetail` gated on `disputes_returns` + `ORDERS_VIEW` (restaurant) or `FULFILLMENT_VIEW` (supplier); list rows in `DisputesScreen` / `IncomingDisputesScreen` navigate to detail.
- **Notifications**: `notificationNavigation.ts` deep-links dispute alerts to `DisputeDetail` when `referenceId` or `/app/disputes/:id` URL is present.
- No API contract changes.

## 2026-09-12 — Cart preferred delivery date (mobile)

### deliveryDate on checkout (parity with web CartPage)

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Updated `useCreateOrder` in `src/services/api/queries/orders.ts` to accept optional `deliveryDate` (ISO `YYYY-MM-DD`) and `notes`.
- Updated `CartScreen.tsx`: Today / Tomorrow / +2 days chips (default Tomorrow); cutoff hint matching web copy; sends `deliveryDate` on `POST /api/orders`.
- Added `src/utils/deliveryDate.ts` helpers.
- No API contract changes — uses existing order create schema.

## 2026-09-12 — Native My Prices + Reports hub (mobile)

### Restaurant contract pricing list (`MyPricesScreen`)

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added `useMyContractPricing` in `src/services/api/queries/restaurant.ts` → `GET /api/restaurant-pricing/my-pricing` (optional `q`, `supplierId`, `productId` filters).
- Added `src/types/contractPricing.ts` with `MyContractPrice`, summary, and response types.
- **MyPricesScreen**: FlashList of contract lines (supplier, product, your price vs catalog); debounced search; pull-to-refresh; stat cards for line/supplier counts.
- **Gates**: stack route `MyPrices` when `CATALOG_VIEW` **or** `ORDERS_VIEW` (matches web sidebar intent).
- **Discoverability**: More → Orders & sourcing **My prices**; restaurant dashboard quick action; removed open-on-web **My prices** row.

### Reports hub (`ReportsScreen` — restaurant + supplier)

- **Mobile implemented** in both mobile repos.
- Added `src/services/api/queries/reports.ts` and `src/types/reports.ts`.
- **Restaurant** (when `reports` plan feature + `ORDERS_VIEW` | `INVOICES_VIEW`): order volume, spend by supplier, top products via `/api/reports/restaurant/*`.
- **Supplier** (when `reports` plan feature + `FULFILLMENT_VIEW` | `INVOICES_VIEW` | `CATALOG_EDIT`): revenue trend, top restaurants, order volume via `/api/reports/supplier/*`.
- **ReportsScreen**: role-aware tabs; date chips (Last 7 / 30 days); summary StatCards; FlashList rows with text progress bars (no chart library).
- **Navigation**: stack route `Reports` with `withFeatureGate(..., 'reports', ...)` in `RestaurantNavigator` and `SupplierNavigator`.
- **Discoverability**: More → Finance & stock (restaurant) / Operations (supplier); dashboard quick actions; removed open-on-web **Reports** rows.
- No API contract changes — read-only parity with existing ERP report endpoints.

## 2026-09-12 — Restaurant staff members list (mobile)

### StaffScreen (parity with web Staff → Team tab roster)

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added `src/types/staff.ts` with `StaffMember` and helpers (`staffDisplayName`, `staffStatusLabel`).
- Added `useStaffMembers` in `src/services/api/queries/staff.ts` — `GET /api/staff/members`; query key `staffMembers`.
- **StaffScreen**: FlashList of members (display name, role, status pill); pull-to-refresh; empty state; footer **Manage on web** rows for schedule and (when `STAFF_EDIT` | `STAFF_MANAGE` | `STAFF_INVITE`) invites/payroll.
- **Navigation**: stack route `Staff` gated on `STAFF_VIEW` in `RestaurantNavigator`.
- **Discoverability**: More → **People → Staff** native row; **Also on web → Schedule on web** retained for scheduling/payroll (`/app/staff`).
- **Supplier**: `STAFF_*` permissions exist in supplier org roles but team management uses tenant roles / branch invitations (`/app/supplier-settings`), not `/api/staff/*` (restaurant-only API). No `Staff` stack route in `SupplierNavigator`; supplier More → **Team & invites** open-on-web row when `STAFF_VIEW`.
- No API contract changes.

## 2026-09-12 — Supplier product catalog list (mobile)

### SupplierProductsScreen (parity with web `/app/products` list for suppliers)

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added `useSupplierProducts` in `src/services/api/queries/supplier.ts` — reuses existing `GET /api/products` with `includeStock=true`; API auto-scopes to the signed-in supplier tenant (no `supplier` query param needed).
- Added `SupplierProductsScreen.tsx`: FlashList of products (name, SKU, price, stock badge, category); debounced search; pull-to-refresh; up to 100 rows per fetch.
- **Capability level**: **Read-only native list** for all users with `CATALOG_VIEW` | `CATALOG_EDIT`. No in-app PATCH (API product update does not expose price/active toggles on PATCH). Users with `CATALOG_EDIT` | `CATALOG_MANAGE` get tap-to-open-web and a header **Web** shortcut for create/pricing/bulk tools; **Bulk import** remains an open-on-web row in More → Also on web.
- **Navigation**: stack route `SupplierProducts` gated on `CATALOG_VIEW` | `CATALOG_EDIT` in `SupplierNavigator`.
- **Discoverability**: supplier dashboard quick action and More → Operations row **Product catalog**; replaced generic open-on-web **Products** row with native navigate when permitted.
- No API contract changes.

## 2026-09-12 — Restaurant inventory adjust operations (mobile)

### Inventory stock adjustments beyond read-only list

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Extended `src/services/api/queries/inventory.ts` with mutations wired to existing ERP endpoints:
  - `POST /api/restaurant-inventory/add` — add stock (`useAddRestaurantInventory`)
  - `POST /api/restaurant-inventory/adjust` — subtract / waste / count correction (`useAdjustRestaurantInventory`)
  - `PATCH /api/restaurant-inventory/:productId` — set quantity or par (`usePatchRestaurantInventory`; exposed for future use)
- Updated `src/types/inventory.ts` with adjustment/waste types and helpers (`inventoryQuantity`, `inventoryParLevel`); list query normalizes API `quantity` / `low_stock_threshold` fields.
- **InventoryScreen**: tap item (when `INVENTORY_EDIT` or `INVENTORY_MANAGE`) opens `InventoryAdjustSheet` modal — Add stock, Remove stock (count correction), or Log waste (WASTAGE + optional `wasteCategory` and reason). Success/error toasts via `ToastProvider`; React Query invalidates inventory + expiry summary on success.
- No API contract changes — client parity with web `InventoryTab` adjust/add flows.

### ReceivingHub screen (parity with web `/app/receiving` pending tab)

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added `ReceivingHubScreen.tsx`: FlashList of pending receiving orders via existing `usePendingReceiving`; pull-to-refresh; tap opens `Receive` with `orderId`; empty state when queue is clear.
- **Navigation**: stack route `ReceivingHub` gated on `RECEIVING_VIEW` | `RECEIVING_MANAGE` and `receiving_quality` feature gate; `Receive` stack screen retained for single-order confirmation.
- **Discoverability**: restaurant dashboard quick action and More → Orders & sourcing row now open `ReceivingHub` (labeled “Receiving queue”) instead of bare `Receive`.
- No API contract changes — uses existing `/api/receiving/pending-orders`.

## 2026-09-12 — Driver milestone push to linked app user + mobile “Also on web” rows

### Driver-targeted in-app / push on delivery milestones

- **Change (API)**: `notifyDriverDeliveryMilestone` accepts optional `driverId`. When the driver row has `user_id`, the API sends a direct `sendNotification` to that user (`userType: SUPPLIER`) with driver-facing copy (assignment uses “Order #… was assigned to you”; other milestones reuse supplier i18n strings). `driver-fulfillment.service.js` passes `driverId` on assign and status updates.
- **Mobile impact**: No handler changes required — existing ORDER / driver-deliveries deep links apply. Linked drivers with Expo push tokens now receive milestone alerts on assign, out-for-delivery, delivered, and failed.

### Open-on-web portal rows (More tab)

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added `src/utils/webAppUrl.ts` (maps `EXPO_PUBLIC_API_URL` host → web origin: dev/preprod/prod Supplify domains; localhost → Vite `:5173`; fallback `https://app.supplifyerp.com`).
- Added `src/features/shared/OpenOnWebRow.tsx` — opens ERP routes in the device browser.
- **SettingsScreen**: new **Also on web** section (RBAC + plan gates) for restaurant and supplier web-only features not yet native.
- Architecture docs updated: reservations/host desk is native; remaining dense ERP modules listed as open-on-web.

## 2026-09-12 — Mobile More/settings discoverability (RBAC + plan gates)

### Restaurant + supplier More menus and dashboard quick actions

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- **SettingsScreen (More tab)**: Reorganized restaurant links into Workspace / Orders & sourcing / Finance & stock / Host desk sections; supplier links into Operations + Workspace (notifications, prefs, assistant, subscription). Every stack destination is linked when the user has the matching RBAC permission **and** plan feature (mirrors `withFeatureGate` keys in navigators).
- **Dashboards**: Restaurant and supplier home quick actions now include Assistant, Plan & features, Chat (nested tab nav), and Reservations (restaurant); feature-gated rows hide when the workspace plan lacks the feature.
- **Performance**: Default React Query `staleTime` is 60s in `AppProviders`; notification preferences and entitlements queries use 5m `staleTime`.
- No API contract changes — navigation wiring only.

## 2026-09-12 — Restaurant reservations host desk (mobile)

### Host desk for FOH / reservations staff

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added `src/types/reservations.ts` with `ReservationStatus`, `Reservation`, `ReservationTable`, `ReservationWaitlist`, and `ReservationBoardResponse` (ported from ERP web types).
- Added `src/services/api/queries/reservations.ts`: `useReservationBoard`, `useCreateReservation`, `useUpdateReservationStatus`, `useAssignReservationTables`, `useReservationWaitlist`, `usePromoteWaitlist`; query keys in `keys.ts`.
- **Screens**: `ReservationsScreen` (Today/Tomorrow board, status actions via Alert, waitlist promote, 30s refetch) and `CreateReservationScreen` (guest + booking form).
- **Navigation**: `Host` bottom tab (calendar icon) when `RESERVATIONS_VIEW`; FOH-only users land on Host; stack routes `Reservations` / `CreateReservation`; Settings and dashboard quick actions link to reservations.
- **Notifications**: `RESERVATION` deep link already maps to `{ screen: 'Reservations' }` in `notificationNavigation.ts`.
- No API contract changes — uses existing `/api/reservations/*` endpoints.

## 2026-09-12 — Mobile push reliability + notification prefs self-service

### Expo push no longer gated on VAPID

- **Change (API)**: `sendNotification` in `in-app.js` no longer requires `isPushConfigured()` (VAPID keys) before dispatching push. Expo mobile push works when the user has `push_enabled` and the tenant has the `push_notifications` feature; web push still no-ops without VAPID.
- **Change (API)**: `sendExpoPushToUser` now sets `priority: 'high'`, `channelId: 'supplify-alerts'`, and returns `{ sent }` so successful Expo deliveries mark `push_sent` on the notification log (same as web).
- **Mobile impact**: No mobile code change required — improves delivery for already-registered Expo tokens on servers without VAPID configured.

### Notification prefs PATCH is self-service (drivers can save)

- **Change (API)**: `notificationsMutationGuard` allows any authenticated user to `PATCH /preferences` without `SETTINGS_EDIT` / `SETTINGS_MANAGE`. `POST /test` still requires `SETTINGS_MANAGE`.
- **Mobile impact**: Drivers and other low-privilege roles can persist notification toggles from the app.

### Driver notification settings nav fix (mobile)

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`: Driver **More** tab exposes **Notification settings** (see entry below for Driver bottom tab navigator).

## 2026-09-12 — WebSocket real-time chat + Driver bottom tab navigator

### Task 1: WebSocket real-time chat (replaces 15-second polling)

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Added `socket.io-client@^4.8.3` to `dependencies` in both mobile `package.json` files.
- Created `src/services/chatSocket.ts` in both repos: singleton Socket.IO client that authenticates via `Cookie: access_token=<token>; refresh_token=<token>` in the handshake `extraHeaders`, matching the server's `resolveSocketUserFromCookieHeader` middleware.
- `ChatThreadScreen.tsx`: added socket `useEffect` that joins the conversation room (`join_conversation` event), listens for `new_message` and invalidates the `['chat', 'messages', conversationId]` query. Polling interval reduced from 15 s to 60 s (socket handles real-time; polling is fallback).
- `ChatListScreen.tsx`: added socket listener on `new_message` to invalidate `['chat', 'conversations']` so the list stays fresh when any conversation receives a message.

### Task 2: Driver App bottom tab navigator with logout

- **Mobile implemented** in both `supplify-mobile` and `supplify-mobile-ios`.
- Created `src/features/driver/screens/DriverMoreScreen.tsx`: displays driver name/tenant/role, "Notification settings" row (navigates to `NotificationPreferences`), and "Sign out" button. Mirrors `SettingsScreen` styling exactly.
- Rewrote `src/navigation/DriverNavigator.tsx`: top-level `createBottomTabNavigator` with three tabs — **Deliveries** (nested `NativeStackNavigator` containing DriverHome, DriverStop, DeliveryProof, ProblemReport, DriverRunSheet, Assistant, NotificationPreferences), **Run Sheet** (DriverRunSheetScreen), and **More** (DriverMoreScreen). Icons: `car-outline`, `document-text-outline`, `person-circle-outline`. Added `DriverTabParamList`. `DriverStackParamList` retains `DriverRunSheet` for backward compatibility with existing `DriverHomeScreen` navigate calls.

## 2026-09-12 — Web-only UX and legal changes (no mobile impact)

### Task 1: Chat in SupplierMobileNav

- Added Chat (`/app/chat`, `CHAT_VIEW`) to `SupplierMobileNav.tsx`, positioned between Orders and Growth.
- **Mobile skipped**: This is the web responsive mobile-nav bar, not the native Expo app navigation. Native apps manage their own tab bars independently.

### Task 2: Socket.IO WebSocket-first transport

- Changed `transports` order in `apps/web/src/lib/socketOptions.ts` from `['polling', 'websocket']` to `['websocket', 'polling']`.
- **Mobile skipped**: Web-only client configuration. Mobile uses Expo push notifications and its own socket client, unaffected.

### Task 3: Remove full cache invalidation on new_message

- Removed `api.util.invalidateTags(['Chat'])` from the `new_message` handler in `useChatRealtime.ts`. The direct cache upsert is kept.
- **Mobile skipped**: Web-only RTK Query optimization. Mobile has its own state management.

### Task 4: Invite modals — email-sent confirmation

- `RestaurantMemberInviteModal.tsx` and `BranchInviteModal.tsx` step 2 now shows an email-sent confirmation ("Invitation Sent" with CheckCircle2, email address, Done / Invite another person buttons) instead of displaying the invite link with a copy button.
- **Mobile skipped**: Web-only modal UI change. No API contract change; the invitation creation endpoint is unchanged.

### Task 5: InviteEmailMismatchCard — user-initiated logout

- `InviteEmailMismatchCard.tsx` now shows a structured mismatch screen ("You're signed in as / This invitation is for") with explicit "Sign out and continue" and "Cancel" buttons instead of a single auto-described button.
- No auto-redirect on mount was present; this is purely a copy/UX improvement.
- **Mobile skipped**: Web-only invite accept flow. Mobile has its own auth handling.

### Task 6: Legal document updates

- Effective date updated to September 12, 2026 in all four legal docs and `LEGAL_PACK_VERSION` bumped to `2026-09-12`.
- Added real-time messaging, GPS/driver tracking, push notification, Expo platform, and data-rights clauses to TERMS, PRIVACY_POLICY, MOBILE_APP_TERMS, and DATA_PROCESSING_ADDENDUM.
- **Mobile skipped**: Legal markdown files are served from the web app. The `LEGAL_PACK_VERSION` string is used in web legal acceptance payloads only; mobile legal acceptance version is managed separately in each mobile repo.

## 2026-09-12 — Expo push delivery implemented; chat email throttling added

### Expo push notification sending (Task 1)

- **Change**: `apps/api/src/services/push.service.js` now actually sends Expo push notifications. `sendExpoPushToUser` iterates over all `expo:*` rows in `push_subscriptions` for a user and fires them via `expo-server-sdk`. Stale `DeviceNotRegistered` tokens are deleted immediately on receipt of a failing ticket.
- `apps/api/src/services/notification/push.js` `dispatchPushNotification` now calls both `sendWebPushToUser` (browser) and `sendExpoPushToUser` (mobile) fire-and-forget in parallel.
- **Mobile impact**: The mobile apps already register tokens and already handle push payloads — no mobile code change needed. This change makes the server start acting on registrations that were previously silently ignored.
- **`expo-server-sdk@^3.7.0`** added to `apps/api/package.json` dependencies.

### Chat email throttling (Task 2)

- **Change**: `notifyMessageReceived` in `apps/api/src/services/notification/templates.js` now fans out per-user instead of calling `notifyTenantUsers`. For each recipient: (a) if the user has an active Socket.IO connection (`user_<id>` room has size > 0), email and WhatsApp are suppressed; (b) if offline, a Redis `SET NX EX 7200` atomic check enforces a 2-hour email rate-limit per user (`chat_email_throttle:<userId>`). Push and in-app notifications are always delivered.
- **Mobile impact**: None — this is a server-side email delivery optimization. Mobile already receives push notifications through the push dispatch path; no payload or contract change.

## 2026-09-12 — Mobile EAS profiles: distinct development / preprod / production

- **Change**: Both `supplify-mobile` and `supplify-mobile-ios` `eas.json` now bake three hosted backends — `development` → `api-dev` / `keycloak-dev` / realm `Supplify`; `preprod` → preprod hosts; `production` → prod hosts. Previously `development` incorrectly pointed at preprod.
- **Git**: iOS repo gains `preprod` and `prod` branches (same promote path as Android + ERP).
- **Docs**: `KEYCLOAK_MOBILE_CLIENT.md` table updated.

## 2026-09-12 — Restaurant delivery location unsavable on mobile (both apps)

- **Symptom**: Saving the restaurant delivery pin from the mobile app always failed with `No delivery location fields to update`, and the form rendered blank even when a pin was already stored.
- **Root cause (mobile)**: `DeliveryLocationScreen` / `useUpdateDeliveryLocation` sent `{ latitude, longitude, label, addressNotes }`, but `PATCH /api/restaurants/me/delivery-location` reads `deliveryLatitude` / `deliveryLongitude` / `deliveryLocationLabel` / `deliveryAddressNotes`. No key matched, so `parseDeliveryLocationInput` rejected every request. Separately, `useDeliveryLocations` typed the response as `{ locations: [...] }` with an `isPrimary` flag, but the API returns `{ restaurant, branches }` with `delivery*` field names — so hydration silently read `undefined` and the form never populated. Web was unaffected because it already used the camelCase contract.
- **Fix (mobile, both repos)**: `DeliveryLocation` retyped to mirror `mapDeliveryLocationRow()`; added `DeliveryLocationsResponse` and `DeliveryLocationUpdate`; the screen now hydrates from `data.restaurant` and sends the `delivery*` keys. Added `useUpdateBranchDeliveryLocation` for the existing branch endpoint (not yet surfaced in the UI).
- **Fix (API, backward compatibility)**: `parseDeliveryLocationInput` now resolves each field through an alias list — camelCase, snake_case, and the bare `latitude` / `longitude` / `label` / `addressNotes` shape — so **already-installed EAS builds start saving without a rebuild**. First defined alias wins; explicit `null` still clears coordinates. Covered by `apps/api/src/services/restaurant-delivery-location.service.test.js` (12 tests).
- **Live tracking audit**: Driver GPS ingest (`POST /api/orders/:id/location`), tracking read (`GET /api/orders/:id/tracking`), `buildTrackingPayload` → `DeliveryTrackingInfo`, and the restaurant/supplier tracking responses were checked field-by-field against both mobile type definitions — these already match; no change needed.
- **Deploy**: API to dev / preprod / prod. Mobile picks up the corrected contract on the next EAS build or Expo update; the API aliases cover builds already in the field.

## 2026-09-12 — Chat messages invisible on mobile (web→app)

- **Root cause (API)**: `apps/api/src/routes/chat/conversations.js` imported socket from `../lib/socket.js` (missing). Realtime `new_message` / read-receipt emits failed on every send (`Cannot find module .../routes/lib/socket.js`). Fixed to `../../lib/socket.js`.
- **Root cause (mobile)**: API returns message `content` and conversation `last_message_preview`; mobile UI read `body` / `last_message`, so threads looked empty even after refresh while in-app notifications still worked. Both Android and iOS now normalize API shapes; send uses `{ content }` (API also accepts `body` alias).
- **Deploy**: Ship API to **dev / preprod / prod**. Mobile needs a new EAS build (or Expo update if JS-only) to pick up the field mapping.
- **Note**: Push channel for chat was `push:false` in preprod logs (in-app only) — separate from this display bug.

## 2026-09-12 — Preprod incident hardening applied to prod

Issues found on preprod and verified/fixed on **production** so they do not recur:

| Issue                                                  | Prod status                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Missing `supplify-mobile` client / redirect variants   | Present; redirects include `supplify://`, triple-slash, package-id; login form OK |
| Broken `supplify-browser-email-otp` flow               | Re-applied; Cookie + forms + email-otp REQUIRED                                   |
| `KC_HOSTNAME` / issuer mismatch                        | `keycloak.supplifyerp.com` / issuer OK                                            |
| Web blank page (`VITE_KEYCLOAK_URL` empty)             | Railway web vars synced; baked bundle has Keycloak URL + `supplify-prod`          |
| OTP from-domain unverified (`preprod.supplifyerp.com`) | Prod already `noreply@supplifyerp.com` (verified)                                 |
| API `KEYCLOAK_CLIENT_SECRET` ≠ Keycloak `supplify-api` | **Fixed** — regenerated + Railway API updated + redeployed                        |
| OTP mail URL/secret wiring                             | `SUPPLIFY_OTP_MAIL_URL` + secrets match API                                       |

- **Mobile code**: release builds hardcode `supplify://auth/callback` (both Android/iOS) so Keycloak never sees wrong redirect variants.
- **Note**: prod `registrationAllowed=false` (invite/admin create only) — unlike preprod self-signup. PENDING users still must finish `/register/complete` on web before mobile.

## 2026-09-12 — Keycloak mobile client + EAS preprod alignment

- **Keycloak**: Added public client `supplify-mobile` (PKCE, `supplify://auth/callback`, post-logout `supplify://auth/logout`) to `deploy/keycloak/realm-export.preprod.json` and `realm-export.prod.json`. Partial-imported into live `keycloak-preprod.supplifyerp.com` / `keycloak.supplifyerp.com` so mobile login no longer returns "Client not found". Verified: auth without PKCE returns `code_challenge_method` error to the app scheme (client present).
- **iOS EAS**: Aligned `supplify-mobile-ios/eas.json` with Android — `preprod` / `preview` / `ios-simulator` / `production` bake `EXPO_PUBLIC_*` API + Keycloak URLs and `supplify-mobile` client id (`220ff61`).
- **Builds**: Android `preprod` APK queued from tip `227435b`: https://expo.dev/accounts/supplify-team/projects/supplify-mobile/builds/01c5457b-7631-4638-9407-21532c2a1302 . iOS `ios-simulator` queued from tip `220ff61`: https://expo.dev/accounts/supplify-team/projects/supplify-mobile-ios/builds/90b35052-5866-40f8-b7f3-b98fcae78497 . iOS **device** `preprod` blocked in non-interactive mode (no Ad Hoc / internal-distribution credentials); run `eas credentials -p ios` then `eas build -p ios --profile preprod` locally once.
- **Docs**: `deploy/railway/*/KEYCLOAK_CLIENT.md` now list `supplify-mobile`; this parity entry records the live sync.

## 2026-09-12 — Android/iOS release audit

- **iOS parity fix**: Restored the empty src/features/supplier/screens/SupplierPromotionsScreen.tsx from the synchronized Android implementation; SupplierNavigator now typechecks on iOS.
- **Shared test fix**: Replaced the unsupported dynamic import of PaymentRequiredError with a static import in both mobile API client tests.
- **Performance**: Catalog product rows in both native repos now use a memoized product-id-to-cart-quantity map instead of scanning the cart for every rendered row, reducing catalog render work from O(products × cart items) to O(products + cart items).
- **Expo/runtime alignment**: Updated both apps to Expo SDK 56 patch-compatible packages; Expo Doctor passes 18/18 checks on Android and iOS.
- **Verification**: Both repos pass sc --noEmit, 19 Jest suites / 65 tests, and static Android/iOS Expo exports. No Xcode or emulator was run.
- **Security note**: npm audit reports 0 high, 0 low, and 17 moderate upstream tooling advisories, now limited to the Expo/xcode/uuid and React Navigation/query-string chains; the patched Metro 0.84.5 override removes the Metro/image-size high findings. Forcing Expo 46 or unsupported major navigation/uuid substitutions would be breaking and was intentionally not applied.

## 2026-09-11 — Production readiness audit

- **Web/API**: Fixed release-gating web regressions (cart price-resolution effect dependency, reservation test mock, address shape assertions, and Arabic locale key/interpolation parity). Added patched production dependency overrides for high-severity advisories (`socket.io-parser`, `fast-uri`, `brace-expansion`, `nanoid`, `sharp`, `nodemailer`) plus compatible `qs`, `uuid`, and `react-router-dom` updates.
- **Mobile**: Skipped — these are web/API dependency, localization, test, and performance-hygiene changes with no mobile API contract, auth, RBAC, notification, feature-flag, or fulfillment behavior change.
- **Verification**: Web typecheck, lint, full suite (128 files / 468 tests), and production build pass. High- and moderate-severity production dependency advisories are clear after upgrading React Router to 7.18.2 and pinning the patched PostCSS selector parser. Full CI passes (API plus 128 web test files / 468 tests), and the production build passes; local Redis/PostgreSQL-backed runtime smoke checks remain environment-gated.

## 2026-09-10 — Docs & QA readiness (manual QA kickoff)

- **Docs**: `docs/qa/regression-checklist.md` extended with 2026-09-10 smoke pack (hospitality, last-order/contract pricing, promotions ad billing, quote inbox v2, FUL POD/multi-WH, RBAC-X, branded 404/500). SETUP-03/NFR-09 migration baseline through `0203`. `testing-guide.md` + `test-coverage-report.md` file counts refreshed (~293 API / ~126 web). Quote supplier routes fixed in `quote-requests.md`. Broken RBAC QA report link retargeted to checklist RBAC-X. Parity log merge corruption in prior web bullet repaired.
- **Mobile:** skipped — documentation and automated test inventory only; no client contract change in this pass.

## 2026-09-10 — Supplier fulfillment, driver, quote inbox & customer growth hardening

- **Fulfillment (API)**: Route mutations now invalidate the 45s dispatch cache (create / add stops / remove stop / update / activate / cancel / build-from-assignments / manual rollover / rollover job) — the dispatch board previously kept showing an order as unassigned for up to 45s after a driver had been routed. `syncDriverAssignment` stamps `scheduled_delivery_date` from the **route's** date instead of `CURRENT_DATE`, so a route planned for tomorrow is no longer treated as overdue by tonight's rollover job. Removing a stop, cancelling a route (`DELETE /routes/:id` **and** `PATCH` with `status=CANCELLED`) and `releaseOrderFromPlannedRoutes` now release the `assigned` driver legs they used to orphan — those legs kept the order sitting in the dispatch board's "assigned" bucket under a driver with no route.
- **Driver (API)**: `reassignDriver` carries `scheduled_delivery_date` forward (it inserted NULL, dropping the order out of the rollover partial index and out of the driver's today list) and deletes the stale stop from the previous driver's live route. Proof of delivery is now **one row per order** (migration `0200`: dedupe + unique index, service uses `ON CONFLICT (order_id) DO UPDATE` with `COALESCE`), so a driver retrying on a flaky connection no longer stacks duplicate proofs that readers picked from arbitrarily. POD submit invalidates the dispatch cache (`has_pod`). POD submit and restaurant POD confirm map `ValidationError` / `ForbiddenError` / `NotFoundError` to 400/403/404 instead of a blanket 500. An empty POD (no photo, no signature, no recipient name) is rejected.
- **Driver management (API)**: `warehouse_id` is verified to belong to the calling supplier on **create and patch** — create only checked existence and patch validated nothing, so a supplier could attach a driver to another tenant's warehouse. The deactivation guard now also counts `rescheduled` legs, and deactivating a driver cancels their `PLANNED` routes (which no one could otherwise start). `DELETE /api/drivers/:id` was an unguarded async handler, so any throw left the request hanging — now wrapped. `PATCH` maps Zod/Validation errors to 400 instead of 500.
- **Quote inbox (API)**: New `POST /api/quote-requests/supplier/inbox/:id/decline`. `declined` was already a valid `quote_request_suppliers.status` but no code path could set it, so a request the supplier could not serve stayed `pending` forever with the restaurant waiting on it. Responses to a closed or cancelled RFQ are now refused. The inbox status filter accepts only supplier-side values (the restaurant-side `open`/`closed`/`cancelled` silently matched nothing), and the endpoint gained `search`, `sort` (`newest` / `oldest` / `needed_by`), whole-inbox `counts` (including unread and urgent) and `viewed_at` read tracking (migration `0202`, which also adds `decline_reason`). `neededBy` is validated as an ISO date — an arbitrary string reached Postgres as a 500.
- **Customer growth (API)**: The sponsorship funnel's `offersCreated` now counts every offer; it counted only rows still sitting in `offered`, so the number shrank as offers were accepted and `offersAccepted > offersCreated` was possible. Added `offersOpen` for the awaiting-reply count. The customer-import error-report CSV is built from client-supplied text and downloaded into Excel/Sheets — every cell is now quoted and leading `=`, `+`, `-`, `@`, TAB and CR are neutralised against formula injection. Prospect and sponsorship `limit`/`offset` are clamped (a negative offset made Postgres throw and surfaced as a 500), and prospects gained `search` across name, email, phone and contact person.
- **Web**: Quote inbox rebuilt — status tabs with live counts, debounced restaurant search, sort control, urgency badges (overdue / due today / due in N days), unread markers, inline decline, and pagination. The response page now locks with an explanation when `canRespond` is false, refuses to submit a line marked available with no unit price, and offers decline. The growth page renders the sponsorship funnel that the API had always returned but nothing displayed, and formats revenue through `formatCurrency` instead of string-concatenating a currency code. The POD dialog disables save until there is a photo, a signature or a recipient name, matching the new server rule.

- **Mobile (Android + iOS)**: **Implemented in both repos.** `SupplierQuoteInboxEntry` gains `declineReason` / `viewedAt` / `respondedAt`; new `SupplierQuoteInboxCounts` and `SupplierQuoteInboxResponse`; `SupplierQuoteRequestDetail` gains `canRespond` / `quoteRequestStatus` / `declineReason` / `createdAt`. `useSupplierQuoteInbox` takes typed `status` / `search` / `sort` and returns the counts envelope; new `useDeclineSupplierQuoteRequest`. The supplier quote inbox screen gained status tabs with counts, search, urgency and unread affordances, and a confirmed decline action. The driver POD flow already required a photo before confirming, so the new empty-POD rejection is compatible with both apps unchanged.
- **Verification**: `apps/api` full suite 1586 passed / 4 failed — all 4 failures (`register-cron-jobs`, `assistant.routes`, `auth.routes`) belong to a concurrent session's in-flight reservations/assistant work, none touch these files. Web: the affected suites pass (quote inbox 5, fulfillment 17) and every file changed here typechecks clean. Android `tsc --noEmit` passes; iOS reports one unrelated pre-existing `SupplierPromotionsScreen` export error from that same concurrent promotions work.
- **No new env vars, feature keys, permission keys or roles** — decline reuses `ORDERS_MANAGE`, the inbox reuses `ORDERS_VIEW`.

## 2026-09-10 — RBAC + supplier warehouse dispatch correctness

- **RBAC (API)**: Restaurant finance invoice/statement/expense routes now require `INVOICES_VIEW`; restaurant deals routes require `ORDERS_VIEW` or `CATALOG_VIEW`. Tenant Owner permission list includes `RECIPES_*`. Org Owner `"ALL"` resolves via the same `getAllPermissionsForTenantType()` as tenant Owner. API `requirePermission` / `requireAnyPermission` Owner bypass aligned with web (`Owner`, `Org Owner`, legacy owner codes). Manage-wildcard parity for `_SEND` / `_IMPORT` / `_VIEW_COSTS`. Assistant router gated by `ai_platform` + baseline workspace view permissions; assistant tools use `rolesIncludeOwner`. Restaurant tracking/POD/confirm require `ORDERS_VIEW`/`RECEIVING_*`/`ORDERS_EDIT`. Price mutations require `CATALOG_EDIT`.
- **RBAC (web)**: Quote routes, dashboard, command center, run sheet, driver deliveries, fulfillment, inventory wrapped with `RequirePermission`.
- **Warehouses (API+web)**: Single-WH Silver (`warehouses` feature) now enters warehouse inventory mode (not only Gold `multi_warehouse`). Default warehouse assignment skips inactive IDs (including stale `default_warehouse_id` fallback). Manual assignment dispatch commits reserved stock + supplier ownership check. Atomic warehouse reassignment (release old + reserve new). Multi-WH driver assign creates one driver leg per open warehouse assignment; delivery/fail is per-leg (order DELIVERED only when all legs terminal). Zone routing fail-closed with postal/radius/polygon matching; routing rules skip inactive warehouses. PATCH deactivate / set-default require active WH. Dispatch board exposes warehouse badge; warehouse list returns stock aggregates + inventory lines; set-default wired in settings UI; routing simulate accepts postal / empty items; picking tab shows assigned warehouse.
- **Mobile:** **Android + iOS updated** — `DispatchOrderCard` includes warehouse fields; fulfillment dispatch cards show dispatch warehouse. Optional follow-up: driver assign body may include `warehouse_assignment_id` / `assign_all_warehouse_legs` and response may return `assignments[]` for multi-WH; existing single-`assignment` clients remain compatible. Mobile already consumes `tenantPermissions` from `/auth/me` (Owners now correctly include recipes).

## 2026-09-10 — Hospitality excellence (reservations + supplier last-order)

- **Reservations (API+web)**: `NO_SHOW` status; guest CRM-lite; occasion/allergies/source; blackouts; booking policy meta (party limits, cancel window, deposit policy); T-24h/T-2h reminders + review invites cron; reservation-linked reviews (`restaurant_reviews.reservation_id`) with staff reply inbox; public manage review flow.
- **Supplier last-order (API+web)**: `last_order_mode` none|cutoff with absolute time or minutes-before-window + rollover days; cart `deliveryDate` persisted as `customer_order.requested_delivery_date` after rule resolution; supplier Business settings UI.
- **Guest menu (API+web)**: allergen + dietary tags (`0201`), dietary filters, QR download/share on MenuAdminPage, badges on MenuItemCard.
- **Staff/kitchen**: 86 (mark unavailable) from guest-order kitchen board (`ConsumerOrdersPage`) when `CATALOG_EDIT`.
- **Mobile:** **skipped for now** — FOH reservations and public booking remain web+portal; B2C guest menu has no mobile diner app; supplier last-order is a new contract mobile checkout must adopt (`deliveryDate` + surface rolled delivery) before live cutoffs on mobile. No native host/guest reservation surface yet. Follow-up required on both Expo repos when enabling mobile ordering cutoffs.

## 2026-09-10 — Promotion ad disputes + create preview + featured pay UX

- **API**: Stripe webhook `POST /webhooks/stripe` for chargebacks; `handlePromotionAdDisputeByProviderPaymentId` pauses boosts / cancels featured; migration `0203` adds `disputed` payment statuses.
- **Web**: Pay-activation + featured purchase send `idempotencyKey`; deal create dialog shows restaurant-facing preview; admin featured panel Refund; featured panel Pay now for pending.
- **Mobile**: **skipped** — Android/iOS already send idempotency keys on pay/purchase; dispute handling is server webhook-only; create-preview is web-only UX. No native contract change.

## 2026-09-10 — Audience targeting correctness (types + areas)

- **API**: Shared `restaurant-targeting` helpers normalize business types (legacy `restaurant` → `casual_dining`), match areas against city/area/region/street/delivery label, and copy deal targeting into boost `target_audience` on publish. Restaurant create/update persist `business_type` (normalized) and `address.area`.
- **Web**: Restaurant Business profile saves business type + area/neighborhood; deal targeting pickers use the same canonical type list.
- **Mobile (Android + iOS)**: Create-deal screens already send `targetRestaurantTypes` / `targetAreas` with the same canonical types. Restaurant profile edit for type/area remains **web-only** (mobile delivery location screen does not own business taxonomy); no native change required this pass beyond existing create-deal audience UI.
- **Docs**: `docs/features/deals-and-promotions.md` targeting section updated.

## 2026-09-10 — Supplier promotions ad billing (boosts + featured)

- **API**: Boost pay-activation and featured placement purchase now create `billing_invoice` rows (`deal_boost` / `featured_placement`), charge via gateway with `billing_payment.invoice_id`, and refuse silent waive when `PAYMENTS_MODE=live`. Stripe registers when `STRIPE_SECRET_KEY`/`PAYMENTS_SECRET_KEY` is set. Admin mark-paid + refund endpoints for boosts; featured pay + admin refund. Admin insights expose real ad spend. Deal analytics include `adSpend` / `attributedGmv` / `roas` / `costPerOrder`.
- **Web**: Admin Deals insights show ad spend / order GMV / open ad invoices; Mark paid + Refund boost actions. Supplier create flow targets restaurant types + areas; analytics dialog and performance summary show ROAS.
- **Mobile (Android + iOS)**: Implemented supplier Deals & boosts stack — list/pay-activation (402 `PaymentRequiredError` distinct from account lock), create deal with `targetRestaurantTypes`/`targetAreas`, analytics ROAS fields, featured purchase/pay. Dashboard quick action + `promotions` feature gate. Track enabling `PAYMENTS_MODE=live` only after Stripe keys + payment method on file.

## 2026-09-09 — Contract prices always win for the restaurant

- **Correctness (API)**: Scheduled quick-list order creation now uses `resolveProductPricesBatch` (same as checkout) and snapshots `pricing_source` / `contract_price_id` / `default_catalog_price` on `order_item`. Catalog list price no longer bills restaurants with active contracts.
- **Web**: Cart re-resolves all lines after rehydrate so stale localStorage catalog prices cannot stick; supplier detail product cards use `ContractPriceDisplay` (“Your price” + strikethrough list).
- **Mobile (Android + iOS)**: Product types include `pricing_source` / `catalog_price`; catalog badge shows **Your price** only when `pricing_source === 'CONTRACT_PRICE'` (was incorrectly shown for every priced SKU); cart calls `POST /api/restaurant-pricing/resolve` on open and labels contract lines.
- **Verification**: `scheduled-orders.service` contract-price unit test; mobile typecheck expected after client updates.

## 2026-09-07 — Branded 404/500 pages, broken-link fixes, admin analytics correctness

- **Web UX**: New Supplify-branded 404 (`*` catch-all) and 500 (router `errorElement`) pages (`apps/web/src/pages/ErrorPages.tsx`), EN+AR. `LegalFooterLinks` now i18n'd via `Trans` (was hardcoded English). Privacy policy already existed at `/legal/privacy_policy`.
- **Broken links (web)**: notification fallback `/app/notifications` → `/app`; stale Header title-map entries removed; reorder-assistance and expiry links retargeted to `/app/restaurant-inventory`; deep-link params wired (`/app/orders?restaurant=`, `/app/products?supplier=`, `/app/fulfillment?tab=`, `/app/restaurant-inventory?tab=`); tenant-aware upgrade CTA in AssistantFab; SPA `Link`/`navigate` instead of full reloads; hash-anchor scrolling added in Layout.
- **Admin analytics (API+web)**: MRR/ARR count ACTIVE only and include yearly-only plans; subscription counts wired to correct columns; reservations week bounded; health `recentApiErrors` limited to 24h and past-due billing downgraded to Degraded; conversion-stats window key reflects `days`; audit limit/offset clamped and UTC-consistent date bounds; tenant lists deduped via LATERAL; usage-meter over/near-limit restricted to current period; `/admin-dashboard/subscriptions` paginated (default 200, cap 500); promotions `/admin/pending` LIMIT 100 and `/admin/deals/insights` 90-day window + 180s cache; finance top-tenants include suppliers with tenant names (camelCase).
- **Mobile:** skipped — admin dashboard has no mobile surface; link/error-page changes are web-only UI. No shared type or client-contract changes affecting mobile.

## 2026-09-07 — Public endpoint perf pass (caching, parallel queries, indexes)

- **Perf (API)**: `columnExists` results cached per process; public supplier catalog column checks and products/count/categories queries parallelized; `Cache-Control` added to anonymous public GETs (restaurant/supplier profiles, public products, resolve-host, consumer menu); `/uploads` static served with 1y immutable; migration `0196` adds `product (supplier_id, name)` and `(supplier_id, category)` indexes.
- **Perf (web)**: Vite es2022 target + prod console strip, React Query defaults (60s staleTime, no focus refetch), nginx gzip level 6 + no-cache index.html; RegisterComplete/LegalReaccept/Invite/BranchInvite pages, ConsumerShell, and the custom-domain catalog page moved out of the eager bundle (lazy chunks); `loading="lazy" decoding="async"` on list/grid images; logo `fetchpriority=high`; `ProductCatalogRow` memoized.
- **Mobile:** skipped — no API contract, auth, RBAC, or type changes; response bodies unchanged (headers only). Mobile clients benefit transparently from HTTP caching.

- **Correctness**: Restaurant create accepts only `DRAFT`/`PLACED`; stock reserved only for `PLACED`; checkout requires follow/prior-order (parity with product detail); WH-mode inventory list is product-anchored (includes WH-only SKUs).
- **Perf**: Supplier low-stock dashboard preview uses SQL LIMIT 3 (no full catalog scan); dashboard summary cache invalidated on order create.
- **Mobile:** Cart already sends `status: 'PLACED'`. New validation errors if ordering from unfollowed suppliers — no type/shape change required. Android/iOS source unchanged this pass.

## 2026-09-02 — In-stock catalog page fill

- **Correctness**: `GET /products?inStock=true` scans ahead with authoritative stock overlay so offset pages fill to `limit` instead of shrinking after post-filter.
- **Mobile:** skipped — mobile catalog uses `includeStock`, not `inStock` filter; server pagination semantics only.

## 2026-09-02 — Checkout blocklist + catalog/dashboard/fulfillment correctness

- **Correctness**: Restaurant checkout rejects blocklisted suppliers; product list hides blocklisted suppliers; restaurant dashboard `totalProducts` scoped to followed/non-blocked; fulfillment `deliveredToday` counts distinct orders (no route+PoD double-count).
- **Perf/hardening**: Notification list cache invalidates all pages via prefix; mark-read requires `user_type`; product COUNT skips price LATERAL unless price filters apply.
- **Mobile:** skipped — server enforcement/metrics only; response shapes unchanged (blocklist now matches search/detail).

## 2026-09-02 — Chat unread correctness + notification/email health cuts

- **Correctness**: Deal-message path uses `getOrCreateConversation` (participant backfill); per-message read decrements `conversation_participant.unread_count`; support initial message uses tenant `sender_id` so unread does not self-increment.
- **Perf**: Notification list reuses shared unread COUNT cache; admin email 24h stats + health failures cached 60s (overview/summary/health share).
- **Mobile:** skipped — server-side chat/notification/admin fixes; response shapes unchanged.

## 2026-09-02 — Supplier profile LATERAL stats + admin conversion query cut

- **Correctness**: `GET /suppliers/:id/statistics` excludes DRAFT/CANCELLED from order count; spend and AOV use delivered line totals only.
- **Perf**: Supplier-by-id product_count/avg_price via LATERAL (aligned with catalog list); admin `conversion-stats` collapses ~10 scans into windowed event counts + top feature/limit queries.
- **Mobile:** skipped — no mobile client uses supplier statistics; conversion-stats is admin-only.

## 2026-09-02 — Supplier restaurants stats + search blocklist + invoice detail

- **Correctness**: Supplier restaurant list aggregates order/spend via supplier line items; search products honor blocklist; invoice detail uses LATERAL paid sum (no payment JOIN+GROUP BY).
- **Perf**: RestaurantsPage drops 1000-order includeItems fetch; search suppliers use LATERAL product_count.
- **Mobile:** skipped — web supplier cockpit / search / invoice detail paths.

## 2026-09-02 — Quote list aggregates + checkout feature dedupe + test repair

- **API**: Quote request lists use LATERAL count aggregates; checkout dedupes `multi_warehouse` feature resolve by billing tenant.
- **Tests**: Products inStock/detail and supplier command-center mocks aligned with warehouse stock SoT.
- **Mobile:** skipped — no mobile client contract change.

## 2026-09-02 — Restaurant detail correctness + supplier/invoice list perf

- **Correctness**: Public catalog branding gate now calls `isFeatureEnabled(tenantId, tenantType, featureKey)` with correct arg order. Restaurant detail loads one restaurant + restaurant-scoped orders; supplier revenue uses line totals for that supplier only.
- **Perf**: Supplier catalog list uses LATERAL aggregates (product_count/avg_price/featured) instead of correlated subqueries; invoice list uses LATERAL payment sum (no JOIN+GROUP BY).
- **API**: Orders list accepts optional `restaurant` UUID filter for supplier/admin scopes.
- **Mobile:** skipped — restaurant detail over-fetch and supplier browse/invoice list are web cockpit paths; additive `restaurant` order filter unused by mobile.

## 2026-09-02 — Reorder suggestions + deal detail + Quick Lists fetch cuts

- **API**: `GET /restaurant-inventory/reorder-suggestions` rewritten to candidate filter + aggregated movement CTEs (no per-SKU correlated scans); LIMIT 50; prefer order-item last qty for suggestions.
- **API**: `loadDealDetailForRestaurant` loads one deal by id instead of scanning the full boosted catalog.
- **Web**: Quick Lists product picker loads only when dialog opens (`limit: 50` + server `q`).
- **Mobile:** skipped — dashboard reorder widget / deal detail / Quick Lists picker are web cockpit paths; mobile inventory/reorder screens unchanged.

## 2026-09-02 — Client MOQ/pack cart UX + amendment stock/totals

- **API**: Product list/detail expose `moq`, `order_multiple`, `supplier_minimum_order_amount`. Accepted order amendments release then re-reserve stock and preserve promotion discounts when recalculating totals. Supplier low-stock dashboard/command-center use warehouse-aware `listSupplierStockDisplay`.
- **Web**: Shared `orderQuantityRules` snaps cart qty to MOQ/pack; cart validates before place; catalog add defaults to MOQ.
- **Mobile (Android + iOS)**: Same rules in cart store, CatalogScreen MOQ hints, CartScreen step/validate before checkout. Types extended on `Product`.

## 2026-09-02 — Documentation currency audit (ERP docs only)

- **Docs**: Refreshed living onboarding, RBAC, feature catalogs, env/ops, API route inventory, and strategy count claims against current code (`permission-keys.js` 56 keys, `feature-keys.js` 27/26, 196 migrations, 657 discovered routes).
- **Mobile:** skipped — documentation-only; no API, auth, RBAC, or client-contract change.

## 2026-09-02 — Catalog stock authority + inventory list filters

- **Bugfix**: Product catalog/detail stock now overlays warehouse inventory when multi-warehouse is active (fail-closed: missing WH row → 0), matching checkout authority.
- **Perf**: Restaurant inventory list supports server-side `q` / `status` / `supplierId` / `category` + pagination + summary counts; web InventoryTab no longer loads 500 rows to filter client-side.
- **Admin**: Overview extras reuses parent health errors instead of a duplicate health fetch.
- **Mobile**: API additive query params only; default list behavior unchanged. Optional follow-up to pass filters from mobile inventory screens. Android/iOS source unchanged this pass.

## 2026-09-02 — Speed + correctness hardening (API)

- **Security**: Parameterized restaurant finance `/expenses` period filter (removed SQL string interpolation).
- **Checkout correctness**: Order create now enforces product MOQ / pack multiples and supplier `minimum_order_amount` server-side (`order-quantity-rules.js`). Mobile already surfaces API `ValidationError` messages; optional client-side MOQ UX can follow without contract change.
- **Performance**: Supplier order list rewritten to `EXISTS` (no `DISTINCT` item joins); unscoped catalog stock uses `LATERAL` inventory; entitlements usage refresh window raised to 180s; dispatch board bucket limit 200 + cache invalidation on driver assign/status/reassign; grace-period account lock now invalidates subscription caches; legacy stock release batched via `unnest`; web Orders list no longer embeds line items.
- **Mobile action**: No API client shape change required. Confirm cart/checkout screens display the new validation messages. Android/iOS source unchanged this pass.

## 2026-08-21 — Production ship hardening (web/API pass)

- **API/Web**: RBAC tenant checks, warehouse stock source-of-truth/fail-closed ordering, deal-boost payment activation through the existing stub/manual gateway, and settings dead-button cleanup.
- **Mobile**: Deferred by explicit request for this pass. Android and iOS repositories were not changed; mobile parity follow-up is required before adding mobile deal-boost payment UI or relying on the tightened tenant behavior.
- **Safety**: Sponsorship, featured placement, invoice payment, subscription checkout, and gateway providers remain unchanged.

## 2026-08-21 — Transactional email redesign (API-only)

Stripe-like shared email layout, OTP code hero, optional detail strips, and EN/AR copy polish for high-traffic templates (`layout.js` / `registry.js` / `emails.json`).

- **Mobile:** skipped — emails are server-rendered by the API; no mobile client contract change.

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

## 2026-09-14 - Chat composer focus and keyboard behavior

- Web chat keeps the message textarea focused when sending with the mouse and keeps it focusable while a send/upload is in progress, so the cursor does not disappear from the composer.
- Android and iOS chat threads now apply keyboard avoidance on both platforms so the composer moves above the software keyboard. Android continues to use the native softwareKeyboardLayoutMode resize setting.

## 2026-09-14 - Customer growth and AI hardening

- Fixed supplier customer CSV parsing for quoted commas, escaped quotes, BOMs, and multiline fields.
- Customer matching now processes imports with bounded concurrency to reduce large-import latency without unbounded database load.
- Sponsorship offers now carry and validate the supplier-selected plan code; duplicate sponsorship actions are disabled while a request is pending, and supplier-scoped transaction locking protects yearly limits/idempotency during concurrent retries.
- AI tool capability checks and independent tool calls run concurrently, and reorder AI capability resolution avoids duplicate feature-flag lookups.
- Android and iOS customer-growth screens remain metric/prospect views and open the web workflow for import/invite/sponsor; both mobile growth type contracts now document the optional sponsorship plan code.

## 2026-09-14 - Admin dashboard hierarchy and density refresh

- Web-only admin UI refresh: the platform overview now removes repeated KPI cards, prioritizes attention/activity/quick actions, and collapses operational, subscription, and growth detail until requested.
- The admin sidebar keeps all existing destinations but collapses billing and growth groups by default, reopening the active group automatically.
- No API, permissions, notification behavior, or mobile client contract changed; Android and iOS require no code changes.

## 2026-09-14 - Supplier organization fulfillment routing and idempotent checkout

- Restaurant checkout now sends an explicit restaurant delivery branch when multiple active operational locations exist; one active branch remains backward-compatible and ambiguous locations fail closed with a structured DELIVERY_LOCATION_REQUIRED error.
- Android and iOS cart flows send the same branch/delivery contract and retain a placement key across retries. The API enforces database-backed restaurant-scoped idempotency, replay, payload mismatch rejection, and transactional rollback behavior.
- The API consolidates supplier discovery at the organization level without merging tenant-specific products, then routes new non-split baskets through the compatible supplier tenant to one tenant-owned warehouse. Existing line-level assignments remain readable.
- Supplier reassignment now has matching Android/iOS warehouse API contracts and web controls; server checks tenant ownership, organization/branch scope, status, stock, service zones, immutable financial snapshots, reason, audit event, and transfer notification.
- Both mobile repositories were updated and typechecked for the shared order, supplier, warehouse, notification, and permission contracts.
- Deferred: device-level push delivery and production database migration execution require the deployment environment and credentials.

## 2026-09-15 - Delivery and fulfillment contract hardening

- Branch unlinking now uses guarded transactions and the current billing amount column; linked tenant history is preserved and unlink remains non-destructive.
- Warehouse transfers are rendered per warehouse/item fulfillment leg. The API keeps supplier, organization, delivery-zone, status, audit, notification, and atomic reservation checks.
- Delivery destinations resolve in immutable snapshot, branch, restaurant order. Boards, route stops, driver tracking, and driver detail expose the same destination metadata.
- Driver schedule dates use assignment date, route date, requested delivery date, then assignment/order creation fallback. Android and iOS expose deterministic Today, Upcoming, Previous, Overdue, Delivered, Failed, and Rescheduled labels; failed/rescheduled rows are not completed.
- Both mobile clients use the driver-detail endpoint, coordinate-first map navigation with real label/address fallback, binary POD upload validation/retry, and required-reason retry/reassign actions.
- Failed delivery retries create linked warehouse/driver attempts and retain superseded history. Dispute resolutions record one immutable idempotency effect for credit notes, invoice adjustments/refunds, replacements, or no action.
- Branch/account unlink remains a web/admin workflow; no mobile branch-management surface is required. Android and iOS were updated for the shared delivery, dispute, POD, and retry contracts.

## 2026-09-15 - Product/business-logic audit (documentation-only)

- **Scope**: Added `PRODUCT_BUSINESS_LOGIC_AUDIT.md`, a repository-wide shareholder briefing covering actors, product map, end-to-end restaurant/supplier/purchasing/inventory/delivery/finance journeys, state machines, permissions, pricing, notifications, jobs, integrations, existing data, manual work, silos, risks, and the top 30 product opportunities.
- **Parity decision**: This is an analysis/documentation deliverable only. It changes no API endpoint, authentication/session behavior, RBAC key, type contract, feature flag, notification payload, or mobile workflow.
- **Mobile repositories**: `C:/myProjects/supplify-mobile` and `C:/myProjects/supplify-mobile-ios` were reviewed for parity context and require no code changes for this audit.
- **Reason**: The audit records the current Android/iOS coverage and web-first boundaries so future product work can use the parity requirements as an explicit input.
