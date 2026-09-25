/**
 * Single authoritative stock path for supplier order lifecycle.
 *
 * Mode resolution:
 * - warehouse: active warehouses and/or multi_warehouse → reserve/commit/release via warehouse_inventory
 * - legacy: no warehouses → deduct/restore via inventory
 *
 * Never mutates both tables for the same place/cancel cycle.
 */
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  assertAndDeductSupplierStock,
  assertAndDeductSupplierStockBatch,
} from './supplier-inventory.service.js'
import { releaseInventoryForOrder } from './warehouseInventory.js'
import { assignWarehousesToOrder } from './warehouseRouting.js'
import {
  ensureDefaultWarehouseForSupplier,
  supplierUsesWarehouseInventory,
} from './supplier-stock.service.js'

function toValidationError(error) {
  const message = error?.message || 'Insufficient warehouse stock'
  if (
    message.includes('Insufficient stock') ||
    message.includes('No default warehouse') ||
    message.includes('no warehouse inventory row') ||
    message.includes('Warehouse stock could not be assigned')
  ) {
    const mapped = new ValidationError(message, error.details || null)
    if (error.code) mapped.code = error.code
    return mapped
  }
  if (
    ['NO_SINGLE_FULFILLMENT_LOCATION', 'SUPPLIER_TENANT_MISMATCH', 'ZONE_INELIGIBLE'].includes(
      error?.code
    )
  ) {
    const mapped = new ValidationError(message, error.details || null)
    mapped.code = error.code
    return mapped
  }
  return error
}

/**
 * @returns {'warehouse' | 'legacy'}
 */
export async function resolveOrderStockMode(supplierId, { client = null } = {}) {
  const useWh = await supplierUsesWarehouseInventory(supplierId, { client })
  return useWh ? 'warehouse' : 'legacy'
}

/**
 * Reserve stock when an order is placed (restaurant, manual, dispute replacement, scheduled).
 * Call after order_item rows exist when warehouse routing needs them.
 */
export async function reserveStockForPlacedOrder(
  client,
  {
    supplierId,
    supplier,
    order,
    orderItems,
    multiWarehouseActive = false,
    legacyLineItems = null,
    reserveLegacy = false,
  }
) {
  const mode = await resolveOrderStockMode(supplierId, { client })
  const lines =
    legacyLineItems ||
    (orderItems || []).map((item) => ({
      productId: item.product_id ?? item.productId,
      quantity: item.quantity,
      sku: item.sku,
      reserve: reserveLegacy,
    }))

  if (mode === 'legacy') {
    if (lines.length === 1 && !legacyLineItems) {
      const only = lines[0]
      await assertAndDeductSupplierStock(client, only.productId, only.quantity, {
        sku: only.sku,
        reserve: reserveLegacy,
      })
    } else {
      await assertAndDeductSupplierStockBatch(
        client,
        lines.map((line) => ({ ...line, reserve: reserveLegacy || Boolean(line.reserve) }))
      )
    }
    return { mode: 'legacy', fulfillment: null }
  }

  let supplierRow = supplier
  if (!supplierRow?.default_warehouse_id) {
    const warehouse = await ensureDefaultWarehouseForSupplier(supplierId, { client })
    supplierRow = {
      ...(supplierRow || { id: supplierId }),
      id: supplierId,
      default_warehouse_id: warehouse?.id ?? supplierRow?.default_warehouse_id,
    }
  }

  try {
    const fulfillment = await assignWarehousesToOrder(client, {
      order,
      orderItems,
      supplier: supplierRow,
      multiWarehouseActive,
    })

    if (!fulfillment?.assignments?.length || fulfillment.mode === 'none') {
      throw new ValidationError('Warehouse stock could not be assigned; order was not placed')
    }

    return { mode: 'warehouse', fulfillment }
  } catch (error) {
    throw toValidationError(error)
  }
}

/**
 * Release / restore stock for cancel or reject.
 * Warehouse-assigned orders: release WH only.
 * Legacy orders (no assignments): restore inventory only.
 */
export async function releaseStockForOrder(client, orderId) {
  const { rows: assignments } = await client.query(
    `SELECT id FROM order_warehouse_assignment WHERE order_id = $1 AND status <> 'superseded' LIMIT 1`,
    [orderId]
  )

  if (assignments.length > 0) {
    await releaseInventoryForOrder(client, orderId)
    return { mode: 'warehouse' }
  }

  const { rows: items } = await client.query(
    `SELECT product_id, quantity FROM order_item WHERE order_id = $1`,
    [orderId]
  )

  const releaseRows = items
    .map((item) => ({
      productId: item.product_id,
      quantity: Number(item.quantity),
    }))
    .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0)

  if (releaseRows.length > 0) {
    await client.query(
      `UPDATE inventory AS inv
       SET available_qty = inv.available_qty + src.qty,
           reserved_qty = GREATEST(0, inv.reserved_qty - src.qty),
           updated_at = now()
       FROM unnest($1::uuid[], $2::numeric[]) AS src(product_id, qty)
       WHERE inv.product_id = src.product_id`,
      [releaseRows.map((row) => row.productId), releaseRows.map((row) => row.quantity)]
    )
  }

  return { mode: 'legacy' }
}

