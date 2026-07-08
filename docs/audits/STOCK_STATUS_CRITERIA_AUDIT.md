# Stock Status Criteria Audit

**Date:** 2026-06-11  
**Scope:** Supplier inventory, restaurant inventory, warehouse fulfillment, catalog/cart/checkout, reorder assistance, notifications, dashboards  
**Method:** Code search and trace through API routes, services, UI pages, migrations, and tests. No business-logic changes were made.

---

## 1. Summary

Supplify uses **two separate inventory domains** with different fields and rules:

| Domain         | Primary quantity field          | Low-stock field                                  | Out-of-stock rule                                                               |
| -------------- | ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Supplier**   | `inventory.available_qty`       | `product_inventory_settings.low_stock_threshold` | `available_qty <= 0` (ordering); UI often treats `> 0` as available             |
| **Restaurant** | `restaurant_inventory.quantity` | `restaurant_inventory.low_stock_threshold`       | `quantity === 0` (UI); backend reorder SQL uses `quantity <= threshold` for low |

**Expiry** is tracked on **restaurant lot records** (`restaurant_inventory_lot`) and does **not** reduce aggregate `restaurant_inventory.quantity` or supplier `inventory.available_qty`.

**Ordering availability** is enforced only against supplier **`inventory.available_qty`** at checkout (`assertAndDeductSupplierStockBatch`). Warehouse `warehouse_inventory` is reserved **after** that deduction and may not exist for every product.

### Top findings

1. **Supplier inventory list API hardcodes `low_stock_threshold = 0`**, so `isLowStock` is always `false` on Inventory page and Dashboard low-stock widget — while Supplier Command Center uses the real threshold.
2. **Threshold boundary inconsistency:** supplier low-stock uses **strict `<`**; restaurant low-stock uses **`<=`**.
3. **Supplier Inventory page labels qty `0` as “In Stock”** when `isLowStock` is false (because threshold is 0).
4. **`min_stock_threshold`** exists on `restaurant_inventory` but is **never read** in app logic (only seeds).
5. **`backorder_allowed`** exists on `product_inventory_settings` but is **not checked** during order creation.
6. **Restaurant `notifyLowStock()`** — wired on `POST /adjust` and quantity PATCH when crossing `low_stock_threshold` (`restaurant-inventory.routes.js`).
7. **Expired lots do not affect usable stock** on the restaurant aggregate row; expiry drives separate alerts/reorder suggestions only.
8. **Warehouse stock** can drift from legacy `inventory`; missing `warehouse_inventory` rows skip reservation checks.

---

## 2. Backend stock status rules

### 2.1 Supplier catalog / products API

**Files:** `apps/api/src/routes/products.routes.js`, `apps/api/src/services/public-supplier-catalog.service.js`

| Rule                               | Implementation                                                      |
| ---------------------------------- | ------------------------------------------------------------------- |
| **In stock (boolean)**             | `SUM(inventory.available_qty) > 0` per product                      |
| **Out of stock**                   | Sum is `0` or no inventory rows                                     |
| **List filter `?inStock=true`**    | `inv.total_available > 0`                                           |
| **`?includeStock=true`**           | Returns `COALESCE(inv.total_available, 0) AS available_qty`         |
| **Default list (no includeStock)** | Returns placeholder `0::int AS available_qty` (not real stock)      |
| **Low stock**                      | Not computed in product list API                                    |
| **Product inactive flag**          | No product-level availability flag; all products in DB are listable |

**Product detail `GET /api/products/:id`:** joins a **single** `inventory` row (`LEFT JOIN inventory i ON i.product_id = p.id`), not `SUM` — consistent today because `inventory.product_id` is unique, but differs from list aggregation pattern.

### 2.2 Supplier inventory API

**File:** `apps/api/src/routes/inventory.routes.js`

