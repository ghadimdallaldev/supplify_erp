import express from 'express'
import {
  requireAuth,
  requireRole,
  getRequestTenant,
  resolveTenantContext,
  requirePermission,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import {
  checkAndIncrementUsage,
  checkUsageWithWarning,
  getTenantSubscription,
  getRecommendedPlanNames,
  buildLimitExceededPayload,
} from '../lib/subscription.js'
import { z } from 'zod'
import { notifyMessageReceived } from '../services/notification.service.js'

const router = express.Router()

// Validation schemas
const createConversationSchema = z.object({
  supplierId: z.string().uuid(),
})

const sendMessageSchema = z.object({
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

const quickReplySchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional(),
})

// Helper: Get or create conversation between supplier and restaurant
async function getOrCreateConversation(supplierId, restaurantId) {
  let { rows: conversations } = await query(
    `
    SELECT * FROM conversation
    WHERE supplier_id = $1 AND restaurant_id = $2
  `,
    [supplierId, restaurantId]
  )

  let conversation

  if (conversations.length === 0) {
    // Create new conversation
    const { rows: newConversations } = await query(
      `
      INSERT INTO conversation (supplier_id, restaurant_id)
      VALUES ($1, $2)
      RETURNING *
    `,
      [supplierId, restaurantId]
    )

    conversation = newConversations[0]

    // Create participant records
    await query(
      `
      INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
      VALUES ($1, 'SUPPLIER', $2), ($1, 'RESTAURANT', $3)
    `,
      [conversation.id, supplierId, restaurantId]
    )
  } else {
    conversation = conversations[0]
    // Repair rows created before participants existed or if inserts failed mid-flight
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

router.use(requireAuth, resolveTenantContext, requirePermission('CHAT_VIEW'))

// List conversations for current user
router.get('/conversations', async (req, res) => {
  try {
    let queryText
    let queryParams

    const tenant = await getRequestTenant(req)
    if (tenant?.tenantType === 'SUPPLIER') {
      queryText = `
        SELECT 
          c.*,
          COALESCE(cp.unread_count, 0) AS unread_count,
          cp.last_read_at,
          s.name as supplier_name,
          r.name as restaurant_name,
          r.contact_email as restaurant_email,
          COALESCE(cp.is_pinned, false) AS is_pinned,
          COALESCE(cp.is_archived, false) AS is_archived,
          COALESCE(r.name, s.name) as participant_name,
          (SELECT content FROM message WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_preview
        FROM conversation c
        LEFT JOIN conversation_participant cp ON cp.conversation_id = c.id AND cp.participant_type = 'SUPPLIER'
        LEFT JOIN supplier s ON s.id = c.supplier_id
        LEFT JOIN restaurant r ON r.id = c.restaurant_id
        WHERE c.supplier_id = $1
          AND (cp.id IS NULL OR cp.is_archived = false)
        ORDER BY COALESCE(cp.is_pinned, false) DESC, c.last_message_at DESC NULLS LAST
      `
      queryParams = [tenant.tenantId]
    } else if (tenant?.tenantType === 'RESTAURANT') {
      queryText = `
        SELECT 
          c.*,
          COALESCE(cp.unread_count, 0) AS unread_count,
          cp.last_read_at,
          s.name as supplier_name,
          s.contact_email as supplier_email,
          r.name as restaurant_name,
          COALESCE(cp.is_pinned, false) AS is_pinned,
          COALESCE(cp.is_archived, false) AS is_archived,
          COALESCE(s.name, r.name) as participant_name,
          (SELECT content FROM message WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_preview
        FROM conversation c
        LEFT JOIN conversation_participant cp ON cp.conversation_id = c.id AND cp.participant_type = 'RESTAURANT'
        LEFT JOIN supplier s ON s.id = c.supplier_id
        LEFT JOIN restaurant r ON r.id = c.restaurant_id
        WHERE c.restaurant_id = $1
          AND (cp.id IS NULL OR cp.is_archived = false)
        ORDER BY COALESCE(cp.is_pinned, false) DESC, c.last_message_at DESC NULLS LAST
      `
      queryParams = [tenant.tenantId]
    } else {
      return res.json({
        ok: true,
        data: { conversations: [] },
        error: null,
        requestId: req.requestId,
      })
    }

    const { rows } = await query(queryText, queryParams)

    res.json({
      ok: true,
      data: { conversations: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('List conversations error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to list conversations',
      },
      requestId: req.requestId,
    })
  }
})

router.delete('/conversations/:conversationId', requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params
    const role = req.userData.role

    if (!['SUPPLIER', 'RESTAURANT', 'ADMIN'].includes(role)) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Only suppliers, restaurants, or admins can manage conversations',
        },
        requestId: req.requestId,
      })
    }

    const { rows: conversations } = await query(
      `
        SELECT id, supplier_id, restaurant_id
        FROM conversation
        WHERE id = $1
      `,
      [conversationId]
    )

    if (!conversations.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Conversation not found' },
        requestId: req.requestId,
      })
    }

    const conversation = conversations[0]
    let participantTypeFilter = null

    if (role === 'SUPPLIER') {
      const { rows: suppliers } = await query(
        `
          SELECT id
          FROM supplier
          WHERE contact_email = $1
        `,
        [req.userData.email]
      )

      if (!suppliers.length || suppliers[0].id !== conversation.supplier_id) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Conversation does not belong to this supplier',
          },
          requestId: req.requestId,
        })
      }
      participantTypeFilter = 'SUPPLIER'
    } else if (role === 'RESTAURANT') {
      const { rows: restaurants } = await query(
        `
          SELECT id
          FROM restaurant
          WHERE contact_email = $1
        `,
        [req.userData.email]
      )

      if (!restaurants.length || restaurants[0].id !== conversation.restaurant_id) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Conversation does not belong to this restaurant',
          },
          requestId: req.requestId,
        })
      }
      participantTypeFilter = 'RESTAURANT'
    }

    const updateParams = participantTypeFilter
      ? [conversationId, participantTypeFilter]
      : [conversationId]
    const updateQuery = `
      UPDATE conversation_participant
      SET is_archived = true,
          is_pinned = false,
          updated_at = now()
      WHERE conversation_id = $1
        ${participantTypeFilter ? 'AND participant_type = $2' : ''}
      RETURNING id
    `

    const { rowCount } = await query(updateQuery, updateParams)

    if (rowCount === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Conversation participant not found' },
        requestId: req.requestId,
      })
    }

    // Admins can optionally hard-delete the conversation (including messages) by passing ?hard=true
    if (role === 'ADMIN' && req.query.hard === 'true') {
      await query(`DELETE FROM conversation WHERE id = $1`, [conversationId])
    }

    res.json({ ok: true, data: { archived: true }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('Delete conversation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to delete conversation',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Get or create conversation
router.post(
  '/conversations',
  requireAuth,
  requireRole(['SUPPLIER', 'RESTAURANT']),
  async (req, res) => {
    try {
      const { supplierId } = createConversationSchema.parse(req.body)

      let resolvedSupplierId = supplierId
      let resolvedRestaurantId

      // Verify that the user has permission to create this conversation
      if (req.userData.role === 'SUPPLIER') {
        const { rows: suppliers } = await query(
          'SELECT id FROM supplier WHERE contact_email = $1 AND id = $2',
          [req.userData.email, supplierId]
        )

        if (suppliers.length === 0) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FORBIDDEN',
              message: 'You can only create conversations as yourself',
            },
            requestId: req.requestId,
          })
        }

        // For suppliers, they need to specify which restaurant to talk to
        // But this endpoint is typically called by restaurants to talk to suppliers
        // So we don't need to handle supplier creating conversations here
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_SUPPORTED',
            message: 'Suppliers cannot create conversations this way',
          },
          requestId: req.requestId,
        })
      } else if (req.userData.role === 'RESTAURANT') {
        const { rows: restaurants } = await query(
          'SELECT id FROM restaurant WHERE contact_email = $1',
          [req.userData.email]
        )

        if (restaurants.length === 0) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FORBIDDEN',
              message: 'Restaurant not found',
            },
            requestId: req.requestId,
          })
        }

        // For restaurants, validate that they're trying to create a conversation with a valid supplier
        const { rows: suppliers } = await query('SELECT id FROM supplier WHERE id = $1', [
          supplierId,
        ])

        if (suppliers.length === 0) {
          return res.status(404).json({
            ok: false,
            data: null,
            error: {
              name: 'NOT_FOUND',
              message: 'Supplier not found',
            },
            requestId: req.requestId,
          })
        }

        // Use the resolved restaurant ID
        resolvedRestaurantId = restaurants[0].id
        resolvedSupplierId = supplierId

        const conversation = await getOrCreateConversation(resolvedSupplierId, resolvedRestaurantId)

        res.status(201).json({
          ok: true,
          data: { conversation },
          error: null,
          requestId: req.requestId,
        })
        return
      }

      // If we get here, the role is not supported
      res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_SUPPORTED',
          message: 'Role not supported',
        },
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid conversation data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Create conversation error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to create conversation',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Get conversation messages
router.get('/conversations/:conversationId/messages', requireAuth, async (req, res, next) => {
  try {
    const { conversationId } = req.params
    const { limit = '50', offset = '0' } = req.query

    // Verify conversation exists and current user is a participant (tenant scoping)
    const { rows: conversations } = await query(
      `
      SELECT id, supplier_id, restaurant_id FROM conversation WHERE id = $1
    `,
      [conversationId]
    )

    if (conversations.length === 0) {
      throw new NotFoundError('Conversation not found')
    }

    const conversation = conversations[0]
    const role = req.userData?.role

    if (role === 'RESTAURANT') {
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1',
        [req.userData.email]
      )
      if (restaurants.length === 0 || restaurants[0].id !== conversation.restaurant_id) {
        throw new NotFoundError('Conversation not found')
      }
    } else if (role === 'SUPPLIER') {
      const { rows: suppliers } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
        req.userData.email,
      ])
      if (suppliers.length === 0 || suppliers[0].id !== conversation.supplier_id) {
        throw new NotFoundError('Conversation not found')
      }
    } else if (role !== 'ADMIN') {
      throw new NotFoundError('Conversation not found')
    }

    // Get messages with reply information
    const { rows: messages } = await query(
      `
      SELECT 
        m.*,
        s.name as supplier_name,
        r.name as restaurant_name,
        rm.content as reply_to_content,
        rm.sender_type as reply_to_sender_type,
        rs.name as reply_to_supplier_name,
        rr.name as reply_to_restaurant_name
      FROM message m
      LEFT JOIN supplier s ON s.id = m.sender_id AND m.sender_type = 'SUPPLIER'
      LEFT JOIN restaurant r ON r.id = m.sender_id AND m.sender_type = 'RESTAURANT'
      LEFT JOIN message rm ON rm.id = m.reply_to
      LEFT JOIN supplier rs ON rs.id = rm.sender_id AND rm.sender_type = 'SUPPLIER'
      LEFT JOIN restaurant rr ON rr.id = rm.sender_id AND rm.sender_type = 'RESTAURANT'
      WHERE m.conversation_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [conversationId, limit, offset]
    )

    // Get attachments for messages
    const messageIds = messages.map((m) => m.id)
    let attachments = []

    if (messageIds.length > 0) {
      const { rows: attRows } = await query(
        `
        SELECT * FROM message_attachment
        WHERE message_id = ANY($1)
      `,
        [messageIds]
      )
      attachments = attRows
    }

    // Group attachments by message_id
    const attachmentsByMessage = {}
    attachments.forEach((att) => {
      if (!attachmentsByMessage[att.message_id]) {
        attachmentsByMessage[att.message_id] = []
      }
      attachmentsByMessage[att.message_id].push(att)
    })

    // Add attachments to messages
    const messagesWithAttachments = messages.map((msg) => ({
      ...msg,
      attachments: attachmentsByMessage[msg.id] || [],
    }))

    res.json({
      ok: true,
      data: { messages: messagesWithAttachments.reverse() }, // Return in chronological order
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return next(error)
    }
    logger.error('Get messages error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get messages',
      },
      requestId: req.requestId,
    })
  }
})

// Send a message
router.post(
  '/conversations/:conversationId/messages',
  requireAuth,
  requireRole(['SUPPLIER', 'RESTAURANT']),
  requirePermission('CHAT_SEND'),
  async (req, res) => {
    try {
      // Check daily chat limit before sending message
      let tenantId, tenantType

      if (req.userData.role === 'RESTAURANT') {
        const { rows: restaurants } = await query(
          'SELECT id FROM restaurant WHERE contact_email = $1',
          [req.userData.email]
        )
        if (restaurants.length > 0) {
          tenantId = restaurants[0].id
          tenantType = 'RESTAURANT'
        }
      } else if (req.userData.role === 'SUPPLIER') {
        const { rows: suppliers } = await query(
          'SELECT id FROM supplier WHERE contact_email = $1',
          [req.userData.email]
        )
        if (suppliers.length > 0) {
          tenantId = suppliers[0].id
          tenantType = 'SUPPLIER'
        }
      }

      if (tenantId && tenantType) {
        const usageCheck = await checkUsageWithWarning(tenantId, tenantType, 'chats_per_day')
        if (usageCheck.isWarning) {
          req.chatWarning = true
          req.chatWarningPercent = usageCheck.usagePercent
        }
        // Atomic check and reserve one chat slot (avoids race conditions)
        const usageResult = await checkAndIncrementUsage(tenantId, tenantType, 'chats_per_day', 1)
        if (!usageResult.allowed) {
          const [subscription, recommendedPlans] = await Promise.all([
            getTenantSubscription(tenantId, tenantType),
            getRecommendedPlanNames(tenantType),
          ])
          const limitCheck = { current: usageResult.current, limit: usageResult.limit }
          const err = buildLimitExceededPayload(
            limitCheck,
            'chats_per_day',
            subscription?.plan_name || subscription?.plan_display_name,
            recommendedPlans
          )
          err.name = 'CHAT_LIMIT_EXCEEDED'
          err.message = `Daily chat limit reached (${usageResult.current}/${usageResult.limit}). Upgrade your plan to send more messages.`
          return res.status(403).json({
            ok: false,
            data: null,
            error: err,
            requestId: req.requestId,
          })
        }
      }

      const { conversationId } = req.params
      const messageData = sendMessageSchema.parse(req.body)

      // Verify conversation and access
      const { rows: conversations } = await query(
        `
      SELECT * FROM conversation WHERE id = $1
    `,
        [conversationId]
      )

      if (conversations.length === 0) {
        throw new NotFoundError('Conversation not found')
      }

      const conversation = conversations[0]

      // Get sender ID
      let senderId
      if (req.userData.role === 'SUPPLIER') {
        const { rows: suppliers } = await query(
          'SELECT id FROM supplier WHERE contact_email = $1 AND id = $2',
          [req.userData.email, conversation.supplier_id]
        )

        if (suppliers.length === 0) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FORBIDDEN',
              message: 'Access denied',
            },
            requestId: req.requestId,
          })
        }

        senderId = suppliers[0].id
      } else if (req.userData.role === 'RESTAURANT') {
        const { rows: restaurants } = await query(
          'SELECT id FROM restaurant WHERE contact_email = $1 AND id = $2',
          [req.userData.email, conversation.restaurant_id]
        )

        if (restaurants.length === 0) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FORBIDDEN',
              message: 'Access denied',
            },
            requestId: req.requestId,
          })
        }

        senderId = restaurants[0].id
      }

      // Verify reply_to message exists and is in the same conversation (before transaction)
      if (messageData.replyTo) {
        const { rows: replyMessages } = await query(
          `
        SELECT id, conversation_id FROM message WHERE id = $1
      `,
          [messageData.replyTo]
        )

        if (replyMessages.length === 0) {
          return res.status(400).json({
            ok: false,
            data: null,
            error: {
              name: 'VALIDATION_ERROR',
              message: 'Reply to message not found',
            },
            requestId: req.requestId,
          })
        }

        if (replyMessages[0].conversation_id !== conversationId) {
          return res.status(400).json({
            ok: false,
            data: null,
            error: {
              name: 'VALIDATION_ERROR',
              message: 'Reply to message must be in the same conversation',
            },
            requestId: req.requestId,
          })
        }
      }

      // Start transaction
      await query('BEGIN')

      try {
        // Create message
        const { rows: messages } = await query(
          `
        INSERT INTO message (
          conversation_id, sender_type, sender_id, content, message_type, order_id, reply_to
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
          [
            conversationId,
            req.userData.role,
            senderId,
            messageData.content,
            messageData.messageType,
            messageData.orderId || null,
            messageData.replyTo || null,
          ]
        )

        const message = messages[0]

        // Usage already reserved atomically in checkAndIncrementUsage above (no second increment)

        // Add attachments if any
        if (messageData.attachments && messageData.attachments.length > 0) {
          for (const attachment of messageData.attachments) {
            await query(
              `
            INSERT INTO message_attachment (message_id, file_url, file_type, file_name, file_size)
            VALUES ($1, $2, $3, $4, $5)
          `,
              [
                message.id,
                attachment.fileUrl,
                attachment.fileType,
                attachment.fileName,
                attachment.fileSize || null,
              ]
            )
          }
        }

        await query('COMMIT')

        notifyMessageReceived({
          conversationId,
          senderType: req.userData.role,
          messagePreview: messageData.content?.slice(0, 100) || '',
        }).catch((err) => logger.warn('Message received notification failed', { err: err.message }))

        // Fetch message with attachments
        const { rows: fullMessages } = await query(
          `
        SELECT 
          m.*,
          rm.content as reply_to_content,
          rm.sender_type as reply_to_sender_type,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ma.id,
                'fileUrl', ma.file_url,
                'fileType', ma.file_type,
                'fileName', ma.file_name,
                'fileSize', ma.file_size
              )
            ) FILTER (WHERE ma.id IS NOT NULL),
            '[]'::json
          ) as attachments
        FROM message m
        LEFT JOIN message rm ON rm.id = m.reply_to
        LEFT JOIN message_attachment ma ON ma.message_id = m.id
        WHERE m.id = $1
        GROUP BY m.id, rm.content, rm.sender_type
      `,
          [message.id]
        )

        logger.info('Message sent', {
          messageId: message.id,
          conversationId,
          actor: req.userData.id,
        })

        // Notify all clients in the conversation so they refetch messages (ensures persistence is visible)
        try {
          const { getIO } = await import('../lib/socket.js')
          const io = getIO()
          if (io) {
            io.to(`conversation_${conversationId}`).emit('new_message', {
              conversationId,
              messageId: message.id,
              senderId: senderId,
              senderType: req.userData.role,
              content: messageData.content,
              timestamp: new Date().toISOString(),
            })
          }
        } catch (socketError) {
          logger.warn('Failed to emit new_message after send:', socketError)
        }

        // Include warning in response if applicable
        const responseData = { message: fullMessages[0] }
        if (req.chatWarning) {
          responseData.warning = {
            message: `You've used ${req.chatWarningPercent.toFixed(0)}% of your daily chat limit. Consider upgrading your plan.`,
            usagePercent: req.chatWarningPercent,
          }
        }

        res.status(201).json({
          ok: true,
          data: responseData,
          error: null,
          requestId: req.requestId,
        })
      } catch (error) {
        await query('ROLLBACK')
        throw error
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid message data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Send message error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to send message',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Mark conversation as read
router.patch('/conversations/:conversationId/read', requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params

    // Reset unread count
    const participantType = req.userData.role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT'

    // Mark all unread messages in this conversation as read for the current participant
    const { rows: updatedMessages } = await query(
      `
      UPDATE message
      SET is_read = true,
          read_at = now(),
          updated_at = now()
      WHERE conversation_id = $1
        AND sender_type != $2
        AND is_read = false
      RETURNING id
    `,
      [conversationId, participantType]
    )

    await query(
      `
      UPDATE conversation_participant
      SET unread_count = 0,
          last_read_at = now(),
          updated_at = now()
      WHERE conversation_id = $1 AND participant_type = $2
    `,
      [conversationId, participantType]
    )

    // Emit socket event for real-time read receipt updates
    try {
      const { getIO } = await import('../lib/socket.js')
      const io = getIO()
      if (io && updatedMessages.length > 0) {
        io.to(`conversation_${conversationId}`).emit('messages_read_update', {
          conversationId,
          messageIds: updatedMessages.map((m) => m.id),
          timestamp: new Date().toISOString(),
        })
      }
    } catch (socketError) {
      logger.warn('Failed to emit read receipt updates:', socketError)
    }

    res.json({
      ok: true,
      data: { message: 'Conversation marked as read' },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Mark as read error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to mark as read',
      },
      requestId: req.requestId,
    })
  }
})

