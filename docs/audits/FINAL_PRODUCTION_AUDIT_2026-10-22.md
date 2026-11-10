# SUPPLIFY FINAL PRODUCTION AUDIT

Date: 2026-10-22
Scope: release-gate review of the working tree at `c:\myProjects\supplify_erp`, traced from implementation. Not a redesign.

## 1. RELEASE VERDICT

🟡 APPROVED WITH KNOWN NON-BLOCKING RISKS

## 2. EXECUTIVE SUMMARY

Supplify can go to production for real restaurants, suppliers, warehouses, drivers, consumers, and admins, provided the two concurrency fixes in this audit ship with the release and the production configuration checklist is actually true in the hosted environment.

The core order machine is server-enforced. Restaurant checkout prices come from the server, not the client. Stock reservation locks `inventory` or `warehouse_inventory` rows inside the placement transaction. Warehouse routing picks one eligible warehouse inside the supplier tenant and refuses a split. Receiving has a unique report per order. Guest tracking tokens are 32-byte random values stored only as SHA-256 hashes. Upload sessions are single-use, magic-byte checked, and private by default. E2E reset routes cannot mount unless debug mode, dev app env, and `E2E_SECRET` are all set, and production config validation rejects that secret outside dev.

The weakest areas are operational, not the happy-path state machine: Railway’s health check does not touch Postgres, ClamAV failure is a documented degraded accept path, idempotency keys are optional for older clients, and guest checkout shares one idempotency namespace per supplier. Those are real, and they are not reasons to hold the release if ClamAV, Postgres, Keycloak, and object storage are up on deploy day.

Two release-blocking races were found and fixed: legacy `COMPLETED` could overwrite a cancel, and the first warehouse-stock seed could overwrite a reservation that another checkout had just written.

Real customer rows are tenant-scoped on the paths reviewed. Financial totals for checkout and invoices are computed on the server from stored prices. Inventory integrity holds for the normal reserve, commit, release, and receive paths after the seed fix. Performance is acceptable for launch: list endpoints are capped, stock locks are batched, and no unbounded order query was found on the placement path. This audit did not run a production load test, so no millisecond claims are made.

## 3. RELEASE BLOCKERS

| Severity | Area            | Issue                                                                                                                                                                                                                                    | Impact                                                                                 | Fixed? | Verification                                                                                                                                      |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Order lifecycle | `PATCH /api/orders/:id` with legacy `status: COMPLETED` read the order, then updated it to `DELIVERED` without `FOR UPDATE` or a status predicate. A cancel that committed first was overwritten, after stock had already been released. | Delivered order with stock available to sell again.                                    | Yes    | `markLegacyOrderDelivered` locks the row and updates `WHERE status = $locked`. `orders.helpers.test.js` covers cancel, shipped, and lost-update.  |
| P1       | Inventory       | First-time warehouse seeding copied legacy `inventory` with `ON CONFLICT DO UPDATE`, which replaced `quantity_available` even after another transaction had reserved that row.                                                           | Concurrent first orders of a product with no `warehouse_inventory` row could oversell. | Yes    | Seed insert is `ON CONFLICT DO NOTHING`. Inactive rows are `FOR UPDATE`. `warehouse-inventory-heal.test.js` and `supplier-stock.service.test.js`. |

No open P0 or P1 remains in the paths reviewed.

## 4. FIXES MADE DURING AUDIT

### Legacy completion vs cancel

