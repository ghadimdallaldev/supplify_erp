# Marketplace Visibility Implementation Plan (revision 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurants browse the whole marketplace. Ordering, reordering and chat need a follow. Suppliers see only restaurants that follow them. Every leak found by both audits is closed, and the change is race-safe, cache-safe and socket-safe.

**Architecture:**

- **Relationship storage:** relationships move to organisation-level keys (`supplier_follow` / `supplier_blocklist` on `(restaurant_id, supplier_org_id)`).
- **One module owns the rules:** `apps/api/src/lib/relationship.js` owns every predicate, every advisory lock and every invalidation hook, and every route, job, notification, socket handler and Assistant tool calls it.
- **Clients:** web and both mobile apps get one choke point each for "Follow & add" and read-only chat.

**Tech Stack:**

- **API:** Node/Express + PostgreSQL in `apps/api`.
  - Unit tests: vitest + supertest with mocked `lib/db.js`.
  - Integration tests: real PostgreSQL, using the `tests/integrity/*.pg.test.js` harness pattern.
- **Web:** React/Vite + RTK Query (`apps/web`), with vitest + RTL.
- **Mobile:** Expo/React Native + react-query (`C:/myProjects/supplify-mobile`, mirrored file-for-file to `C:/myProjects/supplify-mobile-ios`), with jest.
- **Messaging and end-to-end:** socket.io messaging; Playwright end-to-end tests (`tests/`).

**Spec:** `docs/superpowers/specs/2026-11-25-marketplace-categories-and-visibility-design.md`. This plan covers §3 D3–D10 and D12, §6, §10 and §11.1–§11.4, §11.6 and §11.7. §11 wins over earlier sections.

**Companion plan:** `docs/superpowers/plans/2026-11-25-platform-categories-and-shelves.md`. It ships after this one and reuses `catalogVisibleSql` and the Task 0 harness.

**Inputs:** the audit notes behind this revision are the four second-round audits (routes/reports/exports, jobs/sockets/Assistant/caches, category references, clients). Their file:line findings are cited in the tasks below.

## Global Constraints

- **Precedence (§11.1):** there is no backward compatibility with installed mobile builds. Old endpoints, params, columns and tables are removed once their replacement is verified. Business records, financial records, paid sponsorships, open orders, inventory, RBAC, tenant isolation and plan limits are preserved.
- **Organisation-level relationships:**
  - `supplier_org_id` references `supplier_organizations(id)` (`0082:12`). Every supplier gets an organisation, and `supplier.organization_id` becomes NOT NULL (Task 1).
  - When a supplier is linked to another organisation (`supplier-org.js:696-699`, `branch-account-link-invitations.js:102`), its follow and block rows are re-keyed and merged under the exclusive lock.
  - Organisation-level existence never widens data access; branch RBAC (`x-branch-id`, `getSupplierIdForRequest`) and warehouse guards still scope data.
  - The restaurant side stays keyed per restaurant tenant row: each restaurant branch follows independently, and the cap counts per `tenant.tenantId` as today (`relationships.js:164`).
- **Migrations are atomic and locked:**
  - `runAllSqlMigrations` (`apps/api/src/lib/sql-migrator.js:78-91`) gets a global `pg_advisory_lock` held on one dedicated client for the whole run (Task 1).
  - Every multi-step migration in both plans is a single `DO $$ … $$` block, so a partial failure rolls back.
- **Open orders:** `OPEN_ORDER_STATUSES = ['PENDING_APPROVAL', 'PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RECEIVED_PARTIAL', 'RECEIVED_WITH_DISPUTE']` is exported from `relationship.js`. Closed means `DRAFT`, `RECEIVED_FULL`, `INVOICED`, `COMPLETED` or `CANCELLED` (statuses from migrations `0021`, `0028`, `0069`, `0110`).
- **Lock ordering (no deadlocks):** multiple shared relationship locks (a multi-supplier cart) are taken in ascending `supplier_org_id` order. The relationship lock is always taken before the follow-cap lock.
- **Blocks:** a block always wins and deletes the follow row. Following a blocked supplier returns 409 `SUPPLIER_BLOCKED` until the restaurant unblocks it.
- **Follows need consent and respect the cap:** the plan cap `suppliers_per_restaurant` counts follow rows, which are now one per organisation. It is enforced in every follow-creating path, inside the same transaction as the insert.
- **Locks:** `pg_advisory_xact_lock(hashtextextended('rel:' || restaurant_id || ':' || supplier_org_id, 0))` is taken by follow, unfollow, block and unblock. The shared variant `pg_advisory_xact_lock_shared(...)` is taken, and the relationship re-checked, inside the same transaction as:
  - order creation (including scheduled orders);
  - message insert;
  - contract price write;
  - sponsorship offer;
  - quote → order.
- **New business needs a follow:** every new order (checkout, reorder, Quick List, scheduled, quote → order) requires a follow and no block. There is no past-order exception.
  - Exception: a dispute replacement order needs only "not blocked".
- **Read-only history:** suppliers keep read-only access to their own past orders, invoices, credit notes, payments, deliveries, disputes and reports after an unfollow or a block.
- **Open orders** keep their full lifecycle after an unfollow. After a block, fulfilment continues and order chat closes.
- **Chat send contract (§11.3):**
  - A general message needs a follow and no block.
  - A message with `order_id` needs both parties on that order, the order's status in `OPEN_ORDER_STATUSES`, and no block.
  - Support and admin conversations (`is_admin_conversation`, `support-chat.service.js`) are exempt from relationship rules.
  - A block closes the conversation for both sides: the supplier can't open it, and the restaurant reads history only.
- **Quote fields visible to an invited supplier:** `restaurantDisplayName`, `note`, `neededBy`, and its own products' `quantity`, `unit`, `notes`. Nothing else. A restaurant block hides the quote from that supplier and closes responses.
- **Catalog visibility for non-followers:**
  - They see list prices (including tiers) and `in_stock: boolean`, never quantities.
  - Contract prices go only to their own restaurant.
  - A `public_catalog_enabled = false` supplier is shown only as a card.
  - Deals are visible where the catalog is visible (`catalogVisibleSql`).
- **Error contract:**

| Case                                                                                                        | HTTP | `error.name`                    | Details                                  |
| ----------------------------------------------------------------------------------------------------------- | ---- | ------------------------------- | ---------------------------------------- |
| Supplier-side restaurant lookup: "not allowed" or "doesn't exist" (identical bodies apart from `requestId`) | 404  | `RESTAURANT_NOT_AVAILABLE`      | —                                        |
| Restaurant acts without a follow                                                                            | 403  | `FOLLOW_REQUIRED`               | `details: { suppliers: [{ id, name }] }` |
| Chat send not allowed                                                                                       | 403  | `CHAT_READ_ONLY`                | `details: { openOrderIds: string[] }`    |
| Follow at the plan cap                                                                                      | 403  | `SUPPLIER_FOLLOW_LIMIT_REACHED` | unchanged shape                          |

