import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockUser, mockSupplierUser, setupMocks, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn((req, res, next) => {
    req.userData = req.userData || mockUser
    next()
  }),
  requireRole: vi.fn(() => (req, res, next) => next()),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      permissions: ['SUBSCRIPTIONS_VIEW'],
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
    }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
  getRequestTenant: vi.fn().mockResolvedValue({
    tenantId: 'rest-1',
    tenantType: 'RESTAURANT',
    tenantName: 'Test Restaurant',
  }),
}))

const mockGetTenantSubscription = vi.fn()
const mockCheckLimit = vi.fn()
const mockIsFeatureEnabled = vi.fn()
vi.mock('../lib/subscription.js', () => ({
  getTenantSubscription: (...args) => mockGetTenantSubscription(...args),
  checkLimit: (...args) => mockCheckLimit(...args),
  isFeatureEnabled: (...args) => mockIsFeatureEnabled(...args),
}))

import { subscriptionsRoutes } from './subscriptions.routes.js'

describe('Subscriptions Routes', () => {
  let app
  let db

  beforeEach(() => {
    clearAllMocks()
    db = setupMocks()
    mockGetTenantSubscription.mockReset()
    mockCheckLimit.mockReset()
    mockIsFeatureEnabled.mockReset()

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockUser }
      next()
    })
    app.use('/api/subscriptions', subscriptionsRoutes)
  })

  describe('GET /api/subscriptions/current', () => {
    it('returns subscription for restaurant when found', async () => {
      const dbModule = await import('../lib/db.js')
      vi.mocked(dbModule.query).mockImplementation((sql, params) => {
        if (sql.includes('restaurant') && params?.[0] === 'test@example.com') {
          return Promise.resolve({ rows: [{ id: 'rest-1' }] })
        }
        return db.query(sql, params)
      })
      mockGetTenantSubscription.mockResolvedValueOnce({
        id: 'sub-1',
        plan_id: 'plan-free',
        plan_name: 'Free',
        plan_display_name: 'Free',
        status: 'ACTIVE',
        limits: { chats_per_day: 10, products: 50 },
        features: { chat: 'enabled' },
      })

      const res = await request(app).get('/api/subscriptions/current').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.subscription).toBeDefined()
      expect(res.body.data.subscription.plan_name).toBe('Free')
      expect(res.body.data.subscription.limits.chats_per_day).toBe(10)
    })

    it('returns subscription for supplier when found', async () => {
      const rbac = await import('../lib/rbac.js')
      vi.mocked(rbac.getRequestTenant).mockResolvedValueOnce({
        tenantId: 'supp-1',
        tenantType: 'SUPPLIER',
        tenantName: 'Test Supplier',
      })

      const appSupplier = express()
      appSupplier.use(express.json())
      appSupplier.use((req, res, next) => {
        req.requestId = 'test-request-id'
        req.userData = { ...mockSupplierUser, email: 'supplier@example.com' }
        req.tenantContext = {
          permissions: ['SUBSCRIPTIONS_VIEW'],
          tenantId: 'supp-1',
          tenantType: 'SUPPLIER',
        }
        next()
      })
      appSupplier.use('/api/subscriptions', subscriptionsRoutes)

      const dbModule = await import('../lib/db.js')
      vi.mocked(dbModule.query).mockImplementation((sql, params) => {
        if (sql.includes('supplier') && params?.[0] === 'supplier@example.com') {
          return Promise.resolve({ rows: [{ id: 'supp-1' }] })
        }
        return db.query(sql, params)
      })
      mockGetTenantSubscription.mockResolvedValueOnce({
        id: 'sub-2',
        plan_name: 'Free',
        plan_display_name: 'Free',
        status: 'ACTIVE',
        limits: { chats_per_day: 10, products: 50, warehouses: 0 },
        features: {},
      })

      const res = await request(appSupplier).get('/api/subscriptions/current').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.subscription.plan_name).toBe('Free')
      expect(res.body.data.subscription.limits.chats_per_day).toBe(10)
    })

    it('returns 404 when tenant not found', async () => {
      const dbModule = await import('../lib/db.js')
      vi.mocked(dbModule.query).mockResolvedValueOnce({ rows: [] })

      await request(app).get('/api/subscriptions/current').expect(404)
    })
  })

  describe('GET /api/subscriptions/usage/:meterType', () => {
    it('returns usage for restaurant', async () => {
      const dbModule = await import('../lib/db.js')
      vi.mocked(dbModule.query).mockImplementation((sql, params) => {
        if (sql.includes('restaurant') && params?.[0] === 'test@example.com') {
          return Promise.resolve({ rows: [{ id: 'rest-1' }] })
        }
        return db.query(sql, params)
      })
      mockCheckLimit.mockResolvedValueOnce({
        current: 5,
        limit: 10,
        isUnlimited: false,
        isOverLimit: false,
      })

      const res = await request(app).get('/api/subscriptions/usage/chats_per_day').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.meterType).toBe('chats_per_day')
      expect(res.body.data.current).toBe(5)
      expect(res.body.data.limit).toBe(10)
    })
  })

  describe('GET /api/subscriptions/features/:featureKey', () => {
    it('returns feature flag for tenant', async () => {
      const dbModule = await import('../lib/db.js')
      vi.mocked(dbModule.query).mockImplementation((sql, params) => {
        if (sql.includes('restaurant') && params?.[0] === 'test@example.com') {
          return Promise.resolve({ rows: [{ id: 'rest-1' }] })
        }
        return db.query(sql, params)
      })
      mockIsFeatureEnabled.mockResolvedValueOnce(true)

      const res = await request(app).get('/api/subscriptions/features/chat').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.featureKey).toBe('chat')
      expect(res.body.data.isEnabled).toBe(true)
    })
  })
})
