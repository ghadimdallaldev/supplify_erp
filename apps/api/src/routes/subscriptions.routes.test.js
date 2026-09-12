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
    if (req.tenantContext?.tenantId === null) {
      return next()
    }
    req.tenantContext = req.tenantContext || {
      permissions: ['SUBSCRIPTIONS_VIEW'],
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
    }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next(),
  getRequestTenant: vi.fn().mockResolvedValue({
    tenantId: 'rest-1',
    tenantType: 'RESTAURANT',
    tenantName: 'Test Restaurant',
  }),
}))

const mockGetTenantSubscription = vi.fn()
const mockCheckLimit = vi.fn()
const mockIsFeatureEnabled = vi.fn()
const mockGetEntitlements = vi.fn()
const mockRecommendPlan = vi.fn()
const mockResolveEffectivePlanFeatures = vi.fn((subscription) => subscription?.features || {})
vi.mock('../lib/subscription.js', () => ({
  getTenantSubscription: (...args) => mockGetTenantSubscription(...args),
  checkLimit: (...args) => mockCheckLimit(...args),
  isFeatureEnabled: (...args) => mockIsFeatureEnabled(...args),
  getEntitlements: (...args) => mockGetEntitlements(...args),
  recommendPlan: (...args) => mockRecommendPlan(...args),
  resolveEffectivePlanFeatures: (...args) => mockResolveEffectivePlanFeatures(...args),
  RESTAURANT_LIMIT_KEYS: [
    'branches',
    'users',
    'orders_per_day',
    'suppliers_per_restaurant',
    'restaurant_inventory_skus',
    'chats_per_day',
    'storage_mb',
  ],
  SUPPLIER_LIMIT_KEYS: [
    'warehouses',
    'users',
    'supplier_products_skus',
    'chats_per_day',
    'storage_mb',
  ],
}))
const mockRecordConversionEvent = vi.fn()
vi.mock('../lib/conversion-events.js', () => ({
  recordConversionEvent: (...args) => mockRecordConversionEvent(...args),
  ALLOWED_TYPES: [
    'VIEW_PLANS',
    'BLOCKED_FEATURE',
    'BLOCKED_LIMIT',
    'OPEN_UPGRADE',
    'UPGRADE_SUCCESS',
    'CLICK_UPGRADE',
    'CLOSE_UPGRADE_MODAL',
    'DOWNGRADE_ATTEMPT_BLOCKED',
    'RECOMMENDATION_SHOWN',
    'RECOMMENDATION_CLICKED',
  ],
}))

import { subscriptionsRoutes } from './subscriptions.routes.js'

