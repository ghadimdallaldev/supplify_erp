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

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal, {
    requireAuth: vi.fn(async (req, res, next) => {
      req.userData = req.userData || { ...mockUser, role: 'ADMIN' }
      next()
    }),
    resolveTenantContext: (req, res, next) => {
      req.tenantContext = req.tenantContext || {
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: ['CATALOG_MANAGE'],
      }
      next()
    },
    resolveAdminContext: (req, res, next) => {
      req.adminContext = { permissions: ['ADMIN_ACCESS'] }
      next()
    },
    getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
    getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
  })
})

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
  requireWithinLimit: () => (req, res, next) => next(),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/audit.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/notification.service.js', () => ({
  notifyDealApproved: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../services/promotions.service.js', () => ({
  loadActivePromotionsForSupplier: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { promotionsRoutes } from './promotions.routes.js'

describe('promotions.routes admin', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    vi.mocked(dbModule.withTransaction).mockImplementation((handler) => db.withTransaction(handler))
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      next()
    })
    app.use('/api/promotions', promotionsRoutes)
    app.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({
        ok: false,
        error: { name: err.name, message: err.message },
      })
    })
  })

  it('GET /admin/pending returns pending deals', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 'deal-1', name: 'Test Deal', supplier_name: 'Acme', status: 'pending_approval' },
      ],
    })

    const res = await request(app).get('/api/promotions/admin/pending').expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.deals).toHaveLength(1)
    expect(res.body.data.deals[0].name).toBe('Test Deal')
  })

  it('POST /admin/:id/approve rejects deal without boost package', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'deal-1',
          status: 'pending_approval',
          supplier_id: 'supplier-1',
        },
      ],
    })

    const res = await request(app).post('/api/promotions/admin/deal-1/approve')

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.body.error.message).toMatch(/boost package/i)
  })

  it('POST /admin/:id/reject marks deal rejected', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'deal-1', status: 'rejected', name: 'Test Deal' }],
    })

    const res = await request(app)
      .post('/api/promotions/admin/deal-1/reject')
      .send({ rejectionReason: 'Incomplete details' })
      .expect(200)

    expect(res.body.data.deal.status).toBe('rejected')
  })

  it('GET /admin/deals lists deals with filters', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'deal-1', name: 'Deal A', status: 'pending_approval', supplier_name: 'Acme' }],
    })

    const res = await request(app)
      .get('/api/promotions/admin/deals?status=pending_approval')
      .expect(200)

    expect(res.body.data.deals).toHaveLength(1)
  })

  it('PATCH /admin/pricing/:key updates pricing config', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          pricing_key: 'boost_flat',
          display_name: 'Starter Boost',
          amount: 9,
          duration_days: 1,
          is_recommended: false,
        },
      ],
    })

    const res = await request(app)
      .patch('/api/promotions/admin/pricing/boost_flat')
      .send({
        amount: 9,
        durationDays: 1,
        displayName: 'Starter Boost',
        estimatedReachLabel: 'Basic visibility',
        badgeLabel: 'Test visibility',
      })
      .expect(200)

    expect(res.body.data.pricing.amount).toBe(9)
  })

  it('GET /admin/pricing lists boost and activation packages', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          pricing_key: 'deal_activation',
          package_type: 'activation',
          amount: 0,
          display_name: 'Deal activation',
        },
        {
          pricing_key: 'boost_7_day',
          package_type: 'boost',
          display_name: 'Weekly Boost',
          amount: 39,
          is_active: true,
        },
      ],
    })

    const res = await request(app).get('/api/promotions/admin/pricing').expect(200)

    expect(res.body.data.pricing).toHaveLength(2)
  })

  it('GET /pricing returns active boost packages only for suppliers', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          pricing_key: 'boost_flat',
          package_type: 'boost',
          display_name: 'Starter Boost',
          amount: 9,
          duration_days: 1,
          is_active: true,
        },
      ],
    })

    const res = await request(app).get('/api/promotions/pricing').expect(200)

    expect(res.body.data.pricing).toHaveLength(1)
    expect(res.body.data.pricing[0].display_name).toBe('Starter Boost')
  })
})