/**
 * Keep default (or target) warehouse_inventory aligned when legacy inventory is adjusted.
 * No-op when supplier is still on legacy-only mode.
 */
export async function syncWarehouseMirrorFromLegacy(
  dbOrClient,
  { supplierId, productId, availableQty, reservedQty = 0, warehouseId = null }
) {
  if (!supplierId || !productId) return null

  const { query } = await import('../lib/db.js')
  const run =
    typeof dbOrClient?.query === 'function'
      ? (sql, params) => dbOrClient.query(sql, params)
      : typeof dbOrClient === 'function'
        ? dbOrClient
        : query
  const clientForMode = typeof dbOrClient?.query === 'function' ? dbOrClient : null

  const mode = await resolveOrderStockMode(supplierId, { client: clientForMode })
  if (mode !== 'warehouse') return null

  const { getWarehouseSupplierColumn } = await import('../lib/warehouse-helpers.js')
  const supplierCol = await getWarehouseSupplierColumn((sql, params) => run(sql, params))

  let targetWarehouseId = warehouseId
  if (targetWarehouseId) {
    const { rows: owned } = await run(
      `SELECT id FROM warehouse WHERE id = $1 AND ${supplierCol} = $2 AND is_active = TRUE`,
      [targetWarehouseId, supplierId]
    )
    if (!owned.length) {
      throw new ValidationError('Warehouse not found for this supplier')
    }
  } else {
    const warehouse = await ensureDefaultWarehouseForSupplier(supplierId, {
      client: clientForMode,
    })
    targetWarehouseId = warehouse?.id
  }
  if (!targetWarehouseId) return null

  const { rows: currentRows } = await run(
    `
    SELECT
      COALESCE(SUM(wi.quantity_available), 0)::numeric AS available_qty,
      COALESCE(SUM(wi.quantity_reserved), 0)::numeric AS reserved_qty
    FROM warehouse_inventory wi
    JOIN warehouse w ON w.id = wi.warehouse_id
    WHERE wi.product_id = $1
      AND w.${supplierCol} = $2
      AND w.is_active = TRUE
    `,
    [productId, supplierId]
  )

  const available = Number(availableQty) || 0
  const reserved = Number(reservedQty) || 0
  const deltaAvailable = available - (Number(currentRows[0]?.available_qty) || 0)
  const deltaReserved = reserved - (Number(currentRows[0]?.reserved_qty) || 0)

  if (deltaAvailable === 0 && deltaReserved === 0) {
    return { warehouseId: targetWarehouseId, available, reserved }
  }

  // Apply the product-level delta to one owned warehouse. Overwriting that row
  // with the full aggregate would inflate multi-warehouse stock.
  await run(
    `INSERT INTO warehouse_inventory (
       warehouse_id, product_id, quantity_available, quantity_reserved, quantity_on_hand, updated_at
     ) VALUES ($1, $2, GREATEST(0, $3), GREATEST(0, $4), GREATEST(0, $3) + GREATEST(0, $4), now())
     ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
       quantity_available = GREATEST(0, warehouse_inventory.quantity_available + $3),
       quantity_reserved = GREATEST(0, warehouse_inventory.quantity_reserved + $4),
       quantity_on_hand = GREATEST(0, warehouse_inventory.quantity_available + $3)
                         + GREATEST(0, warehouse_inventory.quantity_reserved + $4),
       updated_at = now()`,
    [targetWarehouseId, productId, deltaAvailable, deltaReserved]
  )

  return { warehouseId: targetWarehouseId, available, reserved }
}

/**
 * When warehouse inventory is edited directly, mirror aggregate qty into legacy `inventory`
 * so remaining legacy readers stay aligned for warehouse-mode suppliers.
 */