- **Reviews:** `reviewer_label: 'Verified restaurant'`. No restaurant id or name goes to anyone except the reviewing restaurant (`is_own: true`).
- **Realtime revocation:** a relationship change must, before its HTTP response returns:
  - invalidate the relationship-dependent caches listed in Task 3;
  - make the affected sockets leave `conversation_<id>`;
  - emit `conversation_access_changed { conversationId }`.
- **Mobile strings** go through `copy()` / `copyCount()` with Arabic forms. **Web strings** go through i18n namespaces in `apps/web/src/i18n/locales/{en,ar}`. RTL is verified on every UI task.
- **Mobile UI tasks** follow the `supplify-mobile-design` skill workflow and keep Restaurant Home V4 (`src/features/restaurant/home/`). Mobile jest only picks up tests under `__tests__/` or `src/**/*.test.ts`, so put UI tests in `__tests__/`.
- **Isolation:** all work happens on branch `feat/marketplace-visibility` in worktrees outside the repos:
  - `C:/w/erp-mv`
  - `C:/w/smv` (Android)
  - `C:/w/smiv` (iOS)

  Rules for that work:
  - Never stash, reset or edit another session's uncommitted work (ERP `dev` has foreign changes in `docs/mobile/*`; the `wt/sm-*` design worktrees belong to another session).
  - **Never run `scripts/promote-release.mjs` or `scripts/prune-release-tree.mjs` outside a throwaway worktree.** They `rmSync` untracked folders such as `.claude`.

- **Migration numbers:** use the next free numbers at the time of writing (`ls apps/api/db/migrations | tail -1`; currently `0237`). Never edit a committed migration.
- **Progress ledger:** update `docs/superpowers/plans/2026-11-25-marketplace-ledger.md` and commit it after every task: task, commit SHAs per repo, tests run, open issues.
- **CLAUDE.md:** mobile parity in both repos; `npx tsc --noEmit` and jest green in both; a dated entry in `docs/mobile/MOBILE_FEATURE_PARITY.md`; `pnpm typecheck`, `pnpm test:api` and `pnpm test:web` green.

## Review Focus

1. **A supplier organisation with several branches.**
   - A restaurant follows the organisation, so every branch can transact with it.
   - A branch user without access to branch A still cannot see branch A's orders.
   - Test: Task 1, real-PG "org-level relationship does not widen branch data scope".
2. **An unfollow while an order is in transit.**
   - The supplier can still mark the order delivered, and both sides can send messages tagged with that order.
   - General messages are refused. After a block, order messages are refused too.
   - Test: Task 6, real-PG "order-tagged message allowed while open after unfollow; refused after block".
3. **Two concurrent follows at the plan cap, and an order racing an unfollow.**
   - Exactly one follow succeeds.
   - The order either commits before the unfollow or fails with `FOLLOW_REQUIRED`; never after.
   - Test: Task 2, real-PG "concurrent follows at cap", and Task 4 "order vs unfollow is serialised".
4. **Probing with random or foreign UUIDs.**
   - Customer detail, manual order, contract price, sponsorship, prospect invite and conversation create return byte-identical bodies (apart from `requestId`) for unknown and non-following restaurants, with no extra queries that would change timing materially.
   - Tests: Tasks 7–10, "same response for unknown and non-follower".
5. **A socket already in a conversation room when the restaurant blocks.**
   - The next `send_message` from that socket is rejected, the socket no longer receives room events, and the client gets `conversation_access_changed`.
   - Test: Task 6, real-PG + socket.io-client "block revokes live socket".

---

### Task 0: Real-PostgreSQL integration harness

**Files:**

- Create: `tests/integrity/marketplace/harness.js`
- Create: `tests/integrity/marketplace/fixtures.js`
- Create: `tests/integrity/marketplace/README.md`
- Create: `tests/integrity/marketplace/harness.pg.test.js`
- Create: `apps/api/src/app.js` (`createApp()`, extracted from `server.js`)
- Modify: `apps/api/src/server.js`
- Modify: root `package.json` (script `test:marketplace:pg` running `tests/integrity/marketplace`)

**Interfaces:**

- Setup facts:
  - `runAllSqlMigrations` takes no pool and uses `lib/db.js`, so the harness sets `DATABASE_URL` (and `SUPPLIFY_MARKETPLACE_DATABASE_URL`) **before** importing any API module.
  - It then calls `runFullStartupMigrations({ force: true })`, which also runs the runtime schema steps (`ensureQuoteRequestSchema`, `ensureDeliverySchema`, …).
  - `tests/integrity/vitest.config.js:14` already includes `**/*.pg.test.js`; do not change it.
  - Importing `server.js` calls `listen` (`:640`). Extract `createApp()` into `apps/api/src/app.js` (routes and middleware only), and keep `server.js` as `createApp()` + `listen` + sockets.
- Produces:
  - `startMarketplaceDb(): Promise<{ pool, url }>`. It refuses any URL whose host is not `127.0.0.1` or whose database name is not `marketplace_audit` (same guard style as `supplier-quotes.pg.test.js`). It then runs the full startup migrations as described above.
  - `resetMarketplaceDb(pool)`: truncate business tables between tests.
  - Fixtures in `fixtures.js`:
    - `createSupplierOrg(pool, { branches = 1, publicCatalog = true })` → `{ orgId, branchIds }`
    - `createRestaurant(pool)` → `{ id }`
    - `createProduct(pool, supplierId, overrides)`
    - `follow(pool, r, org)`
    - `block(pool, r, org)`
    - `createOrder(pool, { restaurantId, supplierId, status })`
    - `createConversation(pool, r, s)`
  - `startApiForTest()` → `{ app, server, io, baseUrl, close }`. It builds `createApp()` plus the socket setup on an ephemeral port, with auth mocked to a header-selected test identity (`x-test-user`), for supertest and socket.io-client.
- Database: a Docker container `supplify-marketplace-audit` (`postgres:16-alpine`, `POSTGRES_DB=marketplace_audit`, bound to `127.0.0.1` on a random port). `README.md` documents the start command and `SUPPLIFY_MARKETPLACE_DATABASE_URL`.

- [ ] **Step 1: Write the failing test.** `harness.pg.test.js`: "applies all migrations and fixtures create an org with two branches" asserts that `supplier` has 2 rows sharing `organization_id`.
- [ ] **Step 2: Run** `pnpm test:marketplace:pg`. Expected: FAIL (harness missing).
- [ ] **Step 3: Implement** the harness and fixtures.
- [ ] **Step 4: Run** `pnpm test:marketplace:pg`. Expected: PASS.
- [ ] **Step 5: Commit** `test(integrity): real-postgres marketplace harness` and update the ledger.

