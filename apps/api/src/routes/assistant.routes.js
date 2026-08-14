import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  resolveTenantContext,
  resolveAdminContext,
} from '../lib/rbac.js'
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

router.use(requireAuth)
router.use(resolveTenantContext)
router.use((req, res, next) => {
  if (req.userData?.role === 'ADMIN') {
    return resolveAdminContext(req, res, next)
  }
  return next()
})

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
