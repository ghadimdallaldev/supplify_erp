# Marketplace Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurants browse the whole marketplace; ordering and chat need a follow; suppliers see only restaurants that follow them; every leak found in the audit is closed.

**Architecture:** One relationship module (`apps/api/src/lib/relationship.js`) owns every follow / block / catalog-visibility predicate, matched at supplier-organisation level, and every route calls it instead of hand-written `supplier_follow` SQL. Route-level fixes follow the spec's §6.2 list. Clients (web + both mobile repos) react to two new error codes and two new flags.

**Tech Stack:** Node/Express + PostgreSQL (`apps/api`, vitest + supertest with mocked `lib/db.js`), React/Vite + RTK Query (`apps/web`), Expo/React Native + react-query (`C:/myProjects/supplify-mobile`, mirrored file-for-file to `C:/myProjects/supplify-mobile-ios`).

**Spec:** `docs/superpowers/specs/2026-11-25-marketplace-categories-and-visibility-design.md` (§3 decisions D3–D12, §6, §10 Q1–Q2). This plan covers §6 and §10. Categories (§5) are a separate plan: `docs/superpowers/plans/2026-11-25-platform-categories-and-shelves.md`, which ships after this one.

## Global Constraints

- Relationship is matched at organisation level: `COALESCE(x.organization_id, x.id) = COALESCE(s.organization_id, s.id)` — for follows and for blocks.
- A block always wins over a follow.
- New orders (restaurant checkout, reorder, Quick List, scheduled order, quote → order) require a follow. There is no "past order" exception.
- Suppliers keep read-only access to their own past orders, invoices, credit notes, payments, deliveries and reports, even after an unfollow or a block.
- Open orders keep their full lifecycle after an unfollow. Order-linked chat stays writable until the order is closed (delivered + received, or cancelled); after a block, order chat closes but fulfilment continues.
- "Not allowed" and "doesn't exist" return the same response on supplier-side restaurant lookups: HTTP 404, `error.name = 'RESTAURANT_NOT_AVAILABLE'`.
- Restaurant blocked from acting for lack of a follow: HTTP 403, `error.name = 'FOLLOW_REQUIRED'`, `error.details = { supplierIds: string[] }`.
- Chat send without a relationship: HTTP 403, `error.name = 'CHAT_READ_ONLY'`.
- Non-followers see list prices (incl. tiers) and `in_stock: boolean`, never quantities. Contract prices only for their restaurant. A supplier with `public_catalog_enabled = false` is a card only for non-followers.
- Reviews show `reviewer_label: 'Verified restaurant'` and no restaurant id or name to anyone but the reviewing restaurant.
- Deals: every active, paid deal from a non-blocked supplier is visible to every restaurant; area / business-type audience filters stay; `restaurantIds` targeting is removed.
- The follow cap per plan (`suppliers_per_restaurant`) is unchanged.
- Every user-visible string on mobile goes through `copy()` / `copyCount()` with Arabic forms; web strings go through i18n `t()`.
- CLAUDE.md: mobile parity in both repos, `npx tsc --noEmit` + jest green in both, dated entry in `docs/mobile/MOBILE_FEATURE_PARITY.md`, run `pnpm typecheck`, `pnpm test:api`, `pnpm test:web`.
- Next free migration number is `0238`.

## Review Focus

1. **A supplier organisation with several branches** — a restaurant follows branch A; branch B's staff must see the restaurant too, and a block on any branch hides it from all. Test in Task 1 (`relationship.test.js` "matches follow and block at organisation level").
2. **A restaurant unfollows while an order is in transit** — supplier can still mark it delivered and both can message on that order; general chat goes read-only. Test in Task 4 ("order-linked message allowed while order open after unfollow").
3. **Scheduled / Quick List orders for an unfollowed supplier** — skipped, the restaurant is notified, other suppliers' lines in the same run still go through. Test in Task 2 ("skips unfollowed supplier and notifies").
4. **Probe attempts with random UUIDs** — manual order, contract price, customer detail and sponsorship eligibility all give the identical 404 body for non-existent and non-following restaurants. Tests in Tasks 5–8 ("same 404 for unknown and non-follower").
5. **A supplier switches its public catalog off** — non-followers stop seeing its products in search, category browse, product detail and deals, but still see the supplier card; followers are unaffected. Test in Task 3 ("public_catalog_enabled=false hides products from non-followers only").

