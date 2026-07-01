import { query } from '../lib/db.js'
import { getReferralProgramConfig } from '../lib/platform-settings.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { writeAuditLog } from '../lib/audit.js'
import { notifyTenantUsers } from './notification/in-app.js'

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export async function createConnectionRequest(supplierId, prospectId, { req = null } = {}) {
  const config = await getReferralProgramConfig()
  const { rows: prospects } = await query(
    `SELECT * FROM supplier_customer_prospect WHERE id = $1 AND supplier_id = $2`,
    [prospectId, supplierId]
  )
  if (!prospects.length) throw new NotFoundError('Prospect not found')
  const prospect = prospects[0]
  if (prospect.match_status !== 'existing_supplify' || !prospect.matched_restaurant_id) {
    throw new ValidationError('Prospect is not matched to an existing Supplify restaurant')
  }

  const restaurantId = prospect.matched_restaurant_id

  const { rows: followRows } = await query(
    `SELECT 1 FROM supplier_follow WHERE supplier_id = $1 AND restaurant_id = $2`,
    [supplierId, restaurantId]
  )
  if (followRows.length) {
    await query(
      `UPDATE supplier_customer_prospect SET lifecycle_status = 'connected', updated_at = now()
       WHERE id = $1`,
      [prospectId]
    )
    return { alreadyConnected: true, restaurantId }
  }

  const { rows: pending } = await query(
    `SELECT id FROM supplier_connection_request
     WHERE supplier_id = $1 AND restaurant_id = $2 AND status = 'pending'`,
    [supplierId, restaurantId]
  )
  if (pending.length) {
    return { connectionRequest: pending[0], restaurantId }
  }

  const expiresAt = addDays(new Date(), config.connectionRequestExpiryDays || 30)
  const { rows } = await query(
    `INSERT INTO supplier_connection_request (
       supplier_id, restaurant_id, prospect_id, status, expires_at
     )
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING *`,
    [supplierId, restaurantId, prospectId, expiresAt]
  )

  await query(
    `UPDATE supplier_customer_prospect SET lifecycle_status = 'connection_pending', updated_at = now()
     WHERE id = $1`,
    [prospectId]
  )

  const { rows: supplierRows } = await query(`SELECT name FROM supplier WHERE id = $1`, [
    supplierId,
  ])

  await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'supplier_connection_request',
    notificationCategory: 'supplier_connection_request',
    title: 'Supplier connection request',
    message: `${supplierRows[0]?.name || 'A supplier'} wants to connect with your restaurant on Supplify.`,
    metadata: {
      connectionRequestId: rows[0].id,
      supplierId,
      ctaUrl: '/app/suppliers',
    },
  }).catch(() => {})

  if (req) {
    await writeAuditLog(req, {
      action: 'growth.connection_request',
      entityType: 'supplier_connection_request',
      entityId: rows[0].id,
      metadata: { prospectId, restaurantId },
    })
  }

  return { connectionRequest: rows[0], restaurantId }
}

export async function listConnectionRequestsForRestaurant(restaurantId) {
  const { rows } = await query(
    `SELECT cr.*, s.name AS supplier_name, p.restaurant_name AS prospect_name
     FROM supplier_connection_request cr
     JOIN supplier s ON s.id = cr.supplier_id
     LEFT JOIN supplier_customer_prospect p ON p.id = cr.prospect_id
     WHERE cr.restaurant_id = $1 AND cr.status = 'pending' AND cr.expires_at > now()
     ORDER BY cr.created_at DESC`,
    [restaurantId]
  )
  return rows
}

export async function respondToConnectionRequest(
  requestId,
  restaurantId,
  accept,
  { req = null } = {}
) {
  const { rows } = await query(
    `SELECT * FROM supplier_connection_request
     WHERE id = $1 AND restaurant_id = $2 AND status = 'pending'`,
    [requestId, restaurantId]
  )
  if (!rows.length) throw new NotFoundError('Connection request not found')
  const cr = rows[0]
  const status = accept ? 'accepted' : 'declined'

  await query(
    `UPDATE supplier_connection_request SET status = $2, responded_at = now() WHERE id = $1`,
    [requestId, status]
  )

  if (accept) {
    await query(
      `INSERT INTO supplier_follow (supplier_id, restaurant_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [cr.supplier_id, restaurantId]
    )
    if (cr.prospect_id) {
      await query(
        `UPDATE supplier_customer_prospect SET lifecycle_status = 'connected', updated_at = now()
         WHERE id = $1`,
        [cr.prospect_id]
      )
    }
    await notifyTenantUsers({
      tenantId: cr.supplier_id,
      tenantType: 'SUPPLIER',
      notificationType: 'connection_request_accepted',
      notificationCategory: 'connection_request_accepted',
      title: 'Connection accepted',
      message: 'A restaurant accepted your connection request.',
      metadata: { restaurantId, connectionRequestId: requestId, ctaUrl: '/app/restaurants' },
    }).catch(() => {})
  }

  if (req) {
    await writeAuditLog(req, {
      action: accept ? 'growth.connection_accepted' : 'growth.connection_declined',
      entityType: 'supplier_connection_request',
      entityId: requestId,
    })
  }

  return { status }
}

export async function expireConnectionRequests() {
  const { rowCount } = await query(
    `UPDATE supplier_connection_request SET status = 'expired'
     WHERE status = 'pending' AND expires_at < now()`
  )
  return rowCount ?? 0
}