- Files: `apps/api/src/routes/orders/orders.helpers.js`, `apps/api/src/routes/orders/orders.helpers.test.js`, `apps/api/src/services/warehouseInventory.js`, `apps/api/src/services/warehouseInventory.test.js`
- Problem: `handleOrderDelivery` selected the order without a row lock and then ran `UPDATE customer_order SET status = 'DELIVERED' WHERE id = $1`. The normal `DELIVERED` patch already locked the order. The legacy `COMPLETED` path did not.
- Root cause: the status check ran before the transaction. The write inside the transaction did not re-check the locked status.
- Fix: `markLegacyOrderDelivered` does `SELECT … FOR UPDATE`, allows the legacy transition only from `SHIPPED`, and updates `WHERE id = $1 AND status = $2`. Non-pickup orders must still have an active driver assignment and proof of delivery when the supplier requires it. `releaseInventoryForOrder` and `commitDispatchInventoryForOrder` now lock assignment rows with `FOR UPDATE`.
- Tests: cancel does not write `DELIVERED`; shipped order updates only while status is `SHIPPED`; `rowCount = 0` fails; release SQL includes `FOR UPDATE`.
- Verification: those unit tests passed. Full API suite re-run is recorded in section 13.
- Regression risk: low. Clients that still send `COMPLETED` get `400` if the order is no longer `SHIPPED`. Current web and mobile mark delivery through the locked `DELIVERED` path. No request or response field changed.

### Warehouse seed must not clobber a reservation

- Files: `apps/api/src/services/supplier-stock.service.js`, `apps/api/src/services/supplier-stock.service.test.js`, `apps/api/src/services/warehouse-inventory-heal.test.js`
- Problem: `seedMissingWarehouseInventoryForSupplier` upserted legacy quantities onto `warehouse_inventory` and overwrote an existing row.
- Root cause: the missing-row check and the upsert were not one atomic “insert if absent”. A second checkout could write the stale legacy quantity on top of a reservation.
- Fix: legacy heal uses `INSERT … ON CONFLICT (warehouse_id, product_id) DO NOTHING`. Inactive warehouse rows are locked with `FOR UPDATE OF wi` before a transfer, so two heals cannot both add the same inactive quantity.
- Tests: heal test expects the insert-only SQL and the quantity parameters; supplier-stock test expects `DO NOTHING` and the inactive lock.
- Verification: both files passed after the test expectation was updated to the new SQL.
- Regression risk: low. A product that already has a warehouse row is left alone. Inactive stock still moves, but only the transaction that holds those rows performs the add.

## 5. BUSINESS FLOW STATUS

| Flow                     | Status  |
| ------------------------ | ------- |
| Authentication           | ✅ PASS |
| RBAC                     | ✅ PASS |
| Tenant isolation         | ✅ PASS |
| Restaurant ordering      | ✅ PASS |
| Supplier routing         | ✅ PASS |
| Warehouse assignment     | ✅ PASS |
| Inventory                | ✅ PASS |
| Contract pricing         | ✅ PASS |
| Cart                     | ✅ PASS |
| Checkout                 | ✅ PASS |
| Order lifecycle          | ✅ PASS |
| Packing                  | ✅ PASS |
| Shipping                 | ✅ PASS |
| Driver assignment        | ✅ PASS |
| Delivery                 | ✅ PASS |
| POD                      | ✅ PASS |
| Receiving                | ✅ PASS |
| Disputes                 | ✅ PASS |
| Invoices                 | ✅ PASS |
| Statements               | ⚠️ RISK |
| Public consumer ordering | ✅ PASS |
| Guest ordering           | ⚠️ RISK |
| Notifications            | ✅ PASS |
| File upload/security     | ⚠️ RISK |
| Web                      | ✅ PASS |
| Android                  | ⚠️ RISK |
| iOS                      | ⚠️ RISK |

Statements are computed from invoices and payments on the server. This audit did not re-execute every statement total against a populated ledger, so they stay at risk rather than a clean pass. Guest ordering is correct for a random idempotency key and a hashed tracking token; the shared guest scope and the null token on replay are the residual risk. File upload is strong when ClamAV is healthy. Android and iOS typecheck passed; release binaries and device passes were not run here.

## 6. PERFORMANCE

No production load test was run. Findings below are from the code, not from timings.

