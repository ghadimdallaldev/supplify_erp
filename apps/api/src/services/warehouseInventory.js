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

/** Restore on-hand qty when a dispatched (already committed) assignment is cancelled. */
async function restoreDispatchedWarehouseStock(client, warehouseId, productId, quantity) {
  const qty = Number(quantity)
  if (!qty || qty <= 0) return

  await client.query(
    `UPDATE warehouse_inventory
     SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + $1,
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
  // A whole-order leg does not own lines that have their own warehouse assignment.
  const { rows } = await client.query(
    `SELECT oi.product_id, oi.quantity
     FROM order_item oi
     WHERE oi.order_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM order_warehouse_assignment other
         WHERE other.order_id = oi.order_id
           AND other.order_item_id = oi.id
           AND other.status <> 'superseded'
           AND ($2::uuid IS NULL OR other.id IS DISTINCT FROM $2::uuid)
       )`,
    [orderId, assignment.id ?? null]
  )
  return rows
}

export async function releaseInventoryForOrder(client, orderId) {
  // Cancel before dispatch: release reserved qty. After dispatch: restore on_hand (commit already ran).
  // Restaurant cancel is blocked after SHIPPED; supplier decline on SHIPPED still hits this path.
  const { rows: assignments } = await client.query(
    `SELECT * FROM order_warehouse_assignment
     WHERE order_id = $1 AND status NOT IN ('delivered', 'failed', 'superseded')`,
    [orderId]
  )

  for (const assignment of assignments) {
    const lines = await lineItemsForAssignment(client, orderId, assignment)
    for (const line of lines) {
      if (assignment.status === 'dispatched') {
        await restoreDispatchedWarehouseStock(
          client,
          assignment.warehouse_id,
          line.product_id,
          line.quantity
        )
      } else {
        await releaseWarehouseStock(client, assignment.warehouse_id, line.product_id, line.quantity)
      }
    }
  }

  await client.query(
    `UPDATE order_warehouse_assignment
     SET status = 'failed'
     WHERE order_id = $1 AND status NOT IN ('delivered', 'failed', 'superseded')`,
    [orderId]
  )
}

export async function commitDispatchInventoryForOrder(client, orderId) {
  const { rows: assignments } = await client.query(
    `SELECT * FROM order_warehouse_assignment
     WHERE order_id = $1 AND status NOT IN ('dispatched', 'delivered', 'failed', 'superseded')`,
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
  { orderId, assignmentId, newWarehouseId, supplierId, assignedBy = 'manual', reason = null }
) {
  if (!newWarehouseId) {
    throw new Error('newWarehouseId is required')
  }

  const { rows: orderRows } = await client.query(
    `SELECT id, status, restaurant_id, branch_id, supplier_organization_id, delivery_location_snapshot
     FROM customer_order WHERE id = $1 FOR UPDATE`,
    [orderId]
  )
  if (!orderRows.length) return null
  const order = orderRows[0]
  if (
    ![
      'PLACED',
      'PENDING_APPROVAL',
      'ACKNOWLEDGED',
      'PROCESSING',
      'CONFIRMED',
      'FULFILLING',
    ].includes(order.status)
  ) {
    const err = new Error('Fulfillment can only be reassigned for an active order')
    err.code = 'INVALID_STATUS'
    throw err
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
    `SELECT w.id, w.${supplierCol} AS supplier_id, s.organization_id
     FROM warehouse w
     JOIN supplier s ON s.id = w.${supplierCol}
     WHERE w.id = $1 AND w.is_active = TRUE AND s.is_branch_active = TRUE`,
    [newWarehouseId]
  )
  if (!targetRows.length) {
    const err = new Error('Target warehouse not found or inactive')
    err.code = 'WAREHOUSE_NOT_FOUND'
    throw err
  }
  const target = targetRows[0]
  if (target.supplier_id !== supplierId) {
    const err = new Error('Target warehouse is outside the active supplier tenant')
    err.code = 'SUPPLIER_TENANT_MISMATCH'
    throw err
  }

  const { rows: itemRows } = await client.query(
    `SELECT oi.id, oi.product_id, oi.supplier_id, oi.quantity
     FROM order_item oi
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId]
  )
  const lines = assignment.order_item_id
    ? itemRows.filter((item) => item.id === assignment.order_item_id)
    : itemRows
  if (!lines.length) {
    const err = new Error('Order has no fulfillable lines for this assignment')
    err.code = 'FULFILLMENT_NOT_AVAILABLE'
    throw err
  }
  const lineSupplierIds = [...new Set(lines.map((line) => line.supplier_id))]
  if (lineSupplierIds.length !== 1 || lineSupplierIds[0] !== target.supplier_id) {
    const err = new Error('Target tenant cannot fulfill the committed order lines')
    err.code = 'SUPPLIER_TENANT_MISMATCH'
    throw err
  }
  if (order.supplier_organization_id && target.organization_id !== order.supplier_organization_id) {
    const err = new Error('Target warehouse belongs to another supplier organization')
    err.code = 'SUPPLIER_ORGANIZATION_MISMATCH'
    throw err
  }

  const { rows: targetInventory } = await client.query(
    `SELECT product_id, quantity_available
     FROM warehouse_inventory
     WHERE warehouse_id = $1 AND product_id = ANY($2::uuid[])
     FOR UPDATE`,
    [newWarehouseId, lines.map((line) => line.product_id)]
  )
  const targetAvailable = new Map(
    targetInventory.map((row) => [row.product_id, Number(row.quantity_available)])
  )
  for (const line of lines) {
    if (
      !targetAvailable.has(line.product_id) ||
      targetAvailable.get(line.product_id) < Number(line.quantity)
    ) {
      const err = new Error(`Insufficient stock at warehouse for product ${line.product_id}`)
      err.code = 'INSUFFICIENT_STOCK'
      throw err
    }
  }

  const { rows: zones } = await client.query(
    `SELECT dz.* FROM delivery_zone dz
     WHERE dz.supplier_id = $1 AND dz.warehouse_id = $2 AND dz.is_active = TRUE`,
    [target.supplier_id, newWarehouseId]
  )
  if (zones.length) {
    const { restaurantMatchesZone, resolveRoutingDestination } = await import(
      './warehouseRouting.js'
    )
    const destination = await resolveRoutingDestination(client, order)
    if (!zones.some((zone) => restaurantMatchesZone(zone, destination))) {
      const err = new Error('Target warehouse does not serve the committed delivery location')
      err.code = 'ZONE_INELIGIBLE'
      throw err
    }
  }

  const previousWarehouseId = assignment.warehouse_id
  const previousLines = await lineItemsForAssignment(client, orderId, assignment)
  for (const line of previousLines) {
    await releaseWarehouseStock(client, previousWarehouseId, line.product_id, line.quantity)
  }

  await reserveWarehouseStockBatch(
    client,
    newWarehouseId,
    lines.map((line) => ({ productId: line.product_id, quantity: line.quantity })),
    { supplierId }
  )

  const assignmentReason = JSON.stringify({
    type: 'manual_transfer',
    reason: reason || null,
    actor_id: assignedBy && assignedBy !== 'manual' ? assignedBy : null,
    from_warehouse_id: previousWarehouseId,
    to_warehouse_id: newWarehouseId,
    supplier_tenant_id: target.supplier_id,
    supplier_organization_id: target.organization_id || null,
  })
  const { rows: updated } = await client.query(
    `UPDATE order_warehouse_assignment
     SET warehouse_id = $1,
         assigned_by = 'manual',
         assignment_source = 'manual',
         assignment_reason = $2::jsonb,
         version = COALESCE(version, 1) + 1,
         assigned_at = now(),
         status = CASE WHEN status = 'picking' THEN 'picking' ELSE 'pending' END
     WHERE id = $3
     RETURNING *`,
    [newWarehouseId, assignmentReason, assignmentId]
  )
  return updated[0] ?? null
}

