import express from 'express'
import {
  requireAuth,
  requireRole,
  getRequestTenant,
  resolveTenantContext,
  requirePermission,
  getRestaurantIdForRequest,
  getSupplierIdForRequest,
} from '../../lib/rbac.js'
import { chatSendGuard } from '../../lib/route-permissions.js'
import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { ValidationError, NotFoundError } from '../../middlewares/errorHandler.js'
import {
  checkAndIncrementUsage,
  checkUsageWithWarning,
  getTenantSubscription,
  getRecommendedPlanNames,
  buildLimitExceededPayload,
  requireFeature,
  checkLimit,
} from '../../lib/subscription.js'
import { z } from 'zod'
import { notifyMessageReceived } from '../../services/notification.service.js'
import { assertChatAttachmentUrl } from '../../lib/sanitize-upload.js'
import {
  getOrCreateSupportConversation,
  listSupportConversationsForTenant,
  listAdminSupportConversations,
} from '../../services/support-chat.service.js'

const router = express.Router()

const supportStartSchema = z.object({
  initialMessage: z.string().min(1).max(4000).optional(),
  category: z.string().max(100).optional(),
  pageUrl: z.string().max(500).optional(),
})
router.post(
  '/support/start',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'RESTAURANT']),
  requireFeature(
    'chat',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  requirePermission('CHAT_SEND'),
  async (req, res, next) => {
    try {
      const tenant = await getRequestTenant(req)
      if (!tenant?.tenantId) throw new ValidationError('Tenant not found')
      const body = supportStartSchema.parse(req.body || {})
      const result = await getOrCreateSupportConversation({
        tenantId: tenant.tenantId,
        tenantType: tenant.tenantType,
        userId: req.userData.id,
        context: {
          category: body.category,
          pageUrl: body.pageUrl,
          role: req.userData.role,
        },
        initialMessage: body.initialMessage || 'Hello, I need help with Supplify support.',
      })
      res.status(result.created ? 201 : 200).json({
        ok: true,
        data: result,
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/support/conversations',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'RESTAURANT']),
  requireFeature(
    'chat',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  requirePermission('CHAT_VIEW'),
  async (req, res, next) => {
    try {
      const tenant = await getRequestTenant(req)
      if (!tenant?.tenantId) throw new ValidationError('Tenant not found')
      const conversations = await listSupportConversationsForTenant(
        tenant.tenantId,
        tenant.tenantType
      )
      res.json({ ok: true, data: { conversations }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get('/admin/conversations', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const conversations = await listAdminSupportConversations()
    res.json({ ok: true, data: { conversations }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/conversations/:conversationId/admin-join',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res, next) => {
    try {
      const conversationId = req.params.conversationId
      const { rows: conversations } = await query(`SELECT * FROM conversation WHERE id = $1`, [
        conversationId,
      ])
      if (!conversations[0]) throw new NotFoundError('Conversation not found')

      const { rows: existing } = await query(
        `SELECT 1 FROM conversation_participant WHERE conversation_id = $1 AND user_id = $2 AND role = 'ADMIN'`,
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

      await query(
        `
        INSERT INTO conversation_participant (
          conversation_id, participant_type, participant_id, user_id, role, joined_at
        ) VALUES ($1, 'ADMIN', $2, $2, 'ADMIN', now())
        `,
        [conversationId, req.userData.id]
      )

      await query(
        `
        INSERT INTO message (conversation_id, sender_type, sender_id, content, message_type, is_admin_message)
        VALUES ($1, 'ADMIN', $2, 'Supplify support joined the conversation', 'SYSTEM', true)
        `,
        [conversationId, req.userData.id]
      )

      res.json({
        ok: true,
        data: { message: 'Admin joined conversation successfully' },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