- Slowest work on the critical path is order placement inside one transaction: price resolution, per-supplier stock locks, single-warehouse routing, promotions, and loyalty. That cost is the correctness boundary. It is not an N+1 of unbounded history.
- `claimOrderPlacementKey` deletes every succeeded idempotency row older than 180 days on every placement (`apps/api/src/services/order-placement-idempotency.service.js`). With an empty old set this is a cheap scan. After six months, concurrent checkouts can block each other on those deletes for the whole order transaction. Move that delete to a scheduled job before the table ages. Not a day-one blocker.
- Order lists cap `limit` at 100 and use `LIMIT`/`OFFSET` (`apps/api/src/routes/orders/orders.helpers.js`, `list.js`).
- Stock reservation locks the needed `warehouse_inventory` rows in one `FOR UPDATE`, then applies one batched update (`reserveWarehouseStockBatch`).
- Receiving writes one line insert per line inside the locked order transaction. Typical baskets are fine. A very large receive holds the order row longer.
- Pool default is `DATABASE_POOL_MAX` 20. Slow-request logging starts at `SLOW_REQUEST_MS` 800.
- Hot-path indexes already exist (migrations `0132`, `0139`, `0140`). Unique indexes back one receiving report per order and one idempotency key per actor scope. No missing index on the stock-lock or order-status paths was identified as a launch blocker.
- The working tree drops an unused supplier tracking query on the web order detail page, which removes a duplicate request. That change was already in progress; it was not part of the race fixes.
- Production web build succeeded. Largest minified chunks: app entry `index` 422.64 kB, `vendor` 412.40 kB, `charts` 321.07 kB, `calendar` 267.58 kB, delivery map 151.18 kB. Charts, calendar, and the map are separate chunks, not on every route. Gzip sizes were not printed by the build.

Remaining risk: the idempotency cleanup delete, and the absence of a measured p95 for supplier discovery and catalog search under production data volume.

## 7. SECURITY

- Tenant isolation: restaurant and supplier mutations use the server-resolved tenant id. Order read access requires the restaurant id or an `order_item` row for the caller’s supplier. Invoice detail calls `assertInvoiceTenantAccess` after load. Chat read and mark-read load the conversation and call `userCanAccessConversation`. Product file attach checks the product’s supplier against the caller.
- RBAC: role and permission checks sit on order update, fulfillment, and the admin create/refund/approve routes in the working tree (`ADMIN_TENANTS`, `ADMIN_FINANCE`, `ADMIN_GROWTH`). Permission bundles are cached for 120 seconds and invalidated on role change.
- IDOR: new checkout creates one order per supplier tenant, so `LIMIT 1` on `order_item.supplier_id` matches that tenant. A historical order that still mixed suppliers would let the supplier of an arbitrary first line act on the whole order. Current placement does not create those rows.
- File security: objects are private. `GET /api/files/object` requires a 1-hour HMAC (`SESSION_SECRET`) or ownership. Upload sessions move `pending` → `processing` once. A different body hash is a replay conflict. Magic bytes are checked. Product attach now uses the scanned session’s content type and max bytes, not the client’s declared type. `STORAGE_PUBLIC_READ` is rejected by production config validation.
- ClamAV: if the scanner is unavailable, magic-byte-valid uploads can be stored as `scan_unavailable` and later attached. Migration `0227` only aligns the check constraint with that existing runtime path. It does not skip magic-byte checks. Production must run ClamAV if you do not want that degraded accept.
- Webhooks: WhatsApp verifies `X-Hub-Signature-256`. Internal OTP email requires a timing-safe bearer secret.
- Guest orders: tracking lookup is by token hash only. Consumer reads filter `consumer_user_id`. Guest idempotency scope is `PUBLIC:{supplierId}` for every guest of that supplier. Current web and mobile keys are UUIDs, so another guest cannot replay an order without the key and the identical payload. A predictable client key would be a problem. Do not ship a client that uses a constant or cart-derived key.
- Sensitive logging: query helpers avoid logging SQL parameters. File read failures log the error name, not the object body. Order update still logs the request body at info; that can include a cancel reason. Not a credential leak. Worth tightening later.
- Production secrets: `validateProductionConfig` rejects weak `SESSION_SECRET`, `E2E_SECRET` outside dev, demo seed, and default object-storage keys when `APP_ENV` is preprod or prod. This audit cannot see the live secret store. Treat hosted secrets as UNKNOWN until deploy checks them.

## 8. DATA INTEGRITY