---

### Task 1: Organisation-level relationship schema and module

**Files:**

- Create: `apps/api/db/migrations/<next>_org_level_relationships.sql`
- Create: `apps/api/src/lib/relationship.js`
- Test: `apps/api/src/lib/relationship.test.js` (unit, mocked)
- Test: `tests/integrity/marketplace/relationship.pg.test.js` (real PG)

**Migration** (one `DO $$ … $$` block):

1. Create a `supplier_organizations` row for every supplier whose `organization_id` is null, reusing the creation logic in `lib/supplier-org.js:151`, then set `supplier.organization_id NOT NULL`.
2. Add `supplier_org_id UUID REFERENCES supplier_organizations(id) ON DELETE CASCADE` to `supplier_follow` and `supplier_blocklist`, backfilled from `supplier.organization_id`.
3. Merge duplicate rows per `(restaurant_id, supplier_org_id)`, keeping the earliest `created_at`. Record the merged-row counts with `RAISE NOTICE` for the rehearsal.
4. Delete follow rows where a block exists for the same pair, recording the count the same way.
5. Add `UNIQUE(restaurant_id, supplier_org_id)` and `INDEX(supplier_org_id)` on both tables, and make the column NOT NULL.

**Keep** `supplier_id` and its unique constraint for now. Writers keep filling `supplier_id` with the organisation's main branch. Task 16 drops it behind a grep gate, once every reader is migrated.

Also in this task:

- The global migration advisory lock in `apps/api/src/lib/sql-migrator.js`.
- The re-key hook in `linkSupplierToOrganization` (`supplier-org.js:696-699`) and in `branch-account-link-invitations.js:102`: under the exclusive lock, move and merge the follow and block rows to the new `supplier_org_id`.

**Interfaces (used by every later task):**

- `supplierOrgIdSql(alias: string): string` → `COALESCE(<alias>.organization_id, <alias>.id)`
- `followExistsSql(restaurantExpr, supplierAlias): string`
- `blockedExistsSql(restaurantExpr, supplierAlias): string`
- `catalogVisibleSql(restaurantExpr, supplierAlias): string` → `NOT blocked AND (follow OR <alias>.public_catalog_enabled)`
- `resolveSupplierOrgId(supplierId, db?): Promise<string | null>`
- `getRelationship(restaurantId, supplierId, db?): Promise<{ orgId, following, blocked, publicCatalog }>`
- `canTransact(restaurantId, supplierId, db?): Promise<boolean>`
- `canViewCatalog(restaurantId, supplierId, db?): Promise<boolean>`
- `transactableSupplierIds(restaurantId, supplierIds, db?): Promise<{ allowed: Set<string>, missing: Array<{ id, name }> }>`
- `lockRelationshipShared(client, restaurantId, supplierOrgId): Promise<void>`
- `lockRelationshipExclusive(client, restaurantId, supplierOrgId): Promise<void>`
- `restaurantNotAvailable(res, req)`
- `followRequired(res, req, suppliers)`
- `onRelationshipChanged(fn)`: register a hook.
- `emitRelationshipChanged({ restaurantId, supplierOrgId, kind: 'follow' | 'unfollow' | 'block' | 'unblock' })`: awaited by the writers in Task 2. The hooks are added in Tasks 3 and 6.

- [ ] **Step 1: Write the failing tests.**
  - Unit tests:
    - "fragments match at organisation level"
    - "canTransact false when blocked"
    - "canViewCatalog true for public catalog without follow, false for private"
    - "transactableSupplierIds reports missing with names"
  - Real-PG tests:
    - "migration creates organisations for orgless suppliers and makes organization_id NOT NULL"
    - "linking a supplier to another organisation re-keys and merges its follows"
    - "two concurrent migration runs apply each file once"
    - "migration merges duplicate org follows and drops follows that have a block"
    - "follow on branch B row of an org is visible as org follow"
    - "org-level relationship does not widen branch data scope": a branch-B user still gets 404 on branch-A-only data through `/api/orders/:id`.
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/lib/relationship.test.js && pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration and the module. Each async predicate issues one query.
- [ ] **Step 4: Run** both commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): organisation-level supplier relationships` and update the ledger.

---

### Task 2: Follow, unfollow, block, unblock and all auto-follow paths

**Files:**

- Modify: `apps/api/src/routes/suppliers/relationships.js:127-387`
- Modify: `apps/api/src/services/supplier-connection-request.service.js:134-138` (accept path)
- Modify: `apps/api/src/services/supplier-growth-invitation.service.js:166-170` (referral signup)
- Modify: `apps/api/src/services/supplier-sponsorship.service.js:1015-1019` (sponsorship accept no longer auto-follows, since Task 9 limits offers to followers)
- Modify: `apps/api/src/lib/subscription/entitlements.js:1225` (count unchanged: follow rows now equal organisations)
- Create: `apps/api/src/services/relationship-writes.service.js`
- Test: `apps/api/src/services/relationship-writes.service.test.js`
- Test: `tests/integrity/marketplace/follow-cap.pg.test.js`

**Interfaces:**

- Consumes: `lockRelationshipExclusive` and `emitRelationshipChanged` (Task 1).
- Produces:
  - `followSupplier({ restaurantId, supplierId, source: 'manual' | 'invite' | 'referral' }, db?)` → `{ followed: true }`. It throws `SupplierFollowLimitError` (mapped to the existing 403) or `SupplierBlockedError` (409 `SUPPLIER_BLOCKED`).
  - `unfollowSupplier`, `blockSupplier` (deletes the follow) and `unblockSupplier`, each with the same arguments.
  - Each runs in one transaction: the exclusive lock, then `pg_advisory_xact_lock(hashtextextended('follow-cap:' || restaurant_id, 0))` for the cap check, then count, then write. They call `emitRelationshipChanged` after commit and before responding.
  - Lock order is always the relationship lock, then the cap lock.
  - Accepting an invite never notifies the supplier. The prospect becomes `following` only through the follow row itself.
  - A duplicate follow is idempotent (200), not a 500.

- [ ] **Step 1: Write the failing tests.**
  - Unit tests:
    - "follow refuses a blocked supplier with SUPPLIER_BLOCKED"
    - "block removes the follow"
    - "duplicate follow is idempotent"
    - "invite and referral follows enforce the cap"
  - Real-PG tests:
    - "concurrent follows at cap": 10 parallel follows of different orgs at cap−1 end with exactly 1 inserted.
    - "follow and block race leaves no follow row".
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/services/relationship-writes.service.test.js && pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.** Route all six write paths through the service.
- [ ] **Step 4: Run** both commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): race-safe follow and block writes with cap on every path` and update the ledger.

