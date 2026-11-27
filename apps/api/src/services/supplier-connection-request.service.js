import { query } from '../lib/db.js'
import { getReferralProgramConfig } from '../lib/platform-settings.js'
import { NotFoundError } from '../middlewares/errorHandler.js'
import { blockedExistsSql, followExistsSql } from '../lib/relationship.js'
import { writeAuditLog } from '../lib/audit.js'
import { notifyTenantUsers } from './notification/in-app.js'
import { followSupplier } from './relationship-writes.service.js'

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * In-app follow invite for a prospect that matched an existing restaurant. Called only from
 * the asynchronous invite job; the supplier never learns which branch ran. A restaurant that
 * blocked the supplier organisation, or already follows it, gets nothing.
 * @returns {Promise<'blocked' | 'already_following' | 'pending' | 'sent'>}
 */
export async function dispatchMatchedFollowInvite({ supplierId, prospectId, restaurantId }) {
  const config = await getReferralProgramConfig()
  const { rows: rel } = await query(
    `SELECT ${blockedExistsSql('$2', 's')} AS blocked, ${followExistsSql('$2', 's')} AS following
     FROM supplier s WHERE s.id = $1`,
    [supplierId, restaurantId]
  )
  if (!rel.length || rel[0].blocked) return 'blocked'
  if (rel[0].following) return 'already_following'

  const { rows: pending } = await query(
    `SELECT id FROM supplier_connection_request
     WHERE supplier_id = $1 AND restaurant_id = $2 AND status = 'pending' AND expires_at > now()`,
    [supplierId, restaurantId]
  )
  if (pending.length) return 'pending'

  const expiresAt = addDays(new Date(), config.connectionRequestExpiryDays || 30)
  const { rows } = await query(
    `INSERT INTO supplier_connection_request (
       supplier_id, restaurant_id, prospect_id, status, expires_at
     )
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING id`,
    [supplierId, restaurantId, prospectId, expiresAt]
  )
  const { rows: supplierRows } = await query(`SELECT name FROM supplier WHERE id = $1`, [
    supplierId,
  ])
  const supplierName = supplierRows[0]?.name || 'A supplier'
  await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'SUPPLIER_FOLLOW_INVITE',
    notificationCategory: 'supplier_connection_request',
    title: 'Follow invite',
    message: `${supplierName} invited you to follow them`,
    referenceId: rows[0].id,
    referenceType: 'SUPPLIER_FOLLOW_INVITE',
    metadata: {
      connectionRequestId: rows[0].id,
      supplierId,
      ctaUrl: '/app/suppliers',
    },
  }).catch(() => {})
  return 'sent'
}

export async function listConnectionRequestsForRestaurant(restaurantId) {
  const { rows } = await query(
    `SELECT cr.*, s.name AS supplier_name, p.restaurant_name AS prospect_name
     FROM supplier_connection_request cr
     JOIN supplier s ON s.id = cr.supplier_id
     LEFT JOIN supplier_customer_prospect p ON p.id = cr.prospect_id
     WHERE cr.restaurant_id = $1 AND cr.status = 'pending' AND cr.expires_at > now()
       AND NOT ${blockedExistsSql('cr.restaurant_id', 's')}
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

  // Follow first (blocklist + plan cap enforced, race-safe), then record the response.
  if (accept) {
    await followSupplier({ restaurantId, supplierId: cr.supplier_id, source: 'invite' })
  }

  await query(
    `UPDATE supplier_connection_request SET status = $2, responded_at = now() WHERE id = $1`,
    [requestId, status]
  )

  // No notification goes back to the supplier on accept or decline (spec §11.4): the
  // prospect simply shows "following" once the follow exists.
  if (accept && cr.prospect_id) {
    await query(
      `UPDATE supplier_customer_prospect SET lifecycle_status = 'connected', updated_at = now()
       WHERE id = $1`,
      [cr.prospect_id]
    )
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
