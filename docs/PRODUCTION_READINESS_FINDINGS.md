# Production Readiness Findings Report — Supplify API

**Scope:** Node.js API, Postgres, multi-tenant SaaS.  
**Focus:** Bottlenecks, scalability risks, security, reliability, observability.

---

## Executive summary

- **3 most likely bottlenecks:** (1) N+1 product queries on order creation and invoice creation, (2) orders list + calendar without composite index on `(restaurant_id, created_at)`, (3) per-request tenant lookup by email (repeated `SELECT id FROM restaurant/supplier WHERE contact_email = $1`) with no caching.
- **Highest-risk endpoints under load:** `POST /api/orders` (N+1 + transaction hold), `GET /api/orders` (heavy list + count + items), `GET /api/orders/calendar` (large date range), `GET /api/chat/conversations/:id/messages` (no tenant check + pagination).
- **Tenant scoping:** Enforced in many routes via role + email → restaurant_id/supplier_id lookup and then `WHERE restaurant_id = $1` or equivalent. **Gaps:** `GET /api/invoices/:id` (no check), `GET /api/chat/conversations/:conversationId/messages` (no participant check), `GET /api/restaurants/:id` (supplier can view any restaurant by ID).

---

## Top 10 issues (ranked by impact)

### 1. **Invoice GET by ID — missing tenant scoping (IDOR)**  
**Risk:** P0 — Security / compliance  
**Where:** `apps/api/src/routes/invoices.routes.js` — `router.get('/:id', requireAuth, ...)`  
**Evidence:** After `SELECT ... FROM invoice WHERE i.id = $1` there is no check that the caller is the invoice’s supplier or the invoice’s restaurant. Any authenticated user can pass any invoice UUID and read PII (restaurant/supplier contact, amounts).  
**How to prove:** As restaurant A, call `GET /api/invoices/{invoice_id_for_restaurant_B}`; response 200 with full invoice.

---

### 2. **Chat messages by conversation ID — missing participant check (IDOR)**  
**Risk:** P0 — Security / compliance  
**Where:** `apps/api/src/routes/chat.routes.js` — `router.get('/conversations/:conversationId/messages', requireAuth, ...)`  
**Evidence:** Handler loads conversation by ID and returns messages without verifying that the current user is the restaurant or supplier for that conversation. Any authenticated user can read any conversation’s messages by guessing/enumerating UUIDs.  
**How to prove:** As restaurant A, call `GET /api/chat/conversations/{other_conversation_id}/messages`; response 200 with messages.

---

### 3. **Order creation — N+1 product (and price) queries**  
**Risk:** P1 — Performance  
**Where:** `apps/api/src/routes/orders.routes.js` — `router.post('/', ...)`  
**Evidence:** For each line item, a separate `SELECT p.*, pr.amount ... FROM product p LEFT JOIN price pr ... WHERE p.id = $1` is executed (lines ~834–845). 20 items ⇒ 20 round-trips.  
**How to prove:** Enable query logging or APM; create order with 15 items; observe 15+ product/price queries before the transaction.

---

### 4. **createInvoiceFromOrder — N+1 product queries inside transaction**  
**Risk:** P1 — Performance  
**Where:** `apps/api/src/routes/orders.routes.js` — `createInvoiceFromOrder()`  
**Evidence:** Loop over `orderItems` with `client.query('SELECT p.* FROM product p WHERE p.id = $1', [item.product_id])` per item (lines ~184–189). Holds transaction open longer and increases lock contention.  
**How to prove:** Trigger invoice creation from a delivered order with many lines; count product queries inside the transaction.

---

### 5. **Orders list — missing composite index on (restaurant_id, created_at)**  
**Risk:** P1 — Performance  
**Where:** `apps/api/db/migrations` — no index on `customer_order(restaurant_id, created_at DESC)`.  
**Evidence:** List orders uses `WHERE o.restaurant_id = $1 ORDER BY o.created_at DESC LIMIT n OFFSET m`. Without a composite index, Postgres may do index scan on restaurant_id then sort, or full table scan for large tables.  
**How to prove:** `EXPLAIN (ANALYZE, BUFFERS) SELECT ... FROM customer_order o WHERE o.restaurant_id = $1 ORDER BY o.created_at DESC LIMIT 20`; check for Sort or high row counts.

---

### 6. **order_item batch fetch — no index on order_id**  
**Risk:** P1 — Performance  
**Where:** `apps/api/db/migrations` — only `idx_order_item_supplier` exists; list orders uses `WHERE oi.order_id = ANY($1)`.  
**Evidence:** Batch fetch of items by order IDs may use a full scan of `order_item` when order_id is not indexed.  
**How to prove:** `EXPLAIN SELECT * FROM order_item WHERE order_id = ANY($1)`; look for Seq Scan on order_item.

