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
    return new ValidationError(message)
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
    `SELECT id FROM order_warehouse_assignment WHERE order_id = $1 LIMIT 1`,
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

  let targetWarehouseId = warehouseId
  if (!targetWarehouseId) {
    const warehouse = await ensureDefaultWarehouseForSupplier(supplierId, {
      client: clientForMode,
    })
    targetWarehouseId = warehouse?.id
  }
  if (!targetWarehouseId) return null

  const available = Number(availableQty) || 0
  const reserved = Number(reservedQty) || 0

  await run(
    `INSERT INTO warehouse_inventory (
       warehouse_id, product_id, quantity_available, quantity_reserved, quantity_on_hand, updated_at
     ) VALUES ($1, $2, $3, $4, $3 + $4, now())
     ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
       quantity_available = EXCLUDED.quantity_available,
       quantity_reserved = EXCLUDED.quantity_reserved,
       quantity_on_hand = EXCLUDED.quantity_on_hand,
       updated_at = now()`,
    [targetWarehouseId, productId, available, reserved]
  )

  return { warehouseId: targetWarehouseId, available, reserved }
}
