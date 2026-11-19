import { query } from '../../lib/db.js'
import { hasPermission } from '../../lib/permissions.js'

export function notificationAccessScope(userId, userType, context) {
  const refs = []
  for (const [permission, types] of Object.entries({
    ORDERS_VIEW: ['ORDER', 'DELIVERY'],
    INVOICES_VIEW: ['INVOICE', 'PAYMENT'],
    CHAT_VIEW: ['CHAT', 'CONVERSATION'],
    INVENTORY_VIEW: ['PRODUCT', 'INVENTORY', 'WAREHOUSE'],
    RESERVATIONS_VIEW: ['RESERVATION'],
    SUBSCRIPTIONS_VIEW: ['BILLING', 'SUBSCRIPTION'],
    SETTINGS_VIEW: ['SYSTEM', 'BRANCH', 'SUPPLIER', 'RESTAURANT'],
  }))
    if (hasPermission(context?.permissions, permission)) refs.push(...types)
  const driverOnly =
    userType === 'SUPPLIER' &&
    !hasPermission(context?.permissions, 'ORDERS_VIEW') &&
    hasPermission(context?.permissions, 'DRIVER_DELIVERIES_VIEW')
  if (driverOnly) refs.push('ORDER')
  const ids =
    context?.warehouseAccess?.mode === 'assigned' ? context.warehouseAccess.warehouseIds : null
  return {
    params: [userId, userType, context?.tenantId ?? null, refs, ids],
    clause: `user_id = $1 AND user_type = $2 AND tenant_id = $3
      AND (reference_type = ANY($4::text[]) OR (reference_type IS NULL AND 'SYSTEM' = ANY($4::text[])))
      ${
        driverOnly
          ? `AND reference_type = 'ORDER' AND EXISTS (SELECT 1 FROM driver_assignments da JOIN drivers d ON d.id = da.driver_id
        WHERE da.order_id = notification_log.reference_id AND da.supplier_id = $3 AND d.user_id = $1 AND da.status NOT IN ('reassigned', 'failed'))`
          : ''
      }
      AND (${driverOnly ? 'TRUE' : '$5::uuid[] IS NULL'} OR (reference_type = 'ORDER'
        AND EXISTS (SELECT 1 FROM order_warehouse_assignment a WHERE a.order_id = notification_log.reference_id
          AND a.status <> 'superseded' AND a.warehouse_id = ANY($5::uuid[]))
        AND NOT EXISTS (SELECT 1 FROM order_warehouse_assignment a WHERE a.order_id = notification_log.reference_id
          AND a.status <> 'superseded' AND NOT (a.warehouse_id = ANY($5::uuid[])))))`,
  }
}

/** Read authorization is evaluated on every call, never served from a prior grant's cache. */
export async function getScopedUserNotifications(
  userId,
  userType,
  context,
  { limit = 50, offset = 0, unreadOnly = false } = {}
) {
  const scope = notificationAccessScope(userId, userType, context)
  const boundedLimit = Math.max(0, Math.min(100, Number.isFinite(limit) ? limit : 50))
  const boundedOffset = Math.max(0, Number.isFinite(offset) ? offset : 0)
  const [list, counts] = await Promise.all([
    boundedLimit
      ? query(
          `SELECT id, title, message, reference_id, reference_type, metadata, is_read, read_at, created_at,
      notification_type, notification_category FROM notification_log WHERE ${scope.clause}
      ${unreadOnly ? 'AND is_read = FALSE' : ''} ORDER BY created_at DESC LIMIT $6 OFFSET $7`,
          [...scope.params, boundedLimit, boundedOffset]
        )
      : { rows: [] },
    query(
      `SELECT COUNT(*)::int AS unread_count FROM notification_log WHERE ${scope.clause} AND is_read = FALSE`,
      scope.params
    ),
  ])
  return { notifications: list.rows, unreadCount: Number(counts.rows[0]?.unread_count ?? 0) }
}
