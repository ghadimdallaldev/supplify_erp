/**
 * Warehouse inventory reservations tied to order warehouse assignments.
 */

export async function reserveWarehouseStock(client, warehouseId, productId, quantity) {
  const qty = Number(quantity)
  if (!qty || qty <= 0) return

  const { rows } = await client.query(
    `SELECT id, quantity_available, quantity_reserved FROM warehouse_inventory
     WHERE warehouse_id = $1 AND product_id = $2 FOR UPDATE`,
    [warehouseId, productId]
  )
  if (rows.length === 0) return

  const available = Number(rows[0].quantity_available)
  if (available < qty) {
    throw new Error(`Insufficient stock at warehouse for product ${productId}`)
  }

  await client.query(
    `UPDATE warehouse_inventory
     SET quantity_available = quantity_available - $1,
         quantity_reserved = quantity_reserved + $1,
         updated_at = now()
     WHERE warehouse_id = $2 AND product_id = $3`,
    [qty, warehouseId, productId]
  )
}

async function releaseWarehouseStock(client, warehouseId, productId, quantity) {
  const qty = Number(quantity)
  if (!qty || qty <= 0) return

  await client.query(
    `UPDATE warehouse_inventory
     SET quantity_available = quantity_available + $1,
         quantity_reserved = GREATEST(0, quantity_reserved - $1),
         updated_at = now()
     WHERE warehouse_id = $2 AND product_id = $3`,
    [qty, warehouseId, productId]
  )
}

async function commitWarehouseStock(client, warehouseId, productId, quantity) {
  const qty = Number(quantity)
  if (!qty || qty <= 0) return

  await client.query(
    `UPDATE warehouse_inventory
     SET quantity_reserved = GREATEST(0, quantity_reserved - $1),
         quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - $1),
         updated_at = now()
     WHERE warehouse_id = $2 AND product_id = $3`,
    [qty, warehouseId, productId]
  )
}

async function lineItemsForAssignment(client, orderId, assignment) {
  if (assignment.order_item_id) {
    const { rows } = await client.query(
      `SELECT product_id, quantity FROM order_item WHERE id = $1`,
      [assignment.order_item_id]
    )
    return rows
  }
  const { rows } = await client.query(
    `SELECT product_id, quantity FROM order_item WHERE order_id = $1`,
    [orderId]
  )
  return rows
}

export async function releaseInventoryForOrder(client, orderId) {
  const { rows: assignments } = await client.query(
    `SELECT * FROM order_warehouse_assignment
     WHERE order_id = $1 AND status NOT IN ('dispatched', 'delivered', 'failed')`,
    [orderId]
  )

  for (const assignment of assignments) {
    const lines = await lineItemsForAssignment(client, orderId, assignment)
    for (const line of lines) {
      await releaseWarehouseStock(client, assignment.warehouse_id, line.product_id, line.quantity)
    }
  }

  await client.query(
    `UPDATE order_warehouse_assignment
     SET status = 'failed'
     WHERE order_id = $1 AND status NOT IN ('delivered', 'failed')`,
    [orderId]
  )
}

export async function commitDispatchInventoryForOrder(client, orderId) {
  const { rows: assignments } = await client.query(
    `SELECT * FROM order_warehouse_assignment
     WHERE order_id = $1 AND status NOT IN ('dispatched', 'delivered', 'failed')`,
    [orderId]
  )

  for (const assignment of assignments) {
    const lines = await lineItemsForAssignment(client, orderId, assignment)
    for (const line of lines) {
      await commitWarehouseStock(client, assignment.warehouse_id, line.product_id, line.quantity)
    }
  }

  await client.query(
    `UPDATE order_warehouse_assignment
     SET status = 'dispatched', dispatched_at = COALESCE(dispatched_at, now())
     WHERE order_id = $1 AND status IN ('pending', 'picking', 'packed')`,
    [orderId]
  )
}

const PICKING_ORDER_STATUSES = new Set(['ACKNOWLEDGED', 'PROCESSING'])
const DISPATCH_ORDER_STATUSES = new Set(['SHIPPED', 'COMPLETED'])

/**
 * Sync assignment status and inventory when customer_order.status changes.
 */
export async function syncWarehouseFulfillmentOnOrderStatus(client, orderId, newStatus, oldStatus) {
  if (!newStatus || newStatus === oldStatus) return

  if (PICKING_ORDER_STATUSES.has(newStatus)) {
    await client.query(
      `UPDATE order_warehouse_assignment
       SET status = 'picking'
       WHERE order_id = $1 AND status = 'pending'`,
      [orderId]
    )
  }

  if (DISPATCH_ORDER_STATUSES.has(newStatus) && !DISPATCH_ORDER_STATUSES.has(oldStatus)) {
    await commitDispatchInventoryForOrder(client, orderId)
  }

  if (newStatus === 'CANCELLED' && oldStatus !== 'CANCELLED') {
    await releaseInventoryForOrder(client, orderId)
  }
}