// Mark message as read
router.patch('/messages/:messageId/read', requireAuth, async (req, res) => {
  try {
    const { messageId } = req.params

    // Verify message exists and get conversation
    const { rows: messages } = await query(
      `
      SELECT * FROM message WHERE id = $1
    `,
      [messageId]
    )

    if (messages.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Message not found',
        },
        requestId: req.requestId,
      })
    }

    const message = messages[0]

    // Only mark as read if the current user is the receiver (not the sender)
    const participantType = req.userData.role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT'
    if (message.sender_type === participantType) {
      // User is the sender, can't mark their own message as read
      return res.json({
        ok: true,
        data: { message: 'Message already read' },
        error: null,
        requestId: req.requestId,
      })
    }

    // Mark message as read
    await query(
      `
      UPDATE message
      SET is_read = true,
          read_at = now(),
          updated_at = now()
      WHERE id = $1 AND is_read = false
    `,
      [messageId]
    )

    // Emit socket event for real-time read receipt update
    try {
      const { getIO } = await import('../lib/socket.js')
      const io = getIO()
      if (io) {
        io.to(`conversation_${message.conversation_id}`).emit('message_read_update', {
          conversationId: message.conversation_id,
          messageId: messageId,
          timestamp: new Date().toISOString(),
        })
      }
    } catch (socketError) {
      logger.warn('Failed to emit read receipt update:', socketError)
    }

    res.json({
      ok: true,
      data: { message: 'Message marked as read' },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Mark message as read error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to mark message as read',
      },
      requestId: req.requestId,
    })
  }
})