---

### Task 3: Relationship-dependent caches

**Files:**

- Modify: `apps/api/src/routes/products.routes.js:75-81`, `:243-269` and `:438-453`. The category and tag caches become per-viewer for restaurants: `productCats:v3:r:<restaurantId>:<catalogVersion>`.
  - `catalogVersion` is a Redis counter bumped on any product, catalog-visibility or relationship change.
  - Suppliers keep `productCats:v3:s:<supplierId>:<catalogVersion>`.
  - Admin keeps `productCats:v3:admin:<catalogVersion>`.
- Modify: `apps/api/src/services/dashboard-summary.service.js:16`
- Modify: `apps/api/src/services/restaurant-reorder-assistance.service.js:558-708`
- Modify: the supplier command center cache (`supplier:command-center:<id>`)
- Modify: `apps/api/src/services/product-import.service.js` and `apps/api/src/services/product-image-import.service.js` (bump `catalogVersion`; they never invalidated before)
- Modify: `apps/api/src/services/reorder-forecast-cache.service.js` (key includes the relationship version; invalidated by the hook)
- Modify: `apps/api/src/services/dashboard-summary.service.js:150-154` (its follow and block SQL moves to `relationship.js` fragments)
- Create: `apps/api/src/lib/relationship-cache.js`
- Test: `apps/api/src/lib/relationship-cache.test.js`
- Test: `tests/integrity/marketplace/cache-isolation.pg.test.js` (real Redis is not required; use the in-memory fallback from `lib/cache.js`)

**Interfaces:**

- Consumes: `onRelationshipChanged` (Task 1).
- Produces:
  - `bumpCatalogVersion(): Promise<number>` and `getCatalogVersion(): Promise<number>`
  - `invalidateRelationshipCaches({ restaurantId, supplierOrgId }): Promise<void>`, registered as a relationship hook.

- [ ] **Step 1: Write the failing tests.**
  - "two restaurants never share a category-count cache entry"
  - "block invalidates the blocker's dashboard summary and reorder recommendations immediately"
  - "bulk import bumps catalog version"
  - "supplier command center drops a restaurant right after unfollow"
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/lib/relationship-cache.test.js && pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both commands. Expected: PASS.
- [ ] **Step 5: Commit** `fix(api): relationship-aware cache keys and immediate invalidation` and update the ledger.

---

### Task 4: Every new order requires a follow, serialised with relationship changes

**Files:**

- Modify: `apps/api/src/routes/orders/create.js:327-385` (restaurant path: remove the past-order clause at `:364-371`; move the checks inside the order transaction)
- Modify: `apps/api/src/services/restaurant-order-create.service.js:97`
- Modify: `apps/api/src/services/scheduled-orders.service.js:240-389`
- Modify: the quote → order conversion in `apps/api/src/services/quote-requests.service.js`
- Modify: `apps/api/src/services/disputes.service.js:753-768` (replacement order: only "not blocked")
- Modify: `apps/api/src/services/notification/templates.js` (new type `SCHEDULED_ORDER_SKIPPED_UNFOLLOWED`, en + ar)
- Test: `apps/api/src/routes/orders/create.follow.test.js`
- Test: `apps/api/src/services/scheduled-orders.service.test.js`
- Test: `tests/integrity/marketplace/orders.pg.test.js`

**Interfaces:**

- Consumes: `transactableSupplierIds`, `lockRelationshipShared`, `followRequired` (Task 1).
- Produces: order create returns 403 `FOLLOW_REQUIRED` with `details.suppliers`. A scheduled run skips the unfollowed suppliers' orders and notifies the restaurant with `{ quickListId, supplierId, supplierName }`. Other suppliers in the same run still get their orders.

