import express from 'express'
import { z } from 'zod'
import { requireAuth, resolveTenantContext } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  saveExpoPushDevice,
  removeExpoPushDevice,
} from '../services/push.service.js'
import { setPushEnabledPreference } from '../services/notification.service.js'

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

const deviceSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
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
      await setPushEnabledPreference(req.userData.id, req.userData.role, true)
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
      if (removed) {
        await setPushEnabledPreference(req.userData.id, req.userData.role, false)
      }
      res.json({ ok: true, data: { removed }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/devices',
  requireAuth,
  resolveTenantContext,
  pushFeatureGate,
  async (req, res, next) => {
    try {
      const body = deviceSchema.parse(req.body)
      const device = await saveExpoPushDevice(req.userData.id, {
        token: body.token,
        platform: body.platform,
      })
      await setPushEnabledPreference(req.userData.id, req.userData.role, true)
      res.status(201).json({ ok: true, data: { device }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/devices',
  requireAuth,
  resolveTenantContext,
  pushFeatureGate,
  async (req, res, next) => {
    try {
      const body = deviceSchema.parse(req.body)
      const removed = await removeExpoPushDevice(req.userData.id, body.token)
      res.json({ ok: true, data: { removed }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

export { router as pushRoutes }
