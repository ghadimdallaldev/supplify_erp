import { query } from './db.js'
import { checkLimit } from './subscription.js'
import { ValidationError } from '../middlewares/errorHandler.js'

/**
 * Get or create a 1:1 conversation between supplier and restaurant.
 */
export async function getOrCreateConversation(
  supplierId,
  restaurantId,
  { enforceOpenLimit = true } = {}
) {
  let { rows: conversations } = await query(
    `SELECT * FROM conversation WHERE supplier_id = $1 AND restaurant_id = $2`,
    [supplierId, restaurantId]
  )

  if (conversations.length === 0) {
    if (enforceOpenLimit) {
      for (const [tenantId, tenantType] of [
        [restaurantId, 'RESTAURANT'],
        [supplierId, 'SUPPLIER'],
      ]) {
        const limitCheck = await checkLimit(tenantId, tenantType, 'open_conversations')
        if (!limitCheck.isUnlimited && limitCheck.isOverLimit) {
          const err = new ValidationError(
            `Open conversation limit reached (${limitCheck.current}/${limitCheck.limit})`
          )
          err.name = 'LIMIT_EXCEEDED'
          throw err
        }
      }
    }

    const { rows: newConversations } = await query(
      `INSERT INTO conversation (supplier_id, restaurant_id) VALUES ($1, $2) RETURNING *`,
      [supplierId, restaurantId]
    )
    const conversation = newConversations[0]
    await query(
      `INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
       VALUES ($1, 'SUPPLIER', $2), ($1, 'RESTAURANT', $3)`,
      [conversation.id, supplierId, restaurantId]
    )
    return conversation
  }

  const conversation = conversations[0]
  const { rows: existingParts } = await query(
    `SELECT participant_type FROM conversation_participant WHERE conversation_id = $1`,
    [conversation.id]
  )
  const types = new Set(existingParts.map((row) => row.participant_type))
  if (!types.has('SUPPLIER')) {
    await query(
      `INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
       VALUES ($1, 'SUPPLIER', $2) ON CONFLICT (conversation_id, participant_type) DO NOTHING`,
      [conversation.id, supplierId]
    )
  }
  if (!types.has('RESTAURANT')) {
    await query(
      `INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
       VALUES ($1, 'RESTAURANT', $2) ON CONFLICT (conversation_id, participant_type) DO NOTHING`,
      [conversation.id, restaurantId]
    )
  }
  return conversation
}

/**
 * Post an order-referenced chat message from supplier or restaurant.
 */
export async function postConversationMessage({
  conversationId,
  senderType,
  senderId,
  content,
  messageType = 'ORDER_REFERENCE',
  orderId = null,
  client = null,
}) {
  const q = client ? client.query.bind(client) : query
  const { rows } = await q(
    `
    INSERT INTO message (conversation_id, sender_type, sender_id, content, message_type, order_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [conversationId, senderType, senderId, content, messageType, orderId]
  )
  return rows[0]
}