- [ ] **Step 1: Write the failing tests.**
  - Unit tests:
    - "cart with an unfollowed supplier is FOLLOW_REQUIRED listing it"
    - "past order no longer grants ordering"
    - "dispute replacement allowed without follow, refused when blocked"
    - "skips unfollowed supplier and notifies"
  - Real-PG test: "multi-supplier cart takes locks in org-id order (no deadlock under 20 concurrent carts and 20 concurrent unfollows)".
  - Real-PG test: "order vs unfollow is serialised". Start an order transaction holding the shared lock, run unfollow concurrently, and assert the unfollow waits and the order commits. In the reverse order, the order fails with `FOLLOW_REQUIRED`.
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/routes/orders src/services/scheduled-orders.service.test.js src/services/disputes.service.test.js && pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): follow required for every new order, serialised` and update the ledger.

---

### Task 5: Restaurant catalog visibility (detail, prices, stock, images, list, search, deals)

**Files:**

- Modify: `apps/api/src/routes/products.routes.js`. Replace the detail check at `:1120-1140` (remove `RESTAURANT_PRODUCT_SUPPLIER_ACCESS_SQL` and delete `apps/api/src/lib/product-supplier-access.js`). Update the list blocklist clause at `:583-595`.
- Modify: `apps/api/src/routes/prices.routes.js:95-116`
- Modify: `apps/api/src/routes/inventory.routes.js:404-420` and `:818-830`
- Modify: `apps/api/src/routes/search.routes.js`
- Modify: `apps/api/src/lib/object-download-auth.js:50-76` (organisation-level check)
- Modify: `apps/api/src/services/public-supplier-catalog.service.js:101`
- Modify: `apps/api/src/services/deal-promotions.service.js:217-228` and `:322-333` (visibility = `catalogVisibleSql`; remove the follow/target/boost condition; area and business-type filters stay; boosts affect ranking only)
- Modify: the supplier directory `is_followed` (`apps/api/src/routes/suppliers/catalog.js:101,149`) and supplier profile follow state (`apps/api/src/routes/suppliers/profile.js:790-795`)
- Modify: favourites (`apps/api/src/routes/products.routes.js:860-873`): non-transactable suppliers' favourites show "Follow to order"
- Modify: `apps/api/src/services/assistant-tools/read-tools.js:56-58` and `apps/api/src/services/supplier-price-comparison.service.js:38-45` (use the `relationship.js` fragments)
- Test: `apps/api/src/routes/products.visibility.test.js`
- Test: `tests/integrity/marketplace/catalog-visibility.pg.test.js`

**Interfaces:**

- Consumes: `catalogVisibleSql`, `getRelationship` (Task 1).
- Produces: restaurant product list, search, detail and deal rows carry `is_followed: boolean` and `in_stock: boolean`. Non-followers never get `available_qty`. `contract_price` is present only when it belongs to the caller.

- [ ] **Step 1: Write the failing real-PG tests** (a matrix over follow, public, private and blocked):
  - "non-follower opens a public supplier's product: list price yes, qty no"
  - "public_catalog_enabled=false hides products and deals from non-followers only"
  - "blocked supplier is invisible even when it was followed"
  - "contract price only to its restaurant"
  - "deal of a public supplier visible to a non-follower; deal of a private supplier only to followers"
  - "private-catalog images need org follow; sibling branch image allowed"
- [ ] **Step 2: Run** `pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:marketplace:pg && pnpm --filter @supplify/api exec vitest run src/routes/products.routes.test.js src/routes/prices.routes.test.js src/routes/search.routes.test.js src/lib/object-download-auth.test.js src/services/deal-promotions.service.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): open catalog browsing with org-level visibility and public-catalog switch` and update the ledger.

---

### Task 6: Chat, sockets, attachments and deal chat

**Files:**

- Modify: `apps/api/src/routes/chat/conversations.js:56-76` (list), `:268-356` (create) and `:506-645` (send)
- Modify: `apps/api/src/routes/chat/chat.helpers.js:147`
- Modify: `apps/api/src/lib/chat-access.js:18-65`
- Modify: `apps/api/src/lib/socket.js:290-423` (`join_conversation`, `send_message`, and `typing` / `message_read` at `:376-423`)
- Modify every other message-insert path to go through `canSendMessage`:
  - `apps/api/src/services/order-fulfillment-issues.service.js:151-365` (order-tagged)
  - `apps/api/src/services/supplier-reorder-assistance.service.js:132`
- Keep exempt: `apps/api/src/routes/chat/admin.js:81` and `apps/api/src/services/support-chat.service.js:57` (support and admin)
- Modify: `apps/api/src/services/chatSocket.service.js:62-66` (persist `order_id`)
- Modify: `apps/api/src/lib/chat-conversation.js:36`
- Modify: `apps/api/src/routes/promotions/restaurant.js:782-808` (deal chat)
- Modify: `apps/api/src/services/notification/templates.js:1116-1200` (notify only after an authorised send)
- Create: `apps/api/src/routes/chat/attachments.js`. `GET /api/chat/attachments/:attachmentId` re-checks conversation access and redirects to a 5-minute signed URL. Stop returning stored `file_url`s (`conversations.js:454`, `:706`).
- Test: `apps/api/src/routes/chat.routes.test.js`
- Test: `apps/api/src/lib/chat-access.test.js`
- Test: `tests/integrity/marketplace/chat.pg.test.js` (with socket.io-client against `startApiForTest`)

**Interfaces:**

- Consumes: `canTransact`, `getRelationship`, `lockRelationshipShared`, `onRelationshipChanged` (Task 1).
- Produces:
  - `canSendMessage({ conversation, orderId, actorRole }, db?)` → `{ allowed: boolean, openOrderIds: string[] }`, exported from `lib/chat-access.js`.
  - `canOpenConversation(conversation, actorRole, db?)`: false for the supplier after a block.
  - Conversation list items carry `can_send_general: boolean`, `open_order_ids: string[]` and `is_closed_by_block: boolean`.
  - Socket event `conversation_access_changed { conversationId }`.
  - Relationship hook: conversations exist per supplier **branch** and restaurant (`0149` `idx_conversation_b2b_pair`). The hook therefore loads every conversation between the restaurant and **any branch of the organisation**, and for each one calls `io.in('supplier_<branchId>').socketsLeave('conversation_<id>')`, then emits the event to both tenant rooms.

- [ ] **Step 1: Write the failing tests.**
  - "supplier cannot create a conversation with a non-follower: RESTAURANT_NOT_AVAILABLE, same body as unknown id"
  - "restaurant needs follow to start chat or deal chat"
  - "general send without follow is CHAT_READ_ONLY with openOrderIds"
  - "order-tagged message allowed while open after unfollow; refused after block"
  - "supplier cannot open conversation after block; restaurant reads history"
  - "block revokes live socket": a socket in the room gets `conversation_access_changed`, then its `send_message` is rejected and it receives no further `new_message`.
  - "attachment link re-checks access and expires"
  - "message notification only after authorised send"
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/routes/chat.routes.test.js src/lib/chat-access.test.js && pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.** Reading history stays participant-based, except a blocked supplier cannot open the conversation.
- [ ] **Step 4: Run** both commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): relationship-aware chat with per-order send and live socket revocation` and update the ledger.

---

### Task 7: Supplier customer list and detail, manual orders, contract pricing

**Files:**

- Modify: `apps/api/src/routes/restaurants.routes.js:98-148` (list) and `:603-622` (detail: also fixes the blocklist bypass)
- Modify: `apps/api/src/routes/orders/create.js:895-957` (manual order: relationship check first, before the location lookup at `:902`)
- Modify: `apps/api/src/routes/restaurant-pricing.routes.js:213-251`, `:402-486`, `:509`, `:630` and `:762`
- Test: `apps/api/src/routes/restaurants.routes.test.js`
- Test: `apps/api/src/routes/restaurant-pricing.routes.test.js`
- Test: `tests/integrity/marketplace/supplier-lookups.pg.test.js`

**Interfaces:** Consumes `canTransact`, `lockRelationshipShared` and `restaurantNotAvailable`. The list returns followers only. Contracts for non-followers stay in the database, hidden; following again shows them.

- [ ] **Step 1: Write the failing real-PG tests.**
  - "same response for unknown and non-follower": customer detail, manual order, manual order with a foreign branch id, contract create, bulk create and PATCH.
  - "PATCH after unfollow is 404"
  - "contract write racing a block: the write commits first or fails, never after the block"
  - "list hides blocked followers"
  - "manual order issues no restaurant/location query before the check" (count the pool queries).
- [ ] **Step 2: Run** `pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the PG suite plus `pnpm --filter @supplify/api exec vitest run src/routes/restaurants.routes.test.js src/routes/restaurant-pricing.routes.test.js src/routes/orders`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(api): suppliers reach only following restaurants; no probing` and update the ledger.

---

### Task 8: Supplier intelligence, reports, loyalty, the Assistant, delivery documents

**Files:**

