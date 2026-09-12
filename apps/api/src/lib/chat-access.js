import { query } from './db.js'
import { getPermissionsForUser } from './permissions.js'
import { isFeatureEnabled } from './subscription.js'

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
    'SELECT id, supplier_id, restaurant_id FROM conversation WHERE id = $1',
    [conversationId]
  )
  if (convRows.length === 0) return false
  const conversation = convRows[0]

  if (role === 'ADMIN') return true
  if (!appUserId || !tenantId || !['SUPPLIER', 'RESTAURANT'].includes(role)) return false

  const isParticipant =
    role === 'SUPPLIER'
      ? conversation.supplier_id === tenantId
      : conversation.restaurant_id === tenantId
  if (!isParticipant) return false

  const [permissions, chatEnabled] = await Promise.all([
    getPermissionsForUser(appUserId, tenantId, role),
    isFeatureEnabled(tenantId, role, 'chat'),
  ])
  if (!chatEnabled) return false

  return permissions.includes(requiredPermission) || permissions.includes('CHAT_MANAGE')
}