// Quick reply templates (for suppliers)
router.get('/quick-replies', requireAuth, requireRole(['SUPPLIER']), async (req, res) => {
  try {
    const { rows: suppliers } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
      req.userData.email,
    ])

    if (suppliers.length === 0) {
      return res.json({
        ok: true,
        data: { templates: [] },
        error: null,
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
      SELECT * FROM quick_reply_template
      WHERE supplier_id = $1 AND is_active = true
      ORDER BY usage_count DESC, title ASC
    `,
      [suppliers[0].id]
    )

    res.json({
      ok: true,
      data: { templates: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get quick replies error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get quick replies',
      },
      requestId: req.requestId,
    })
  }
})

// Create quick reply template
// ========================================
// ADMIN CHAT PARTICIPATION
// ========================================

/**
 * POST /api/chat/conversations/:conversationId/admin-join
 * Admin joins a conversation to help resolve issues
 */
router.post(
  '/conversations/:conversationId/admin-join',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res) => {
    try {
      const conversationId = req.params.conversationId

      // Verify conversation exists
      const { rows: conversations } = await query(
        `
      SELECT * FROM conversation WHERE id = $1
    `,
        [conversationId]
      )

      if (conversations.length === 0) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Conversation not found' },
          requestId: req.requestId,
        })
      }

      // Check if admin already in conversation
      const { rows: existing } = await query(
        `
      SELECT * FROM conversation_participant 
      WHERE conversation_id = $1 AND user_id = $2 AND role = 'ADMIN'
    `,
        [conversationId, req.userData.id]
      )

      if (existing.length > 0) {
        return res.json({
          ok: true,
          data: { message: 'Admin already in conversation' },
          error: null,
          requestId: req.requestId,
        })
      }

      // Add admin as participant
      await query(
        `
      INSERT INTO conversation_participant (conversation_id, user_id, role, joined_at)
      VALUES ($1, $2, 'ADMIN', now())
    `,
        [conversationId, req.userData.id]
      )

      // Send system message
      await query(
        `
      INSERT INTO message (conversation_id, sender_id, content, message_type, is_admin_message)
      VALUES ($1, $2, 'Admin joined the conversation', 'SYSTEM', true)
    `,
        [conversationId, req.userData.id]
      )

      // Log audit
      await query(
        `
      INSERT INTO admin_audit_log (action_type, target_entity_type, target_entity_id, action_description, admin_user_id)
      VALUES ('ADMIN_JOINED_CHAT', 'CONVERSATION', $1, 'Admin joined chat conversation', $2)
    `,
        [conversationId, req.userData.id]
      )

      res.json({
        ok: true,
        data: { message: 'Admin joined conversation successfully' },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Admin join conversation error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to join conversation' },
        requestId: req.requestId,
      })
    }
  }
)

/**
 * POST /api/chat/admin/start-conversation
 * Admin starts a conversation with a tenant
 */
router.post('/admin/start-conversation', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { tenant_id, tenant_type, initial_message } = req.body

    // Get tenant details
    const tenantTable = tenant_type === 'RESTAURANT' ? 'restaurant' : 'supplier'
    const { rows: tenants } = await query(
      `
      SELECT id, name, contact_email FROM ${tenantTable} WHERE id = $1
    `,
      [tenant_id]
    )

    if (tenants.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Tenant not found' },
        requestId: req.requestId,
      })
    }

    // Create conversation
    const conversationData =
      tenant_type === 'RESTAURANT'
        ? { restaurant_id: tenant_id, supplier_id: null }
        : { supplier_id: tenant_id, restaurant_id: null }

    const { rows: newConversations } = await query(
      `
      INSERT INTO conversation (supplier_id, restaurant_id, is_admin_conversation)
      VALUES ($1, $2, true)
      RETURNING *
    `,
      [conversationData.supplier_id, conversationData.restaurant_id]
    )

    const conversation = newConversations[0]

    // Add admin as participant
    await query(
      `
      INSERT INTO conversation_participant (conversation_id, user_id, role, joined_at)
      VALUES ($1, $2, 'ADMIN', now())
    `,
      [conversation.id, req.userData.id]
    )

    // Send initial message
    const { rows: messages } = await query(
      `
      INSERT INTO message (conversation_id, sender_id, content, message_type, is_admin_message)
      VALUES ($1, $2, $3, 'TEXT', true)
      RETURNING *
    `,
      [
        conversation.id,
        req.userData.id,
        initial_message || 'Hello, this is Supplify Admin. How can we help you?',
      ]
    )

    // Log audit
    await query(
      `
      INSERT INTO admin_audit_log (action_type, target_entity_type, target_entity_id, action_description, admin_user_id)
      VALUES ('ADMIN_STARTED_CHAT', $1, $2, 'Admin started chat conversation with tenant', $3)
    `,
      [tenant_type, tenant_id, req.userData.id]
    )

    res.status(201).json({
      ok: true,
      data: { conversation, initial_message: messages[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Admin start conversation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to start conversation' },
      requestId: req.requestId,
    })
  }
})

/**
 * GET /api/chat/admin/conversations
 * Admin view of all conversations
 */
router.get('/admin/conversations', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { status, tenant_type } = req.query

    let whereClause = '1=1'
    const params = []

    if (status) {
      whereClause += ` AND c.status = $${params.length + 1}`
      params.push(status)
    }

    const { rows: conversations } = await query(
      `
      SELECT 
        c.*,
        CASE WHEN c.restaurant_id IS NOT NULL THEN r.name ELSE s.name END as tenant_name,
        CASE WHEN c.restaurant_id IS NOT NULL THEN r.contact_email ELSE s.contact_email END as tenant_email,
        COUNT(DISTINCT CASE WHEN cp.role = 'ADMIN' THEN cp.user_id END) as admin_count,
        MAX(m.created_at) as last_message_at
      FROM conversation c
      LEFT JOIN restaurant r ON c.restaurant_id = r.id
      LEFT JOIN supplier s ON c.supplier_id = s.id
      LEFT JOIN conversation_participant cp ON cp.conversation_id = c.id
      LEFT JOIN message m ON m.conversation_id = c.id
      WHERE ${whereClause}
      GROUP BY c.id, r.name, s.name, r.contact_email, s.contact_email
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT 100
    `,
      params
    )

    res.json({
      ok: true,
      data: { conversations },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Admin get conversations error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get conversations' },
      requestId: req.requestId,
    })
  }
})

router.post('/quick-replies', requireAuth, requireRole(['SUPPLIER']), async (req, res) => {
  try {
    const templateData = quickReplySchema.parse(req.body)

    const { rows: suppliers } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
      req.userData.email,
    ])

    if (suppliers.length === 0) {
      throw new ValidationError('Supplier not found')
    }

    const { rows } = await query(
      `
      INSERT INTO quick_reply_template (supplier_id, title, content, category)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [suppliers[0].id, templateData.title, templateData.content, templateData.category || null]
    )

    res.status(201).json({
      ok: true,
      data: { template: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid template data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error('Create quick reply error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create quick reply',
      },
      requestId: req.requestId,
    })
  }
})

export { router as chatRoutes }