| Area              | Verdict                                                                                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orders            | Safe after the legacy `COMPLETED` lock. Illegal transitions throw. Terminal received/invoiced/cancelled statuses cannot move backward through the normal patch.                                                                                                 |
| Inventory         | Safe for concurrent checkout of an existing warehouse row (`FOR UPDATE` then conditional quantity check). Safe for the first seed after `DO NOTHING`. Cancel releases warehouse reservations once; a second release sees `failed` and does not add stock again. |
| Money             | Server is the source of truth. Checkout uses resolved contract or catalog prices and stores `unit_price` / `line_total` as `NUMERIC`. Invoices cap discounts at the subtotal and round to 2 decimal places. Client totals are not trusted.                      |
| Warehouse routing | One warehouse per order, tenant-scoped, zone and stock checked. Reassignment does not reprice. Target warehouse must belong to the same supplier tenant and organization.                                                                                       |
| Receiving         | One report per order (`uq_receiving_report_order`) plus an order row lock. Over-receive is rejected. Restaurant inventory updates are locked per product.                                                                                                       |
| Delivery          | `updateRouteStop` locks the route and the stop and applies assignment hops in one transaction. Notifications run after commit.                                                                                                                                  |
| Idempotency       | Strong when `Idempotency-Key` is present (unique on actor scope + key, claim inside the order transaction, rollback releases an in-progress claim). Optional when the key is absent.                                                                            |
| Concurrency       | Order status patches compare the locked status to the status the caller saw and return 409 when it moved. The legacy completion path now fails closed the same way.                                                                                             |

## 9. DATABASE / MIGRATION SAFETY

Latest migration on disk is `0227_allow_scan_unavailable_file_status.sql`.

Reviewed as safe to apply to a populated database:

- `0224_account_deletion_org_close.sql` adds nullable columns. No table rewrite and no row delete.
- `0226_mobile_public_shop_feature_flag.sql` upserts one feature-flag row, default off.
- `0227` drops and re-adds a check constraint as `NOT VALID`, then `VALIDATE CONSTRAINT`. It does not rewrite `file_security_scan` and does not delete files. `VALIDATE` takes a lock while it checks existing rows. That table is small relative to orders. Existing statuses are a subset of the new list, so validation should succeed.

`0225_cancel_spurious_free_over_past_due.sql` is a targeted `UPDATE` of free `pending_activation` subscription rows that sit beside a commercial row for the same tenant. It does not touch orders or inventory. It will change billing status for rows that match. Apply it on a staging copy first and spot-check a tenant that has both a free pending row and a paid or past-due row. It is not a lock-the-orders-table migration.

No migration in the 0220–0227 range drops order, inventory, or invoice data, assumes an empty table, or rewrites `customer_order`.

This audit did not execute the migrations against a production-sized database.

## 10. WEB STATUS

Build: production `pnpm --filter @supplify/web build` succeeded (`tsc` then Vite, built in 24.89s).
Tests: 144 files, 560 passed, 0 failed (`pnpm --filter @supplify/web test:run`).
Typecheck: `tsc --noEmit` passed.
Major issues: none found in this pass. The working tree also tightens admin featured-placement buttons to `ADMIN_GROWTH` / `ADMIN_FINANCE`, matching the new API gates.
Production risk: low for the web app itself. Deploy the same commit as the API so the admin permission gates and the order-detail request removal stay together.

## 11. ANDROID STATUS

Build: release binary not built in this audit.
Typecheck: `npx tsc --noEmit` in `C:\myProjects\supplify-mobile` passed.
Tests: not run in this audit.
Crashes found: none from static review of the checkout and order clients. No device pass was done.
API compatibility: restaurant checkout and public checkout send a UUID `Idempotency-Key`. Delivery status is not sent as legacy `COMPLETED`. No mobile change was required for the server fixes.
Production risk: low for API contract. Unknown for a store binary until a release build is installed on a device.

## 12. IOS STATUS

Build: release binary not built in this audit.
Typecheck: `npx tsc --noEmit` in `C:\myProjects\supplify-mobile-ios` passed.
Tests: not run in this audit.
Crashes found: none from this pass. No simulator pass was done.
API compatibility: same contract as Android for the flows checked (idempotency key on placement, no legacy `COMPLETED` write).
Production risk: same as Android. Typecheck is green; a device smoke test on deploy day is still required.

