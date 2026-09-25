import { query } from './db.js'
import { getPermissionsForUser, hasPermission } from './permissions.js'
import { isFeatureEnabled } from './subscription.js'

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
    if (conversation.is_admin_conversation) {
      return adminHasSupportChatAccess(appUserId)
    }
    if (
      tenantId &&
      (conversation.supplier_id === tenantId || conversation.restaurant_id === tenantId)
    ) {
      return true
    }
    return false
  }
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
