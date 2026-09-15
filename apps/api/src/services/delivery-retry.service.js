import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { reserveWarehouseStockBatch } from './warehouseInventory.js'
import { getWarehouseSupplierColumn } from '../lib/warehouse-helpers.js'
import { invalidateDispatchCacheForSupplier } from '../lib/dispatch-cache.js'

const ACTIVE_ORDER_STATUSES = ['PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'FULFILLING', 'SHIPPED']

/** Create a linked fulfillment attempt without deleting the failed attempt or restoring consumed stock. */
export async function retryFailedDelivery({
  orderId,
  supplierId,
  sourceDriverAssignmentId,
  driverId,
  warehouseId = null,
  reason,
  assignedByUserId = null,
}) {
  if (!reason || String(reason).trim().length < 3) {
    throw new ValidationError('A retry reason of at least 3 characters is required')
  }
  if (!sourceDriverAssignmentId || !driverId) {
    throw new ValidationError('source_driver_assignment_id and driver_id are required')
  }

  const result = await withTransaction(async (client) => {
    const { rows: orders } = await client.query(
      `SELECT id, status FROM customer_order WHERE id = $1 FOR UPDATE`,
      [orderId]
    )
    if (!orders.length) throw new NotFoundError('Order not found')
    if (!ACTIVE_ORDER_STATUSES.includes(orders[0].status)) {
      throw new ValidationError('Only active orders can be retried')
    }

    const { rows: sourceDrivers } = await client.query(
      `SELECT * FROM driver_assignments
       WHERE id = $1 AND order_id = $2 AND supplier_id = $3 AND status = 'failed'
       FOR UPDATE`,
      [sourceDriverAssignmentId, orderId, supplierId]
    )
    if (!sourceDrivers.length) throw new ValidationError('Failed driver attempt not found')
    const sourceDriver = sourceDrivers[0]

    const { rows: drivers } = await client.query(
      `SELECT id FROM drivers WHERE id = $1 AND supplier_id = $2 AND is_active = TRUE`,
      [driverId, supplierId]
    )
    if (!drivers.length) throw new ValidationError('Retry driver not found or inactive')

    let sourceWarehouse = null
    if (sourceDriver.warehouse_assignment_id) {
      const { rows } = await client.query(
        `SELECT * FROM order_warehouse_assignment
         WHERE id = $1 AND order_id = $2 AND status = 'failed'
         FOR UPDATE`,
        [sourceDriver.warehouse_assignment_id, orderId]
      )
      sourceWarehouse = rows[0] ?? null
    }

    const targetWarehouseId = warehouseId || sourceWarehouse?.warehouse_id || null
    let newWarehouse = null
    if (targetWarehouseId) {
      const supplierColumn = await getWarehouseSupplierColumn((sql, params) =>
        client.query(sql, params)
      )
      const { rows } = await client.query(
        `SELECT w.id, w.${supplierColumn} AS supplier_id
         FROM warehouse w WHERE w.id = $1 AND w.is_active = TRUE`,
        [targetWarehouseId]
      )
      if (!rows.length || rows[0].supplier_id !== supplierId) {
        throw new ValidationError('Retry warehouse is not active for this supplier')
      }
      newWarehouse = rows[0]
    }

    let newWarehouseAssignment = null
    if (sourceWarehouse || newWarehouse) {
      const { rows: lines } = await client.query(
        sourceWarehouse?.order_item_id
          ? `SELECT id, product_id, quantity, supplier_id FROM order_item WHERE id = $1`
          : `SELECT id, product_id, quantity, supplier_id FROM order_item WHERE order_id = $1 AND supplier_id = $2 ORDER BY id`,
        sourceWarehouse?.order_item_id ? [sourceWarehouse.order_item_id] : [orderId, supplierId]
      )
      if (!lines.length) throw new ValidationError('No order lines are available for retry')
      if (lines.some((line) => line.supplier_id !== supplierId)) {
        throw new ValidationError('Retry cannot cross supplier-owned order lines')
      }

      if (sourceWarehouse) {
        await client.query(
          `UPDATE order_warehouse_assignment
           SET status = 'superseded', superseded_at = now()
           WHERE id = $1`,
          [sourceWarehouse.id]
        )
      }
      const reasonJson = JSON.stringify({
        type: 'redelivery_retry',
        reason: String(reason).trim(),
        source_assignment_id: sourceWarehouse?.id ?? null,
      })
      const { rows } = await client.query(
        `INSERT INTO order_warehouse_assignment
         (order_id, order_item_id, warehouse_id, assigned_by, assignment_source, assignment_reason, status, retry_of_assignment_id)
         VALUES ($1, $2, $3, 'manual', 'manual', $4::jsonb, 'pending', $5)
         RETURNING *`,
        [
          orderId,
          sourceWarehouse?.order_item_id ?? null,
          targetWarehouseId,
          reasonJson,
          sourceWarehouse?.id ?? null,
        ]
      )
      newWarehouseAssignment = rows[0]
      await reserveWarehouseStockBatch(
        client,
        targetWarehouseId,
        lines.map((line) => ({ productId: line.product_id, quantity: line.quantity })),
        { supplierId }
      )
      if (sourceWarehouse) {
        await client.query(
          `UPDATE order_warehouse_assignment SET superseded_by_assignment_id = $1 WHERE id = $2`,
          [newWarehouseAssignment.id, sourceWarehouse.id]
        )
      }
    }

    await client.query(
      `UPDATE driver_assignments
       SET status = 'superseded', superseded_at = now(), superseded_by_assignment_id = NULL, updated_at = now()
       WHERE id = $1`,
      [sourceDriver.id]
    )
    const { rows: created } = await client.query(
      `INSERT INTO driver_assignments
       (order_id, warehouse_assignment_id, driver_id, supplier_id, assigned_by, status, notes, scheduled_delivery_date, retry_of_assignment_id)
       VALUES ($1, $2, $3, $4, $5, 'assigned', $6, COALESCE($7::date, CURRENT_DATE), $8)
       RETURNING *`,
      [
        orderId,
        newWarehouseAssignment?.id ?? null,
        driverId,
        supplierId,
        assignedByUserId,
        String(reason).trim(),
        sourceDriver.scheduled_delivery_date,
        sourceDriver.id,
      ]
    )
    await client.query(
      `UPDATE driver_assignments SET superseded_by_assignment_id = $1 WHERE id = $2`,
      [created[0].id, sourceDriver.id]
    )
    return {
      driverAssignment: created[0],
      warehouseAssignment: newWarehouseAssignment,
      sourceDriverAssignmentId: sourceDriver.id,
    }
  })

  await invalidateDispatchCacheForSupplier(supplierId)
  return result
}
