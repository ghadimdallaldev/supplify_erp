# Warehouse fulfillment

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

Order creation (`POST /api/orders`, supplier manual create) calls `assignWarehousesToOrder` in the **same transaction**; failure rolls back the order.

## Frontend

- **Settings → Warehouses**: gated by `entitlements.features.warehouses` (`useGetEntitlementsQuery`).
- Multi-warehouse toggle: gated by `multi_warehouse` plan flag; calls fulfillment API.
- **Order detail**: shows per-item warehouse badges when `multiLocationFulfillment` is true.

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