---

### Task 1: Relationship module

**Files:**

- Create: `apps/api/src/lib/relationship.js`
- Test: `apps/api/src/lib/relationship.test.js`

**Interfaces:**

- Produces (every later task uses these; `db` defaults to `query` from `lib/db.js`, and accepts a transaction client):
  - `followExistsSql(restaurantExpr: string, supplierAlias: string): string` — SQL `EXISTS (...)` fragment, organisation-level.
  - `blockedExistsSql(restaurantExpr: string, supplierAlias: string): string` — same for `supplier_blocklist`.
  - `catalogVisibleSql(restaurantExpr: string, supplierAlias: string): string` — `NOT blocked AND (follow OR <alias>.public_catalog_enabled)`.
  - `isFollowing(restaurantId, supplierId, db?): Promise<boolean>`
  - `isBlocked(restaurantId, supplierId, db?): Promise<boolean>`
  - `canTransact(restaurantId, supplierId, db?): Promise<boolean>` — follow and not blocked.
  - `canViewCatalog(restaurantId, supplierId, db?): Promise<boolean>`
  - `followedSupplierIds(restaurantId, supplierIds: string[], db?): Promise<Set<string>>` — subset the restaurant can transact with.
  - `restaurantNotAvailable(res, req)` — sends the Global-Constraints 404 body.
  - `followRequired(res, req, supplierIds: string[])` — sends the 403 `FOLLOW_REQUIRED` body.

- [ ] **Step 1: Write the failing tests** — mock `./db.js` like `chat.routes.test.js` does.

```js
it('matches follow and block at organisation level', () => {
  const sql = followExistsSql('$1', 's')
  expect(sql).toMatch(
    /COALESCE\(\w+\.organization_id, \w+\.id\) = COALESCE\(s\.organization_id, s\.id\)/
  )
  expect(blockedExistsSql('$1', 's')).toMatch(/supplier_blocklist/)
})
it('canTransact is false when blocked even if followed', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ following: true, blocked: true }] })
  expect(await canTransact('r1', 's1')).toBe(false)
})
it('canViewCatalog is true for a public catalog without a follow', async () => {
  queryMock.mockResolvedValueOnce({
    rows: [{ following: false, blocked: false, public_catalog_enabled: true }],
  })
  expect(await canViewCatalog('r1', 's1')).toBe(true)
})
it('canViewCatalog is false for a private catalog without a follow', async () => {
  /* public_catalog_enabled false → false */
})
it('followedSupplierIds returns only transactable ids', async () => {
  /* rows [{id:'s1'}] → Set{'s1'} */
})
it('restaurantNotAvailable sends 404 RESTAURANT_NOT_AVAILABLE', () => {
  /* res.status(404), body.error.name */
})
```

- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/lib/relationship.test.js` — expected FAIL (module not found).
- [ ] **Step 3: Implement** the module. One query per async predicate, selecting `following`, `blocked`, `public_catalog_enabled` for the given supplier row, using the SQL fragments.
- [ ] **Step 4: Run** the same command — expected PASS.
- [ ] **Step 5: Commit** `feat(api): shared supplier-restaurant relationship predicates`.

---

### Task 2: New orders require a follow (checkout, reorder, scheduled, quote → order)

**Files:**

- Modify: `apps/api/src/routes/orders/create.js:351-372` (restaurant order path: replace the follow-or-prior-order query)
- Modify: `apps/api/src/services/scheduled-orders.service.js` (`executeScheduledOrders`, `createOrderFromQuickList`)
- Modify: quote → order conversion in `apps/api/src/services/quote-requests.service.js` (find the accept/convert function)
- Test: `apps/api/src/routes/orders/create.follow.test.js` (new), `apps/api/src/services/scheduled-orders.service.test.js`, `apps/api/src/services/quote-requests.service.test.js` (create if absent)

**Interfaces:**

- Consumes: `followedSupplierIds`, `followRequired` (Task 1).
- Produces: order create responds 403 `FOLLOW_REQUIRED` with `details.supplierIds` = suppliers in the cart not followed. Notification type `SCHEDULED_ORDER_SKIPPED_UNFOLLOWED` with payload `{ quickListId, supplierId, supplierName }`.

- [ ] **Step 1: Failing tests**
  - `create.follow.test.js`: "rejects a cart containing an unfollowed supplier with FOLLOW_REQUIRED" (status 403, `details.supplierIds` equals `['s2']`); "accepts when every supplier is followed"; "past order no longer grants ordering" (mock no follow + prior order exists → 403).
  - `scheduled-orders.service.test.js`: "skips unfollowed supplier and notifies" (no order insert for that supplier, notifier called with `SCHEDULED_ORDER_SKIPPED_UNFOLLOWED`; a followed supplier's order still created).
  - quote test: "converting a quote to an order requires a follow".
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/routes/orders/create.follow.test.js src/services/scheduled-orders.service.test.js src/services/quote-requests.service.test.js` — FAIL.
- [ ] **Step 3: Implement.** In `create.js` compute `followedSupplierIds(restaurantId, cartSupplierIds)`; any missing → `followRequired`. In scheduled orders, check per supplier before `createOrderFromQuickList`, notify via the existing notification service (`services/notification/in-app.js` `notifyTenantUsers`) and add the template to `services/notification/templates.js`. Quote conversion uses the same check.
- [ ] **Step 4: Run** — PASS. Also run `pnpm --filter @supplify/api exec vitest run src/routes/orders` — PASS.
- [ ] **Step 5: Commit** `feat(api): follow required for every new order`.

