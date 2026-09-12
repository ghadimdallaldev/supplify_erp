import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const saveExpoPushDevice = vi.fn()
const removeExpoPushDevice = vi.fn()

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => {
    if (!req.userData) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'UNAUTHORIZED', message: 'Authentication required' },
        requestId: req.requestId,
      })
    }
    next()
  },
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      permissions: ['SETTINGS_MANAGE'],
    }
    next()
  },
}))

vi.mock('../services/push.service.js', () => ({
  getVapidPublicKey: vi.fn(() => 'vapid-key'),
  savePushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
  saveExpoPushDevice: (...args) => saveExpoPushDevice(...args),
  removeExpoPushDevice: (...args) => removeExpoPushDevice(...args),
}))

vi.mock('../services/notification.service.js', () => ({
  setPushEnabledPreference: vi.fn(),
}))

import { pushRoutes } from './push.routes.js'

function buildApp(userData) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    req.requestId = 'test-req'
    req.userData = userData
    next()
  })
  app.use('/api/push', pushRoutes)
  return app
}

describe('push.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saveExpoPushDevice.mockReset()
    removeExpoPushDevice.mockReset()
  })

  it('POST /devices registers expo push token', async () => {
    saveExpoPushDevice.mockResolvedValueOnce({ id: 'device-1' })
    const app = buildApp({ id: 'user-1', role: 'RESTAURANT' })

    const res = await request(app)
      .post('/api/push/devices')
      .send({ token: 'ExponentPushToken[abc]', platform: 'ios' })
      .expect(201)

    expect(res.body.ok).toBe(true)
    expect(saveExpoPushDevice).toHaveBeenCalledWith('user-1', {
      token: 'ExponentPushToken[abc]',
      platform: 'ios',
    })
  })

  it('DELETE /devices unregisters expo push token', async () => {
    removeExpoPushDevice.mockResolvedValueOnce(true)
    const app = buildApp({ id: 'user-1', role: 'RESTAURANT' })

    const res = await request(app)
      .delete('/api/push/devices')
      .send({ token: 'ExponentPushToken[abc]', platform: 'android' })
      .expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.removed).toBe(true)
    expect(removeExpoPushDevice).toHaveBeenCalledWith('user-1', 'ExponentPushToken[abc]')
  })
})
