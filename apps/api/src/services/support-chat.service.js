import { query } from '../lib/db.js'
import { NotFoundError } from '../middlewares/errorHandler.js'

export async function getOrCreateSupportConversation({
  tenantId,
  tenantType,
  userId,
  context = {},
  initialMessage,
}) {
  const { rows: existing } = await query(
    `
    SELECT * FROM conversation
    WHERE is_admin_conversation = true
      AND support_tenant_id = $1
      AND support_tenant_type = $2
    LIMIT 1
    `,
    [tenantId, tenantType]
  )

  if (existing[0]) {
    return { conversation: existing[0], created: false }
  }

  const supplierId = tenantType === 'SUPPLIER' ? tenantId : null
  const restaurantId = tenantType === 'RESTAURANT' ? tenantId : null

  const { rows: created } = await query(
    `
    INSERT INTO conversation (
      supplier_id, restaurant_id, is_admin_conversation,
      support_tenant_id, support_tenant_type, support_context
    ) VALUES ($1, $2, true, $3, $4, $5)
    RETURNING *
    `,
    [supplierId, restaurantId, tenantId, tenantType, JSON.stringify(context)]
  )

  const conversation = created[0]

  await query(
    `
    INSERT INTO conversation_participant (
      conversation_id, participant_type, participant_id, user_id, role
    ) VALUES ($1, $2, $3, $4, 'PARTICIPANT')
    `,
    [conversation.id, tenantType, tenantId, userId]
  )

  if (initialMessage) {
    await query(
      `
      INSERT INTO message (conversation_id, sender_type, sender_id, content, message_type)
      VALUES ($1, $2, $3, $4, 'TEXT')
      `,
      [conversation.id, tenantType, userId, initialMessage]
    )
  }

  return { conversation, created: true }
}

export async function listSupportConversationsForTenant(tenantId, tenantType) {
  const { rows } = await query(
    `
    SELECT c.*,
      (SELECT content FROM message m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview
    FROM conversation c
    WHERE c.is_admin_conversation = true
      AND c.support_tenant_id = $1
      AND c.support_tenant_type = $2
    ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
    `,
    [tenantId, tenantType]
  )
  return rows
}

export async function listAdminSupportConversations({ limit = 100 } = {}) {
  const { rows } = await query(
    `
    SELECT
      c.*,
      COALESCE(r.name, s.name) AS tenant_name,
      COALESCE(r.contact_email, s.contact_email) AS tenant_email,
      MAX(m.created_at) AS last_message_at
    FROM conversation c
    LEFT JOIN restaurant r ON c.support_tenant_type = 'RESTAURANT' AND r.id = c.support_tenant_id
    LEFT JOIN supplier s ON c.support_tenant_type = 'SUPPLIER' AND s.id = c.support_tenant_id
    LEFT JOIN message m ON m.conversation_id = c.id
    WHERE c.is_admin_conversation = true
    GROUP BY c.id, r.name, s.name, r.contact_email, s.contact_email
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT $1
    `,
    [limit]
  )
  return rows
}

export async function assertSupportConversationAccess(
  conversationId,
  { tenantId, tenantType, isAdmin }
) {
  const { rows } = await query(`SELECT * FROM conversation WHERE id = $1`, [conversationId])
  const conv = rows[0]
  if (!conv || !conv.is_admin_conversation)
    throw new NotFoundError('Support conversation not found')
  if (isAdmin) return conv
  if (conv.support_tenant_id !== tenantId || conv.support_tenant_type !== tenantType) {
    throw new NotFoundError('Support conversation not found')
  }
  return conv
}