---

### Task 3: Restaurant catalog visibility (product detail, prices, stock, images, list, search, deals list exclusion)

**Files:**

- Modify: `apps/api/src/routes/products.routes.js:1120-1140` (detail; drop `RESTAURANT_PRODUCT_SUPPLIER_ACCESS_SQL`), list query near `:583-595`
- Delete: `apps/api/src/lib/product-supplier-access.js` (and its import at `products.routes.js:1583`)
- Modify: `apps/api/src/routes/prices.routes.js:95-116`, `apps/api/src/routes/inventory.routes.js:404-420` and `:818-830`, `apps/api/src/lib/object-download-auth.js:52-76`, `apps/api/src/routes/search.routes.js`
- Test: `apps/api/src/routes/products.visibility.test.js` (new), update `apps/api/src/lib/object-download-auth.test.js`, `apps/api/src/routes/search.routes.test.js`

**Interfaces:**

- Consumes: `catalogVisibleSql`, `canViewCatalog`, `isFollowing` (Task 1).
- Produces: product list, search and detail rows for restaurants carry `is_followed: boolean` and `in_stock: boolean`; detail never carries quantities for non-followers; contract price only when it belongs to the caller. Clients use `is_followed` for "Follow to order" (Tasks 11–12).

- [ ] **Step 1: Failing tests** (`products.visibility.test.js`):
  - "non-follower can open product detail of a public-catalog supplier" (200, `is_followed:false`, no `available_qty`, `in_stock` present)
  - "public_catalog_enabled=false hides products from non-followers only" (list SQL contains `catalogVisibleSql` fragment; detail → 404 for non-follower, 200 for follower)
  - "blocked supplier product detail is 404 even when followed"
  - prices route: "non-follower gets list and tier prices but no contract price"
  - inventory route: "non-follower gets in_stock only"
  - object-download-auth: "non-follower may load images of a public-catalog supplier"
  - search: "search excludes private-catalog suppliers for non-followers"
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/routes/products.visibility.test.js src/lib/object-download-auth.test.js src/routes/search.routes.test.js` — FAIL.
- [ ] **Step 3: Implement** with the Task 1 fragments; replace every hand-written `supplier_follow` check in these files.
- [ ] **Step 4: Run** the command plus `pnpm --filter @supplify/api exec vitest run src/routes/products.routes.test.js src/routes/prices.routes.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(api): open restaurant catalog browsing with public-catalog switch`.

---

### Task 4: Chat follows the relationship

**Files:**

- Modify: `apps/api/src/routes/chat/conversations.js:268-356` (create), the send-message handler near `:506`, conversation list `:56-76`
- Modify: `apps/api/src/routes/chat/chat.helpers.js:147` (`userCanAccessConversation`), `apps/api/src/lib/chat-access.js`, `apps/api/src/lib/socket.js:318` (`send_message`)
- Test: `apps/api/src/routes/chat.routes.test.js`, `apps/api/src/lib/chat-access.test.js`

**Interfaces:**

- Consumes: `canTransact`, `isBlocked` (Task 1).
- Produces: `canSendInConversation(conversation, { orderId }?, db?): Promise<boolean>` exported from `lib/chat-access.js` — true when `canTransact`, or when `orderId` refers to an open order (not delivered+received, not cancelled) between the two parties and they are not blocked. Conversation list items gain `is_read_only: boolean`. Send failures → 403 `CHAT_READ_ONLY`.

- [ ] **Step 1: Failing tests:** "supplier cannot start a chat with a non-follower" (404 `RESTAURANT_NOT_AVAILABLE`); "restaurant cannot start a chat with an unfollowed supplier" (403 `FOLLOW_REQUIRED`); "send in a conversation without follow is CHAT_READ_ONLY"; "order-linked message allowed while order open after unfollow"; "blocked parties cannot send, even on an open order"; "list marks is_read_only"; socket: "send_message emits an error and stores nothing when read-only".
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/routes/chat.routes.test.js src/lib/chat-access.test.js` — FAIL.
- [ ] **Step 3: Implement.** Reading stays participant-based; creation and sending use `canSendInConversation`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(api): chat requires a follow; read-only otherwise`.

---

### Task 5: Supplier customer list and detail — followers only

**Files:**

- Modify: `apps/api/src/routes/restaurants.routes.js:98-148` (list), `:603-622` (detail)
- Test: `apps/api/src/routes/restaurants.routes.test.js`

**Interfaces:** Consumes `followExistsSql`, `blockedExistsSql`, `restaurantNotAvailable`.

- [ ] **Step 1: Failing tests:** "list returns followers only" (SQL has no prior-order UNION); "detail is 404 RESTAURANT_NOT_AVAILABLE for a past customer who unfollowed"; "detail is 404 for a blocked follower"; "same 404 for unknown and non-follower" (identical JSON bodies apart from `requestId`).
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/routes/restaurants.routes.test.js` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `fix(api): suppliers see only following restaurants`.

