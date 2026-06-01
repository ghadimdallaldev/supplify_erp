import express from 'express'
import { z } from 'zod'
import { requireAuth, resolveTenantContext } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
} from '../services/push.service.js'

const router = express.Router()

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

router.get('/vapid-public-key', (req, res) => {
  const publicKey = getVapidPublicKey()
  if (!publicKey) {
    return res.json({
      ok: true,
      data: { publicKey: null, enabled: false },
      error: null,
      requestId: req.requestId,
    })
  }
  res.json({
    ok: true,
    data: { publicKey, enabled: true },
    error: null,
    requestId: req.requestId,
  })
})

const pushFeatureGate = requireFeature(
  'push_notifications',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.post(
  '/subscribe',
  requireAuth,
  resolveTenantContext,
  pushFeatureGate,
  async (req, res, next) => {
    try {
      const body = subscribeSchema.parse(req.body)
      const subscription = await savePushSubscription(req.userData.id, {
        endpoint: body.endpoint,
        keys: body.keys,
        userAgent: req.headers['user-agent'],
      })
      res
        .status(201)
        .json({ ok: true, data: { subscription }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/unsubscribe',
  requireAuth,
  resolveTenantContext,
  pushFeatureGate,
  async (req, res, next) => {
    try {
      const body = unsubscribeSchema.parse(req.body)
      const removed = await removePushSubscription(req.userData.id, body.endpoint)
      res.json({ ok: true, data: { removed }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

export { router as pushRoutes }
