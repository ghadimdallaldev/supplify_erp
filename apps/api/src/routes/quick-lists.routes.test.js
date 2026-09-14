import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  const withTransactionMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: withTransactionMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser, role: 'RESTAURANT' }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('rest-1'),
}))

vi.mock('../lib/route-permissions.js', () => ({
  ordersCreateMutationGuard: (req, res, next) => next(),
}))

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi.fn().mockResolvedValue({ isUnlimited: true, limit: null, current: 0 }),
  getTenantSubscription: vi.fn(),
  getRecommendedPlanNames: vi.fn(),
  buildLimitExceededPayload: vi.fn(),
  buildFeatureNotAvailablePayload: vi.fn(),
  requireFeature: () => (req, res, next) => next(),
  isQuickListAutomationEnabled: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { quickListsRoutes } from './quick-lists.routes.js'

describe('Quick Lists Routes', () => {
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
      req.userData = { ...mockUser, role: 'RESTAURANT' }
      next()
    })
    app.use('/api/quick-lists', quickListsRoutes)
  })

  describe('GET /api/quick-lists', () => {
    it('returns paginated quick lists with total', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'ql-1', name: 'Weekly', item_count: 2, created_at: new Date() }],
        })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] })

      const response = await request(app).get('/api/quick-lists?limit=10&offset=0').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.pagination).toEqual({ total: 5, limit: 10, offset: 0 })
      expect(response.body.data.quickLists).toHaveLength(1)
    })

    it('skips item fetch when includeItems=false', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'ql-1', name: 'Weekly', item_count: 2, created_at: new Date() }],
        })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })

      const response = await request(app).get('/api/quick-lists?includeItems=false').expect(200)

      expect(response.body.data.quickLists[0].items).toBeUndefined()
      expect(db.query).toHaveBeenCalledTimes(2)
    })
  })
})