---

### Task 6: Manual orders check the relationship first

**Files:**

- Modify: `apps/api/src/routes/orders/create.js:895-957` (supplier manual order: move eligibility before the delivery-location lookup at `:902`)
- Test: `apps/api/src/routes/orders/create.manual.test.js` (new)

- [ ] **Step 1: Failing tests:** "same 404 for unknown and non-follower" (no delivery-location query issued — assert `queryMock` was not called with SQL containing `delivery_location` / branch lookup); "branch of a non-follower returns the same 404, not DELIVERY_LOCATION_INVALID"; "follower without past order can receive a manual order".
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/routes/orders/create.manual.test.js` — FAIL.
- [ ] **Step 3: Implement** with `canTransact` + `restaurantNotAvailable`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `fix(api): manual orders cannot probe restaurants`.

---

### Task 7: Contract pricing re-checks the relationship

**Files:**

- Modify: `apps/api/src/routes/restaurant-pricing.routes.js` — eligibility `:214-251`, POST `:509`, bulk `:630`, list `:402-486`, PATCH `:762`
- Test: `apps/api/src/routes/restaurant-pricing.routes.test.js`

- [ ] **Step 1: Failing tests:** "PATCH is 404 after the restaurant unfollows"; "bulk create skips non-followers and reports them as unavailable without naming them" (response lists only ids the supplier sent); "list hides contracts for non-followers"; "same 404 for unknown and non-follower".
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/routes/restaurant-pricing.routes.test.js` — FAIL.
- [ ] **Step 3: Implement** with `canTransact`; contracts stay in the DB.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `fix(api): contract pricing follows the relationship on every write`.

---

### Task 8: Sponsorships to followers only

**Files:**

- Modify: `apps/api/src/services/supplier-sponsorship.service.js:169-227` (eligibility), `:251-405` (create); `apps/api/src/routes/supplier-growth.routes.js:251-307`
- Test: `apps/api/src/services/supplier-sponsorship.service.test.js`

