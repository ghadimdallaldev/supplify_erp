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

router.post(
  '/admin/start-conversation',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res, next) => {
    try {
      const { tenant_id, tenant_type, initial_message } = req.body
      if (!tenant_id || !tenant_type)
        throw new ValidationError('tenant_id and tenant_type required')
      const result = await getOrCreateSupportConversation({
        tenantId: tenant_id,
        tenantType: tenant_type,
        userId: req.userData.id,
        context: { startedBy: 'admin' },
        initialMessage: initial_message || 'Hello, this is Supplify Support. How can we help you?',
      })
      res.status(201).json({
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

export default router
