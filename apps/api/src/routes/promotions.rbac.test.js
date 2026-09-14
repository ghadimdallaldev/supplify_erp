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

const tenantPermissions = { value: ['PROMOTIONS_VIEW'] }

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
      permissions: tenantPermissions.value,
    }
    next()
  },
  resolveAdminContext: (req, res, next) => next(),
  requirePermission: (key) => (req, res, next) => {
    const perms = req.tenantContext?.permissions ?? []
    if (perms.includes(key) || perms.includes('ALL')) return next()
    return res.status(403).json({
      ok: false,
      error: { name: 'FORBIDDEN', message: `Missing permission: ${key}` },
    })
  },
  requireAnyPermission:
    (...keys) =>
    (req, res, next) => {
      const perms = req.tenantContext?.permissions ?? []
      if (keys.some((k) => perms.includes(k) || perms.includes('ALL'))) return next()
      return res.status(403).json({
        ok: false,
        error: { name: 'FORBIDDEN', message: `Missing one of: ${keys.join(', ')}` },
      })
    },
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
  requireWithinLimit: () => (req, res, next) => next(),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/audit.js', () => ({ writeAuditLog: vi.fn() }))
vi.mock('../services/deal-promotions.service.js', () => ({
  discoverDealsForRestaurant: vi.fn(),
  loadDealDetailForRestaurant: vi.fn(),
  recordDealInteraction: vi.fn(),
  enrichPromotionRow: vi.fn(async (row) => row),
  enrichPromotionRows: vi.fn(async (rows) => rows),
}))
vi.mock('../services/promotions.service.js', () => ({
  loadActivePromotionsForSupplier: vi.fn(),
}))
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock('../lib/systemEvent.js', () => ({ writeSystemEvent: vi.fn() }))

import { promotionsRoutes } from './promotions.routes.js'
import { errorHandler } from '../middlewares/errorHandler.js'

describe('promotions RBAC', () => {
  let app

  beforeEach(() => {
    clearAllMocks()
    setupMocks()
    tenantPermissions.value = ['PROMOTIONS_VIEW']
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      next()
    })
    app.use('/api/promotions', promotionsRoutes)
    app.use(errorHandler)
  })

  it('driver-like permissions cannot read boost pricing', async () => {
    tenantPermissions.value = ['DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE']
    const res = await request(app).get('/api/promotions/pricing').expect(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
  })

  it('viewer with PROMOTIONS_VIEW can list promotions (GET /)', async () => {
    tenantPermissions.value = ['PROMOTIONS_VIEW']
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query)
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
    await request(app).get('/api/promotions').expect(200)
  })

  it('viewer cannot mutate promotions (POST /)', async () => {
    tenantPermissions.value = ['PROMOTIONS_VIEW']
    const res = await request(app).post('/api/promotions').send({ name: 'Deal' }).expect(403)
    expect(res.body.error.name).toBe('FORBIDDEN')
  })
})
