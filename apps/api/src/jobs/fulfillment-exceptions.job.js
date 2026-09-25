import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { createFulfillmentException } from '../lib/fulfillment-exceptions.js'
import { isTenantUnlockedForBackgroundWrites } from '../lib/background-write-locks.js'

const BATCH_LIMIT = 200

async function createFulfillmentExceptionForUnlockedSupplier(payload) {
  const unlocked = await isTenantUnlockedForBackgroundWrites({
    tenantId: payload.supplierId,
    tenantType: 'SUPPLIER',
  })
  if (!unlocked) return null
  return createFulfillmentException(null, payload)
}
export async function runFulfillmentExceptionChecks() {
  const overdue = await checkOverdueDeliveries()
  const noPod = await checkMissingPod()
  const unassigned = await checkUnassignedOverdue()
  logger.info('Fulfillment exception checks complete', { overdue, noPod, unassigned })
  return { overdue, noPod, unassigned, scanned: overdue + noPod + unassigned }
}

async function checkOverdueDeliveries() {
  const { rows } = await query(
    `SELECT da.id, da.order_id, da.supplier_id, owa.warehouse_id
     FROM driver_assignments da
     LEFT JOIN order_warehouse_assignment owa ON owa.id = da.warehouse_assignment_id
     WHERE da.status = 'out_for_delivery'
       AND da.updated_at < now() - interval '4 hours'
       AND EXISTS (
         SELECT 1
         FROM subscription sub
         WHERE sub.tenant_id = da.supplier_id
           AND sub.tenant_type = 'SUPPLIER'
           AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
           AND sub.account_locked_at IS NULL
       )
     LIMIT $1`,
    [BATCH_LIMIT]
  )
  let created = 0
  for (const row of rows) {
    const inserted = await createFulfillmentExceptionForUnlockedSupplier({
      supplierId: row.supplier_id,
      orderId: row.order_id,
      driverAssignmentId: row.id,
      warehouseId: row.warehouse_id,
      type: 'overdue',
      description: 'Order has been out for delivery for more than 4 hours',
    })
    if (inserted) created++
  }
  return created
}

async function checkMissingPod() {
  const { rows } = await query(
    `SELECT da.id, da.order_id, da.supplier_id, owa.warehouse_id
     FROM driver_assignments da
     JOIN order_item oi ON oi.order_id = da.order_id
     LEFT JOIN order_warehouse_assignment owa ON owa.id = da.warehouse_assignment_id
     WHERE da.status = 'delivered'
       AND da.delivered_at < now() - interval '2 hours'
       AND NOT EXISTS (
         SELECT 1 FROM proof_of_delivery pod
         WHERE pod.order_id = da.order_id
           AND (
             pod.driver_assignment_id = da.id
             OR (
               pod.driver_assignment_id IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM driver_assignments sibling
                 WHERE sibling.order_id = da.order_id
                   AND sibling.supplier_id = da.supplier_id
                   AND sibling.id <> da.id
                   AND sibling.status NOT IN ('reassigned', 'superseded')
               )
             )
           )
       )
       AND EXISTS (
         SELECT 1
         FROM subscription sub
         WHERE sub.tenant_id = da.supplier_id
           AND sub.tenant_type = 'SUPPLIER'
           AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
           AND sub.account_locked_at IS NULL
       )
     GROUP BY da.id, da.order_id, da.supplier_id, owa.warehouse_id
     LIMIT $1`,
    [BATCH_LIMIT]
  )
  let created = 0
  for (const row of rows) {
    const inserted = await createFulfillmentExceptionForUnlockedSupplier({
      supplierId: row.supplier_id,
      orderId: row.order_id,
      driverAssignmentId: row.id,
      warehouseId: row.warehouse_id,
      type: 'no_pod',
      description: 'Delivered more than 2 hours ago with no proof of delivery',
    })
    if (inserted) created++
  }
  return created
}

async function checkUnassignedOverdue() {
  const { rows } = await query(
    `SELECT DISTINCT oi.supplier_id, o.id AS order_id, owa.warehouse_id
     FROM customer_order o
     JOIN order_item oi ON oi.order_id = o.id
     LEFT JOIN order_warehouse_assignment owa
       ON owa.order_id = o.id
      AND owa.status NOT IN ('delivered', 'failed', 'superseded')
     WHERE o.status IN ('ACKNOWLEDGED', 'PROCESSING')
       AND COALESCE(o.placed_at, o.created_at) < now() - interval '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM driver_assignments da
         WHERE da.order_id = o.id
           AND da.status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered', 'rescheduled')
           AND (
             (owa.id IS NULL AND da.warehouse_assignment_id IS NULL)
             OR da.warehouse_assignment_id = owa.id
           )
       )
       AND EXISTS (
         SELECT 1
         FROM subscription sub
         WHERE sub.tenant_id = oi.supplier_id
           AND sub.tenant_type = 'SUPPLIER'
           AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
           AND sub.account_locked_at IS NULL
       )
     LIMIT $1`,
    [BATCH_LIMIT]
  )
  let created = 0
  for (const row of rows) {
    const inserted = await createFulfillmentExceptionForUnlockedSupplier({
      supplierId: row.supplier_id,
      orderId: row.order_id,
      warehouseId: row.warehouse_id,
      type: 'unassigned_overdue',
      description: 'Order pending driver assignment for more than 24 hours',
    })
    if (inserted) created++
  }
  return created
}
