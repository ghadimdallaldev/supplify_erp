# Warehouse fulfillment

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

Warehouses are a **fulfillment** concept inside a supplier branch (not a separate account). Suppliers manage locations, per-warehouse inventory, delivery zones, and optional multi-warehouse routing.

## Feature flags

| Key               | Plans (supplier)                  | When off                                     | When on                              |
| ----------------- | --------------------------------- | -------------------------------------------- | ------------------------------------ |
| `warehouses`      | Silver+ (Silver: **1** warehouse) | No warehouse UI/API (Free: 0)                | CRUD, inventory per warehouse, zones |
| `multi_warehouse` | Gold+                             | Single default warehouse fulfills all orders | Per-item routing, split fulfillment  |

Both flags appear in **Admin → Features** (global + per-tenant override).

### Per-supplier toggle

`multi_warehouse` also requires `supplier.multi_warehouse_enabled = true` and `fulfillment_mode = 'multi'`. A Gold supplier can keep single-warehouse mode while on a plan that allows multi-warehouse.

Configure under **Settings → Warehouses** (toggle) or `PATCH /api/suppliers/me/fulfillment`.

## Permissions

- `WAREHOUSES_VIEW` — list warehouses, inventory, zones, routing preview
- `WAREHOUSES_EDIT` — update warehouse metadata and set default (Warehouse Manager)
- `WAREHOUSES_MANAGE` — create warehouses, deactivate, and manage delivery zones

`PATCH /api/warehouses/:id` uses `WAREHOUSES_EDIT`. Setting `is_active: false` additionally requires `WAREHOUSES_MANAGE`.

Platform admins must impersonate a supplier to list or mutate warehouses, drivers, and inventory (including adjustments, alerts, settings, and alert acknowledge). Warehouse-mode product PATCH and adjustments update `warehouse_inventory` first, then mirror the aggregate into legacy `inventory`. `GET /api/orders/:id/warehouses` requires the same tenant order access as order detail. `?supplier_id=` is accepted only when it matches that tenant. Product `initialStock` writes the legacy `inventory` row and mirrors into `warehouse_inventory` for warehouse-mode suppliers. Warehouse joins use `getWarehouseSupplierColumn()` (`tenant_id` preferred over `supplier_id`). Product inventory GET uses warehouse totals when the supplier is in warehouse mode, including products that have no legacy `inventory` row.

## Single vs multi-warehouse

- **Single** (`fulfillment_mode = 'single'`): one `order_warehouse_assignment` row per order (`order_item_id` null), using `default_warehouse_id` or first active warehouse.
- **Multi** (plan flag + supplier toggle): one assignment per line item; routing rules choose the warehouse.

Existing order flows are unchanged when multi-warehouse is off.

## Routing engine

Priority (lowest number wins within same rule type ordering in `warehouseRouting.js`):

1. **product** — exact `product_id`
2. **category** — product `category_id`
3. **zone** — restaurant address matches the rule's `delivery_zone`, not merely some other zone of the same warehouse. Radius is used only when `zone_type` is `radius`. Polygon holes do not count as inside, including rings-format coverage. Postal codes match after trimming, removing spaces, and ignoring case. A shorter code also matches a longer one at a district boundary, so SW1 covers SW1A 1AA and E1 covers E1 6AN, while SW1 does not cover SW10 and a numeric code such as 11 does not cover 1100. Dispatch and route area labels use a postal or radius zone only when the delivery destination matches it (order snapshot, then branch, then restaurant). Branch zones use that same destination match. Otherwise they show the city. `PATCH /api/warehouses/:id/zones/:zoneId` stores one coverage type. A postal zone clears radius and center, and a radius zone clears postal codes, so a later edit cannot flip the match. A name-only update leaves coverage as it is. A radius zone needs a positive radius and a center; a postal zone needs at least one code.
4. **stock_available** — `warehouse_inventory.quantity_available` ≥ line qty
5. **default** — explicit default rule or supplier default warehouse
6. **fallback** — first active warehouse

A product rule aimed at an inactive warehouse does not block the active warehouses. Listing the same product twice on an order does not fail tenant ownership. Stock used to choose the warehouse is locked in that transaction before the choice, in a stable warehouse and product order. Completing a pick wave marks packed only the warehouse leg that pick list belongs to.

On assignment in multi mode, stock is reserved: `quantity_available` decreases, `quantity_reserved` increases. Route optimization loads the depot warehouse using `getWarehouseSupplierColumn` so `tenant_id` and `supplier_id` schema variants both resolve.

## Inventory source of truth (P0-1)

Order place / cancel / reject / dispatch use **one** stock path via `supplier-order-stock.service.js`:

| Mode        | Condition                                                     | Place                              | Cancel / Reject         | Dispatch                  |
| ----------- | ------------------------------------------------------------- | ---------------------------------- | ----------------------- | ------------------------- |
| `warehouse` | `warehouses` or `multi_warehouse` plan feature + ≥1 active WH | Reserve `warehouse_inventory` only | Release WH reservations | Commit reserved → on-hand |
| `legacy`    | No warehouses feature / no active warehouses                  | Deduct `inventory` only            | Restore `inventory`     | N/A                       |

Legacy `inventory` is kept for UI/compatibility. When warehouse mode is on, a legacy product-level adjustment applies a **delta** to one owned warehouse (the requested `warehouseId` or the supplier default). It does not overwrite that warehouse with the full product aggregate, which would inflate multi-warehouse stock. Warehouse names and product rows are joined only when `warehouse.supplier_id` / `product.supplier_id` match the tenant (including pick lists, drivers, routing rules, auto-routing context, fulfillment board, and order warehouse assignments). Delivery-board branch name/coord joins require `branch.tenant_id` to match the order restaurant. Dashboard low-stock previews sum `warehouse_inventory` only through owned active warehouses. Creating a product with `warehouse_id` rejects IDs that are not an active warehouse of the same supplier. Single-warehouse assign also requires `default_warehouse_id` to be an active warehouse of that supplier. Fulfillment `warehouse_id` query filters, driver list filters, and pick-wave generation reject a foreign warehouse with 400 instead of returning an empty scoped set. Ops tooling:

- `node apps/api/scripts/seed-warehouse-inventory-from-inventory.js [--apply]`
- `node apps/api/scripts/reconcile-inventory-sources.js [--apply-seed-missing-wh] [--apply-mirror-legacy]`

Design: `docs/superpowers/specs/2026-07-23-inventory-source-of-truth-design.md`.

## API (supplier)

All warehouse routes: `requireAuth` → `requireFeature('warehouses')` → `requirePermission(...)`.

| Method                | Path                                                | Notes                                                   |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| GET                   | `/api/warehouses`                                   | List + summary counts                                   |
| POST                  | `/api/warehouses`                                   | First warehouse auto-default                            |
| PATCH                 | `/api/warehouses/:id`                               | Update                                                  |
| DELETE                | `/api/warehouses/:id`                               | Soft deactivate                                         |
| POST                  | `/api/warehouses/:id/set-default`                   | Atomic default swap                                     |
| GET/PATCH             | `/api/warehouses/:id/inventory`                     | Per-warehouse stock; PATCH is partial and product-owned |
| GET                   | `/api/warehouses/:id/orders`                        | Open assignments                                        |
| GET/POST/PATCH/DELETE | `/api/warehouses/:id/zones`                         | `delivery_zone` rows                                    |
| GET/POST/PATCH/DELETE | `/api/warehouses/routing/rules`                     | `requireFeature('multi_warehouse')`                     |
| POST                  | `/api/warehouses/routing/simulate`                  | Preview only; stock is supplier-warehouse scoped        |
| GET/PATCH             | `/api/suppliers/me/fulfillment`                     | Toggle + mode                                           |
| GET                   | `/api/orders/:id/warehouses`                        | Assignments (all modes)                                 |
| PATCH                 | `/api/orders/:id/warehouses/:assignmentId`          | Atomic reassign (`warehouse_id`); pending/picking only  |
| POST                  | `/api/orders/:id/warehouses/:assignmentId/dispatch` | Mark dispatched + commit reserved stock                 |

Order creation (`POST /api/orders`, supplier manual create) calls `reserveStockForPlacedOrder` in the **same transaction** (warehouse reserve XOR legacy deduct); failure rolls back the order.

## Frontend

- **Settings → Warehouses**: gated by `entitlements.features.warehouses` (`useGetEntitlementsQuery`).
- **Warehouse delivery zones**: **Settings → Warehouses → Manage zones** — `WarehouseZonesPanel` saves an explicit coverage type (postal codes or radius). Editing a postal zone does not turn it into a radius because leftover coordinates are still stored. Polygon zones keep their drawn area until the type changes. Uses `listZones` / `createZone` / `updateZone` / `deleteZone` RTK endpoints.
- Multi-warehouse toggle: gated by `multi_warehouse` plan flag; calls fulfillment API.
- **Order detail**: shows per-item warehouse badges when `multiLocationFulfillment` is true.
- **Fulfillment → Pick lists**: `PickListsTab` on `/app/fulfillment` — generate waves, view pick lists, complete picking. API: `/api/fulfillment/waves/*` (`fulfillment/waves.js`, `pick-lists.service.js`). Migration `0177_pick_lists_hardening.sql` adds `order_item_id` on `pick_list_item`.