- Modify: `apps/api/src/routes/supplier-ops.routes.js:420`, `:495`, `:511`, `:527` and `:545`
- Modify: `apps/api/src/services/supplier-reorder-assistance.service.js:117-135`
- Modify: `apps/api/src/services/supplier-reorder-intelligence.service.js:8-92` and `:193-221`
- Modify: `apps/api/src/services/reorder-cadence.service.js:185-219`, `:257`, `:270-346` (supplier notifications)
- Modify: `apps/api/src/services/supplier-cross-sell-intelligence.service.js:26-84`
- Modify: `apps/api/src/services/reports.service.js:433-455` (top restaurants: followers by name, the rest as `Other customers`)
- Modify: `apps/api/src/services/loyalty.service.js:226-240` and the ledger at `apps/api/src/routes/loyalty.routes.js:200`
- Modify: `apps/api/src/services/assistant-tools/index.js:252-275` (`get_followed_suppliers`) and the supplier cross-sell tool
- Modify: `apps/api/src/services/restaurant-reorder-assistance.service.js:138-143` (suggest only transactable suppliers, label the others)
- Modify: `apps/api/src/routes/orders/documents.js:243-246` and `:327-330`, and `apps/api/src/services/delivery-routes.service.js:207-230`. `customer_order.delivery_location_snapshot` and `customer_contact_snapshot` already exist: swap the COALESCE order so the snapshot wins over the live profile. No migration.
- Review: the supplier-ops CSV exports (`apps/api/src/routes/supplier-ops.routes.js:605-700`) stay order-scoped. Add a test asserting they only contain the supplier's own invoices.
- Test: each service's `*.test.js`
- Test: `tests/integrity/marketplace/supplier-intel.pg.test.js`

- [ ] **Step 1: Write the failing tests.**
  - "at-risk, cross-sell, cadence and loyalty exclude non-followers"
  - "reminder draft and open-chat require follow"
  - "top restaurants groups non-followers as Other customers"
  - "assistant reorder suggestions never include blocked suppliers and label non-followed ones"
  - "packing slip after unfollow shows order snapshot, not live profile"
- [ ] **Step 2: Run** `pnpm --filter @supplify/api exec vitest run src/services src/routes/supplier-ops.routes.test.js && pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both commands. Expected: PASS.
- [ ] **Step 5: Commit** `fix(api): supplier intelligence and assistant respect the follow rule` and update the ledger.

---

### Task 9: Sponsorships and deals (app-wide, notifications)

**Files:**

- Modify: `apps/api/src/services/supplier-sponsorship.service.js:169-227` and `:251-405`
- Modify: `apps/api/src/routes/supplier-growth.routes.js:251-307`
- Do **not** drop `promotion_restaurant_targets` here; spec §11.5 puts it in release 2.
  - Here, stop reading and writing it.
  - The rehearsal records `SELECT count(*)`.
  - The release-2 drop in categories Plan Task 10 raises if the count is above 0, unless the ledger records the owner's acknowledgement. The reason: deals that targeted specific restaurants become visible to everyone.
- Modify: `apps/api/src/routes/promotions/promotions.helpers.js:78` and `:188-198` (remove `restaurantIds` / `syncRestaurantTargets`)
- Modify: `apps/api/src/routes/promotions/supplier.js:233`, `:335`, `:355-363` (also clear targets when a deal switches back to `applies_to = 'all'`) and `:678-692` (redemptions: `Verified restaurant` for non-followers)
- Modify: `apps/api/src/services/deal-promotions.service.js:880` and `:960`
- Modify: `apps/api/src/services/notification/templates.js:1252-1298` (`notifyDealApproved` to org-level followers, excluding blocked)
- Test: `apps/api/src/services/supplier-sponsorship.service.test.js`
- Test: `apps/api/src/services/deal-promotions.service.test.js`
- Test: `apps/api/src/routes/promotions.rbac.test.js`
- Test: `tests/integrity/marketplace/sponsorship-deals.pg.test.js`

- [ ] **Step 1: Write the failing tests.**
  - "sponsorship offer only to followers; never reveals another supplier's sponsorship"
  - Real-PG: "sponsorship offer racing an unfollow is serialised"
  - "active paid sponsorship continues after unfollow and block; no renewal offered"
  - "restaurantIds is rejected"
  - "switching to applies_to all clears targets"
  - "deal-approved notifies org followers except blocked"
  - "same response for unknown and non-follower on sponsorship create"
- [ ] **Step 2: Run** the listed unit tests and `pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): followers-only sponsorships, app-wide deals` and update the ledger.

---

### Task 10: Reviews and customer import (no enumeration)

**Files:**

- Modify: `apps/api/src/services/reviews.service.js:95-127` and `:296-317`
- Modify: `apps/api/src/routes/reviews.routes.js:46`
- Modify: `apps/api/src/routes/suppliers/suppliers.helpers.js:34`
- Modify: `apps/api/src/routes/suppliers/profile.js:844`
- Modify: `apps/api/src/services/supplier-customer-matching.service.js:35-140` (exact normalised email or phone only; remove the name `LIKE` and the city filter)
- Modify: `apps/api/src/services/supplier-connection-request.service.js:14-163`, which becomes the in-app invite:
  - a blocklist check;
  - the cap enforced through Task 2 on accept;
  - **no notification to the supplier on decline or accept** (`:141`, `:156-162` are removed). The prospect becomes `following` only through the follow itself.
- Modify: `apps/api/src/services/supplier-growth-invitation.service.js:34-35`
- Modify: `apps/api/src/routes/supplier-growth.routes.js:88-199` (remove `/rematch` and `/connect`; `/invite` enqueues)
- Create: `apps/api/src/jobs/prospect-invite.job.js`. It dispatches both matched (in-app notification `SUPPLIER_FOLLOW_INVITE`) and unmatched (email/SMS) invites asynchronously, using the existing jobs pattern in `apps/api/src/jobs`.
- Modify: `apps/api/src/services/quote-requests.service.js:31-65` (org-level block check), `:368-608` (fields per §11.3; hidden after a block) and `notification/templates.js:1832-1843`
- Test: `reviews.service.test.js`, `supplier-customer-matching.service.test.js`, `supplier-growth.routes.test.js`, `quote-requests.service.test.js`
- Test: `tests/integrity/marketplace/import-enumeration.pg.test.js`

**Interfaces:** Prospect rows expose only `{ id, name, email, phone, contact_person, area_region, status: 'imported' | 'invited' | 'following', invited_at }`. All of those except `status` are the supplier's own input. `status` becomes `following` only after the restaurant follows. The import endpoint caps rows per request at 500 and requests per supplier at 10 per hour (existing rate-limit middleware).

- [ ] **Step 1: Write the failing tests.**
  - "review lists never contain restaurant identity; own review marked is_own"
  - "prospect payloads contain no match fields"
  - "invite responses identical for matched, unmatched and blocked prospects": status, body, headers and statuses afterwards. Response time is within the same order of magnitude, because dispatch is asynchronous: assert that the handler awaits no matching work.
  - "name fragments never match"
  - "quote detail shows only allowed fields; hidden after block"
  - "/rematch and /connect are 404"
- [ ] **Step 2: Run** the unit tests and `pnpm test:marketplace:pg`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then the full `pnpm test:api`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(api): reviews, customer import and quotes reveal no restaurants` and update the ledger.

---

### Task 11: Performance and indexes

**Files:**

