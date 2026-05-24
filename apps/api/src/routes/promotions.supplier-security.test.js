import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

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
    req.userData = { ...mockUser, role: 'SUPPLIER', id: 'user-supplier' }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = {
      tenantId: 'supplier-1',
      tenantType: 'SUPPLIER',
      permissions: ['CATALOG_MANAGE'],
    }
    next()
  },
  resolveAdminContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
  requireWithinLimit: () => (req, res, next) => next(),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/audit.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/deal-promotions.service.js', () => ({
  discoverDealsForRestaurant: vi.fn(),
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

vi.mock('../services/promotions.service.js', () => ({
  loadActivePromotionsForSupplier: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/systemEvent.js', () => ({
  writeSystemEvent: vi.fn().mockResolvedValue(undefined),
}))

import { promotionsRoutes } from './promotions.routes.js'
import { errorHandler } from '../middlewares/errorHandler.js'

describe('promotions.routes supplier security', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      next()
    })
    app.use('/api/promotions', promotionsRoutes)
    app.use(errorHandler)
  })

  it('PATCH /:id returns 404 when deal belongs to another supplier (IDOR)', async () => {
    db.query.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .patch('/api/promotions/other-supplier-deal')
      .send({ name: 'Hijacked' })
      .expect(404)

    expect(res.body.error.name).toBe('NOT_FOUND')
    expect(res.status).toBe(404)
  })

  it('POST /:id/resume rejects unpaid activation', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'deal-1',
          supplier_id: 'supplier-1',
          status: 'paused',
          payment_status: 'pending',
          starts_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
    })

    const res = await request(app).post('/api/promotions/deal-1/resume').expect(400)

    expect(res.body.error.message).toMatch(/payment/i)
  })
})
