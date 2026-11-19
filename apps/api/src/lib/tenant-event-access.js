import { query } from './db.js'
import { userCanAccessTenant } from './tenant-switch.js'
import { getWarehouseAccess, warehouseAccessAllows } from './warehouse-access.js'
import { getPermissionsForUser, hasPermission } from './permissions.js'

/** Recheck recipients at delivery time; queued work and old socket rooms are not grants. */
export async function canReceiveTenantEvent({
  userId,
  tenantId,
  tenantType,
  orderId = null,
  warehouseId = null,
  driverId = null,
  gps = false,
  referenceType = null,
}) {
  if (!userId || !tenantId || !['SUPPLIER', 'RESTAURANT'].includes(tenantType)) return false
  if (!(await userCanAccessTenant(userId, '', tenantId, tenantType))) return false
  // A valid grant to this tenant is not proof that an event's resource belongs to it.
  if (orderId) {
    const { rows } = await query(
      `SELECT 1 FROM customer_order co WHERE co.id = $1 AND
      (($3 = 'RESTAURANT' AND co.restaurant_id = $2) OR ($3 = 'SUPPLIER' AND EXISTS
        (SELECT 1 FROM order_item oi WHERE oi.order_id = co.id AND oi.supplier_id = $2)))`,
      [orderId, tenantId, tenantType]
    )
    if (!rows.length) return false
  }
  if (warehouseId) {
    if (tenantType !== 'SUPPLIER') return false
    const { rows } = await query(
      `SELECT 1 FROM warehouse WHERE id = $1 AND COALESCE(tenant_id, supplier_id) = $2`,
      [warehouseId, tenantId]
    )
    if (!rows.length) return false
  }
  const permissions = await getPermissionsForUser(userId, tenantId, tenantType)
  const required = {
    ORDER: 'ORDERS_VIEW',
    INVOICE: 'INVOICES_VIEW',
    CONVERSATION: 'CHAT_VIEW',
    CHAT: 'CHAT_VIEW',
    PRODUCT: 'INVENTORY_VIEW',
    INVENTORY: 'INVENTORY_VIEW',
    RESERVATION: 'RESERVATIONS_VIEW',
    SUBSCRIPTION: 'SUBSCRIPTIONS_VIEW',
    BILLING: 'SUBSCRIPTIONS_VIEW',
  }[referenceType]
  if (required && !hasPermission(permissions, required)) {
    if (
      referenceType !== 'ORDER' ||
      !orderId ||
      tenantType !== 'SUPPLIER' ||
      !hasPermission(permissions, 'DRIVER_DELIVERIES_VIEW')
    )
      return false
    const { rows } = await query(
      `SELECT a.id FROM driver_assignments a JOIN drivers d ON d.id = a.driver_id
      WHERE a.order_id = $1 AND a.supplier_id = $2 AND d.user_id = $3
        AND a.status NOT IN ('reassigned', 'failed') LIMIT 1`,
      [orderId, tenantId, userId]
    )
    return rows.length > 0
  }
  if (gps && tenantType === 'SUPPLIER' && !hasPermission(permissions, 'FULFILLMENT_VIEW')) {
    if (!driverId || !hasPermission(permissions, 'DRIVER_DELIVERIES_VIEW')) return false
    const { rows } = await query(
      'SELECT id FROM drivers WHERE id = $1 AND user_id = $2 AND supplier_id = $3',
      [driverId, userId, tenantId]
    )
    return rows.length > 0
  }
  if (tenantType !== 'SUPPLIER') return permissions.length > 0
  const access = await getWarehouseAccess(userId, tenantId)
  if (access.mode === 'all') return permissions.length > 0
  if (warehouseId && !warehouseAccessAllows(access, warehouseId)) return false
  if (warehouseId && !orderId) return true
  if (!orderId || !access.warehouseIds.length) return false
  const { rows } = await query(
    `SELECT 1 WHERE
    EXISTS (SELECT 1 FROM order_warehouse_assignment a JOIN warehouse w ON w.id = a.warehouse_id
      WHERE a.order_id = $1 AND a.status <> 'superseded' AND COALESCE(w.tenant_id, w.supplier_id) = $2)
    AND NOT EXISTS (SELECT 1 FROM order_warehouse_assignment a WHERE a.order_id = $1 AND a.status <> 'superseded'
      AND NOT (a.warehouse_id = ANY($3::uuid[])))`,
    [orderId, tenantId, access.warehouseIds]
  )
  return rows.length > 0
}
