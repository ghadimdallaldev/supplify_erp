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
import { logger } from '../../lib/logger.js'
import { ValidationError } from '../../middlewares/errorHandler.js'
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
} from '../../services/support-chat.service.js'

const router = express.Router()

const supportStartSchema = z.object({
  initialMessage: z.string().min(1).max(4000).optional(),
  category: z.string().max(100).optional(),
  pageUrl: z.string().max(500).optional(),
})
const supportAccess = [
  requireFeature(
    'chat',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  requireFeature(
    'support_sla',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
]

router.post(
  '/support/start',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'RESTAURANT']),
  ...supportAccess,
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
  ...supportAccess,
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

export default router
