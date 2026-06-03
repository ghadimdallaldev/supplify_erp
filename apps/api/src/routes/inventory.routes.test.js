import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

// Setup mocks at top level
vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  const withTransactionMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: withTransactionMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
    __withTransactionMock: withTransactionMock,
  }
})

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  requireOwnership: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  getRequestTenant: vi.fn().mockResolvedValue(null),
  checkPermission: vi.fn().mockResolvedValue(true),
  upsertUser: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
  getUserBySub: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
}))

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, current: 0, limit: 100, isOverLimit: false }),
  incrementUsage: vi.fn().mockResolvedValue(true),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import routes after mocks
import { inventoryRoutes } from './inventory.routes.js'

describe('Inventory Routes', () => {
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
      req.requestId = 'test-request-id'
      req.user = mockUser
      req.userData = { ...mockUser, role: 'SUPPLIER', email: 'supplier@example.com' } // Use SUPPLIER role
      next()
    })
    app.use('/api/inventory', inventoryRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/inventory', () => {
    it('should return inventory list', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'inv-1',
            product_id: 'prod-1',
            warehouse_id: 'warehouse-1',
            quantity: 100,
            reserved_quantity: 10,
          },
        ],
      })

      const response = await request(app).get('/api/inventory').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.inventory).toHaveLength(1)
    })
  })

  describe('PATCH /api/inventory/product/:productId', () => {
    it('should update inventory quantity', async () => {
      // Mock: checkProductOwnership query, then UPDATE inventory
      db.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'prod-1', supplier_id: 'supplier-1', contact_email: 'supplier@example.com' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'inv-1', product_id: 'prod-1', available_qty: 150 }],
        })

      const response = await request(app)
        .patch('/api/inventory/product/prod-1')
        .send({
          availableQty: 150,
        })
        .expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.inventory.available_qty).toBe(150)
    })
  })
})
