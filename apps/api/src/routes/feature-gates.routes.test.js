import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'
import {
  resetFeatureGates,
  setFeatureEnabled,
  setLimitBlocked,
  mockSubscriptionModule,
} from '../test/feature-gate-mock.js'

vi.mock('../lib/subscription.js', () => mockSubscriptionModule())

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: vi.fn(async (fn) => fn({ query: queryMock })),
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      permissions: [
        'ORDERS_VIEW',
        'ORDERS_CREATE',
        'ORDERS_MANAGE',
        'SETTINGS_VIEW',
        'SETTINGS_MANAGE',
        'CATALOG_MANAGE',
      ],
    }
    next()
  },
  resolveAdminContext: (req, res, next) => {
    req.adminContext = { permissions: ['ADMIN_ACCESS'] }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next(),
  getRequestTenant: vi.fn(async (req) => req.tenantContext),
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
}))

vi.mock('../services/deal-promotions.service.js', () => ({
  discoverDealsForRestaurant: vi.fn().mockResolvedValue([]),
  loadDealDetailForRestaurant: vi.fn(),
  recordDealInteraction: vi.fn(),
  createDealPromotionCampaign: vi.fn(),
  getDealAnalytics: vi.fn(),
  enrichPromotionRow: vi.fn(async (row) => row),
  enrichPromotionRows: vi.fn(async (rows) => rows),
  getEligibleProductsForDeal: vi.fn(),
  getActiveDealPromotion: vi.fn(),
  previewDealForCart: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../services/reviews.service.js', () => ({
  listSupplierReviews: vi.fn().mockResolvedValue({ reviews: [{ id: 'r1' }], total: 1 }),
  getSupplierRatingSummary: vi.fn().mockResolvedValue({ review_count: 1 }),
  listMyReviews: vi.fn().mockResolvedValue([]),
  createSupplierReview: vi.fn().mockResolvedValue({ id: 'review-1' }),
  updateSupplierReview: vi.fn(),
  deleteSupplierReview: vi.fn(),
}))

vi.mock('../services/promotions.service.js', () => ({
  loadActivePromotionsForSupplier: vi.fn(),
}))

vi.mock('../services/push.service.js', () => ({
  getVapidPublicKey: vi.fn(() => 'vapid-key'),
  savePushSubscription: vi.fn().mockResolvedValue({ id: 'sub-1' }),
  removePushSubscription: vi.fn().mockResolvedValue(true),
}))

vi.mock('../services/order-amendments.service.js', () => ({
  getOrderForAmendment: vi.fn().mockResolvedValue({
    id: 'order-1',
    restaurant_id: 'tenant-1',
    supplier_id: 'sup-1',
    status: 'CONFIRMED',
  }),
  assertNoPendingAmendment: vi.fn(),
  canAmendOrderStatus: vi.fn(() => true),
  acceptAmendment: vi.fn(),
  notifyAmendmentParty: vi.fn(),
}))

vi.mock('../lib/audit.js', () => ({
  writeAuditLog: vi.fn(),
  formatAuditLogRow: vi.fn((row) => row),
}))

vi.mock('../lib/audit-labels.js', () => ({
  buildAuditFilterOptions: vi.fn(() => []),
  AUDIT_ACTION_LABELS: {},
  AUDIT_RESOURCE_LABELS: {},
  getAuditActionLabel: vi.fn((k) => k),
  getAuditResourceLabel: vi.fn((k) => k),
}))

