Mobile parity audit — source of truth for this repo. Native Expo apps live only in the standalone sibling repositories: `C:/myProjects/supplify-mobile` (Android) and `C:/myProjects/supplify-mobile-ios` (iOS).

Web = full cockpit. Mobile v1 = operational app. Driver mobile = complete and simple.

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