- [ ] **Step 1: Failing tests:** "eligibility is not_eligible for a non-follower"; "eligibility never reports already_sponsored from another supplier" (reason is `not_eligible` only); "same 404 for unknown and non-follower on create".
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/services/supplier-sponsorship.service.test.js` — FAIL.
- [ ] **Step 3: Implement.** Keep `already_sponsored` only when the existing sponsorship is this supplier's own.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `fix(api): sponsorship offers only to following restaurants`.

---

### Task 9: Deals are app-wide

**Files:**

- Create: `apps/api/db/migrations/0238_deals_app_wide.sql` — `DELETE FROM promotion_restaurant_targets;` plus `COMMENT ON TABLE promotion_restaurant_targets IS 'Deprecated 2026-11-25: deals are app-wide; drop in a later release.'`
- Modify: `apps/api/src/routes/promotions/promotions.helpers.js:78` (remove `restaurantIds` from schema), `:188-198` (delete `syncRestaurantTargets`); `apps/api/src/routes/promotions/supplier.js:233,335,363`; `apps/api/src/services/deal-promotions.service.js:217-228` and `:322-333` (visibility clause), `:880,960` (stop echoing targets); supplier redemption list `apps/api/src/routes/promotions/supplier.js:678-692`; notification on approval `apps/api/src/services/notification/templates.js:1262-1296`
- Test: `apps/api/src/services/deal-promotions.service.test.js`, `apps/api/src/routes/promotions.rbac.test.js`

- [ ] **Step 1: Failing tests:** "non-follower sees an active paid deal" (SQL has no follow/target condition, keeps blocklist); "area and business-type filters still apply"; "creating a deal with restaurantIds is a validation error"; "redemptions list shows Verified restaurant for non-followers".
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/services/deal-promotions.service.test.js src/routes/promotions.rbac.test.js` — FAIL.
- [ ] **Step 3: Implement.** Deal approval notifications go to no specific restaurant list (keep any existing follower notification behaviour as is).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(api): deals visible to every restaurant`.

---

### Task 10: Reviews show "Verified restaurant"; customer import reveals nothing

**Files:**

- Modify: `apps/api/src/services/reviews.service.js:95-127`, `:296-311`; `apps/api/src/routes/suppliers/suppliers.helpers.js:34`; `apps/api/src/routes/suppliers/profile.js:844`
- Modify: `apps/api/src/services/supplier-customer-matching.service.js:39-81`, `:135-137`; `apps/api/src/services/supplier-connection-request.service.js:14-97`; `apps/api/src/services/supplier-growth-invitation.service.js:34-35`; `apps/api/src/routes/supplier-growth.routes.js:122-199` (remove `/rematch` and `/connect`, keep `/invite`)
- Test: `apps/api/src/services/reviews.service.test.js`, `apps/api/src/services/supplier-customer-matching.service.test.js`, `apps/api/src/routes/supplier-growth.routes.test.js`

**Interfaces:**

- Produces: review rows `{ reviewer_label: 'Verified restaurant', is_own: boolean, ... }` (no `restaurant_id`, `restaurant_name` unless `is_own`). Prospect rows expose `status: 'imported' | 'invited' | 'following'` and never `matched_restaurant_id`, `matched_restaurant_name`, `match_field`, `match_status`. Invite on a matched prospect creates notification type `SUPPLIER_FOLLOW_INVITE` `{ supplierId, supplierName }` with Follow / Dismiss; accepting follows through the existing connection-request accept path, which now also checks the blocklist.

- [ ] **Step 1: Failing tests:** reviews "public list has no restaurant names"; "own review is marked is_own". Matching: "matches only exact normalised email or phone" (no `LIKE` in SQL); "prospect list never includes match fields"; "invite to a matched prospect sends in-app follow invite, response identical to unmatched invite"; "invite from a blocked supplier is silently dropped" (same response); "status becomes following only after the restaurant follows"; routes: "/rematch and /connect are 404".
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/services/reviews.service.test.js src/services/supplier-customer-matching.service.test.js src/routes/supplier-growth.routes.test.js` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS, then the full `pnpm test:api` — PASS.
- [ ] **Step 5: Commit** `fix(api): reviews and customer import reveal no restaurants`.

---

### Task 11: Web clients

**Files (apps/web/src):**