## 13. TEST RESULTS

API: 371 files passed, 2307 tests passed, 0 failed (`vitest run` after both fixes and the heal-test update). An earlier run of the same suite failed 1 test (`warehouse-inventory-heal.test.js`) because it still expected the old overwrite upsert. That expectation was updated, and the suite above is the clean re-run.

Web typecheck: passed.
Web tests: 144 files, 560 passed / 0 failed.
Web production build: passed.
Android typecheck: passed.
iOS typecheck: passed.
Android tests: not run.
iOS tests: not run.

Critical slice run earlier, before the seed fix was included in a full pass: 13 files, 117 tests passed, including orders helpers, warehouse inventory, placement idempotency, supplier stock release, receiving, public sales, files, delivery routes, order routes, and driver access.

## 14. KNOWN NON-BLOCKING ISSUES

P2

- Idempotency keys are optional. Web (`OrdersPage`, `PublicSalesCheckout`) and both Expo apps send a UUID. A client that omits the key can create two orders with two clicks.
- Guest actor scope is `PUBLIC:{supplierId}` rather than per guest. Safe with random keys. Unsafe if a client ever sends a shared or short key.
- A replay of a guest checkout returns `trackingToken: null` because the raw token is not stored. The web falls back to a one-time receipt. The first token stays valid. Do not rotate it on replay; that would invalidate a response already in flight.
- Idempotency retention delete runs inside the placement transaction.
- Railway `healthcheckPath` is `/health`. That handler checks object storage and returns 200 without querying Postgres. `/ready` runs `SELECT 1` and reports migration startup. A database outage does not fail the Railway check.
- ClamAV outage accepts magic-byte-valid files as `scan_unavailable`.
- Order lines are `NUMERIC(14,3)` from JavaScript multiplication. Invoices round to 2 decimal places. A 0.001 difference can exist between an order line and an invoice line. It is not a client-trusted total.
- Auto-invoice errors after a successful receive are logged and do not roll the receive back. The goods receipt stands; the invoice may need a retry. That is intentional so a billing glitch does not lose the receipt.
- Order update logs the request body.
- Image bytes are magic-byte checked. Sharp is not applied on the upload path.

P3

- `orderUpdateSchema` still lists received statuses that the transition guard rejects.
- Amendment copy says processing orders cannot be amended while `PROCESSING` is still mutable.
- POD presign does not prove the order id belongs to the supplier. The submit path does (`assertSupplierOwnsOrder`). A presign for a foreign id only spends the caller’s own upload quota.
- Permission cache can be stale for up to 120 seconds if an invalidation call fails.

## 15. PRODUCTION CONFIGURATION CHECKLIST

[ ] production database — UNKNOWN (not visible from the repo)
[ ] production Keycloak configuration — UNKNOWN (local docs say port 8180; hosted realm was not inspected)
[ ] storage — code requires private objects and non-default keys in hosted env; live bucket UNKNOWN
[ ] ClamAV — required for a clean verdict on uploads; live daemon UNKNOWN
[ ] email provider — UNKNOWN
[ ] push notifications — VAPID keys are env-driven; live keys UNKNOWN
[ ] Sentry — UNKNOWN from this pass (not confirmed against the hosted project)
[ ] CORS — allow-list is `WEB_ORIGINS`; live list UNKNOWN
[ ] domains — UNKNOWN
[ ] mobile API URLs — must point at production API in the store binaries; UNKNOWN
[ ] deep links — UNKNOWN until a device opens an order and a guest tracking link
[ ] migrations — files through `0227` are present; applied state of production UNKNOWN
[ ] health checks — `/health` and `/ready` exist; Railway uses `/health` (does not check Postgres)
[ ] secrets — validation fails closed on weak values when `APP_ENV` is preprod or prod; live values UNKNOWN
[ ] rate limits — enabled path exists, default 300 requests per window in production node; live value UNKNOWN
[ ] logging — structured logger; SQL parameters are not logged
[ ] backups/rollback capability — UNKNOWN; confirm a Postgres backup and a previous deploy image before traffic

