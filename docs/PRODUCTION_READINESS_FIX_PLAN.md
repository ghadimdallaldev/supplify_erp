# Production Readiness Fix Plan — PR-sized steps

Each step is intended to be a small, reviewable PR. Diffs are described; actual code is applied in the repo where “Implement” is done.

---

## Step 1: Add DB indexes for orders list and order_item batch (migration)

**Goal:** Avoid full scans / heavy sorts on orders list and on “items by order_ids” batch.

**Change:** New migration file.

- `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_order_restaurant_created ON customer_order(restaurant_id, created_at DESC);`
- `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_item_order_id ON order_item(order_id);`

**Note:** Use `CONCURRENTLY` in production to avoid long locks; migration runner must support it or run manually.

**File:** `apps/api/db/migrations/0038_orders_list_indexes.sql` (or next number).

**How to run:** From the API app directory (so `DATABASE_URL` and env are correct):
```bash
cd apps/api
node scripts/run-migration.js
```
The script runs all pending migrations in order; 0038 will run when you apply migrations. From repo root you can use: `cd apps/api && node scripts/run-migration.js`

---

## Step 2: Enforce tenant scoping on GET /api/invoices/:id

**Goal:** Fix IDOR; only the invoice’s supplier or restaurant (or admin) may read the invoice.

**Change in** `apps/api/src/routes/invoices.routes.js`:

- After loading invoice by id, resolve tenant from `req.userData` (role + email → supplier_id or restaurant_id).
- If role is SUPPLIER: require `invoice.supplier_id === resolvedSupplierId`.
- If role is RESTAURANT: require `invoice.restaurant_id === resolvedRestaurantId`.
- If role is ADMIN: allow.
- Otherwise return 403 (or 404 to avoid leaking existence).

**Diff (conceptual):** Add a small helper or inline checks after `if (rows.length === 0) throw new NotFoundError(...)` and before returning JSON; use existing tenant lookup pattern from invoices list (supplier by email) and restaurant by email from tenant.js or same-file query.

---

## Step 3: Enforce participant check on GET /api/chat/conversations/:id/messages

**Goal:** Fix IDOR; only participants (and admin) may read messages.

**Change in** `apps/api/src/routes/chat.routes.js`:

- After loading conversation by id, check:
  - If RESTAURANT: resolve restaurant_id by email; require `conversation.restaurant_id === restaurantId`.
  - If SUPPLIER: resolve supplier_id by email; require `conversation.supplier_id === supplierId`.
  - If ADMIN: allow.
- If check fails, return 403 (or 404).

**Diff (conceptual):** Reuse the same tenant lookup pattern used in POST messages (restaurant/supplier by email); add a single block that returns 403 when the conversation’s restaurant_id/supplier_id does not match the current user’s tenant.

---

## Step 4: Batch product (and price) fetch in order creation

**Goal:** Remove N+1 in `POST /api/orders`.

**Change in** `apps/api/src/routes/orders.routes.js`:

- Collect all `item.productId` from `orderData.items`.
- Single query: `SELECT p.*, pr.amount as current_price, pr.currency FROM product p LEFT JOIN price pr ON ... WHERE p.id = ANY($1)` with valid price filter, then build a `Map(productId -> row)`.
- In the loop, use `productMap.get(item.productId)` instead of per-item query; if missing, throw ValidationError.

**Diff (conceptual):** Replace the `for (const item of orderData.items) { const { rows: products } = await query(...) }` block with one query and a map lookup loop.

---

## Step 5: Batch product fetch in createInvoiceFromOrder

**Goal:** Remove N+1 inside transaction when building invoice line items.

**Change in** `apps/api/src/routes/orders.routes.js` inside `createInvoiceFromOrder`:

- Collect all `item.product_id` from `orderItems`.
- Single `client.query('SELECT id, name, sku FROM product WHERE id = ANY($1)', [productIds])` (only columns needed for line item description/sku).
- Build `Map(product_id -> product)`.
- In the loop over `orderItems`, use the map instead of per-item query.

**Diff (conceptual):** Replace the inner `for (const item of orderItems) { const { rows: products } = await client.query('SELECT p.* FROM product p WHERE p.id = $1', ...) }` with one batch query and map lookups.

---

## Step 6: Add timeout (and optional retry) for Keycloak HTTP calls

**Goal:** Avoid hanging requests to Keycloak.

**Change in** `apps/api/src/lib/auth.js`:

- For all axios calls (get well-known, post token, get userinfo, post revoke, post password grant), add `timeout: 10000` (or config value, e.g. 10s).
- Optionally add `validateStatus` or catch and map to a clear “Identity provider unavailable” error.

**Diff (conceptual):** Add `timeout: 10000` to each axios config object; no new dependencies.

---

## Step 7 (optional): Restrict GET /api/restaurants/:id for supplier

**Goal:** Only allow supplier to load a restaurant that has ordered from them (or is otherwise linked).

**Change in** `apps/api/src/routes/restaurants.routes.js`:

- For role SUPPLIER, after loading restaurant by id: run a check that this supplier has at least one order with this restaurant (e.g. `SELECT 1 FROM customer_order o JOIN order_item oi ON oi.order_id = o.id WHERE o.restaurant_id = $1 AND oi.supplier_id = $2 LIMIT 1`). If no row, return 404.

---

## Step 8 (optional): Reduce product list payload

**Goal:** Lower latency and payload size for product list.

**Change in** `apps/api/src/routes/products.routes.js`:

- Replace `SELECT p.*` with an explicit column list (id, supplier_id, sku, name, description, category, image_url, unit, created_at, etc.) excluding large or rarely-needed fields if any.
- Ensure count query and list query use consistent filters to avoid skew.

---

## Implementation order (this pass)

1. Migration (indexes)  
2. Invoice GET tenant check  
3. Chat messages tenant check  
4. Order create batch products  
5. createInvoiceFromOrder batch products  
6. Auth axios timeout  

Steps 7–8 can follow in a later PR.
