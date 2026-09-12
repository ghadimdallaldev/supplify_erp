#!/usr/bin/env node
/**
 * Reconcile legacy `inventory` vs `warehouse_inventory` for suppliers on warehouse mode.
 *
 * Default: dry-run report (JSON).
 *
 * Usage:
 *   node apps/api/scripts/reconcile-inventory-sources.js
 *   node apps/api/scripts/reconcile-inventory-sources.js --apply-seed-missing-wh
 *   node apps/api/scripts/reconcile-inventory-sources.js --apply-mirror-legacy
 *   node apps/api/scripts/reconcile-inventory-sources.js --supplier <uuid>
 *
 * --apply-seed-missing-wh  Insert missing warehouse_inventory rows from legacy (non-destructive).
 * --apply-mirror-legacy    Set legacy inventory.available/reserved to sum of active WH rows.
 */
import { query } from '../src/lib/db.js'
import { ensureDefaultWarehouseForSupplier } from '../src/services/supplier-stock.service.js'
import { upsertWarehouseInventoryFromInventory } from '../src/services/supplier-inventory.service.js'
import { getWarehouseSupplierColumn } from '../src/lib/warehouse-helpers.js'

const applySeedMissing = process.argv.includes('--apply-seed-missing-wh')
const applyMirrorLegacy = process.argv.includes('--apply-mirror-legacy')
const supplierIdx = process.argv.indexOf('--supplier')
const supplierFilter =
  supplierIdx >= 0 && process.argv[supplierIdx + 1] ? process.argv[supplierIdx + 1] : null

function qty(value) {
  return Number(value || 0)
}

async function main() {
  const supplierCol = await getWarehouseSupplierColumn()
  const params = []
  let supplierClause = ''
  if (supplierFilter) {
    params.push(supplierFilter)
    supplierClause = ` WHERE id = $1`
  }

  const { rows: suppliers } = await query(
    `SELECT id, name, default_warehouse_id FROM supplier${supplierClause} ORDER BY created_at`,
    params
  )

  const report = {
    mode: applySeedMissing || applyMirrorLegacy ? 'apply' : 'dry-run',
    applySeedMissing,
    applyMirrorLegacy,
    suppliers: 0,
    productsCompared: 0,
    driftCount: 0,
    missingWhRows: 0,
    seededWhRows: 0,
    mirroredLegacyRows: 0,
    drifts: [],
  }

  for (const supplier of suppliers) {
    report.suppliers += 1
    const warehouse = await ensureDefaultWarehouseForSupplier(supplier.id)

    const { rows: legacy } = await query(
      `SELECT i.product_id, i.available_qty, i.reserved_qty, p.sku
       FROM inventory i
       JOIN product p ON p.id = i.product_id
       WHERE p.supplier_id = $1`,
      [supplier.id]
    )

    const { rows: whAgg } = await query(
      `
      SELECT
        wi.product_id,
        COALESCE(SUM(wi.quantity_available), 0)::numeric AS available_qty,
        COALESCE(SUM(wi.quantity_reserved), 0)::numeric AS reserved_qty
      FROM warehouse_inventory wi
      JOIN warehouse w ON w.id = wi.warehouse_id
      WHERE w.${supplierCol} = $1 AND w.is_active = TRUE
      GROUP BY wi.product_id
      `,
      [supplier.id]
    )
    const whByProduct = new Map(whAgg.map((row) => [row.product_id, row]))

    for (const row of legacy) {
      report.productsCompared += 1
      const wh = whByProduct.get(row.product_id)
      if (!wh) {
        report.missingWhRows += 1
        report.driftCount += 1
        report.drifts.push({
          supplierId: supplier.id,
          productId: row.product_id,
          sku: row.sku,
          type: 'missing_warehouse_row',
          legacyAvailable: qty(row.available_qty),
          warehouseAvailable: 0,
        })
        if (applySeedMissing && warehouse?.id) {
          await upsertWarehouseInventoryFromInventory(null, {
            warehouseId: warehouse.id,
            productId: row.product_id,
            availableQty: row.available_qty,
            reservedQty: row.reserved_qty || 0,
          })
          report.seededWhRows += 1
        }
        continue
      }

      const legacyAvail = qty(row.available_qty)
      const whAvail = qty(wh.available_qty)
      const legacyReserved = qty(row.reserved_qty)
      const whReserved = qty(wh.reserved_qty)
      if (legacyAvail !== whAvail || legacyReserved !== whReserved) {
        report.driftCount += 1
        report.drifts.push({
          supplierId: supplier.id,
          productId: row.product_id,
          sku: row.sku,
          type: 'quantity_mismatch',
          legacyAvailable: legacyAvail,
          warehouseAvailable: whAvail,
          legacyReserved,
          warehouseReserved: whReserved,
          deltaAvailable: whAvail - legacyAvail,
        })
        if (applyMirrorLegacy) {
          await query(
            `UPDATE inventory
             SET available_qty = $1, reserved_qty = $2, updated_at = now()
             WHERE product_id = $3`,
            [whAvail, whReserved, row.product_id]
          )
          report.mirroredLegacyRows += 1
        }
      }
    }

    // WH-only products (no legacy row)
    for (const [productId, wh] of whByProduct) {
      if (legacy.some((row) => row.product_id === productId)) continue
      report.productsCompared += 1
      report.driftCount += 1
      report.drifts.push({
        supplierId: supplier.id,
        productId,
        type: 'missing_legacy_row',
        legacyAvailable: 0,
        warehouseAvailable: qty(wh.available_qty),
        warehouseReserved: qty(wh.reserved_qty),
      })
      if (applyMirrorLegacy) {
        await query(
          `INSERT INTO inventory (product_id, available_qty, reserved_qty, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (product_id) DO UPDATE SET
             available_qty = EXCLUDED.available_qty,
             reserved_qty = EXCLUDED.reserved_qty,
             updated_at = now()`,
          [productId, qty(wh.available_qty), qty(wh.reserved_qty)]
        )
        report.mirroredLegacyRows += 1
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        driftsSample: report.drifts.slice(0, 50),
        driftsTruncated: report.drifts.length > 50,
        note:
          applySeedMissing || applyMirrorLegacy
            ? 'Apply flags executed. Re-run without flags to verify remaining drift.'
            : 'Dry-run only. Use --apply-seed-missing-wh and/or --apply-mirror-legacy.',
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
