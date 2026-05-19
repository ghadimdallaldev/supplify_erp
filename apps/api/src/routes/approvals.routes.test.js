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
      permissions: ['ORDERS_VIEW', 'ORDERS_MANAGE', 'ORDERS_CREATE'],
      tenantId: 'restaurant-1',
      tenantType: 'RESTAURANT',
    }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
  isFeatureEnabled: (...args) => isFeatureEnabled(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../services/approvals.service.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    approveOrderRequest: vi.fn().mockResolvedValue({ orderId: 'order-1', status: 'PLACED' }),
    rejectOrderRequest: vi.fn().mockResolvedValue({ orderId: 'order-1', status: 'CANCELLED' }),
    getBudgetPeriodUsage: vi.fn().mockResolvedValue({
      period: { id: 'bp-1' },
      categories: [],
      summary: { totalAllocated: 1000, totalSpent: 200, totalRemaining: 800, percentUsed: 20 },
    }),
  }
})

import { approvalsRoutes } from './approvals.routes.js'

describe('Approvals Routes', () => {
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
      req.requestId = 'test-request-id'
      req.userData = {
        ...mockUser,
        id: 'user-1',
        role: 'RESTAURANT',
        email: 'restaurant@example.com',
      }
      req.tenantContext = {
        tenantId: 'restaurant-1',
        tenantType: 'RESTAURANT',
        permissions: ['ORDERS_VIEW', 'ORDERS_MANAGE'],
      }
      next()
    })
    app.use('/api/approvals', approvalsRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  it('GET /budgets returns periods for tenant', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'bp-1', name: 'Q1', allocations: [] }],
    })
    const res = await request(app).get('/api/approvals/budgets').expect(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.periods).toHaveLength(1)
  })

  it('GET /pending returns approvals for current approver', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'oa-1', status: 'pending', order_id: 'order-1' }],
    })
    const res = await request(app).get('/api/approvals/pending').expect(200)
    expect(res.body.data.approvals).toHaveLength(1)
  })

  it('POST /requests/:id/approve delegates to service', async () => {
    const { approveOrderRequest } = await import('../services/approvals.service.js')
    const res = await request(app).post('/api/approvals/requests/a1/approve').send({ notes: 'ok' })
    expect(res.status).toBe(200)
    expect(approveOrderRequest).toHaveBeenCalledWith('a1', 'user-1', 'ok')
  })
})