- Create: `tests/integrity/marketplace/bench.pg.test.js`, gated by `MARKETPLACE_BENCH=1`
- Create: `tests/integrity/marketplace/seed-large.js`: 300 supplier organisations (600 branches), 2,000 restaurants, 60,000 products, 20,000 follows, 500 blocks, 50,000 orders
- Possibly create: `apps/api/db/migrations/<next>_marketplace_indexes.sql`, only for indexes the benchmark proves necessary

**Budgets** (local Docker, warm cache, p95 over 50 runs; record the before/after numbers in the ledger):

| Query                                                     | Budget   |
| --------------------------------------------------------- | -------- |
| `getRelationship`                                         | ≤ 2 ms   |
| Restaurant product list, 24 rows with `catalogVisibleSql` | ≤ 60 ms  |
| Grouped `/api/search`                                     | ≤ 120 ms |
| Supplier customer list, 50 rows                           | ≤ 40 ms  |
| Deal list                                                 | ≤ 80 ms  |
| Conversation list                                         | ≤ 40 ms  |

No endpoint in Tasks 4–10 may issue per-row relationship queries. The test asserts the query count per request with a counting pool wrapper.

- [ ] **Step 1: Write the benchmark and query-count tests.** Expected: FAIL any budget that is exceeded.
- [ ] **Step 2: Run** `MARKETPLACE_BENCH=1 pnpm test:marketplace:pg`.
- [ ] **Step 3: Add indexes or rewrite queries** until the budgets pass, using `EXPLAIN (ANALYZE, BUFFERS)` output saved to `tests/integrity/marketplace/bench-results.md`.
- [ ] **Step 4: Re-run.** Expected: PASS.
- [ ] **Step 5: Commit** `perf(api): marketplace visibility indexes and benchmarks` and update the ledger.

---

### Task 12: Web clients

**Files (`apps/web/src`):**

- `hooks/useCartActions.ts:16-30` is the single choke point. `addItem` and `updateQuantity` check `is_followed`.
- Create `components/marketplace/FollowAndAddButton.tsx`. It replaces the add buttons in `components/products/ProductCatalogRow.tsx:197,241`, `pages/ProductsPage.tsx:249,546`, `pages/ProductDetailPage.tsx:32,62`, `pages/QuickListsPage.tsx:244`, `pages/QuoteRequestDetailPage.tsx:68`, `pages/PublicSupplierCatalogPage.tsx:333` and `components/inventory/ReorderAssistancePanel.tsx:867`. A single tap follows the supplier and then adds the item. At the cap it opens the existing upgrade prompt used by `CartPage.tsx` for `LIMIT_EXCEEDED`.
- `pages/CartPage.tsx:339-397` handles `FOLLOW_REQUIRED` with an inline per-supplier "Follow & keep in cart" row.
- Follow buttons in `pages/SuppliersPage.tsx:218-236` and `pages/SupplierDetailPage.tsx:157-174` handle `SUPPLIER_FOLLOW_LIMIT_REACHED` (upgrade prompt) and `SUPPLIER_BLOCKED` ("Unblock to follow").
- Private-catalog supplier card: "Follow to see the catalog".
- Chat (`components/chat/ChatComposer.tsx`, `ChatConversationList.tsx`, `pages/ChatPage.tsx`):
  - a read-only banner;
  - a "Message about order #…" chip when `open_order_ids` exist;
  - a closed-by-block state;
  - listening to `conversation_access_changed`.
- `components/chat/NewConversationDialog.tsx:28-40`: restaurants come from a server-side search (followers only), not `limit:200`.
- Supplier screens:
  - `pages/RestaurantsPage.tsx`, `RestaurantDetailPage.tsx` ("not available" state)
  - `OrdersPage.tsx:82,172-178` (manual order picker: server search of followers)
  - `ContractPricingPage.tsx:144-156`
  - `SupplierCustomerGrowthPage.tsx:182,560-583` (no match columns; statuses imported / invited / following)
  - `components/supplier/SponsorshipOffersPanel.tsx`
  - top-restaurants report ("Other customers")
- `pages/CreateQuoteRequestPage.tsx:46-51`: server-searched, paginated supplier and product pickers, with followed suppliers first and marked.
- i18n: `locales/{en,ar}` keys in the relevant namespaces: `followAndAdd`, `followToReorder`, `followToSeeCatalog`, `unblockToFollow`, `chatReadOnly`, `chatClosedByBlock`, `messageAboutOrder`, `verifiedRestaurant`, `otherCustomers`, and the growth statuses.
- Tests: colocated `*.test.tsx`.
- E2E: `tests/e2e/suites/critical_e2e/marketplace-visibility.spec.ts`.

- [ ] **Step 1: Write the failing tests.**
  - "Follow & add follows then adds in one tap"
  - "cart FOLLOW_REQUIRED shows per-supplier follow rows"
  - "follow at cap opens upgrade prompt"
  - "composer read-only with open-order chip"
  - "access change event closes composer live"
  - "growth page never renders match data"
  - "quote pickers search server-side"
  - RTL snapshot of `FollowAndAddButton` in Arabic
  - E2E: "restaurant browses non-followed supplier, follows from product, orders"; "supplier never sees non-follower in customers".
- [ ] **Step 2: Run** `pnpm test:web`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm test:web`, then `pnpm exec playwright test --config=tests/playwright.config.ts --project=critical_e2e_restaurant` against local dev. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): follow-and-add, relationship-aware chat, private customer import` and update the ledger.

---

### Task 13: Mobile clients (Android source of truth, mirrored to iOS)

Use the `supplify-mobile-design` workflow: inspect, look at real screenshots, critique, implement, build, capture, fix.

**Files (`src/` in `C:/w/smv`, copied to `C:/w/smiv`; the trees are identical today):**

- `store/cartStore.ts:38` is the choke point.
- Create `features/restaurant/components/FollowAndAddButton.tsx` and use it in:
  - `features/restaurant/components/catalog-product-card.tsx:83-103,160,290`
  - `features/restaurant/screens/CatalogScreen.tsx:155,183,415`
  - `components/ui/v2.tsx:76,158`
  - `features/restaurant/components/ReorderGuidance.tsx:96`
  - `QuickListsScreen.tsx:61`
  - `QuoteRequestDetailScreen.tsx:39`
  - `home/HomeSections.tsx:465` (UsualsRail)
- `CartScreen.tsx:207-255`: inline `FOLLOW_REQUIRED` rows instead of an `Alert`.
- `SuppliersScreen.tsx:175-194` and `supplier-market-card.tsx:62-93`: cap sheet and the blocked state.
- Private-catalog supplier card.
- `features/chat/screens/ChatThreadScreen.tsx:165-361`:
  - read-only banner;
  - order chip;
  - closed-by-block state;
  - socket `conversation_access_changed`.
