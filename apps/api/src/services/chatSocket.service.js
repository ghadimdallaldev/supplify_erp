import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { adminHasSupportChatAccess } from '../lib/chat-access.js'

/**
 * Persist a chat message received via socket (e.g. from legacy client that only emits send_message).
 * Uses the socket-authenticated active tenant to resolve the sender, then inserts the message.
 * @param {string} conversationId - UUID
 * @param {string} appUserId - app_user.id (UUID)
 * @param {string} content - message content
 * @returns {Promise<{ id: string, created_at: string } | null>} created message or null if cannot resolve
 */
export async function persistMessageFromSocket(
  conversationId,
  appUserId,
  content,
  { tenantId = null, role = null } = {}
) {
  if (
    !conversationId ||
    !appUserId ||
    !content ||
    typeof content !== 'string' ||
    content.trim().length === 0
  ) {
    return null
  }
  try {
    const { rows: convRows } = await query(
      'SELECT id, supplier_id, restaurant_id FROM conversation WHERE id = $1',
      [conversationId]
    )
    if (convRows.length === 0) return null
    const conversation = convRows[0]

    let senderType = null
    let senderId = null
    if (role === 'SUPPLIER' && tenantId === conversation.supplier_id) {
      senderType = 'SUPPLIER'
      senderId = tenantId
    } else if (role === 'RESTAURANT' && tenantId === conversation.restaurant_id) {
      senderType = 'RESTAURANT'
      senderId = tenantId
    } else if (role === 'ADMIN') {
      const { rows: adminConv } = await query(
        `SELECT 1 FROM conversation WHERE id = $1 AND COALESCE(is_admin_conversation, false) = true`,
        [conversationId]
      )
      if (adminConv.length > 0 && (await adminHasSupportChatAccess(appUserId))) {
        senderType = 'ADMIN'
        senderId = appUserId
      }
    }
    if (!senderType || !senderId) return null

    if (senderType !== 'ADMIN') {
      const { checkAndIncrementUsage } = await import('../lib/subscription.js')
      const usage = await checkAndIncrementUsage(tenantId, role, 'chats_per_day', 1)
      if (!usage.allowed) return null
    }

    const { rows: msgRows } = await query(
      `INSERT INTO message (conversation_id, sender_type, sender_id, content, message_type, is_admin_message)
       VALUES ($1, $2, $3, $4, 'TEXT', $5)
       RETURNING id, created_at`,
      [conversationId, senderType, senderId, content.trim(), senderType === 'ADMIN']
    )
    const msg = msgRows[0]
    logger.info('Persisted message from socket', { conversationId, messageId: msg.id })
    return { id: msg.id, created_at: msg.created_at }
  } catch (err) {
    logger.error('persistMessageFromSocket error', { conversationId, appUserId, err })
    return null
  }
}
