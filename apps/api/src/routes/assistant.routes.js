import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  resolveTenantContext,
  resolveAdminContext,
  requireAnyPermission,
  rolesIncludeOwner,
} from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { hasPermission } from '../lib/permissions.js'
import {
  getAssistantCapabilities,
  buildAssistantContext,
  listConversations,
  createConversation,
  listMessages,
  sendAssistantMessage,
} from '../services/assistant-chat.service.js'

const router = express.Router()

const messageSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  message: z.string().min(1).max(4000),
})

/** Baseline: any workspace view permission (or Owner) can open the assistant. */
function assistantAccessGuard(req, res, next) {
  if (req.userData?.role === 'ADMIN' || req.adminContext) return next()
  if (rolesIncludeOwner(req.tenantContext?.roles)) return next()
  return requireAnyPermission(
    'ORDERS_VIEW',
    'INVENTORY_VIEW',
    'INVOICES_VIEW',
    'FULFILLMENT_VIEW',
    'CATALOG_VIEW',
    'SETTINGS_VIEW',
    'RESERVATIONS_VIEW',
    'CHAT_VIEW'
  )(req, res, next)
}

const assistantFeatureGate = requireFeature(
  'ai_assistant',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(requireAuth)
router.use(resolveTenantContext)
router.use((req, res, next) => {
  if (req.userData?.role === 'ADMIN') {
    return resolveAdminContext(req, res, next)
  }
  return next()
})
router.use((req, res, next) => {
  if (req.userData?.role !== 'ADMIN' && !req.adminContext) return next()
  if (hasPermission(req.adminContext?.permissions || [], 'ADMIN_ACCESS')) return next()
  return res.status(403).json({
    ok: false,
    data: null,
    error: {
      name: 'FORBIDDEN',
      message: 'Administrator access is required to use the assistant',
    },
    requestId: req.requestId,
  })
})
router.use((req, res, next) => {
  if (req.userData?.role !== 'DRIVER') return next()
  return res.status(403).json({
    ok: false,
    data: null,
    error: {
      name: 'FORBIDDEN',
      message: 'Drivers use guided delivery tools instead of the conversational assistant',
    },
    requestId: req.requestId,
  })
})

router.use((req, res, next) => {
  if (req.userData?.role === 'ADMIN' || req.adminContext) return next()
  return assistantFeatureGate(req, res, next)
})
router.use(assistantAccessGuard)

router.get('/capabilities', async (req, res, next) => {
  try {
    const data = await getAssistantCapabilities(req)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/conversations', async (req, res, next) => {
  try {
    const ctx = await buildAssistantContext(req)
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 50)
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0)
    const conversations = await listConversations(ctx, { limit, offset })
    res.json({ ok: true, data: { conversations }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/conversations', async (req, res, next) => {
  try {
    const ctx = await buildAssistantContext(req)
    const title = req.body?.title ? String(req.body.title).slice(0, 120) : null
    const conversation = await createConversation(ctx, { title })
    res.status(201).json({
      ok: true,
      data: { conversation },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/conversations/:conversationId/messages', async (req, res, next) => {
  try {
    const ctx = await buildAssistantContext(req)
    const messages = await listMessages(ctx, req.params.conversationId)
    res.json({ ok: true, data: { messages }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/messages', async (req, res, next) => {
  try {
    const parsed = messageSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid message payload' },
        requestId: req.requestId,
      })
    }
    const data = await sendAssistantMessage(req, parsed.data)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

export { router as assistantRoutes }
