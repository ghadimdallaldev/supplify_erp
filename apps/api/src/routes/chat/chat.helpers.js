import { getRestaurantIdForRequest, getSupplierIdForRequest } from '../../lib/rbac.js'
import { query } from '../../lib/db.js'
import { ValidationError } from '../../middlewares/errorHandler.js'
import { requireFeature, checkLimit } from '../../lib/subscription.js'
import { z } from 'zod'

export const createConversationRestaurantSchema = z.object({
  supplierId: z.string().uuid(),
})

export const createConversationSupplierSchema = z.object({
  restaurantId: z.string().uuid(),
})

export const sendMessageSchema = z.object({
  content: z.string().min(1),
  messageType: z.enum(['TEXT', 'SYSTEM', 'ORDER_REFERENCE']).default('TEXT'),
  orderId: z.string().uuid().optional(),
  replyTo: z.string().uuid().optional(),
  attachments: z
    .array(
      z.object({
        fileUrl: z.string().url(),
        fileType: z.string(),
        fileName: z.string(),
        fileSize: z.number().optional(),
      })
    )
    .optional(),
})

export const quickReplySchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional(),
})

/** Get or create conversation between supplier and restaurant */
export async function getOrCreateConversation(
  supplierId,
  restaurantId,
  { enforceOpenLimit = true } = {}
) {
  let { rows: conversations } = await query(
    `
    SELECT * FROM conversation
    WHERE supplier_id = $1 AND restaurant_id = $2
  `,
    [supplierId, restaurantId]
  )

  let conversation

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
          err.details = {
            limitKey: 'open_conversations',
            limitValue: limitCheck.limit,
            currentUsage: limitCheck.current,
            tenantType,
          }
          throw err
        }
      }
    }

    const { rows: newConversations } = await query(
      `
      INSERT INTO conversation (supplier_id, restaurant_id)
      VALUES ($1, $2)
      RETURNING *
    `,
      [supplierId, restaurantId]
    )

    conversation = newConversations[0]

    await query(
      `
      INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
      VALUES ($1, 'SUPPLIER', $2), ($1, 'RESTAURANT', $3)
    `,
      [conversation.id, supplierId, restaurantId]
    )
  } else {
    conversation = conversations[0]
    const { rows: existingParts } = await query(
      `SELECT participant_type FROM conversation_participant WHERE conversation_id = $1`,
      [conversation.id]
    )
    const types = new Set(existingParts.map((row) => row.participant_type))
    if (!types.has('SUPPLIER')) {
      await query(
        `
        INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
        VALUES ($1, 'SUPPLIER', $2)
        ON CONFLICT (conversation_id, participant_type) DO NOTHING
      `,
        [conversation.id, supplierId]
      )
    }
    if (!types.has('RESTAURANT')) {
      await query(
        `
        INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
        VALUES ($1, 'RESTAURANT', $2)
        ON CONFLICT (conversation_id, participant_type) DO NOTHING
      `,
        [conversation.id, restaurantId]
      )
    }
  }

  return conversation
}

/** Tenant-scoped access (supports invited staff, not only contact_email on the tenant row). */
export async function userCanAccessConversation(req, conversation) {
  const role = req.userData?.role
  if (role === 'ADMIN') return true

  if (role === 'RESTAURANT') {
    const restaurantId = await getRestaurantIdForRequest(req)
    return Boolean(restaurantId && restaurantId === conversation.restaurant_id)
  }

  if (role === 'SUPPLIER') {
    const supplierId = await getSupplierIdForRequest(req)
    return Boolean(supplierId && supplierId === conversation.supplier_id)
  }

  return false
}

const chatFeatureGate = requireFeature(
  'chat',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

export function chatFeatureGateUnlessAdmin(req, res, next) {
  if (req.userData?.role === 'ADMIN') return next()
  return chatFeatureGate(req, res, next)
}