- Restaurant: product detail / catalog cards (`pages/PublicSupplierCatalogPage.tsx`, `pages/ProductsPage.tsx`, `components/products/*`), deals pages, `pages/CartPage.tsx` (handle `FOLLOW_REQUIRED`), reorder buttons on order detail and quick lists, `pages/CreateQuoteRequestPage.tsx:51-59` (searchable supplier and product pickers, server-side `q` + pagination, followed first and marked; remove the `limit: 50` load-all)
- Chat: conversation view composer (`components/chat/*` / chat page) uses `is_read_only`; `NewConversationDialog.tsx` lists followers only (already via `/api/restaurants`)
- Supplier: `pages/SupplierCustomerGrowthPage.tsx:577` (no matched name; statuses imported / invited / following), `RestaurantsPage`, `RestaurantDetailPage` (404 → "not available"), `ContractPricingPage.tsx`, reviews display ("Verified restaurant"), promotions form (remove any restaurant targeting UI)
- i18n: en + ar keys `followToOrder`, `followToReorder`, `followToSeeCatalog`, `chatReadOnlyRestaurant` ("Follow {{supplier}} to message"), `chatReadOnlySupplier` ("This restaurant no longer follows you"), `verifiedRestaurant`, growth statuses
- Tests: colocated `*.test.tsx` beside each changed component

- [ ] **Step 1: Failing tests:** product card "shows Follow to order when is_followed is false and does not add to cart"; cart "FOLLOW_REQUIRED shows follow prompt listing the suppliers"; chat "composer hidden when is_read_only"; quote page "supplier picker searches the server and lists followed first"; growth page "never renders a matched restaurant name".
- [ ] **Step 2: Run** `pnpm test:web` — the new tests FAIL.
- [ ] **Step 3: Implement.** The Follow button calls the existing follow mutation and then re-enables add to cart; the follow-limit error (`SUPPLIER_FOLLOW_LIMIT_REACHED`) shows the existing upgrade prompt.
- [ ] **Step 4: Run** `pnpm typecheck` and `pnpm test:web` — PASS.
- [ ] **Step 5: Commit** `feat(web): follow-to-order, read-only chat, private customer import`.

---

### Task 12: Mobile clients (Android, then mirror to iOS)

**Files (`C:/myProjects/supplify-mobile/src`, same paths in `supplify-mobile-ios`):**

- `features/restaurant/screens/CatalogScreen.tsx`, `HomeSearchScreen.tsx`, `DealsScreen.tsx`, `QuickListsScreen.tsx`, `OrderDetailScreen.tsx` (reorder), `CartScreen.tsx`, `components/ReorderGuidance.tsx`, `CreateQuoteRequestScreen.tsx` (searchable pickers)
- `features/chat/screens/ChatThreadScreen.tsx` (read-only banner instead of composer)
- `features/supplier/screens/CustomerGrowthScreen.tsx`, `services/api/queries/growth.ts`, `types/growth.ts`
- `services/api/queries/chat.ts`, `types/supplify.ts` (`is_followed`, `in_stock`, `is_read_only`, review `reviewer_label`)
- `i18n/en.json`, `i18n/ar.json`
- Tests: `features/**/__tests__/*.test.tsx`

- [ ] **Step 1: Failing tests:** "Catalog shows Follow to order for unfollowed supplier"; "Cart handles FOLLOW_REQUIRED"; "ChatThread hides composer when read-only"; "CustomerGrowth shows Invited, never a restaurant name"; "Quote supplier picker queries server with q".
- [ ] **Step 2: Run** `cd C:/myProjects/supplify-mobile && npx jest` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx tsc --noEmit && npx jest` in `supplify-mobile` — PASS. Copy every changed file to `supplify-mobile-ios` (same relative paths, iOS `package.json` untouched) and run `npx tsc --noEmit && npx jest` there — PASS.
- [ ] **Step 5: Commit** in each mobile repo `feat(mobile): follow-to-order, read-only chat, private customer import`.

---

### Task 13: Docs

**Files:**

- Create: `docs/features/marketplace-visibility.md` (the spec §6.1 table, unfollow and block behaviour, error codes)
- Modify: `docs/mobile/MOBILE_FEATURE_PARITY.md` (dated `## 2026-11-25 — Marketplace visibility` entry), `docs/mobile/MOBILE_PARITY_CHECKLIST.md`, `docs/features/search-and-discovery.md`, `docs/features/deals-and-promotions.md`, `docs/features/supplier-ops.md`, `docs/onboarding/*` (migration count +1)

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Run `pnpm test:api` and `pnpm test:web` once more — PASS.
- [ ] **Step 3: Commit** `docs: marketplace visibility rules`.
