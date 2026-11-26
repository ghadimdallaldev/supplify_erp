import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { adminHasSupportChatAccess, canSendMessage } from '../lib/chat-access.js'
import { lockRelationshipShared, resolveSupplierOrgId } from '../lib/relationship.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Persist a chat message received via socket (e.g. from legacy client that only emits send_message).
 * Uses the socket-authenticated active tenant to resolve the sender, then inserts the message.
 * @param {string} conversationId - UUID
 * @param {string} appUserId - app_user.id (UUID)
 * @param {string} content - message content
 * Marketplace messages follow the chat relationship rules (lib/chat-access.js canSendMessage):
 * the check runs under the shared relationship lock in the insert's transaction, and
 * `orderId` is persisted so order-tagged messages stay sendable while the order is open.
 * @returns {Promise<{ id: string, created_at: string } | { error: 'CHAT_READ_ONLY', openOrderIds: string[] } | null>}
 */
export async function persistMessageFromSocket(
  conversationId,
  appUserId,
  content,
  { tenantId = null, role = null, orderId = null } = {}
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
      'SELECT id, supplier_id, restaurant_id, is_admin_conversation FROM conversation WHERE id = $1',
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

    const taggedOrderId = typeof orderId === 'string' && UUID_RE.test(orderId) ? orderId : null
    if (senderType !== 'ADMIN') {
      const pre = await canSendMessage({ conversation, orderId: taggedOrderId, actorRole: role })
      if (!pre.allowed) return { error: 'CHAT_READ_ONLY', openOrderIds: pre.openOrderIds }
    }

    if (senderType !== 'ADMIN') {
      const { checkAndIncrementUsage } = await import('../lib/subscription.js')
      const usage = await checkAndIncrementUsage(tenantId, role, 'chats_per_day', 1)
      if (!usage.allowed) return null
    }

    const result = await withTransaction(async (client) => {
      if (senderType !== 'ADMIN' && !conversation.is_admin_conversation) {
        const orgId = await resolveSupplierOrgId(conversation.supplier_id, client)
        await lockRelationshipShared(client, conversation.restaurant_id, orgId)
        const access = await canSendMessage(
          { conversation, orderId: taggedOrderId, actorRole: role },
          client
        )
        if (!access.allowed) return { error: 'CHAT_READ_ONLY', openOrderIds: access.openOrderIds }
      }
      const { rows: msgRows } = await client.query(
        `INSERT INTO message (conversation_id, sender_type, sender_id, content, message_type, is_admin_message, order_id)
         VALUES ($1, $2, $3, $4, 'TEXT', $5, $6)
         RETURNING id, created_at`,
        [
          conversationId,
          senderType,
          senderId,
          content.trim(),
          senderType === 'ADMIN',
          taggedOrderId,
        ]
      )
      return { msg: msgRows[0] }
    })
    if (result.error) return result
    const msg = result.msg
    logger.info('Persisted message from socket', { conversationId, messageId: msg.id })
    return { id: msg.id, created_at: msg.created_at }
  } catch (err) {
    logger.error('persistMessageFromSocket error', { conversationId, appUserId, err })
    return null
  }
}
