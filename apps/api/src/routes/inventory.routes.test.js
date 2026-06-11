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
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
  checkPermission: vi.fn().mockResolvedValue(true),
  upsertUser: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
  getUserBySub: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
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

vi.mock('../services/notification.service.js', () => ({
  notifySupplierLowStock: vi.fn().mockResolvedValue(null),
  notifyOutOfStock: vi.fn().mockResolvedValue(null),
}))

// Import routes after mocks
import { inventoryRoutes } from './inventory.routes.js'

function inventoryRow(overrides = {}) {
  return {
    id: 'prod-1',
    product_id: 'prod-1',
    warehouse_id: 'warehouse-1',
    available_qty: 100,
    reserved_qty: 0,
    product_name: 'Test Product',
    sku: 'SKU-1',
    supplier_id: 'supplier-1',
    supplier_name: 'Supplier',
    low_stock_threshold: 10,
    warehouse_name: 'Main',
    warehouse_code: 'MAIN',
    ...overrides,
  }
}

describe('Inventory Routes', () => {
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
      req.user = mockUser
      req.userData = { ...mockUser, role: 'SUPPLIER', email: 'supplier@example.com' }
      next()
    })
    app.use('/api/inventory', inventoryRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/inventory', () => {
    it('should return inventory list', async () => {
      db.query.mockResolvedValueOnce({
        rows: [inventoryRow()],
      })

      const response = await request(app).get('/api/inventory').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.inventory).toHaveLength(1)
    })

    it('joins product_inventory_settings for low_stock_threshold', async () => {
      db.query.mockResolvedValueOnce({ rows: [inventoryRow()] })

      await request(app).get('/api/inventory').expect(200)

      const listSql = String(db.query.mock.calls[0][0])
      expect(listSql).toContain('product_inventory_settings')
      expect(listSql).toContain('COALESCE(pis.low_stock_threshold')
      expect(listSql).not.toContain('0 as low_stock_threshold')
    })

    it('scopes supplier inventory to workspace supplier id', async () => {
      db.query.mockResolvedValueOnce({ rows: [] })

      await request(app).get('/api/inventory').expect(200)

      const listSql = String(db.query.mock.calls[0][0])
      expect(listSql).toContain('WHERE p.supplier_id = $1')
      expect(db.query.mock.calls[0][1]).toEqual(['supplier-1'])
    })

    it('marks available_qty 0 as out of stock and not low stock', async () => {
      db.query.mockResolvedValueOnce({
        rows: [inventoryRow({ available_qty: 0, low_stock_threshold: 10 })],
      })

      const response = await request(app).get('/api/inventory').expect(200)
      const item = response.body.data.inventory[0]

      expect(item.isOutOfStock).toBe(true)
      expect(item.isLowStock).toBe(false)
      expect(item.stockStatus).toBe('OUT_OF_STOCK')
    })

    it('marks available_qty below threshold as low stock', async () => {
      db.query.mockResolvedValueOnce({
        rows: [inventoryRow({ available_qty: 5, low_stock_threshold: 10 })],
      })

      const response = await request(app).get('/api/inventory').expect(200)
      const item = response.body.data.inventory[0]

      expect(item.isLowStock).toBe(true)
      expect(item.stockStatus).toBe('LOW_STOCK')
    })

    it('marks available_qty equal to threshold as low stock (inclusive <=)', async () => {
      db.query.mockResolvedValueOnce({
        rows: [inventoryRow({ available_qty: 10, low_stock_threshold: 10 })],
      })

      const response = await request(app).get('/api/inventory').expect(200)
      const item = response.body.data.inventory[0]

      expect(item.isLowStock).toBe(true)
      expect(item.stockStatus).toBe('LOW_STOCK')
    })

    it('marks available_qty above threshold as in stock', async () => {
      db.query.mockResolvedValueOnce({
        rows: [inventoryRow({ available_qty: 11, low_stock_threshold: 10 })],
      })

      const response = await request(app).get('/api/inventory').expect(200)
      const item = response.body.data.inventory[0]

      expect(item.isLowStock).toBe(false)
      expect(item.isInStock).toBe(true)
      expect(item.stockStatus).toBe('IN_STOCK')
    })

    it('falls back to default threshold when settings value is null', async () => {
      db.query.mockResolvedValueOnce({
        rows: [inventoryRow({ available_qty: 10, low_stock_threshold: null })],
      })

      const response = await request(app).get('/api/inventory').expect(200)
      const item = response.body.data.inventory[0]

      expect(item.low_stock_threshold).toBe(10)
      expect(item.isLowStock).toBe(true)
    })
  })

  describe('PATCH /api/inventory/product/:productId', () => {
    it('should update inventory quantity', async () => {
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