| Endpoint                         | Stock fields                                                             | Low-stock logic                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/inventory`             | `available_qty`, `reserved_qty`                                          | **`0 AS low_stock_threshold`** (hardcoded). `isLowStock = threshold ? available_qty < threshold : false` → **always false** |
| `GET /api/inventory/product/:id` | Includes `pis.low_stock_threshold` from settings                         | No computed status                                                                                                          |
| `POST .../adjustment`            | Updates `available_qty`                                                  | Alert if `newQty < pis.low_stock_threshold`; out-of-stock notify if `newQty <= 0 && previous > 0`                           |
| `PATCH .../settings`             | Writes `product_inventory_settings.low_stock_threshold` (default **10**) | —                                                                                                                           |

**Low-stock alert SQL (adjustment):** `newQty < threshold` (**strict less than**).

**Out-of-stock notify (adjustment):** `newQty <= 0`.

### 2.3 Supplier command center

**File:** `apps/api/src/services/supplier-command-center.service.js` → `getLowStockProducts()`

```sql
WHERE pis.low_stock_threshold IS NOT NULL
  AND i.available_qty < pis.low_stock_threshold
```

- Requires threshold to be set (non-null).
- Uses **strict `<`** (qty equal to threshold is **not** low stock).
- Orders by lowest `available_qty` first; limit 20.

### 2.4 Order / checkout stock validation

**Files:** `apps/api/src/services/supplier-inventory.service.js`, `apps/api/src/services/restaurant-order-create.service.js`

| Check                      | Rule                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Place order                | `SELECT available_qty FROM inventory WHERE product_id = $1 FOR UPDATE`                                       |
| Insufficient               | No row **or** `available_qty < ordered quantity` → `ValidationError('Insufficient inventory for product …')` |
| Deduction                  | Decrements `inventory.available_qty` (optional `reserved_qty` if reserve flag)                               |
| **backorder_allowed**      | **Not consulted**                                                                                            |
| Product active/unavailable | **Not consulted**                                                                                            |

Warehouse assignment runs **after** supplier stock deduction via `assignWarehousesToOrder()` (`warehouseRouting.js`).

### 2.5 Restaurant inventory API

**File:** `apps/api/src/routes/restaurant-inventory.routes.js`

| Field             | Source                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| On-hand qty       | `restaurant_inventory.quantity`                                                                 |
| Low threshold     | `restaurant_inventory.low_stock_threshold` (COALESCE to 0 in SQL)                               |
| Min threshold     | `min_stock_threshold` column exists — **not used in queries**                                   |
| Branch            | `branch_id` stored; **UNIQUE(restaurant_id, product_id)** — one row per product, not per branch |
| Suggested reorder | Computed when `quantity <= low_stock_threshold`                                                 |

**Low-stock in SQL:** `ri.quantity <= COALESCE(ri.low_stock_threshold, 0)` (**inclusive**).

**Legacy column:** `restaurant_inventory.expiry_date` on aggregate row; active expiry feature uses **`restaurant_inventory_lot`**.

### 2.6 Restaurant reorder assistance

**File:** `apps/api/src/services/restaurant-reorder-assistance.service.js`

Combines four signal sources:

1. **Low stock / usage / cadence-of-orders:** `fetchLowStockSuggestions()` — includes items where:
   - `quantity <= low_stock_threshold`, **or**
   - days-of-stock below lead time + 21 days, **or**
   - `days_since_last_order >= 14`
2. **Cadence reminders:** `reorder-cadence.service.js` (order history patterns — **not** stock quantity)
3. **Expiry lots:** `expiring_soon` / `expired` lots → reorder suggestions (**does not change stock status**)
4. **Scheduled quick lists:** recurring list items

**Low-stock reason code:** `current_qty <= low_stock_threshold` → `reasonCode: 'low_stock'`.

### 2.7 Expiry status (restaurant lots)

**Files:** `apps/api/src/lib/inventory-expiry-status.js`, `apps/api/src/services/inventory-expiry.service.js`

| Status          | Rule (`computeExpiryStatus`)                                                      |
| --------------- | --------------------------------------------------------------------------------- |
| `expired`       | `expiry_date` calendar day **< today**                                            |
| `expiring_soon` | `0 <= daysUntil <= expiringSoonDays` (default **7**, configurable per restaurant) |
| `safe`          | beyond threshold window                                                           |
| `null`          | no expiry date                                                                    |

**Not connected to:** `restaurant_inventory.quantity`, supplier `available_qty`, or cart availability.

### 2.8 Warehouse inventory

**Files:** `apps/api/src/services/warehouseInventory.js`, `apps/api/src/services/warehouseRouting.js`

| Concept   | Field                                    | Role                         |
| --------- | ---------------------------------------- | ---------------------------- |
| Available | `warehouse_inventory.quantity_available` | Reserved on order assignment |
| Reserved  | `quantity_reserved`                      | Held for pending assignments |
| On hand   | `quantity_on_hand`                       | Reduced on dispatch          |

**Reservation behavior (`reserveWarehouseStockBatch`):**

- If **no** `warehouse_inventory` row for product → **skips** check (no error).
- If row exists and `quantity_available < qty` → throws `Insufficient stock at warehouse`.

**Routing `stock_available` rule:** picks warehouse where `quantity_available >= line quantity`.

Legacy `inventory` table remains the **checkout gate**; warehouse is **fulfillment layer**.

### 2.9 Notifications

**File:** `apps/api/src/services/notification.service.js`

| Event                 | Trigger                                          | Tenant                              |
| --------------------- | ------------------------------------------------ | ----------------------------------- |
| Supplier low stock    | Inventory adjustment when `newQty < threshold`   | Supplier (`notifySupplierLowStock`) |
| Supplier out of stock | Adjustment when qty hits 0 from >0               | Supplier (`notifyOutOfStock`)       |
| Restaurant low stock  | **`notifyLowStock()` exported but never called** | —                                   |
| Expiry grouped alerts | Cron / `runExpiryReminderCheck`                  | Restaurant                          |

---

## 3. Frontend stock status rules

### 3.1 Products catalog (`ProductsPage`, `ProductDetailPage`)

**Files:** `apps/web/src/pages/ProductsPage.tsx`, `ProductDetailPage.tsx`

- Uses `includeStock: true` → real `available_qty` from API.
- **Available for cart:** `available_qty > 0` (button disabled otherwise).
- **Display color:** green if `> 0`, red if `0`.
- **No “low stock” badge** on product cards — only zero vs non-zero.
- **No check** of supplier low-stock threshold in UI.

### 3.2 Public supplier catalog

**File:** `apps/web/src/pages/PublicSupplierCatalogPage.tsx`

- `inStock === false` → “Out of stock” badge; add-to-cart hidden.
- `inStock === true` → “In stock” badge.
- `inStock` undefined → no badge; add still allowed if `inStock !== false`.
- Backend: `COALESCE(SUM(available_qty),0) > 0`.

### 3.3 Supplier inventory page

**File:** `apps/web/src/pages/InventoryPage.tsx`

- KPI **Low Stock:** count where `item.isLowStock` (from broken API — always 0).
- Status column: `isLowStock ? "Low Stock" : "In Stock"` — with threshold 0, **qty 0 shows “In Stock”**.
- Displays raw `available_qty`, `reserved_qty` (no computed status strings from backend).

### 3.4 Supplier dashboard low-stock widget

**File:** `apps/web/src/pages/DashboardPage.tsx`

- Uses `useGetInventoryListQuery` → filters `item.isLowStock` → **always empty** due to API bug.
- **Supplier Command Center** (`SupplierCommandCenterPage.tsx`) uses separate API with **correct** low-stock list.

### 3.5 Restaurant inventory page

**File:** `apps/web/src/pages/RestaurantInventoryPage.tsx`

**Local helper (only place in codebase):**

```typescript
function getStockStatus(quantity, threshold) {
  if (quantity === 0) return 'OUT_OF_STOCK'
  if (threshold && quantity <= threshold) return 'LOW_STOCK'
  return 'IN_STOCK'
}
```

| Status         | Criteria                                                   |
| -------------- | ---------------------------------------------------------- |
| `OUT_OF_STOCK` | `quantity === 0` exactly                                   |
| `LOW_STOCK`    | `quantity > 0` **and** `quantity <= low_stock_threshold`   |
| `IN_STOCK`     | otherwise (including when threshold is null/0 and qty > 0) |

Rendered via `StatusBadge` → labels like **“Out Of Stock”**, **“Low Stock”**, **“In Stock”** (formatted from `IN_STOCK` etc.).

**Reorder qty (UI fallback):** if `quantity > low_stock_threshold` → 0; else `ceil(threshold * 3 - quantity)`.

### 3.6 Reorder assistance panel

**File:** `apps/web/src/components/inventory/ReorderAssistancePanel.tsx`

- Displays API `reasonCode` / `reasonLabel` / `urgency` (e.g. `low_stock`, `near_expiry`, `URGENT`).
- Shows raw urgency strings (`URGENT`, `HIGH`, …) in badges.

---

## 4. Supplier stock logic

| Question            | Answer                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Primary quantity    | `inventory.available_qty`                                                                        |
| Reserved            | `inventory.reserved_qty` (display only on inventory page; deducted on order unless reserve flag) |
| Reorder / low point | `product_inventory_settings.low_stock_threshold` (default 10)                                    |
| Low stock           | `available_qty < low_stock_threshold` (command center, adjustment alerts)                        |
| Out of stock        | `available_qty <= 0` for notifications; ordering blocked when `available_qty < qty`              |
| In stock (catalog)  | `SUM(available_qty) > 0`                                                                         |
| Warehouse           | Optional parallel `warehouse_inventory`; not used for catalog “in stock”                         |

---

## 5. Restaurant inventory stock logic

| Question            | Answer                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Primary quantity    | `restaurant_inventory.quantity`                                                             |
| Low threshold       | `restaurant_inventory.low_stock_threshold`                                                  |
| Min threshold       | `min_stock_threshold` — **stored only, unused**                                             |
| Low stock           | UI + backend reorder: `quantity <= low_stock_threshold` (and qty > 0 for UI “LOW” vs “OUT”) |
| Out of stock        | UI: `quantity === 0`                                                                        |
| Branch              | `branch_id` on row; **no per-branch quantity split**                                        |
| Expiry on aggregate | Legacy `expiry_date` column; feature uses lots                                              |

Receiving/delivery **increments** `restaurant_inventory.quantity` on order delivery (`orders.routes.js`).

---

## 6. Warehouse stock logic

- **Does not drive** product card or catalog availability.
- **May block** fulfillment if `warehouse_inventory` row exists and lacks quantity (reservation error after order already deducted supplier `inventory`).
- **Does not block** if no warehouse row (silent skip).
- Sync helper `upsertWarehouseInventoryFromInventory()` exists for seeding alignment.

---

## 7. Branch stock logic

- `restaurant_inventory` has `branch_id` but **unique constraint is (restaurant_id, product_id)**.
- Branch is informational/filter metadata, **not** separate stock buckets.
- No branch-level stock status calculation.

---

## 8. Expiry lot interaction

| Aspect              | Behavior                                                                   |
| ------------------- | -------------------------------------------------------------------------- |
| Usable stock        | **Not reduced** when lots expire                                           |
| Stock status badges | **Independent** — aggregate qty unchanged                                  |
| Reorder assistance  | Adds `near_expiry` / `expired` suggestions from lots                       |
| Notifications       | Grouped daily expiry/expired alerts                                        |
| Warning window      | `restaurant_inventory_settings.expiring_soon_days` (default 7)             |
| Waste adjustment    | `EXPIRED` waste category on manual adjustments — separate from lot archive |

**Bug note:** `fetchExpirySuggestions()` maps `lot.productName` but `mapLotRow()` returns **`itemName`** — product name in expiry reorder cards may be undefined.

---

## 9. Cart / checkout availability rules

| Layer                                   | Rule                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Frontend (Products, Public catalog)** | Disable/hide add when `available_qty <= 0` or `inStock === false`                                                |
| **Frontend cart**                       | No server-side stock re-validation before submit (relies on product data at add time)                            |
| **Backend checkout**                    | `assertAndDeductSupplierStockBatch` — must have inventory row and sufficient `available_qty`                     |
| **Mismatch risk**                       | Stale UI qty, default `0` when `includeStock` omitted, or concurrent orders → checkout error after “in stock” UI |
| **Restaurant on-hand**                  | **Not checked** at supplier checkout                                                                             |

---

## 10. Reorder assistance stock rules

| Source                          | Uses stock? | Threshold / rule                                                           |
| ------------------------------- | ----------- | -------------------------------------------------------------------------- |
| Low stock suggestions           | Yes         | `quantity <= low_stock_threshold` + usage/lead-time heuristics             |
| Cadence                         | No          | Order history weekday patterns                                             |
| Expiry lots                     | Parallel    | Lot status, not aggregate qty                                              |
| Quick lists                     | No          | Scheduled list membership                                                  |
| Smart reorder endpoint (legacy) | Yes         | Same SQL family in `restaurant-inventory.routes.js` `/reorder-suggestions` |

Restaurant dashboard “Reorder Alerts” uses reorder assistance API, **not** the same SQL as supplier low stock.

---

## 11. Inconsistencies found

| ID  | Classification                            | File(s)                                         | Current behavior                                                                        | Expected / canonical                                         | Risk                                      | Recommended fix                                                 |
| --- | ----------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------- |
| S1  | **BACKEND_RULE_MISMATCH**                 | `apps/api/src/routes/inventory.routes.js` L41   | List query sets `0 AS low_stock_threshold`                                              | Join `product_inventory_settings.low_stock_threshold`        | **High** — dashboard/inventory KPIs wrong | JOIN `pis`; compute `isLowStock` like command center            |
| S2  | **UI_ONLY_MISMATCH**                      | `apps/web/src/pages/InventoryPage.tsx` L301–305 | Qty 0 shows “In Stock” when `isLowStock` false                                          | Show “Out of stock” when `available_qty <= 0`                | **High** — misleading ops UI              | Fix S1 + add explicit out-of-stock branch in UI                 |
| S3  | **FRONTEND_BACKEND_MISMATCH**             | Dashboard vs Command Center                     | Dashboard low stock always empty; command center correct                                | Same threshold source everywhere                             | **Medium**                                | Dashboard should use command center data or fixed inventory API |
| S4  | **REORDER_THRESHOLD_MISMATCH**            | Supplier (`<`) vs restaurant (`<=`)             | Qty **equal** to threshold: restaurant = low, supplier = not low                        | Align on `<=` or document domain-specific rules              | **Medium**                                | Pick one boundary; add tests at equality                        |
| S5  | **WAREHOUSE_STOCK_NOT_WIRED**             | `warehouseInventory.js` L47–50                  | Missing warehouse row skips reservation                                                 | Either sync rows or fail closed when multi-warehouse enabled | **Medium**                                | Sync on inventory update; or validate when feature on           |
| S6  | **EXPIRY_NOT_EXCLUDED_FROM_USABLE_STOCK** | Lot vs aggregate                                | Expired lot qty still in `restaurant_inventory.quantity`                                | Exclude expired lot qty if lot tracking enabled              | **Medium** (food safety reporting)        | Document or subtract on lot expiry/waste                        |
| S7  | **FRONTEND_BACKEND_MISMATCH**             | `restaurant-reorder-assistance.service.js` L182 | Uses `lot.productName` (undefined)                                                      | Use `lot.itemName`                                           | **Low**                                   | One-line fix                                                    |
| S8  | **MISSING_TEST_COVERAGE**                 | —                                               | No tests for supplier list `isLowStock`, restaurant `getStockStatus`, boundary equality | Tests per proposed rules                                     | **Medium**                                | Add unit/integration tests                                      |
| S9  | **RESOLVED** (2026-07)                    | `restaurant-inventory.routes.js`                | `notifyLowStock()` on adjust/PATCH below threshold                                      | Wired with threshold-crossing guard                          | —                                         | Done                                                            |
| S10 | **BACKEND_RULE_MISMATCH**                 | `product_inventory_settings.backorder_allowed`  | Ignored at checkout                                                                     | Honor flag or remove setting                                 | **Low–Medium**                            | Validate in `assertAndDeductSupplierStock`                      |
| S11 | **UI_ONLY_MISMATCH**                      | `ProductsPage` / cards                          | Shows qty even when low by supplier threshold                                           | Optional “Low stock” when below supplier threshold           | **Low**                                   | Product enhancement                                             |
| S12 | **REORDER_THRESHOLD_MISMATCH**            | `seed-restaurant-inventory-demo.js` L77         | `quantity < low_stock_threshold`                                                        | App uses `<=`                                                | **Low** (demo only)                       | Align seed script                                               |

---

## 12. Duplicated helpers found

| Helper                   | Location                                                                                                | Notes                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `getStockStatus()`       | `RestaurantInventoryPage.tsx` only                                                                      | **Not shared**; backend has no equivalent enum      |
| `computeExpiryStatus()`  | `apps/api/src/lib/inventory-expiry-status.js`                                                           | Canonical for lots; re-exported from expiry service |
| `isLowStock` computation | `inventory.routes.js` (list) vs `supplier-command-center.service.js`                                    | **Different inputs** (0 vs real threshold)          |
| Low-stock SQL            | `restaurant-inventory.routes.js`, `restaurant-reorder-assistance.service.js`, reorder-suggestions route | Similar `<= threshold` logic duplicated             |
| In-stock boolean         | `products.routes.js`, `public-supplier-catalog.service.js`                                              | Same `SUM > 0` pattern duplicated                   |
| Supplier deduct          | `assertAndDeductSupplierStock` vs `assertAndDeductSupplierStockBatch`                                   | Shared service (good)                               |

**Recommendation:** Extract shared modules e.g. `packages/shared/stock-status.ts` or `apps/api/src/lib/stock-status.js` for supplier/restaurant/catalog rules.

---

## 13. Tests found

| Test file                                                                              | What it covers                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------ |
| `apps/api/src/lib/inventory-expiry-status.js` (via `inventory-expiry.service.test.js`) | Expired / expiring_soon / safe / null date |
| `apps/api/src/services/inventory-expiry.service.test.js`                               | Notification dedup                         |
| `apps/api/src/services/restaurant-reorder-assistance.service.test.js`                  | Low-stock + cadence merge, suppression     |
| `apps/api/src/services/supplier-inventory.service.test.js`                             | Deduct, insufficient stock, batch          |
| `apps/api/src/services/public-supplier-catalog.service.test.js`                        | `in_stock` mapping, no prices              |
| `apps/api/src/routes/products.routes.test.js`                                          | `includeStock`, `inStock=true` SQL         |
| `apps/api/src/services/warehouseInventory.test.js`                                     | Picking/cancel release                     |
| `apps/api/src/services/reorder-cadence.service.test.js`                                | Cadence detection                          |
| `apps/api/src/routes/inventory.routes.test.js`                                         | Basic GET; **no isLowStock assertion**     |
| `apps/api/src/services/notification.service.test.js`                                   | Category mapping includes `low_stock`      |

**Tests run for this audit:** None executed (read-only audit).

---

## 14. Missing tests

Recommended additions (safe, high value):

- Supplier inventory list returns correct `isLowStock` when `available_qty` is below/equal/above `product_inventory_settings.low_stock_threshold`
- Supplier out-of-stock: `available_qty = 0` status labeling expectations
- Restaurant `getStockStatus` boundaries: `0`, `threshold`, `threshold + 1`, null threshold
- Product list `includeStock` vs checkout deduction alignment
- Warehouse reservation when row missing vs insufficient
- Reorder assistance: low_stock reason when `quantity === threshold`
- Expiry suggestion maps correct item name
- Cart/checkout: UI allows add but backend rejects when stale qty

---

## 15. Recommended fixes (priority)

1. **P0 — Fix supplier inventory list query** — JOIN `product_inventory_settings`, remove hardcoded `0 AS low_stock_threshold`.
2. **P0 — Supplier inventory UI** — Treat `available_qty <= 0` as out of stock regardless of `isLowStock`.
3. **P1 — Align low-stock boundary** — Document or unify `<` vs `<=` across supplier and restaurant.
4. **P1 — Dashboard low stock** — Use command center endpoint or fixed inventory list.
5. **P1 — Extract shared stock-status helpers** — Single source for API + web (+ mobile parity).
6. **P2 — Wire or remove `notifyLowStock`**, **`min_stock_threshold`**, **`backorder_allowed`**.
7. **P2 — Warehouse sync policy** — Keep `warehouse_inventory` aligned with `inventory` when warehouses enabled.
8. **P2 — Fix expiry suggestion `itemName`** field mapping.
9. **P3 — Expired lot vs usable qty** — Product decision then implement or document.

---

## 16. Proposed canonical stock status rules (evaluation)

| Rule                                                        | Current fit                                                                  | Gap                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Out of stock:** available qty ≤ 0 or inactive/unavailable | Supplier ordering: **qty ≤ 0 blocks**; no inactive product flag              | Add product availability if needed; restaurant uses **qty === 0** only for OUT badge |
| **Low stock:** qty > 0 and qty ≤ reorder point              | Restaurant: **matches (`<=`)**; Supplier command center: **`<` only**        | Fix supplier boundary                                                                |
| **In stock:** qty > low threshold and active                | Restaurant UI: **matches**; Supplier products: **any qty > 0** (no low band) | Supplier catalog ignores low band                                                    |
| **Near expiry:** lot within warning window                  | **Matches** lot logic                                                        | Not tied to stock status                                                             |
| **Expired:** lot date < today                               | **Matches**                                                                  | Does not reduce usable aggregate                                                     |
| **Usable stock:** exclude expired lots                      | **Not implemented**                                                          | Needs lot-level subtraction or reporting-only                                        |
| **Warehouse dispatch respects warehouse qty**               | **Partial** — only when row exists                                           | Missing rows bypass check                                                            |

---

## Appendix A — Fields reference

### Supplier

| Field                   | Table                        | Used for                              |
| ----------------------- | ---------------------------- | ------------------------------------- |
| `available_qty`         | `inventory`                  | Catalog, checkout, low stock          |
| `reserved_qty`          | `inventory`                  | Display, optional reserve on order    |
| `warehouse_id`          | `inventory`                  | Warehouse association                 |
| `low_stock_threshold`   | `product_inventory_settings` | Alerts, command center                |
| `backorder_allowed`     | `product_inventory_settings` | **Unused** in checkout                |
| `moq`, `lead_time_days` | `product_inventory_settings` | Reorder suggestions (restaurant-side) |

### Restaurant

| Field                         | Table                      | Used for                     |
| ----------------------------- | -------------------------- | ---------------------------- |
| `quantity`                    | `restaurant_inventory`     | On-hand, status, reorder     |
| `low_stock_threshold`         | `restaurant_inventory`     | Low stock, reorder           |
| `min_stock_threshold`         | `restaurant_inventory`     | **Unused**                   |
| `branch_id`                   | `restaurant_inventory`     | Metadata only                |
| `expiry_date`                 | `restaurant_inventory`     | Legacy; lots preferred       |
| Lot `quantity`, `expiry_date` | `restaurant_inventory_lot` | Expiry status, reorder hints |

### Warehouse

| Field                | Table                 | Used for           |
| -------------------- | --------------------- | ------------------ |
| `quantity_available` | `warehouse_inventory` | Reservation        |
| `quantity_reserved`  | `warehouse_inventory` | Held stock         |
| `quantity_on_hand`   | `warehouse_inventory` | Dispatch decrement |

---

## Appendix B — Consistency matrix

| Surface                   | In stock               | Low stock                   | Out of stock                   | Expiry                    |
| ------------------------- | ---------------------- | --------------------------- | ------------------------------ | ------------------------- |
| Products page             | qty > 0                | —                           | qty ≤ 0                        | —                         |
| Public catalog            | `inStock` SUM>0        | —                           | `inStock` false                | —                         |
| Supplier inventory page   | `!isLowStock` (broken) | `isLowStock` (always false) | **Shown as In Stock** at qty 0 | —                         |
| Supplier command center   | not listed             | `avail < threshold`         | not listed separately          | —                         |
| Dashboard supplier widget | —                      | broken (S1)                 | —                              | —                         |
| Restaurant inventory      | `getStockStatus` IN    | `getStockStatus` LOW        | `getStockStatus` OUT           | separate tab              |
| Reorder assistance        | —                      | `low_stock` reason          | —                              | `near_expiry` / `expired` |
| Cart/checkout UI          | qty > 0                | —                           | disabled at 0                  | —                         |
| Order API                 | deduct if avail ≥ qty  | —                           | error if insufficient          | —                         |

---

## Appendix C — Files inspected

**API / services:**  
`inventory.routes.js`, `products.routes.js`, `restaurant-inventory.routes.js`, `warehouses.routes.js`, `orders.routes.js`, `supplier-inventory.service.js`, `supplier-command-center.service.js`, `public-supplier-catalog.service.js`, `restaurant-order-create.service.js`, `restaurant-reorder-assistance.service.js`, `inventory-expiry.service.js`, `inventory-expiry-status.js`, `warehouseInventory.js`, `warehouseRouting.js`, `notification.service.js`, `reorder-cadence.service.js`

**Web:**  
`ProductsPage.tsx`, `ProductDetailPage.tsx`, `PublicSupplierCatalogPage.tsx`, `InventoryPage.tsx`, `RestaurantInventoryPage.tsx`, `DashboardPage.tsx`, `SupplierCommandCenterPage.tsx`, `ReorderAssistancePanel.tsx`, `status-badge.tsx`

**Migrations / docs:**  
`0002_inventory_enhancements.sql`, `0004_restaurant_inventory.sql`, `0014_restaurant_inventory_enhancements.sql`, `0133_restaurant_inventory_lots.sql`, `0081_warehouse_fulfillment.sql`, `docs/features/inventory-expiry-and-reorder.md`

**Tests:**  
Listed in §13

---

## Audit conclusion

- **Exact criteria:** Documented in §2–§10; supplier uses `inventory.available_qty` + `product_inventory_settings.low_stock_threshold`; restaurant uses `restaurant_inventory.quantity` + `low_stock_threshold`; expiry is lot-based and orthogonal.
- **Supplier vs restaurant:** **Different tables, thresholds, and boundary operators.**
- **UI vs backend:** **Mostly aligned for catalog/checkout qty > 0**; **supplier inventory/dashboard low stock is broken**; restaurant page computes status client-side consistently with backend reorder SQL (`<=`).
- **Cart vs product cards:** **Same qty > 0 rule** when `includeStock=true`; backend may still reject on race/stale data.
- **Reorder assistance:** Uses **broader rules** than simple low stock (usage, cadence, expiry, quick lists); low-stock portion matches restaurant `<= threshold`.
- **Safe fixes applied:** **None** (audit-only per request).
- **Risky areas:** Warehouse dual inventory, backorder flag, expired lot vs aggregate qty, threshold boundary unification.

---

## Fix implemented (2026-06-11)

### API threshold source fixed

- `GET /api/inventory` now `LEFT JOIN product_inventory_settings` and returns `COALESCE(pis.low_stock_threshold, 10)` instead of hardcoded `0`.
- Response rows include `isLowStock`, `isOutOfStock`, `isInStock`, and `stockStatus` computed via `apps/api/src/lib/supplier-stock-status.js`.
- Supplier command center low-stock query aligned to the same helper rules and default threshold.

### Out-of-stock UI fixed

- `apps/web/src/lib/supplierStockStatus.ts` resolves status with **qty ≤ 0 → Out of stock** before checking `isLowStock`.
- `InventoryPage.tsx` uses `StatusBadge` with `OUT_OF_STOCK` / `LOW_STOCK` / `IN_STOCK` labels in table and warehouse views.
- Low Stock KPI uses `countSupplierLowStockItems()` (excludes out-of-stock rows).

### Threshold boundary decision

- **Supplier low stock now uses inclusive `<=`** (matching restaurant), via shared `computeSupplierStockFlags()`:
  - Out of stock: `available_qty <= 0`
  - Low stock: `available_qty > 0 && available_qty <= low_stock_threshold`
  - In stock: `available_qty > low_stock_threshold`
- Default threshold when settings row is missing/null: **10** (`product_inventory_settings` column default).
- Inventory adjustment low-stock alerts/notifications use the same helper (was strict `<`).

### Tests added

- `apps/api/src/lib/supplier-stock-status.test.js`
- Expanded `apps/api/src/routes/inventory.routes.test.js` (list threshold join, boundary cases, tenant scoping)
- `apps/web/src/lib/supplierStockStatus.test.ts`
- `apps/web/src/pages/InventoryPage.test.tsx`

### Remaining risks

- Dual `inventory` vs `warehouse_inventory` can drift; checkout still uses legacy `inventory` only.
- Expired restaurant lots do not reduce aggregate `restaurant_inventory.quantity`.
- `backorder_allowed` is not enforced at checkout.
- `restaurant_inventory.min_stock_threshold` remains unused.
- Restaurant `notifyLowStock()` remains unwired.
- Expiry reorder suggestion `lot.productName` vs `itemName` bug not addressed in this fix.
