import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'

/**
 * Persist a chat message received via socket (e.g. from legacy client that only emits send_message).
 * Resolves app_user id to sender_type + entity sender_id, verifies conversation access, then INSERTs.
 * @param {string} conversationId - UUID
 * @param {string} appUserId - app_user.id (UUID)
 * @param {string} content - message content
 * @returns {Promise<{ id: string, created_at: string } | null>} created message or null if cannot resolve
 */
export async function persistMessageFromSocket(conversationId, appUserId, content) {
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

    const { rows: userRows } = await query('SELECT id, email, role FROM app_user WHERE id = $1', [
      appUserId,
    ])
    if (userRows.length === 0) return null
    const appUser = userRows[0]

    let senderType = null
    let senderId = null
    if (appUser.role === 'SUPPLIER') {
      const { rows: sup } = await query(
        'SELECT id FROM supplier WHERE id = $1 AND contact_email = $2',
        [conversation.supplier_id, appUser.email]
      )
      if (sup.length > 0) {
        senderType = 'SUPPLIER'
        senderId = sup[0].id
      }
    } else if (appUser.role === 'RESTAURANT') {
      const { rows: rest } = await query(
        'SELECT id FROM restaurant WHERE id = $1 AND contact_email = $2',
        [conversation.restaurant_id, appUser.email]
      )
      if (rest.length > 0) {
        senderType = 'RESTAURANT'
        senderId = rest[0].id
      }
    } else if (appUser.role === 'ADMIN') {
      const { rows: adminConv } = await query(
        `SELECT 1 FROM conversation WHERE id = $1 AND COALESCE(is_admin_conversation, false) = true`,
        [conversationId]
      )
      if (adminConv.length > 0) {
        senderType = 'ADMIN'
        senderId = appUser.id
      }
    }
    if (!senderType || !senderId) return null

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
