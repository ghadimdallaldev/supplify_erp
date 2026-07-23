# Inventory source of truth (P0-1)

## Problem

Order placement deducted legacy `inventory` and then reserved `warehouse_inventory`, so cancel/reject/dispatch could diverge. Display already preferred warehouse stock when warehouses existed.

## Decision

**One authoritative path per supplier at runtime:**

| Mode        | When                                                              | Place                                       | Cancel / Reject         | Dispatch                  |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------- | ----------------------- | ------------------------- |
| `warehouse` | Supplier has ≥1 active warehouse **or** `multi_warehouse` feature | Assign + reserve `warehouse_inventory` only | Release WH reservations | Commit reserved → on-hand |
| `legacy`    | No active warehouses and no multi-WH                              | Deduct `inventory` only                     | Restore `inventory`     | N/A (no WH assignments)   |

Never deduct both tables for the same order.

## Compatibility

- Legacy `inventory` rows are **not** dropped.
- Inventory UI adjustments still write `inventory`; when in warehouse mode they also upsert the default (or specified) warehouse row.
- Display overlay (`supplier-stock.service`) continues to prefer warehouse aggregates when in warehouse mode.
- In-flight dual-write orders: cancel releases WH; use reconcile tooling if legacy drifted.

## Tooling

- `seed-warehouse-inventory-from-inventory.js` — seed missing WH rows from legacy (unchanged).
- `reconcile-inventory-sources.js` — report drift; optional `--apply-mirror-legacy` / `--apply-seed-missing-wh`.

## Entry points

All order stock mutations go through `supplier-order-stock.service.js`:

- `reserveStockForPlacedOrder`
- `releaseStockForOrder` (also used by `restoreSupplierStockForOrder`)
- Status sync still uses `syncWarehouseFulfillmentOnOrderStatus` for picking/dispatch/release of WH assignments.
