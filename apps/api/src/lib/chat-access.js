import { query } from './db.js'
import { getPermissionsForUser, hasPermission } from './permissions.js'
import { isFeatureEnabled } from './subscription.js'
import { userCanAccessTenant } from './tenant-switch.js'
import { getWarehouseAccess } from './warehouse-access.js'
import { OPEN_ORDER_STATUSES, RelationshipError, getRelationship } from './relationship.js'

/**
 * Chat relationship rules (spec §11.3.2 and §11.3.3). One conversation per restaurant and
 * supplier branch; read-only is decided per message:
 * - a general message needs a follow (restaurant → supplier organisation) and no block;
 * - a message tagged with an order needs that order to be open between the two parties and
 *   no block;
 * - a block closes the conversation: nobody sends, the supplier can no longer open it, the
 *   restaurant keeps read-only history.
 * Support/admin threads are exempt.
 */
export class ChatReadOnlyError extends RelationshipError {
  constructor(openOrderIds = []) {
    super('CHAT_READ_ONLY', 'This conversation is read-only', 403, { openOrderIds })
  }
}

function dbOf(db) {
  if (!db) return { query }
  return db
}

/** Open orders between the conversation's restaurant and supplier branch, newest first. */
export async function openOrderIdsForConversation(conversation, db) {
  const { rows } = await dbOf(db).query(
    `SELECT o.id FROM customer_order o
     WHERE o.restaurant_id = $1
       AND o.status::text = ANY($3::text[])
       AND EXISTS (SELECT 1 FROM order_item oi WHERE oi.order_id = o.id AND oi.supplier_id = $2)
     ORDER BY o.created_at DESC
     LIMIT 50`,
    [conversation.restaurant_id, conversation.supplier_id, [...OPEN_ORDER_STATUSES]]
  )
  return rows.map((r) => r.id)
}

/**
 * @param {{ conversation: { id: string, supplier_id: string, restaurant_id: string, is_admin_conversation?: boolean }, orderId?: string|null, actorRole?: string }} input
 * @returns {Promise<{ allowed: boolean, openOrderIds: string[] }>}
 */
// eslint-disable-next-line no-unused-vars -- actorRole is part of the contract (both sides share the rule)
export async function canSendMessage({ conversation, orderId = null, actorRole = null }, db) {
  if (!conversation) return { allowed: false, openOrderIds: [] }
  if (conversation.is_admin_conversation) {
    return { allowed: true, openOrderIds: [] }
  }
  const rel = await getRelationship(conversation.restaurant_id, conversation.supplier_id, db)
  if (rel.blocked) return { allowed: false, openOrderIds: [] }
  const openOrderIds = await openOrderIdsForConversation(conversation, db)
  if (orderId) return { allowed: openOrderIds.includes(orderId), openOrderIds }
  return { allowed: rel.following, openOrderIds }
}

/** False for the supplier side once the restaurant blocked the organisation. */
export async function canOpenConversation(conversation, actorRole, db) {
  if (!conversation || conversation.is_admin_conversation) return Boolean(conversation)
  if (actorRole !== 'SUPPLIER') return true
  const rel = await getRelationship(conversation.restaurant_id, conversation.supplier_id, db)
  return !rel.blocked
}

export async function adminHasSupportChatAccess(appUserId) {
  if (!appUserId) return false
  const adminPermissions = await getPermissionsForUser(appUserId, null, 'ADMIN')
  return hasPermission(adminPermissions, 'ADMIN_SUPPORT')
}

/**
 * Verify a socket user may access a chat conversation in their active tenant.
 * Socket auth resolves and validates tenantId before this check; permissions and
 * feature access are repeated here because sockets do not pass through Express RBAC.
 */
export async function userCanAccessConversation(
  appUserId,
  conversationId,
  { tenantId = null, role = null, requiredPermission = 'CHAT_VIEW' } = {}
) {
  const { rows: convRows } = await query(
    'SELECT id, supplier_id, restaurant_id, is_admin_conversation FROM conversation WHERE id = $1',
    [conversationId]
  )
  if (convRows.length === 0) return false
  const conversation = convRows[0]

  if (role === 'ADMIN') {
    const { rows: active } = await query(
      "SELECT id FROM app_user WHERE id = $1 AND role = 'ADMIN' AND is_active = TRUE",
      [appUserId]
    )
    if (!active.length) return false
    if (conversation.is_admin_conversation) {
      return adminHasSupportChatAccess(appUserId)
    }
    if (
      tenantId &&
      (conversation.supplier_id === tenantId || conversation.restaurant_id === tenantId)
    ) {
      return requiredPermission === 'CHAT_VIEW'
    }
    return false
  }
  if (!appUserId || !tenantId || !['SUPPLIER', 'RESTAURANT'].includes(role)) return false

  const isParticipant =
    role === 'SUPPLIER'
      ? conversation.supplier_id === tenantId
      : conversation.restaurant_id === tenantId
  if (!isParticipant) return false
  if (!(await userCanAccessTenant(appUserId, '', tenantId, role))) return false
  if (role === 'SUPPLIER' && (await getWarehouseAccess(appUserId, tenantId)).mode !== 'all')
    return false
  if (!(await canOpenConversation(conversation, role))) return false

  const [permissions, chatEnabled] = await Promise.all([
    getPermissionsForUser(appUserId, tenantId, role),
    isFeatureEnabled(tenantId, role, 'chat'),
  ])
  if (!chatEnabled) return false

  return permissions.includes(requiredPermission) || permissions.includes('CHAT_MANAGE')
}
