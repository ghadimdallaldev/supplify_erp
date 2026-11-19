import { query } from './db.js'
import { ForbiddenError, ValidationError } from '../middlewares/errorHandler.js'
import { rolesIncludeOwner } from './tenant-roles.js'
import { isBillingRecoveryPath } from './billing/billing-recovery-paths.js'
import { isDriverOnlyPermissions } from './driver-rbac.js'
import { writeAuditLog } from './audit.js'

export async function getWarehouseAccess(userId, supplierId, db = query) {
  if (!userId || !supplierId) return { mode: 'assigned', warehouseIds: [] }
  const { rows } = await db(
    `SELECT a.mode,
       EXISTS (SELECT 1 FROM tenant_user_roles ur JOIN tenant_roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id AND r.tenant_type = ur.tenant_type
         WHERE ur.user_id = $1 AND ur.tenant_id = $2 AND ur.tenant_type = 'SUPPLIER'
           AND r.is_system = TRUE AND r.name = 'Owner') AS owner,
       COALESCE((SELECT array_agg(l.warehouse_id ORDER BY l.warehouse_id)
         FROM supplier_warehouse_access_location l JOIN warehouse w ON w.id = l.warehouse_id
         WHERE l.user_id = $1 AND l.supplier_id = $2
           AND COALESCE(w.tenant_id, w.supplier_id) = $2), ARRAY[]::uuid[]) AS warehouse_ids
     FROM (SELECT 1) seed LEFT JOIN supplier_warehouse_access a ON a.user_id = $1 AND a.supplier_id = $2`,
    [userId, supplierId]
  )
  const row = rows[0]
  return row?.owner || row?.mode === 'all'
    ? { mode: 'all', warehouseIds: [] }
    : { mode: 'assigned', warehouseIds: row?.warehouse_ids ?? [] }
}

export function warehouseAccessAllows(access, warehouseId) {
  return (
    access?.mode === 'all' ||
    (access?.mode === 'assigned' && access.warehouseIds.includes(warehouseId))
  )
}

export async function replaceWarehouseAccess(
  client,
  { actorId, userId, supplierId, access, requestId = null }
) {
  const db = (sql, params) => client.query(sql, params)
  // Serializes concurrent assignments and prevents mixed mode/location reads during writes.
  await db('SELECT id FROM supplier WHERE id = $1 FOR UPDATE', [supplierId])
  const actor = await getWarehouseAccess(actorId, supplierId, db)
  const ids = [...new Set(access.warehouseIds ?? [])].sort()
  if (!['all', 'assigned'].includes(access.mode) || (access.mode === 'all' && ids.length))
    throw new ValidationError('Invalid warehouse access')
  if (
    (access.mode === 'all' && actor.mode !== 'all') ||
    ids.some((id) => !warehouseAccessAllows(actor, id))
  ) {
    throw new ForbiddenError('Cannot grant warehouse access beyond your own scope')
  }
  if (ids.length) {
    const { rows } = await db(
      `SELECT id FROM warehouse WHERE id = ANY($1::uuid[])
      AND COALESCE(tenant_id, supplier_id) = $2 AND is_active = TRUE FOR SHARE`,
      [ids, supplierId]
    )
    if (rows.length !== ids.length)
      throw new ValidationError('Select active warehouses of this supplier')
  }
  await db(
    `INSERT INTO supplier_warehouse_access (user_id, supplier_id, mode, granted_by)
    VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, supplier_id) DO UPDATE SET
      mode = EXCLUDED.mode, granted_by = EXCLUDED.granted_by, updated_at = now()`,
    [userId, supplierId, access.mode, actorId]
  )
  await db(
    'DELETE FROM supplier_warehouse_access_location WHERE user_id = $1 AND supplier_id = $2',
    [userId, supplierId]
  )
  if (ids.length)
    await db(
      `INSERT INTO supplier_warehouse_access_location (user_id, supplier_id, warehouse_id)
    SELECT $1, $2, unnest($3::uuid[])`,
      [userId, supplierId, ids]
    )
  await writeAuditLog(
    { userData: { id: actorId }, requestId },
    {
      action_type: 'warehouse.access_updated',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: userId,
      payload_json: { resource_type: 'warehouse_access', mode: access.mode, warehouseIds: ids },
    },
    { client, required: true }
  )
  return { mode: access.mode, warehouseIds: ids }
}

