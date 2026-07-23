import { ValidationError } from '../middlewares/errorHandler.js'
import { query } from '../lib/db.js'

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
 * Lock and deduct stock for multiple products in one transaction (2 queries vs 2N).
 */
export async function assertAndDeductSupplierStockBatch(client, lineItems) {
  if (!lineItems?.length) return

  const normalized = lineItems.map((item) => ({
    productId: item.productId,
    quantity: Number(item.quantity),
    sku: item.sku,
    reserve: Boolean(item.reserve),
  }))

  for (const item of normalized) {
    if (!item.quantity || item.quantity <= 0) {
      throw new ValidationError('Order quantity must be positive')
    }
  }

  // PostgreSQL UPDATE ... FROM unnest fails if the same product_id appears twice.
  const aggregated = new Map()
  for (const item of normalized) {
    const existing = aggregated.get(item.productId)
    if (existing) {
      existing.quantity += item.quantity
      existing.reserve = existing.reserve || item.reserve
      if (!existing.sku && item.sku) existing.sku = item.sku
    } else {
      aggregated.set(item.productId, { ...item })
    }
  }
  const lines = [...aggregated.values()]

  const productIds = lines.map((item) => item.productId)
  const { rows } = await client.query(
    `SELECT product_id, available_qty FROM inventory WHERE product_id = ANY($1) FOR UPDATE`,
    [productIds]
  )
  const availableByProduct = new Map(rows.map((row) => [row.product_id, Number(row.available_qty)]))

  for (const item of lines) {
    const available = availableByProduct.get(item.productId)
    if (available == null || available < item.quantity) {
      throw new ValidationError(`Insufficient inventory for product ${item.sku || item.productId}`)
    }
  }

  const quantities = lines.map((item) => item.quantity)
  const reserveFlags = lines.map((item) => item.reserve)

  await client.query(
    `
    UPDATE inventory i
    SET
      available_qty = i.available_qty - v.quantity,
      reserved_qty = CASE
        WHEN v.reserve THEN i.reserved_qty + v.quantity
        ELSE i.reserved_qty
      END,
      updated_at = now()
    FROM unnest($1::uuid[], $2::numeric[], $3::boolean[]) AS v(product_id, quantity, reserve)
    WHERE i.product_id = v.product_id
    `,
    [productIds, quantities, reserveFlags]
  )
}

/**
 * Put supplier stock back when an order is cancelled/rejected.
 * Delegates to the unified stock path (warehouse release XOR legacy restore).
 */
export async function restoreSupplierStockForOrder(client, orderId) {
  const { releaseStockForOrder } = await import('./supplier-order-stock.service.js')
  return releaseStockForOrder(client, orderId)
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