- `features/chat/screens/NewConversationSheet.tsx:100-126`: server search.
- `features/supplier/screens/CustomersScreen.tsx`, `ContractPricingScreen.tsx:50-83`, `CustomerGrowthScreen.tsx:87-189` (no match row).
- `CreateQuoteRequestScreen.tsx:30`: searchable suppliers, followed first.
- `services/api/client.ts:16` error codes, `services/api/queries/*`, `types/supplify.ts`, `types/growth.ts`.
- `i18n/en.json` and `ar.json`.
- Tests: `features/**/__tests__/*.test.tsx`.

- [ ] **Step 1: Write the failing tests.**
  - "Catalog card shows Follow & add for unfollowed supplier and adds after follow"
  - "Cart shows FOLLOW_REQUIRED rows"
  - "ChatThread read-only with order chip; closes on access change"
  - "CustomerGrowth shows Invited, never a match"
  - "Quote supplier picker queries server"
- [ ] **Step 2: Run** `npx jest` in `C:/w/smv`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx tsc --noEmit && npx jest` in `C:/w/smv` (PASS). Then copy every changed file to `C:/w/smiv` at the same paths, leaving the iOS `package.json` and `eas.json` untouched, and run the same commands there (PASS).
- [ ] **Step 5: Build and capture.**
  - Build Android with the local recipe (memory: JDK 17, short path, embedded bundle) and install it on the emulator.
  - Capture before/after screenshots into `design-audit/mobile/marketplace-visibility/` with the `supplify-mobile-design` capture set:
    - 390×844 initial and scrolled
    - Arabic RTL
    - 360×800
    - font scale 1.3
  - Fix the defects found, then reset the emulator display.
- [ ] **Step 6: Commit** `feat(mobile): follow-and-add, relationship-aware chat, private customer import` in each mobile repo, and update the ledger.

---

### Task 14: Docs, parity, full regression

**Files:**

- Create: `docs/features/marketplace-visibility.md`. It covers the rule table, unfollow, block, chat and quotes rules, the error codes and the realtime revocation.
- Modify: `docs/mobile/MOBILE_FEATURE_PARITY.md` (a dated entry; add it with an `Edit` that leaves the other session's uncommitted entries alone)
- Modify: `docs/mobile/MOBILE_PARITY_CHECKLIST.md`
- Modify: `docs/features/search-and-discovery.md`, `deals-and-promotions.md` and `supplier-ops.md`
- Modify: `docs/architecture/rbac-overview.md` (the relationship layer)
- Modify: `docs/onboarding/*` (migration counts, routes)

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Run `pnpm typecheck && pnpm test:api && pnpm test:web && pnpm test:marketplace:pg`, plus `npx tsc --noEmit && npx jest` in both mobile worktrees. Expected: all PASS. Record the counts in the ledger.
- [ ] **Step 3: Commit** `docs: marketplace visibility rules`.

---

### Task 15: Rehearsal, dev deploy, preprod deploy, evidence (stop before prod)

- [ ] **Step 1: Migration rehearsal.**
  - Dump the dev database to a local container: Railway CLI `railway connect` / `pg_dump` into `supplify-marketplace-rehearsal` on `127.0.0.1`.
  - Run all migrations and startup steps against it.
  - Produce reconciliation counts in `docs/superpowers/plans/2026-11-25-marketplace-ledger.md`:
    - follow rows before and after;
    - orgs merged;
    - follows dropped because blocked;
    - `promotion_restaurant_targets` rows still present (dropped in release 2);
    - suppliers that got a new organisation row.
- [ ] **Step 2: Merge** `feat/marketplace-visibility` into `dev` in all three repos (no fast-forward; resolve conflicts by preserving both sides), then push. Railway dev deploys and runs migrations (`RUN_MIGRATIONS_ON_START=true`). Watch the API logs for `Full startup migrations completed`.
- [ ] **Step 3: Smoke test on dev** with the HORECA demo logins.
  - Run the Playwright critical suites against `app-dev`.
  - Run the mobile demo build against the dev API: `npx eas-cli build --platform android --profile demo` from `C:/w/smv`.
  - Run an iOS simulator build: `npx eas-cli build --platform ios --profile ios-simulator` from `C:/w/smiv`. First reconcile the iOS EAS project id: `app.json` says `69e55e43…`, but `IOS_PLATFORM.md` says `34a9b878…`.
  - Fix regressions on the feature branch and repeat.
- [ ] **Step 4: Preprod.**
  - Promote by hand in a throwaway worktree outside the repo (memory `release-prune-deletes-untracked`): `git worktree add C:/w/rel-pre preprod`, merge `origin/dev` with `-X theirs`, sync runtime paths, run the prune there, diff against `origin/preprod`, commit and push.
  - Repeat in each mobile repo.
  - Verify the preprod deploy logs, and run the smoke suite against preprod.
- [ ] **Step 5: Evidence package** in the ledger:
  - migration reconciliation counts (rehearsal, dev, preprod);
  - test results with counts;
  - benchmark before/after;
  - screenshots;
  - EAS build links;
  - remaining risks, with "iOS not visually verified" always on the list.
- [ ] **Step 6: Stop.** Report to the owner and wait for approval before any production promotion.

---

### Task 16: Drop `supplier_id` from relationships, plus the remaining readers (release 2, alongside categories Plan Task 10)

**Files:**

- Modify: the remaining readers, which move to `supplier_org_id`:
  - `apps/api/src/routes/admin.routes.js:236-240`
  - `apps/api/src/routes/admin-dashboard/tenants.js:310`
  - `apps/api/src/lib/admin-tenant-usage-metrics.js:52`
  - seeds `seed-business-engineer-demo.js:299,467` and `seed/horeca-sections.mjs:355`
  - `scripts/qa/verify-ipad-data.mjs`
  - tests `tests/integrity/restaurant.pg.test.js:277` and `supplier-order-checkout.pg.test.js:223`
- Create: `apps/api/db/migrations/<next>_drop_relationship_supplier_id.sql`. A `DO` block drops `supplier_follow.supplier_id` and `supplier_blocklist.supplier_id`, along with their old unique constraints.

- [ ] **Step 1: Grep gate.** `grep -rnE "(supplier_follow|supplier_blocklist|\bsf|\bsb)\.supplier_id\b" apps/api/src apps/api/scripts scripts tests` must return nothing outside the drop migration.
- [ ] **Step 2: Write the failing real-PG test.** "relationship tables have no supplier_id; admin tenant metrics still count follows per org".
- [ ] **Step 3: Implement and run** the full regression (Task 14, Step 2). Expected: PASS.
- [ ] **Step 4: Commit** `refactor(api): relationships keyed only by organisation`, then deploy with categories Plan Task 10.