Do not treat a blank hosted dashboard as configured.

## 16. DEPLOYMENT-DAY SMOKE TEST

Run against production immediately after deploy. About 20 minutes with two browsers or one browser and one phone.

1. Restaurant login. Open an order list. Session survives a refresh.
2. Supplier login. Order list shows only that supplier’s orders.
3. Driver login. Home shows only that driver’s route.
4. Consumer account login, or skip if `mobile_public_shop` is off and you are not testing web public sales.
5. Restaurant supplier discovery. A supplier organization appears once. Open it.
6. Catalog loads. An inactive product is absent.
7. Contract price on a known contracted item matches the contract, not the public list price.
8. Add that item to the cart. Change quantity. Confirm the server preview, not the typed total, is what checkout will bill.
9. Place the restaurant order once. Double-click or retry with the same idempotency key. Exactly one order id comes back.
10. Supplier order detail shows one warehouse on the assignment, inside that supplier tenant.
11. Supplier accepts the order (`ACKNOWLEDGED`). A second accept does not create a second financial document.
12. Move the order through packing / processing.
13. Assign a driver who belongs to that supplier. A driver from another supplier is rejected.
14. Mark shipped only after the driver assignment exists.
15. Upload proof of delivery when the supplier requires it. Delivery without it is rejected.
16. Mark delivered. Refresh. Status stays delivered.
17. Restaurant receives the order once. A second receive is rejected. Received quantity above ordered quantity is rejected.
18. Supplier available quantity dropped by the ordered amount at placement and did not drop again at delivery. Restaurant on-hand rose by the accepted quantity only.
19. Invoice total equals accepted quantities times snapshotted unit prices, minus any promotion already on the order, plus tax at the supplier rate. Compare the invoice to the order. They may differ by rounding at the third decimal; they must not differ by a unit price.
20. Restaurant and supplier each get one notification for placement and one for delivery. Open the link. It lands on that order, not another tenant’s order.
21. If public sales is on: guest checkout with cash on delivery or the enabled payment method. Refresh the result page.
22. Open guest tracking with the token from step 21. A random token returns not found. A different guest cannot open it.
23. Copy an order id from the restaurant session into the supplier session of an unrelated supplier, and the reverse. Both get 403 or 404, not the order body.
24. Upload a product image as the owning supplier. A supplier user cannot attach a file to another supplier’s product. A mismatched extension is rejected.
25. Confirm `/ready` returns ok. Confirm one error you force (bad login is enough) shows a request id. If Sentry is configured, that event arrives without passwords or tokens in the payload.

## 17. ROLLBACK TRIGGERS

Roll back the deploy, or disable new checkout, if any of these happen:

- A user can read or mutate another tenant’s order, invoice, inventory, or file.
- Login fails for a large share of users, or Keycloak is unreachable and sessions cannot refresh.
- Restaurant or public checkout returns 5xx for valid baskets, or creates two orders for one idempotency key.
- Available stock goes negative, or a cancelled order’s quantity is not returned.
- The same placement creates two orders for clients that sent an idempotency key.
- Invoice totals do not match accepted quantity times the order’s stored unit price, beyond a 0.01 rounding difference.
- A migration fails or `0225` cancels a subscription that was the tenant’s real paid plan.
- API 5xx rate spikes above the normal baseline in the first 15 minutes and is not a single bad client.
- Current Android or iOS builds cannot reach the API host or reject the auth token.

## 18. FINAL SIGN-OFF

RELEASE VERDICT:
🟡 APPROVED WITH KNOWN NON-BLOCKING RISKS

CONFIDENCE:
78%

REMAINING P0 ISSUES:
0

REMAINING P1 ISSUES:
0

BIGGEST REMAINING RISK:
Railway will keep routing to an instance whose Postgres is down, because `/health` does not query the database, and uploads are accepted without a malware verdict if ClamAV is down.

SAFE TO RELEASE TO REAL CUSTOMERS:
YES
