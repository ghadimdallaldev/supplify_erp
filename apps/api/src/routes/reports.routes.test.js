import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: vi.fn(),
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

const isFeatureEnabled = vi.fn().mockResolvedValue(true)

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      tenantId: 'restaurant-1',
      tenantType: 'RESTAURANT',
    }
    next()
  },
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
  isFeatureEnabled: (...args) => isFeatureEnabled(...args),
}))

vi.mock('../services/reports.service.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    restaurantSpendBySupplier: vi.fn().mockResolvedValue({
      data: [{ supplier_name: 'Acme', total_spend: 100 }],
      meta: { from: '2026-01-01', to: '2026-01-31', granularity: 'day', rowCount: 1 },
    }),
  }
})

import { reportsRoutes } from './reports.routes.js'

describe('Reports Routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    db.query.mockResolvedValue({ rows: [{ id: 'restaurant-1' }] })

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.userData = { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = { tenantId: 'restaurant-1', tenantType: 'RESTAURANT' }
      next()
    })
    app.use('/api/reports', reportsRoutes)
  })

  it('GET /restaurant/spend-by-supplier returns data and meta', async () => {
    const res = await request(app).get(
      '/api/reports/restaurant/spend-by-supplier?from=2026-01-01&to=2026-01-31'
    )
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.meta.granularity).toBe('day')
  })
})