describe('Subscriptions Routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()
    // Drop any unconsumed mockResolvedValueOnce values queued by earlier tests
    // (e.g. when a route takes the tenantContext fast path), then
    // restore the default tenant and a clean DB mock.
    const rbac = await import('../lib/rbac.js')
    vi.mocked(rbac.getRequestTenant).mockReset().mockResolvedValue({
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
      tenantName: 'Test Restaurant',
    })
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockReset()
    mockGetTenantSubscription.mockReset()
    mockCheckLimit.mockReset()
    mockIsFeatureEnabled.mockReset()
    mockGetEntitlements.mockReset()
    mockRecommendPlan.mockReset()
    mockResolveEffectivePlanFeatures.mockReset()
    mockResolveEffectivePlanFeatures.mockImplementation(
      (subscription) => subscription?.features || {}
    )
    mockRecordConversionEvent.mockReset()

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
        plan_code: 'free',
        plan_name: 'Free',
        plan_display_name: 'Free',
        status: 'ACTIVE',
        limits: { chats_per_day: 10, products: 50 },
        features: { chat: 'enabled' },
      })

      const res = await request(app).get('/api/subscriptions/current').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.subscription).toBeDefined()
      expect(res.body.data.subscription.plan_name).toBe('30-day Free Trial')
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
        plan_code: 'free',
        plan_name: 'Free',
        plan_display_name: 'Free',
        status: 'ACTIVE',
        limits: { chats_per_day: 10, products: 50, warehouses: 0 },
        features: {},
      })

      const res = await request(appSupplier).get('/api/subscriptions/current').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.subscription.plan_name).toBe('30-day Free Trial')
      expect(res.body.data.subscription.limits.chats_per_day).toBe(10)
    })

    it('returns 404 when tenant not found', async () => {
      const dbModule = await import('../lib/db.js')
      vi.mocked(dbModule.query).mockResolvedValueOnce({ rows: [] })

      await request(app).get('/api/subscriptions/current').expect(404)
    })
  })

  describe('GET /api/subscriptions/plans', () => {
    it('returns tenant-specific public plan names and DB-derived annual savings', async () => {
      mockGetTenantSubscription.mockResolvedValueOnce({ plan_id: 'plan-scale', plan_code: 'gold' })
      const dbModule = await import('../lib/db.js')
      vi.mocked(dbModule.query).mockImplementation((sql) => {
        if (String(sql).includes('FROM subscription_plan')) {
          return Promise.resolve({
            rows: [
              {
                id: 'plan-growth',
                code: 'silver',
                name: 'Silver',
                description: 'Legacy name from an old catalog row',
                price_per_month: 49,
                price_per_year: 490,
                tenant_type: 'RESTAURANT',
                is_active: true,
                display_order: 20,
                limits: { branches: 1 },
                features: {},
                trial_days: 0,
              },
              {
                id: 'plan-scale',
                code: 'gold',
                name: 'Gold',
                description: 'Legacy name from an old catalog row',
                price_per_month: 149,
                price_per_year: 1490,
                tenant_type: 'RESTAURANT',
                is_active: true,
                display_order: 30,
                limits: { branches: 3 },
                features: {},
                trial_days: 0,
              },
            ],
          })
        }
        return db.query(sql)
      })

      const res = await request(app).get('/api/subscriptions/plans').expect(200)

      expect(res.body.data.plans).toHaveLength(2)
      expect(res.body.data.plans[0]).toMatchObject({
        code: 'silver',
        display_name: 'Restaurant Growth',
        annual_savings: 98,
        current_plan: false,
      })
      expect(res.body.data.plans[1]).toMatchObject({
        code: 'gold',
        display_name: 'Restaurant Scale',
        annual_savings: 298,
        current_plan: true,
      })
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

  describe('GET /api/subscriptions/entitlements', () => {
    it('returns entitlements with plan, limits, overrides, usage', async () => {
      const entitlements = {
        tenantType: 'RESTAURANT',
        tenantId: 'rest-1',
        plan: {
          id: 'plan-1',
          name: 'Free',
          code: 'free',
          tenant_type: 'RESTAURANT',
          price_monthly: 0,
          price_yearly: null,
        },
        features: { chat: true, reports: false },
        limits: { orders_per_day: 10, users: 1 },
        baseLimits: { orders_per_day: 10, users: 1 },
        overrides: [{ limitKey: 'orders_per_day', value: 20, reason: 'Promo', expiresAt: null }],
        usage: { orders_per_day: 5, users: 1 },
        usageWindowMeta: {},
      }
      mockGetEntitlements.mockResolvedValueOnce(entitlements)

      const res = await request(app).get('/api/subscriptions/entitlements').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.entitlements).toBeDefined()
      expect(res.body.data.entitlements.plan.name).toBe('Free')
      expect(res.body.data.entitlements.plan.code).toBe('free')
      expect(res.body.data.entitlements.overrides).toHaveLength(1)
      expect(res.body.data.entitlements.overrides[0].limitKey).toBe('orders_per_day')
      expect(res.body.data.entitlements.usage.orders_per_day).toBe(5)
    })

    it('returns Restaurant Scale entitlements with tier limits', async () => {
      mockGetEntitlements.mockResolvedValueOnce({
        tenantType: 'RESTAURANT',
        tenantId: 'rest-1',
        plan: {
          id: 'plan-gold',
          name: 'Restaurant Scale',
          code: 'gold',
          tenant_type: 'RESTAURANT',
          price_monthly: 149,
          price_yearly: null,
        },
        features: { multi_branch: true, reports: true },
        limits: { orders_per_day: 50, branches: 3 },
        baseLimits: { orders_per_day: 50, branches: 3 },
        overrides: [],
        usage: { orders_per_day: 2 },
        usageWindowMeta: {},
      })

      const res = await request(app).get('/api/subscriptions/entitlements').expect(200)

      expect(res.body.data.entitlements.plan.code).toBe('gold')
      expect(res.body.data.entitlements.limits.branches).toBe(3)
      expect(res.body.data.entitlements.features.multi_branch).toBe(true)
    })

    it('returns synthetic Free entitlements when getEntitlements returns null', async () => {
      mockGetEntitlements.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      const dbModule = await import('../lib/db.js')
      vi.mocked(dbModule.query)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get('/api/subscriptions/entitlements').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.entitlements).toBeDefined()
      expect(res.body.data.entitlements.plan.name).toBe('30-day Free Trial')
      expect(res.body.data.entitlements.plan.code).toBe('free')
    })

    it('returns Free Trial display name when entitlements plan code is free', async () => {
      mockGetEntitlements.mockResolvedValueOnce({
        tenantType: 'RESTAURANT',
        tenantId: 'rest-1',
        plan: {
          id: 'plan-free',
          name: '30-day Free Trial',
          code: 'free',
          tenant_type: 'RESTAURANT',
          price_monthly: 0,
          price_yearly: null,
        },
        features: {},
        limits: { orders_per_day: 3 },
        baseLimits: { orders_per_day: 3 },
        overrides: [],
        usage: { orders_per_day: 0 },
        usageWindowMeta: {},
      })

      const res = await request(app).get('/api/subscriptions/entitlements').expect(200)

      expect(res.body.data.entitlements.plan.name).toBe('30-day Free Trial')
    })
  })

  describe('GET /api/subscriptions/recommendation', () => {
    it('returns recommendation for tenant', async () => {
      mockRecommendPlan.mockResolvedValueOnce({
        recommendedPlanCode: 'gold',
        reason: 'Upgrade to get more capacity.',
        comparedToCurrent: { upgrades: ['Higher limits'], resolvesLimits: ['orders_per_day'] },
      })

      const res = await request(app).get('/api/subscriptions/recommendation').expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.recommendedPlanCode).toBe('gold')
      expect(res.body.data.reason).toBeDefined()
      expect(res.body.data.comparedToCurrent.resolvesLimits).toContain('orders_per_day')
    })

    it('accepts blocked query param', async () => {
      mockRecommendPlan.mockResolvedValueOnce({
        recommendedPlanCode: 'gold',
        reason: 'Unlock reports.',
        comparedToCurrent: { upgrades: ['reports (Restaurant Scale)'], resolvesLimits: [] },
      })

      await request(app)
        .get('/api/subscriptions/recommendation?blocked=feature:reports')
        .expect(200)

      expect(mockRecommendPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'rest-1',
          tenantType: 'RESTAURANT',
          blockedEvents: [{ type: 'FEATURE', key: 'reports' }],
        })
      )
    })

    it('returns 404 when tenant not found', async () => {
      const rbac = await import('../lib/rbac.js')
      vi.mocked(rbac.getRequestTenant).mockResolvedValueOnce(null)

      const noTenantApp = express()
      noTenantApp.use(express.json())
      noTenantApp.use((req, res, next) => {
        req.requestId = 'test-req'
        req.userData = mockUser
        req.tenantContext = { permissions: [], tenantId: null, tenantType: 'RESTAURANT' }
        next()
      })
      const { subscriptionsRoutes } = await import('./subscriptions.routes.js')
      noTenantApp.use('/api/subscriptions', subscriptionsRoutes)

      await request(noTenantApp).get('/api/subscriptions/recommendation').expect(404)
    })
  })

  describe('POST /api/subscriptions/conversion-event', () => {
    it('records VIEW_PLANS and returns 200', async () => {
      mockRecordConversionEvent.mockResolvedValueOnce(undefined)

      const res = await request(app)
        .post('/api/subscriptions/conversion-event')
        .send({ eventType: 'VIEW_PLANS' })
        .expect(200)

      expect(res.body.ok).toBe(true)
      expect(res.body.data.recorded).toBe(true)
      expect(mockRecordConversionEvent).toHaveBeenCalledWith(
        'rest-1',
        'RESTAURANT',
        'VIEW_PLANS',
        {}
      )
    })

    it('records OPEN_UPGRADE with metadata', async () => {
      mockRecordConversionEvent.mockResolvedValueOnce(undefined)

      await request(app)
        .post('/api/subscriptions/conversion-event')
        .send({ eventType: 'OPEN_UPGRADE', metadata: { source: 'modal' } })
        .expect(200)

      expect(mockRecordConversionEvent).toHaveBeenCalledWith(
        'rest-1',
        'RESTAURANT',
        'OPEN_UPGRADE',
        { source: 'modal' }
      )
    })

    it('returns 400 for invalid eventType', async () => {
      const res = await request(app)
        .post('/api/subscriptions/conversion-event')
        .send({ eventType: 'INVALID' })
        .expect(400)

      expect(res.body.ok).toBe(false)
      expect(mockRecordConversionEvent).not.toHaveBeenCalled()
    })
  })
})
