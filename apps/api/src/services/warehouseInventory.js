/**
 * Warehouse inventory reservations tied to order warehouse assignments.
 */

export async function reserveWarehouseStock(
  client,
  warehouseId,
  productId,
  quantity,
  options = {}
) {
  await reserveWarehouseStockBatch(client, warehouseId, [{ productId, quantity }], options)
}

/**
 * Reserve warehouse stock for multiple lines (single lock + batch update).
 * When supplierId is provided, heals missing rows from legacy/inactive WH stock once.
 */
export async function reserveWarehouseStockBatch(client, warehouseId, lineItems, options = {}) {
  const items = (lineItems || [])
    .map((item) => ({
      productId: item.productId ?? item.product_id,
      quantity: Number(item.quantity),
    }))
    .filter((item) => item.productId && item.quantity > 0)

  if (!items.length) return

  const aggregated = new Map()
  for (const item of items) {
    const existing = aggregated.get(item.productId)
    if (existing) {
      existing.quantity += item.quantity
    } else {
      aggregated.set(item.productId, { ...item })
    }
  }
  const lines = [...aggregated.values()]

  const productIds = lines.map((item) => item.productId)
  const quantities = lines.map((item) => item.quantity)

  let { rows } = await client.query(
    `SELECT product_id, quantity_available FROM warehouse_inventory
     WHERE warehouse_id = $1 AND product_id = ANY($2)
     FOR UPDATE`,
    [warehouseId, productIds]
  )

  let availableByProduct = new Map(
    rows.map((row) => [row.product_id, Number(row.quantity_available)])
  )

  const missingIds = lines
    .filter((item) => !availableByProduct.has(item.productId))
    .map((item) => item.productId)

  if (missingIds.length && options.supplierId) {
    const { seedMissingWarehouseInventoryForSupplier } = await import('./supplier-stock.service.js')
    await seedMissingWarehouseInventoryForSupplier(options.supplierId, warehouseId, {
      client,
      productIds: missingIds,
    })
    ;({ rows } = await client.query(
      `SELECT product_id, quantity_available FROM warehouse_inventory
       WHERE warehouse_id = $1 AND product_id = ANY($2)
       FOR UPDATE`,
      [warehouseId, productIds]
    ))
    availableByProduct = new Map(
      rows.map((row) => [row.product_id, Number(row.quantity_available)])
    )
  }

  for (const item of lines) {
    const available = availableByProduct.get(item.productId)
    // Fail closed: missing warehouse_inventory row means stock is not available
    if (available == null) {
      throw new Error(
        `Insufficient stock at warehouse for product ${item.productId} (no warehouse inventory row)`
      )
    }
    if (available < item.quantity) {
      throw new Error(`Insufficient stock at warehouse for product ${item.productId}`)
    }
  }

  await client.query(
    `
    UPDATE warehouse_inventory wi
    SET
      quantity_available = wi.quantity_available - v.quantity,
      quantity_reserved = wi.quantity_reserved + v.quantity,
      updated_at = now()
    FROM unnest($2::uuid[], $3::numeric[]) AS v(product_id, quantity)
    WHERE wi.warehouse_id = $1 AND wi.product_id = v.product_id
    `,
    [warehouseId, productIds, quantities]
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

/**
 * Atomically move an assignment to another warehouse: release old reservation, reserve at new.
 * Allowed only while status is pending or picking (not packed/dispatched/delivered/failed).
 */
export async function reassignOrderWarehouseAssignment(
  client,
  { orderId, assignmentId, newWarehouseId, supplierId, assignedBy = 'manual' }
) {
  if (!newWarehouseId) {
    throw new Error('newWarehouseId is required')
  }

  const { rows: locked } = await client.query(
    `SELECT * FROM order_warehouse_assignment
     WHERE id = $1 AND order_id = $2
     FOR UPDATE`,
    [assignmentId, orderId]
  )
  if (!locked.length) return null

  const assignment = locked[0]
  if (!['pending', 'picking'].includes(assignment.status)) {
    const err = new Error('Assignment can only be reassigned while pending or picking')
    err.code = 'INVALID_STATUS'
    throw err
  }

  if (assignment.warehouse_id === newWarehouseId) {
    return assignment
  }

  const { getWarehouseSupplierColumn } = await import('../lib/warehouse-helpers.js')
  const supplierCol = await getWarehouseSupplierColumn((sql, params) => client.query(sql, params))
  const { rows: targetRows } = await client.query(
    `SELECT id FROM warehouse
     WHERE id = $1 AND ${supplierCol} = $2 AND is_active = TRUE`,
    [newWarehouseId, supplierId]
  )
  if (!targetRows.length) {
    const err = new Error('Target warehouse not found or inactive')
    err.code = 'WAREHOUSE_NOT_FOUND'
    throw err
  }

  const lines = await lineItemsForAssignment(client, orderId, assignment)
  for (const line of lines) {
    await releaseWarehouseStock(client, assignment.warehouse_id, line.product_id, line.quantity)
  }

  await reserveWarehouseStockBatch(
    client,
    newWarehouseId,
    lines.map((line) => ({ productId: line.product_id, quantity: line.quantity })),
    { supplierId }
  )

  const { rows: updated } = await client.query(
    `UPDATE order_warehouse_assignment
     SET warehouse_id = $1,
         assigned_by = $2,
         assigned_at = now(),
         status = CASE WHEN status = 'picking' THEN 'picking' ELSE 'pending' END
     WHERE id = $3
     RETURNING *`,
    [newWarehouseId, assignedBy, assignmentId]
  )
  return updated[0] ?? null
}

/**
 * Release reserved stock for a single warehouse assignment and mark it failed.
 */
export async function releaseInventoryForAssignment(client, orderId, assignmentId) {
  const { rows } = await client.query(
    `SELECT * FROM order_warehouse_assignment
     WHERE id = $1 AND order_id = $2 AND status NOT IN ('delivered', 'failed')
     FOR UPDATE`,
    [assignmentId, orderId]
  )
  if (!rows.length) return null

  const assignment = rows[0]
  if (assignment.status !== 'dispatched') {
    const lines = await lineItemsForAssignment(client, orderId, assignment)
    for (const line of lines) {
      await releaseWarehouseStock(client, assignment.warehouse_id, line.product_id, line.quantity)
    }
  }

  const { rows: updated } = await client.query(
    `UPDATE order_warehouse_assignment
     SET status = 'failed'
     WHERE id = $1
     RETURNING *`,
    [assignmentId]
  )
  return updated[0] ?? null
}

/**
 * Mark a warehouse assignment delivered after committing reserved stock (if still open).
 */
export async function markWarehouseAssignmentDelivered(client, orderId, assignmentId) {
  const { rows } = await client.query(
    `SELECT * FROM order_warehouse_assignment
     WHERE id = $1 AND order_id = $2 AND status NOT IN ('delivered', 'failed')
     FOR UPDATE`,
    [assignmentId, orderId]
  )
  if (!rows.length) return null

  const assignment = rows[0]
  if (['pending', 'picking', 'packed'].includes(assignment.status)) {
    const lines = await lineItemsForAssignment(client, orderId, assignment)
    for (const line of lines) {
      await commitWarehouseStock(client, assignment.warehouse_id, line.product_id, line.quantity)
    }
  }

  const { rows: updated } = await client.query(
    `UPDATE order_warehouse_assignment
     SET status = 'delivered',
         dispatched_at = COALESCE(dispatched_at, now())
     WHERE id = $1
     RETURNING *`,
    [assignmentId]
  )
  return updated[0] ?? null
}

/**
 * True when every warehouse assignment for the order is terminal (delivered/failed),
 * or there are no assignments at all.
 */
export async function allWarehouseAssignmentsTerminal(client, orderId) {
  const { rows } = await client.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('delivered', 'failed'))::int AS terminal
     FROM order_warehouse_assignment
     WHERE order_id = $1`,
    [orderId]
  )
  const total = Number(rows[0]?.total || 0)
  const terminal = Number(rows[0]?.terminal || 0)
  return total === 0 || total === terminal
}

/**
 * Commit reserved stock and mark a single warehouse assignment as dispatched.
 */
export async function commitDispatchInventoryForAssignment(client, orderId, assignmentId) {
  const { rows } = await client.query(
    `SELECT * FROM order_warehouse_assignment
     WHERE id = $1 AND order_id = $2 AND status IN ('pending', 'picking', 'packed')
     FOR UPDATE`,
    [assignmentId, orderId]
  )
  if (!rows.length) return null

  const assignment = rows[0]
  const lines = await lineItemsForAssignment(client, orderId, assignment)
  for (const line of lines) {
    await commitWarehouseStock(client, assignment.warehouse_id, line.product_id, line.quantity)
  }

  const { rows: updated } = await client.query(
    `UPDATE order_warehouse_assignment
     SET status = 'dispatched', dispatched_at = now()
     WHERE id = $1
     RETURNING *`,
    [assignmentId]
  )
  return updated[0] ?? null
}

/**
 * Release reserved stock for open assignments on an order, then mark them failed.
 * Call this before/while marking delivery failed so reservations are not left dangling.
 */
export async function releaseInventoryForFailedDelivery(client, orderId) {
  const { rows: assignments } = await client.query(
    `SELECT * FROM order_warehouse_assignment
     WHERE order_id = $1 AND status NOT IN ('delivered', 'failed')
     FOR UPDATE`,
    [orderId]
  )

  for (const assignment of assignments) {
    if (assignment.status === 'dispatched') {
      // Already committed on-hand — do not restore available; just mark failed.
      continue
    }
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

const PICKING_ORDER_STATUSES = new Set(['ACKNOWLEDGED', 'PROCESSING'])
const DISPATCH_ORDER_STATUSES = new Set(['SHIPPED', 'COMPLETED', 'DELIVERED'])
const RELEASE_ORDER_STATUSES = new Set(['CANCELLED', 'REJECTED'])

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

  if (RELEASE_ORDER_STATUSES.has(newStatus) && !RELEASE_ORDER_STATUSES.has(oldStatus)) {
    await releaseInventoryForOrder(client, orderId)
  }
}
