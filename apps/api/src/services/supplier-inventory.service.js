import { ValidationError } from '../middlewares/errorHandler.js'
import { query } from '../lib/db.js'
import { releaseInventoryForOrder } from './warehouseInventory.js'

/**
 * Decrease supplier available stock when a restaurant (or supplier) places an order.
 * Updates the legacy `inventory` row (what the supplier inventory UI reads).
 */
export async function assertAndDeductSupplierStock(
  client,
  productId,
  quantity,
  { sku, reserve = false } = {}
) {
  const qty = Number(quantity)
  if (!qty || qty <= 0) {
    throw new ValidationError('Order quantity must be positive')
  }

  const label = sku || productId

  const { rows } = await client.query(
    `SELECT available_qty FROM inventory WHERE product_id = $1 FOR UPDATE`,
    [productId]
  )

  if (rows.length === 0 || Number(rows[0].available_qty) < qty) {
    throw new ValidationError(`Insufficient inventory for product ${label}`)
  }

  if (reserve) {
    await client.query(
      `UPDATE inventory
       SET available_qty = available_qty - $1,
           reserved_qty = reserved_qty + $1,
           updated_at = now()
       WHERE product_id = $2`,
      [qty, productId]
    )
    return
  }

  await client.query(
    `UPDATE inventory
     SET available_qty = available_qty - $1, updated_at = now()
     WHERE product_id = $2`,
    [qty, productId]
  )
}

/**
 * Put supplier stock back when an order is cancelled (before fulfillment completes).
 */
export async function restoreSupplierStockForOrder(client, orderId) {
  const { rows: items } = await client.query(
    `SELECT product_id, quantity FROM order_item WHERE order_id = $1`,
    [orderId]
  )

  for (const item of items) {
    const qty = Number(item.quantity)
    if (!qty || qty <= 0) continue

    await client.query(
      `UPDATE inventory
       SET available_qty = available_qty + $1,
           reserved_qty = GREATEST(0, reserved_qty - $1),
           updated_at = now()
       WHERE product_id = $2`,
      [qty, item.product_id]
    )
  }

  await releaseInventoryForOrder(client, orderId)
}

/**
 * Keep warehouse_inventory in sync when seeding or creating product stock.
 */
export async function upsertWarehouseInventoryFromInventory(
  client,
  { warehouseId, productId, availableQty, reservedQty = 0 }
) {
  if (!warehouseId || !productId) return

  const available = Number(availableQty) || 0
  const reserved = Number(reservedQty) || 0
  const db = client ? (sql, params) => client.query(sql, params) : query

  await db(
    `INSERT INTO warehouse_inventory (
       warehouse_id, product_id, quantity_available, quantity_reserved, quantity_on_hand, updated_at
     ) VALUES ($1, $2, $3, $4, $3, now())
     ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
       quantity_available = EXCLUDED.quantity_available,
       quantity_reserved = EXCLUDED.quantity_reserved,
       quantity_on_hand = EXCLUDED.quantity_on_hand,
       updated_at = now()`,
    [warehouseId, productId, available, reserved]
  )
}
