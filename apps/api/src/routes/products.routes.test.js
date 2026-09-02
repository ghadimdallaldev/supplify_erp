import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

// Setup mocks at top level - must be before any imports
// Use a factory function that doesn't reference variables
vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  const withTransactionMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: withTransactionMock,
    pool: { query: queryMock },
    __queryMock: queryMock, // Export for test access
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
  resolveAdminContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next(),
  getRequestTenant: vi.fn().mockResolvedValue(null),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
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

vi.mock('../lib/audit.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}))

// Now import routes (mocks are set up)
import { productsRoutes, __resetProductTagsColumnCache } from './products.routes.js'

describe('Products Routes', () => {
  let app
  let db
  let queryMock

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()

    // Sync db mocks
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    vi.mocked(dbModule.withTransaction).mockImplementation((...args) => db.withTransaction(...args))

    // Get the mocked query function from the module
    queryMock = dbModule.__queryMock || dbModule.query
    queryMock = dbModule.__queryMock || dbModule.query
    // Sync the mock with our test mock
    vi.mocked(queryMock).mockImplementation((...args) => db.query(...args))
    vi.mocked(dbModule.withTransaction).mockImplementation((handler) => db.withTransaction(handler))
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.user = mockUser
      req.userData = { ...mockUser, email: 'test@example.com', role: 'SUPPLIER' }
      next()
    })
    app.use('/api/products', productsRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/products/tags', () => {
    it('should return empty tags when product.tags column does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }) // productHasTagsColumn() returns no column

      const response = await request(app).get('/api/products/tags').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.tags).toEqual([])
    })
  })

  describe('GET /api/products/categories', () => {
    it('should return product categories', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'cat-1',
            name: 'Beverages',
            slug: 'beverages',
            description: 'Drinks',
            display_order: 1,
          },
          { id: 'cat-2', name: 'Food', slug: 'food', description: 'Food items', display_order: 2 },
        ],
      })

      const response = await request(app).get('/api/products/categories').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.categories).toHaveLength(2)
      expect(response.body.data.categories[0].name).toBe('Beverages')
    })
  })

  describe('GET /api/products', () => {
    it('should return list of products', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'prod-1',
              sku: 'SKU001',
              name: 'Test Product',
              description: 'Test Description',
              supplier_id: 'supplier-1',
              category_id: 'cat-1',
              created_at: new Date(),
              supplier_name: 'Test Supplier',
              available_qty: 10,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ total: '1' }],
        })

      const response = await request(app).get('/api/products').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.products).toHaveLength(1)
      expect(response.body.data.products[0].name).toBe('Test Product')
    })

    it('should filter products by category', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        })
        .mockResolvedValueOnce({
          rows: [{ total: '0' }],
        })

      const response = await request(app).get('/api/products?category=cat-1').expect(200)

      expect(response.body.ok).toBe(true)
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('category'), expect.any(Array))
    })

    it('should filter products by search query', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // productHasSearchVectorColumn()
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        })
        .mockResolvedValueOnce({
          rows: [{ total: '0' }],
        })

      await request(app).get('/api/products?q=test').expect(200)

      const listSql = db.query.mock.calls.find((call) =>
        String(call[0]).includes('FROM product p')
      )?.[0]
      expect(listSql).toMatch(/LIKE|search_vector/)
      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.stringMatching(/test|%test%/i)])
      )
    })

    it('should omit inventory join by default (available_qty placeholder)', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })

      await request(app).get('/api/products').expect(200)

      const listSql = db.query.mock.calls[0][0]
      expect(listSql).not.toContain('FROM inventory')
      expect(listSql).toContain('0::int as available_qty')
    })

    it('should join inventory when includeStock=true', async () => {
      const rbac = await import('../lib/rbac.js')
      vi.mocked(rbac.getRequestTenant).mockResolvedValueOnce({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
      })

      db.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })

      await request(app).get('/api/products?includeStock=true').expect(200)

      const listSql = db.query.mock.calls[0][0]
      expect(listSql).toContain('FROM inventory i')
      expect(listSql).toContain('inv_p.supplier_id = $1')
      expect(listSql).toContain('COALESCE(inv.total_available, 0) as available_qty')
      expect(listSql).not.toContain('0::int as available_qty')
    })

    it('uses explicit product list columns instead of p.*', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })

      await request(app).get('/api/products').expect(200)

      const listSql = String(db.query.mock.calls[0][0])
      expect(listSql).not.toMatch(/\bp\.\*\b/)
      expect(listSql).toContain('p.image_thumb_url')
      expect(listSql).toContain('pr.amount as current_price')
    })

    it('should filter to in-stock rows when inStock=true', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })

      await request(app).get('/api/products?inStock=true').expect(200)

      const listSql = db.query.mock.calls[0][0]
      expect(listSql).toContain('inv.total_available > 0')
    })
  })

  describe('GET /api/products/:id', () => {
    it('should return product by id', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'prod-1',
            sku: 'SKU001',
            name: 'Test Product',
            description: 'Test Description',
            supplier_id: 'supplier-1',
          },
        ],
      })

      const response = await request(app).get('/api/products/prod-1').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.product.id).toBe('prod-1')
    })

    it('should return 404 when supplier cannot access another suppliers product', async () => {
      const rbac = await import('../lib/rbac.js')
      vi.mocked(rbac.getRequestTenant).mockResolvedValueOnce({
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
      })
      vi.mocked(rbac.getSupplierIdForRequest).mockResolvedValueOnce('supplier-other')

      db.query.mockResolvedValueOnce({
        rows: [{ id: 'prod-1', sku: 'SKU001', name: 'Test Product', supplier_id: 'supplier-1' }],
      })

      const response = await request(app).get('/api/products/prod-1').expect(404)

      expect(response.body.ok).toBe(false)
      expect(response.body.error.name).toBe('NOT_FOUND')
    })

    it('should return 404 for non-existent product', async () => {
      db.query.mockResolvedValueOnce({
        rows: [],
      })

      const response = await request(app).get('/api/products/non-existent').expect(404)

      expect(response.body.ok).toBe(false)
    })
  })

  describe('POST /api/products', () => {
    it('should create a new product', async () => {
      __resetProductTagsColumnCache() // ensure productHasTagsColumn runs (info_schema query)
      db.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // productHasTagsColumn() when uncached - no tags column
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'prod-1',
              sku: 'SKU001',
              name: 'New Product',
              supplier_id: 'supplier-1',
              created_at: new Date(),
            },
          ],
        }) // INSERT product
        .mockResolvedValueOnce({}) // COMMIT

      const { checkLimit, incrementUsage } = await import('../lib/subscription.js')
      vi.mocked(checkLimit).mockResolvedValueOnce({
        allowed: true,
        current: 0,
        limit: 100,
        isOverLimit: false,
        isUnlimited: false,
      })
      vi.mocked(incrementUsage).mockResolvedValueOnce(true)

      const response = await request(app)
        .post('/api/products')
        .send({
          sku: 'SKU001',
          name: 'New Product',
          description: 'Product description',
          supplier_id: 'supplier-1',
        })
        .expect(201)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.product.name).toBe('New Product')
    })

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/products')
        .send({
          name: 'Product without SKU',
        })
        .expect(400)

      expect(response.body.ok).toBe(false)
    })
  })

  describe('PATCH /api/products/:id', () => {
    it('should update existing product', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'prod-1', supplier_id: 'supplier-1', contact_email: 'test@example.com' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'prod-1', name: 'Updated Product', sku: 'SKU001' }],
        })

      const response = await request(app)
        .patch('/api/products/prod-1')
        .send({
          name: 'Updated Product',
        })
        .expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.product.name).toBe('Updated Product')
    })

    it('should return 404 for non-existent product', async () => {
      // Mock: product query returns empty (product not found)
      // The route validates the body first, then checks if product exists
      // If empty, throws NotFoundError which error handler should catch and return 404
      db.query.mockResolvedValueOnce({
        rows: [], // Product not found - route throws NotFoundError
      })

      const response = await request(app)
        .patch('/api/products/non-existent')
        .send({ name: 'Updated Product' }) // Valid body that passes validation
        .expect(404)

      expect(response.body.ok).toBe(false)
      expect(response.body.error.name).toBe('NOT_FOUND')
    })
  })

  // Note: DELETE route doesn't exist in products.routes.js
  // Products are typically soft-deleted or archived, not hard-deleted
})
