#!/usr/bin/env node
/**
 * Dry-run (default) / apply script: seed default warehouse_inventory from legacy inventory.
 * Non-destructive: never drops inventory rows.
 *
 * Usage:
 *   node apps/api/scripts/seed-warehouse-inventory-from-inventory.js
 *   node apps/api/scripts/seed-warehouse-inventory-from-inventory.js --apply
 */
import { query } from '../src/lib/db.js'
import { ensureDefaultWarehouseForSupplier } from '../src/services/supplier-stock.service.js'
import { upsertWarehouseInventoryFromInventory } from '../src/services/supplier-inventory.service.js'
import { getWarehouseSupplierColumn } from '../src/lib/warehouse-helpers.js'

const apply = process.argv.includes('--apply')

async function main() {
  const supplierCol = await getWarehouseSupplierColumn()
  const { rows: suppliers } = await query(
    `SELECT id, name, default_warehouse_id FROM supplier ORDER BY created_at`
  )

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    suppliers: 0,
    warehousesEnsured: 0,
    inventoryRowsSeen: 0,
    warehouseRowsWouldUpsert: 0,
    warehouseRowsUpserted: 0,
    skippedAlreadyPresent: 0,
    details: [],
  }

  for (const supplier of suppliers) {
    report.suppliers += 1
    const warehouse = await ensureDefaultWarehouseForSupplier(supplier.id)
    if (warehouse) report.warehousesEnsured += 1

    const { rows: inv } = await query(
      `SELECT i.product_id, i.available_qty, i.reserved_qty
       FROM inventory i
       JOIN product p ON p.id = i.product_id
       WHERE p.supplier_id = $1`,
      [supplier.id]
    )
    report.inventoryRowsSeen += inv.length

    for (const row of inv) {
      const { rows: existing } = await query(
        `SELECT quantity_available FROM warehouse_inventory
         WHERE warehouse_id = $1 AND product_id = $2`,
        [warehouse.id, row.product_id]
      )
      if (existing.length) {
        report.skippedAlreadyPresent += 1
        continue
      }
      report.warehouseRowsWouldUpsert += 1
      if (apply) {
        await upsertWarehouseInventoryFromInventory(null, {
          warehouseId: warehouse.id,
          productId: row.product_id,
          availableQty: row.available_qty,
          reservedQty: row.reserved_qty || 0,
        })
        report.warehouseRowsUpserted += 1
      }
    }

    report.details.push({
      supplierId: supplier.id,
      supplierName: supplier.name,
      warehouseId: warehouse?.id,
      inventoryRows: inv.length,
    })
  }

  // Verification query summary
  const { rows: verify } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM inventory) AS inventory_rows,
       (SELECT COUNT(*)::int FROM warehouse_inventory) AS warehouse_inventory_rows,
       (SELECT COUNT(*)::int FROM warehouse WHERE is_active = TRUE) AS active_warehouses`
  )

  console.log(
    JSON.stringify(
      {
        ...report,
        verification: verify[0],
        note: apply
          ? 'Upserts applied. Legacy inventory table was not dropped.'
          : 'Dry-run only. Pass --apply to write warehouse_inventory rows.',
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