export async function syncLegacyMirrorFromWarehouse(dbOrClient, { supplierId, productId }) {
  if (!supplierId || !productId) return null

  const { query } = await import('../lib/db.js')
  const run =
    typeof dbOrClient?.query === 'function'
      ? (sql, params) => dbOrClient.query(sql, params)
      : typeof dbOrClient === 'function'
        ? dbOrClient
        : query
  const clientForMode = typeof dbOrClient?.query === 'function' ? dbOrClient : null

  const mode = await resolveOrderStockMode(supplierId, { client: clientForMode })
  if (mode !== 'warehouse') return null

  const { getWarehouseSupplierColumn } = await import('../lib/warehouse-helpers.js')
  const supplierCol = await getWarehouseSupplierColumn((sql, params) => run(sql, params))
  const { rows } = await run(
    `
    SELECT
      COALESCE(SUM(wi.quantity_available), 0)::numeric AS available_qty,
      COALESCE(SUM(wi.quantity_reserved), 0)::numeric AS reserved_qty
    FROM warehouse_inventory wi
    JOIN warehouse w ON w.id = wi.warehouse_id
    WHERE wi.product_id = $1
      AND w.${supplierCol} = $2
      AND w.is_active = TRUE
    `,
    [productId, supplierId]
  )

  const available = Number(rows[0]?.available_qty || 0)
  const reserved = Number(rows[0]?.reserved_qty || 0)

  await run(
    `
    INSERT INTO inventory (product_id, available_qty, reserved_qty, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (product_id) DO UPDATE SET
      available_qty = EXCLUDED.available_qty,
      reserved_qty = EXCLUDED.reserved_qty,
      updated_at = now()
    `,
    [productId, available, reserved]
  )

  return { available, reserved }
}

/**
 * Apply an IN/OUT adjustment to warehouse_inventory, then mirror the aggregate into legacy inventory.
 * Uses warehouse totals as the source of truth so a stale inventory row cannot wipe warehouse stock.
 */
export async function applyWarehouseInventoryAdjustment(
  dbOrClient,
  { supplierId, productId, adjustmentType, quantity, warehouseId = null }
) {
  const mode = await resolveOrderStockMode(supplierId, {
    client: typeof dbOrClient?.query === 'function' ? dbOrClient : null,
  })
  if (mode !== 'warehouse') return { applied: false }

  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ValidationError('Adjustment quantity must be positive')
  }
  if (adjustmentType !== 'IN' && adjustmentType !== 'OUT') {
    throw new ValidationError('Invalid adjustment type')
  }

  const { query } = await import('../lib/db.js')
  const run =
    typeof dbOrClient?.query === 'function'
      ? (sql, params) => dbOrClient.query(sql, params)
      : typeof dbOrClient === 'function'
        ? dbOrClient
        : query
  const clientForMode = typeof dbOrClient?.query === 'function' ? dbOrClient : null

  const { getWarehouseSupplierColumn } = await import('../lib/warehouse-helpers.js')
  const supplierCol = await getWarehouseSupplierColumn((sql, params) => run(sql, params))

  let targetWarehouseId = warehouseId
  if (targetWarehouseId) {
    const { rows: owned } = await run(
      `SELECT id FROM warehouse WHERE id = $1 AND ${supplierCol} = $2 AND is_active = TRUE`,
      [targetWarehouseId, supplierId]
    )
    if (!owned.length) {
      throw new ValidationError('Warehouse not found for this supplier')
    }
  } else {
    const warehouse = await ensureDefaultWarehouseForSupplier(supplierId, {
      client: clientForMode,
    })
    targetWarehouseId = warehouse?.id
  }
  if (!targetWarehouseId) {
    throw new ValidationError('No warehouse available for this supplier')
  }

  const { rows: sumRows } = await run(
    `
    SELECT
      COALESCE(SUM(wi.quantity_available), 0)::numeric AS available_qty,
      COALESCE(SUM(wi.quantity_reserved), 0)::numeric AS reserved_qty
    FROM warehouse_inventory wi
    JOIN warehouse w ON w.id = wi.warehouse_id
    WHERE wi.product_id = $1
      AND w.${supplierCol} = $2
      AND w.is_active = TRUE
    `,
    [productId, supplierId]
  )
  const { rows: targetRows } = await run(
    `SELECT COALESCE(quantity_available, 0)::numeric AS available_qty
     FROM warehouse_inventory
     WHERE warehouse_id = $1 AND product_id = $2`,
    [targetWarehouseId, productId]
  )

  const productAvailable = Number(sumRows[0]?.available_qty || 0)
  const productReserved = Number(sumRows[0]?.reserved_qty || 0)
  const warehouseAvailable = Number(targetRows[0]?.available_qty || 0)
  const delta = adjustmentType === 'IN' ? qty : -qty
  if (delta < 0 && warehouseAvailable + delta < 0) {
    throw new ValidationError('Insufficient available inventory')
  }

  await syncWarehouseMirrorFromLegacy(dbOrClient, {
    supplierId,
    productId,
    availableQty: productAvailable + delta,
    reservedQty: productReserved,
    warehouseId: targetWarehouseId,
  })
  const mirrored = await syncLegacyMirrorFromWarehouse(dbOrClient, { supplierId, productId })
  return {
    applied: true,
    warehouseId: targetWarehouseId,
    availableQty: mirrored?.available ?? productAvailable + delta,
    reservedQty: mirrored?.reserved ?? productReserved,
  }
}
