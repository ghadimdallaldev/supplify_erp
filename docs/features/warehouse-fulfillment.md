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

## Single vs multi-warehouse

- **Single** (`fulfillment_mode = 'single'`): one `order_warehouse_assignment` row per order (`order_item_id` null), using `default_warehouse_id` or first active warehouse.
- **Multi** (plan flag + supplier toggle): one assignment per line item; routing rules choose the warehouse.

Existing order flows are unchanged when multi-warehouse is off.

## Routing engine

Priority (lowest number wins within same rule type ordering in `warehouseRouting.js`):

1. **product** — exact `product_id`
2. **category** — product `category_id`
3. **zone** — restaurant address matches a warehouse `delivery_zone`
4. **stock_available** — `warehouse_inventory.quantity_available` ≥ line qty
5. **default** — explicit default rule or supplier default warehouse
6. **fallback** — first active warehouse

On assignment in multi mode, stock is reserved: `quantity_available` decreases, `quantity_reserved` increases.

## Inventory source of truth (P0-1)

Order place / cancel / reject / dispatch use **one** stock path via `supplier-order-stock.service.js`:

| Mode        | Condition                                | Place                              | Cancel / Reject         | Dispatch                  |
| ----------- | ---------------------------------------- | ---------------------------------- | ----------------------- | ------------------------- |
| `warehouse` | Active warehouse(s) or `multi_warehouse` | Reserve `warehouse_inventory` only | Release WH reservations | Commit reserved → on-hand |
| `legacy`    | No warehouses                            | Deduct `inventory` only            | Restore `inventory`     | N/A                       |

Legacy `inventory` is kept for UI/compatibility. Adjustments mirror into default warehouse stock when in warehouse mode. Ops tooling:

- `node apps/api/scripts/seed-warehouse-inventory-from-inventory.js [--apply]`
- `node apps/api/scripts/reconcile-inventory-sources.js [--apply-seed-missing-wh] [--apply-mirror-legacy]`

Design: `docs/superpowers/specs/2026-07-23-inventory-source-of-truth-design.md`.

## API (supplier)

All warehouse routes: `requireAuth` → `requireFeature('warehouses')` → `requirePermission(...)`.

| Method                | Path                                                | Notes                               |
| --------------------- | --------------------------------------------------- | ----------------------------------- |
| GET                   | `/api/warehouses`                                   | List + summary counts               |
| POST                  | `/api/warehouses`                                   | First warehouse auto-default        |
| PATCH                 | `/api/warehouses/:id`                               | Update                              |
| DELETE                | `/api/warehouses/:id`                               | Soft deactivate                     |
| POST                  | `/api/warehouses/:id/set-default`                   | Atomic default swap                 |
| GET/PATCH             | `/api/warehouses/:id/inventory`                     | Per-warehouse stock                 |
| GET                   | `/api/warehouses/:id/orders`                        | Open assignments                    |
| GET/POST/PATCH/DELETE | `/api/warehouses/:id/zones`                         | `delivery_zone` rows                |
| GET/POST/PATCH/DELETE | `/api/warehouses/routing/rules`                     | `requireFeature('multi_warehouse')` |
| POST                  | `/api/warehouses/routing/simulate`                  | Preview only, no writes             |
| GET/PATCH             | `/api/suppliers/me/fulfillment`                     | Toggle + mode                       |
| GET                   | `/api/orders/:id/warehouses`                        | Assignments (all modes)             |
| PATCH                 | `/api/orders/:id/warehouses/:assignmentId`          | Manual reassign (pending/picking)   |
| POST                  | `/api/orders/:id/warehouses/:assignmentId/dispatch` | Mark dispatched                     |

Order creation (`POST /api/orders`, supplier manual create) calls `reserveStockForPlacedOrder` in the **same transaction** (warehouse reserve XOR legacy deduct); failure rolls back the order.

## Frontend

- **Settings → Warehouses**: gated by `entitlements.features.warehouses` (`useGetEntitlementsQuery`).
- **Warehouse delivery zones**: **Settings → Warehouses → Manage zones** — `WarehouseZonesPanel` (radius, postal codes, min order, delivery fee). Uses `listZones` / `createZone` / `updateZone` / `deleteZone` RTK endpoints.
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

`POST /api/warehouses/routing/simulate` with `{ items: [{ product_id, quantity }], restaurant_id }` returns `{ preview: [{ productId, warehouseId, reason }] }` with no database side effects.

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