---

### 7. **External Keycloak calls — no timeout**  
**Risk:** P1 — Reliability  
**Where:** `apps/api/src/lib/auth.js` — `axios.get(WELL_KNOWN_URL)`, `axios.post(config.token_endpoint, ...)`, `axios.get(USERINFO_URL, ...)` etc.  
**Evidence:** No `timeout` option on axios requests. A slow or hung Keycloak can block auth and exhaust Node/connection resources.  
**How to prove:** Simulate slow Keycloak (e.g. proxy with delay); observe hanging requests and no failure after a bounded time.

---

### 8. **Restaurant GET by ID — supplier can view any restaurant**  
**Risk:** P2 — Data isolation  
**Where:** `apps/api/src/routes/restaurants.routes.js` — `router.get('/:id', requireAuth, ...)`  
**Evidence:** For role RESTAURANT, access is restricted to own restaurant (contact_email match). For ADMIN, all allowed. For SUPPLIER there is no check; supplier can request any restaurant ID and receive full record.  
**How to prove:** As supplier, `GET /api/restaurants/{restaurant_id_that_never_ordered_from_me}`; response 200 with restaurant details.

---

### 9. **Products list — unauthenticated and SELECT p.***  
**Risk:** P2 — Performance + optional auth  
**Where:** `apps/api/src/routes/products.routes.js` — `router.get('/', async (req, res) => ...)` (no requireAuth), and `SELECT p.*, ...` in main and count query.  
**Evidence:** Catalog may be intentionally public; if so, consider rate limiting and minimal columns. Returning `p.*` pulls all product columns (including large text/jsonb) and increases payload and serialization cost.  
**How to prove:** Call `GET /api/products` without auth; 200 with full product rows. Inspect response size and columns.

---

### 10. **Per-request tenant lookup by email (no caching)**  
**Risk:** P2 — Performance  
**Where:** Multiple routes — e.g. orders list, order GET, order POST, chat, quick-lists, staff — each does `SELECT id FROM restaurant WHERE contact_email = $1` or equivalent per request.  
**Evidence:** Same lookup repeated on every request for the same user. Under load this multiplies DB round-trips.  
**How to prove:** Trace or log DB queries for a single order list request; see repeated restaurant/supplier lookup.

---

## Where tenant scoping is enforced vs missing

| Area | Enforced | Missing / weak |
|------|----------|-----------------|
| Orders list/GET | ✅ restaurant_id / supplier_id from email, then filter | — |
| Order POST | ✅ restaurant from email; items validated by product ownership | — |
| Invoices list | ✅ Supplier: `WHERE s.contact_email = $1` | — |
| **Invoices GET :id** | — | ❌ No check that user is supplier or restaurant for this invoice |
| Chat conversations list | ✅ By supplier_id or restaurant_id from email | — |
| **Chat GET messages** | — | ❌ No check that user is participant of conversation |
| Restaurants list | ✅ Supplier: only those with orders; Restaurant: 403 | — |
| **Restaurants GET :id** | ✅ Restaurant: own only | ❌ Supplier can view any restaurant by ID |
| Staff routes | ✅ restaurant_id in all queries | — |
| Products | Optional auth on list; create/patch use requireAuth + role/ownership | List unauthenticated; consider if intended |

---

## Additional notes (reliability / observability)

- **Request ID:** Set in `requestContext.js` and on response; good for tracing.
- **Structured logging:** Present via `logger`; ensure no PII in logs (e.g. avoid logging full tokens or emails in production).
- **Error handler:** Uses `error.statusCode` for NotFoundError; `NotFoundError` class does not set `statusCode` — handler still maps by `err.name`, so 404 is correct; consider adding `statusCode: 404` on `NotFoundError` for consistency.
- **DB query logging:** `db.js` logs every query at debug and logs full params on error; in production, consider sampling or disabling debug query log to avoid volume and accidental PII.
- **Transactions:** `withTransaction` used for order create and invoice creation; ensure all critical writes that must be atomic use it and that no long-running or external calls run inside the transaction.

---

## Next steps

See **Fix Plan** (`docs/PRODUCTION_READINESS_FIX_PLAN.md`) for PR-sized steps and diffs. Highest-impact implementations in this pass: tenant scoping for invoice and chat messages, batched product fetches for orders and invoice creation, DB indexes for orders/list and order_item, and axios timeout for Keycloak.
