import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser, id: 'user-1' }
    next()
  }),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = { tenantId: 'rest-1', tenantType: 'RESTAURANT' }
    next()
  },
  resolveAdminContext: (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next(),
  getRequestTenant: vi.fn().mockResolvedValue({ tenantId: 'rest-1', tenantType: 'RESTAURANT' }),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../services/resolve-product-price.service.js', () => ({
  enrichProductsWithResolvedPricing: vi.fn(async (rows) => rows),
}))

import { searchRoutes } from './search.routes.js'

describe('Search Routes', () => {
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
      req.userData = { ...mockUser, id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = { tenantId: 'rest-1', tenantType: 'RESTAURANT' }
      next()
    })
    app.use('/api/search', searchRoutes)
  })

  describe('GET /api/search/history', () => {
    it('returns search history for the current user', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'h1', entity_type: 'product', query: 'tomato', created_at: '2026-01-01' }],
      })

      const response = await request(app).get('/api/search/history?entityType=product').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.history).toHaveLength(1)
      expect(response.body.data.history[0].query).toBe('tomato')
    })
  })

  describe('POST /api/search/history', () => {
    it('upserts a search history entry', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'h1', entity_type: 'product', query: 'rice', created_at: '2026-01-01' }],
      })

      const response = await request(app)
        .post('/api/search/history')
        .send({ entityType: 'product', query: 'rice' })
        .expect(201)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.entry.query).toBe('rice')
    })
  })

  describe('DELETE /api/search/history', () => {
    it('deletes search history entries', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 2 })

      const response = await request(app)
        .delete('/api/search/history')
        .send({ entityType: 'supplier' })
        .expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.deleted).toBe(2)
    })
  })

  describe('GET /api/search', () => {
    it('returns grouped search results when grouped=true', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Tomato' }] })
        .mockResolvedValueOnce({ rows: [{ id: 's1', name: 'Fresh Foods' }] })

      const response = await request(app).get('/api/search?q=tomato&grouped=true').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.products).toHaveLength(1)
      expect(response.body.data.suppliers).toHaveLength(1)
    })
  })
})