/**
 * Release reserved stock for a single warehouse assignment and mark it failed.
 */
export async function releaseInventoryForAssignment(client, orderId, assignmentId) {
  const { rows } = await client.query(
    `SELECT * FROM order_warehouse_assignment
     WHERE id = $1 AND order_id = $2 AND status NOT IN ('delivered', 'failed', 'superseded')
     FOR UPDATE`,
    [assignmentId, orderId]
  )
  if (!rows.length) return null

  const assignment = rows[0]
  const lines = await lineItemsForAssignment(client, orderId, assignment)
  for (const line of lines) {
    if (assignment.status === 'dispatched') {
      await restoreDispatchedWarehouseStock(
        client,
        assignment.warehouse_id,
        line.product_id,
        line.quantity
      )
    } else {
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
     WHERE id = $1 AND order_id = $2 AND status NOT IN ('delivered', 'failed', 'superseded')
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
       COUNT(*) FILTER (WHERE status <> 'superseded')::int AS total,
       COUNT(*) FILTER (WHERE status IN ('delivered', 'failed', 'superseded'))::int AS terminal
     FROM order_warehouse_assignment
     WHERE order_id = $1`,
    [orderId]
  )
  const total = Number(rows[0]?.total || 0)
  const terminal = Number(rows[0]?.terminal || 0)
  return total === 0 || total === terminal
}

/**
 * True when every warehouse assignment for the order is delivered (none failed/pending).
 */
export async function allWarehouseAssignmentsDelivered(client, orderId) {
  const { rows } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE status <> 'superseded')::int AS total,
       COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered
     FROM order_warehouse_assignment
     WHERE order_id = $1`,
    [orderId]
  )
  const total = Number(rows[0]?.total || 0)
  const delivered = Number(rows[0]?.delivered || 0)
  return total > 0 && total === delivered
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
     WHERE order_id = $1 AND status NOT IN ('delivered', 'failed', 'superseded')
     FOR UPDATE`,
    [orderId]
  )

  for (const assignment of assignments) {
    const lines = await lineItemsForAssignment(client, orderId, assignment)
    for (const line of lines) {
      if (assignment.status === 'dispatched') {
        await restoreDispatchedWarehouseStock(
          client,
          assignment.warehouse_id,
          line.product_id,
          line.quantity
        )
      } else {
        await releaseWarehouseStock(client, assignment.warehouse_id, line.product_id, line.quantity)
      }
    }
  }

  await client.query(
    `UPDATE order_warehouse_assignment
     SET status = 'failed'
     WHERE order_id = $1 AND status NOT IN ('delivered', 'failed', 'superseded')`,
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