describe('Feature gate routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    resetFeatureGates({
      supplier_reviews: true,
      promotions: true,
      push_notifications: true,
      order_amendments: true,
      tenant_audit_log: true,
    })
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    db.query.mockResolvedValue({ rows: [{ id: 'tenant-1' }] })

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = {
        tenantId: 'tenant-1',
        tenantType: 'RESTAURANT',
        permissions: ['ORDERS_VIEW', 'ORDERS_MANAGE', 'SETTINGS_VIEW', 'SETTINGS_MANAGE'],
      }
      next()
    })

    const { reviewsRoutes } = await import('./reviews.routes.js')
    const { pushRoutes } = await import('./push.routes.js')
    const { tenantAuditRoutes } = await import('./tenant-audit.routes.js')
    const { orderAmendmentsRouter } = await import('./order-amendments.routes.js')
    app.use('/api/reviews', reviewsRoutes)
    app.use('/api/push', pushRoutes)
    app.use('/api/audit', tenantAuditRoutes)
    app.use('/api/orders/:orderId/amendments', orderAmendmentsRouter)
  })

  describe('supplier_reviews', () => {
    it('blocks POST when flag is off', async () => {
      setFeatureEnabled('supplier_reviews', false)
      const res = await request(app)
        .post('/api/reviews/suppliers/11111111-1111-1111-1111-111111111111')
        .send({
          orderId: '22222222-2222-2222-2222-222222222222',
          overallRating: 5,
        })
      expect(res.status).toBe(403)
    })

    it('allows GET when flag is off', async () => {
      setFeatureEnabled('supplier_reviews', false)
      const res = await request(app).get('/api/reviews/suppliers/sup-1')
      expect(res.status).toBe(200)
    })

    it('allows POST when flag is on', async () => {
      const res = await request(app)
        .post('/api/reviews/suppliers/11111111-1111-1111-1111-111111111111')
        .send({
          orderId: '22222222-2222-2222-2222-222222222222',
          overallRating: 5,
        })
      expect(res.status).toBe(201)
    })
  })

  describe('push_notifications', () => {
    it('blocks subscribe when flag is off', async () => {
      setFeatureEnabled('push_notifications', false)
      const res = await request(app)
        .post('/api/push/subscribe')
        .send({
          endpoint: 'https://push.example/sub/1',
          keys: { p256dh: 'k', auth: 'a' },
        })
      expect(res.status).toBe(403)
    })

    it('allows vapid key when flag is off', async () => {
      setFeatureEnabled('push_notifications', false)
      const res = await request(app).get('/api/push/vapid-public-key')
      expect(res.status).toBe(200)
    })

    it('allows subscribe when flag is on', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .send({
          endpoint: 'https://push.example/sub/1',
          keys: { p256dh: 'k', auth: 'a' },
        })
      expect(res.status).toBe(201)
    })
  })

  describe('order_amendments', () => {
    it('blocks POST when flag is off', async () => {
      setFeatureEnabled('order_amendments', false)
      const res = await request(app)
        .post('/api/orders/order-1/amendments')
        .send({ changeType: 'other', description: 'Change qty' })
      expect(res.status).toBe(403)
    })

    it('allows GET when flag is off', async () => {
      setFeatureEnabled('order_amendments', false)
      db.query.mockResolvedValue({ rows: [] })
      const res = await request(app).get('/api/orders/order-1/amendments')
      expect(res.status).toBe(200)
    })

    it('allows POST when flag is on', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'amend-1' }] }).mockResolvedValue({ rows: [] })
      const res = await request(app)
        .post('/api/orders/order-1/amendments')
        .send({ changeType: 'other', description: 'Change qty' })
      expect(res.status).toBe(201)
    })
  })

  describe('tenant_audit_log', () => {
    it('blocks GET logs when flag is off', async () => {
      setFeatureEnabled('tenant_audit_log', false)
      const res = await request(app).get('/api/audit/logs')
      expect(res.status).toBe(403)
    })

    it('allows GET logs when flag is on', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ total: 0 }] }).mockResolvedValueOnce({ rows: [] })
      const res = await request(app).get('/api/audit/logs')
      expect(res.status).toBe(200)
    })
  })
})

describe('promotions feature gate', () => {
  let app

  beforeEach(async () => {
    clearAllMocks()
    resetFeatureGates({ promotions: true, supplier_deals: true })
    const db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    db.query.mockResolvedValue({ rows: [] })

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockUser, id: 'user-1', role: 'SUPPLIER' }
      req.tenantContext = {
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: ['CATALOG_MANAGE'],
      }
      next()
    })
    const { promotionsRoutes } = await import('./promotions.routes.js')
    app.use('/api/promotions', promotionsRoutes)
  })

  it('blocks supplier POST when flag is off', async () => {
    setFeatureEnabled('promotions', false)
    const res = await request(app).post('/api/promotions').send({
      name: 'Summer',
      type: 'percentage_discount',
      discountValue: 10,
      startsAt: new Date().toISOString(),
    })
    expect(res.status).toBe(403)
  })

  it('allows restaurant GET active when supplier flag is off', async () => {
    setFeatureEnabled('promotions', false)
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockResolvedValue({ rows: [{ id: 'restaurant-1' }] })

    const promoApp = express()
    promoApp.use(express.json())
    promoApp.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = { tenantId: 'restaurant-1', tenantType: 'RESTAURANT' }
      next()
    })
    const { promotionsRoutes } = await import('./promotions.routes.js')
    promoApp.use('/api/promotions', promotionsRoutes)

    const res = await request(promoApp).get('/api/promotions/active')
    expect(res.status).toBe(200)
  })

  it('blocks restaurant GET /active when supplier_deals is off (API-21, GATE-R19)', async () => {
    setFeatureEnabled('supplier_deals', false)
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockResolvedValue({ rows: [{ id: 'restaurant-1' }] })

    const promoApp = express()
    promoApp.use(express.json())
    promoApp.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = { tenantId: 'restaurant-1', tenantType: 'RESTAURANT' }
      next()
    })
    const { promotionsRoutes } = await import('./promotions.routes.js')
    promoApp.use('/api/promotions', promotionsRoutes)

    const res = await request(promoApp).get('/api/promotions/active')
    expect(res.status).toBe(403)
    expect(res.body.error?.featureKey || res.body.error?.name).toBeTruthy()
  })

  it('blocks supplier POST when promotions plan limit is exceeded (SUP-52 limit)', async () => {
    setLimitBlocked('promotions', true)
    const res = await request(app).post('/api/promotions').send({
      name: 'Summer',
      type: 'percentage_discount',
      discountValue: 10,
      startsAt: new Date().toISOString(),
    })
    expect(res.status).toBe(403)
    expect(res.body.error?.limitKey || res.body.error?.name).toBeTruthy()
  })
})