## Pick lists and waves

| Method | Path                                          | Permission           | Description                       |
| ------ | --------------------------------------------- | -------------------- | --------------------------------- |
| POST   | `/api/fulfillment/waves/generate`             | `FULFILLMENT_MANAGE` | Create delivery wave + pick lists |
| GET    | `/api/fulfillment/waves`                      | `FULFILLMENT_VIEW`   | List waves for supplier           |
| GET    | `/api/fulfillment/waves/:id`                  | `FULFILLMENT_VIEW`   | Wave detail + pick lists          |
| POST   | `/api/fulfillment/waves/:id/complete-picking` | `FULFILLMENT_MANAGE` | Mark wave picking complete        |

Service: `pick-lists.service.js`

## Simulation

`POST /api/warehouses/routing/simulate` accepts `{ items: [{ product_id, quantity }], restaurant_id?, postal_code? }`. Empty `items` returns the supplier default warehouse preview. Response: `{ preview: [...], warehouseName? }` with no database side effects.

## Schema notes

- Table name is `warehouse` (singular), not `warehouses`.
- Assignments: `order_warehouse_assignment` → `customer_order` / `order_item`.
- Per-warehouse stock: `warehouse_inventory`.
- **`delivery_zone`** is shared between supplier warehouse zones and restaurant B2C branch zones on one table:
  - Supplier: `supplier_id` + `warehouse_id` (+ optional geometry / postal codes)
  - B2C consumer: `branch_id` + `postcode_prefix`
- Migration `0161_consumer_ordering.sql` may create `delivery_zone` with branch columns only on fresh DBs; **`0165_supplier_delivery_zone_columns.sql`** adds missing supplier columns so warehouse zones and supplier delivery board joins work.
- Supplier delivery board / route planning use `getDeliveryZoneJoinSql()` (`apps/api/src/lib/delivery-zone-join.js`) to pick warehouse vs branch join mode at runtime.

Migrations: `0081_warehouse_fulfillment.sql`, `0161_consumer_ordering.sql`, `0165_supplier_delivery_zone_columns.sql`.

## Canonical non-split assignment (2026-09-14)

The historical per-line routing model remains readable for old orders. New orders use one order-level assignment and require one warehouse to fulfill the complete basket. The resolver is supplier-tenant scoped:

Supplier Organization → eligible supplier tenant → eligible warehouse

Eligibility checks service zones, existing tenant product/catalog capability, warehouse stock where tracked, operational and delivery rules, MOQ/business rules, contract compatibility, and configured routing priority. Distance is only a tie-breaker when existing reliable coordinates are available. If no single warehouse satisfies the basket, placement returns NO_SINGLE_FULFILLMENT_LOCATION; it does not create a partial split order.

A warehouse is not a replacement name for a supplier branch. The branch is the sellable supplier tenant; the warehouse is its fulfillment location. warehouse_inventory remains the stock source of truth when warehouse fulfillment is active. No duplicate warehouse-product availability table was added.

Fulfillment transfer is transactional and preserves financial snapshots. It is limited to compatible pending/picking assignments and authorized supplier scope, records a reason/source/version, and rejects incompatible tenant, zone, stock, status, or driver-state changes.

## Per-leg transfer and failed retry (2026-09-15)

A whole-order warehouse leg commits and releases only lines that do not have their own warehouse assignment, so those lines are not moved twice. Transfers are presented for each pending/picking warehouse assignment, including item-level legs. A transfer never moves unrelated supplier or warehouse lines. The transaction locks the order and assignment, and it allows the move while the order is placed, pending approval, acknowledged, or processing. Zone eligibility uses the same destination as routing: the order snapshot (including a postal code nested on the address), then the branch, then the restaurant. The transaction validates supplier organization, releases the old reservation, reserves the target stock, and records the transfer reason.

A failed delivery is history, not an active assignment. POST /api/orders/:id/delivery-retry requires a failed driver assignment, target driver, and reason. Pre-dispatch warehouse legs reserve stock again transactionally; dispatched legs do not restore consumed stock. New warehouse/driver attempts link to the superseded records, while active boards hide superseded attempts. A retry whose driver attempt was not tied to one warehouse leg replaces the failed legs only: already-delivered lines are not reserved again, and those failed legs are superseded so a later delivery can complete the order. A retry tied to a whole-order warehouse leg also leaves lines that still have their own live warehouse assignment out of the new reservation. Migration 0208_delivery_retry_provenance.sql adds provenance fields, status, and active-assignment uniqueness.
