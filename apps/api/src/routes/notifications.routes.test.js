import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserNotifications = vi.fn()
const getUnreadNotificationCount = vi.fn()

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
      permissions: ['SETTINGS_VIEW'],
    }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
}))

vi.mock('../services/notification.service.js', () => ({
  getUserNotifications: (...args) => getUserNotifications(...args),
  getUnreadNotificationCount: (...args) => getUnreadNotificationCount(...args),
  getUserPreferences: vi.fn(),
  ensureNotificationPreferences: vi.fn(),
  invalidateNotificationPreferencesCache: vi.fn(),
  invalidateUserNotificationsListCache: vi.fn(),
  sendNotification: vi.fn(),
}))

import { notificationsRoutes } from './notifications.routes.js'

function buildApp(userData) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    req.requestId = 'test-req'
    req.userData = userData
    next()
  })
  app.use('/api/notifications', notificationsRoutes)
  return app
}

describe('notifications.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserNotifications.mockReset()
    getUnreadNotificationCount.mockReset()
  })

  it('GET / returns 401 without authentication', async () => {
    const app = buildApp(undefined)
    await request(app).get('/api/notifications').expect(401)
  })

  it('GET / scopes notifications to authenticated user', async () => {
    getUserNotifications.mockResolvedValueOnce({
      notifications: [{ id: 'n1', title: 'Order update' }],
      pagination: { total: 1, limit: 50, offset: 0 },
    })

    const app = buildApp({ id: 'user-1', role: 'RESTAURANT', email: 'r@test.com' })
    const res = await request(app).get('/api/notifications').expect(200)

    expect(res.body.ok).toBe(true)
    expect(getUserNotifications).toHaveBeenCalledWith(
      'user-1',
      'RESTAURANT',
      expect.objectContaining({ limit: 50, offset: 0, unreadOnly: false })
    )
  })

  it('GET /unread-count returns count for authenticated user', async () => {
    getUnreadNotificationCount.mockResolvedValueOnce(2)

    const app = buildApp({ id: 'user-1', role: 'RESTAURANT', email: 'r@test.com' })
    const res = await request(app).get('/api/notifications/unread-count').expect(200)

    expect(res.body.data).toBe(2)
    expect(getUnreadNotificationCount).toHaveBeenCalledWith('user-1', 'RESTAURANT')
  })
})