/** Explicitly scoped surfaces only. Tenant-wide aggregates fail closed for restricted staff. */
export async function enforceWarehouseRequestAccess(req, tenant) {
  if (tenant?.tenantType !== 'SUPPLIER' || req.userData?.role === 'ADMIN') return
  if (rolesIncludeOwner(tenant.roles)) {
    tenant.warehouseAccess = { mode: 'all', warehouseIds: [] }
    return
  }
  const access = await getWarehouseAccess(req.userData.id, tenant.tenantId)
  tenant.warehouseAccess = access
  if (access.mode === 'all') return
  const pathname = (req.originalUrl || req.url || '').split('?')[0]
  if (isBillingRecoveryPath(req.method, req)) return
  if (pathname === '/auth/me' || pathname === '/api/auth/me' || /\/entitlements$/.test(pathname))
    return
  if (
    isDriverOnlyPermissions(tenant.permissions) &&
    (pathname === '/api/supplier/deliveries/board' ||
      pathname === '/api/fulfillment/routes/active' ||
      pathname === '/api/fulfillment/routes/build-from-assignments' ||
      // Route handlers apply driverIdScope / linked-driver checks themselves.
      /^\/api\/fulfillment\/routes\/[0-9a-f-]{36}(?:\/(?:optimize|next-stop|stops\/reorder|stops\/[0-9a-f-]{36}))?$/i.test(
        pathname
      ) ||
      // Own-profile endpoints: no warehouse-scoped data.
      pathname === '/api/push/devices' ||
      pathname === '/api/notifications/preferences' ||
      /^\/api\/orders\/[0-9a-f-]{36}\/(driver-detail|delivery-status|location|proof-of-delivery|pod|complete-delivery)(?:\/|$)/i.test(
        pathname
      ))
  )
    return // Existing driver-assignment checks remain authoritative for these routes.
  const warehouse = pathname.match(/^\/api\/warehouses\/([^/]+)(?:\/|$)/)
  if (pathname === '/api/warehouses' && req.method === 'GET') return
  if (pathname === '/api/orders' && req.method === 'GET') return // SQL list/count queries apply the same scope predicate.
  if (/^\/api\/notifications(?:\/unread-count)?$/.test(pathname) && req.method === 'GET') return
  if (
    /^\/api\/notifications\/(?:read-all|[0-9a-f-]{36}\/read)$/i.test(pathname) &&
    req.method === 'POST'
  )
    return
  if (
    /^\/api\/roles\/users\/[0-9a-f-]{36}\/warehouse-access$/i.test(pathname) &&
    req.method === 'PUT'
  )
    return
  if (warehouse && warehouseAccessAllows(access, warehouse[1]) && warehouse[1] !== 'routing') {
    if (
      req.body?.destination_warehouse_id &&
      !warehouseAccessAllows(access, req.body.destination_warehouse_id)
    )
      throw new ForbiddenError('Destination warehouse is outside your assigned scope')
    return
  }
  const order = pathname.match(/^\/api\/orders\/([0-9a-f-]{36})(?:\/|$)/i)
  if (order) {
    const { rows } = await query(
      `SELECT 1 FROM customer_order co WHERE co.id = $1
      AND EXISTS (SELECT 1 FROM order_warehouse_assignment a JOIN warehouse w ON w.id = a.warehouse_id
        WHERE a.order_id = co.id AND a.status <> 'superseded' AND COALESCE(w.tenant_id, w.supplier_id) = $2)
      AND NOT EXISTS (SELECT 1 FROM order_warehouse_assignment a WHERE a.order_id = co.id
        AND a.status <> 'superseded' AND NOT (a.warehouse_id = ANY($3::uuid[])))`,
      [order[1], tenant.tenantId, access.warehouseIds]
    )
    if (rows.length) return
  }
  throw new ForbiddenError(
    'This operation requires broader warehouse access. Ask your workspace owner to review your assignments.'
  )
}
