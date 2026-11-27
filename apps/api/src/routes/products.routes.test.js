import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

// Setup mocks at top level - must be before any imports
// Use a factory function that doesn't reference variables
vi.mock('../lib/tenant-feature-gate.js', () => {
  const pass = (key) => Object.assign((_req, _res, next) => next(), { featureKey: key })
  return {
    tenantFeatureGate: pass,
    publicTenantFeatureGate: pass,
    platformFeatureGate: pass,
  }
})

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

// The platform tree comes from the seed migration, not from the mocked db.
vi.mock('../lib/category-matcher.js', async (importOriginal) => {
  const actual = await importOriginal()
  const { loadSeedCategories } = await import('../test/category-seed.js')
  return { ...actual, loadPlatformCategories: vi.fn(async () => loadSeedCategories()) }
})

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, current: 0, limit: 100, isOverLimit: false }),
  incrementUsage: vi.fn().mockResolvedValue(true),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock('../services/supplier-stock.service.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getSupplierProductAvailableQty: vi.fn().mockResolvedValue(25),
    overlayProductRowsWithAuthoritativeStock: vi.fn(async (rows) => rows),
  }
})

vi.mock('../services/resolve-product-price.service.js', () => ({
  enrichProductsWithResolvedPricing: vi.fn(async (rows) => rows),
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
  deleteCacheByPrefix: vi.fn().mockResolvedValue(undefined),
  getRedisClient: vi.fn(() => null),
}))

vi.mock('../lib/warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('supplier_id'),
}))

// Now import routes (mocks are set up)
import { productsRoutes, __resetProductTagsColumnCache } from './products.routes.js'

const LEAF_ID = '22222222-2222-4222-8222-222222222222'

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
    it('returns the platform tree: departments with their categories', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'd-2',
            slug: 'dept-food',
            name: 'Food',
            parent_category_id: null,
            display_order: 2,
          },
          {
            id: 'd-1',
            slug: 'dept-drinks',
            name: 'Drinks',
            parent_category_id: null,
            display_order: 1,
          },
          {
            id: 'c-1',
            slug: 'beverages',
            name: 'Beverages',
            name_ar: 'مشروبات',
            icon_key: 'coffee',
            parent_category_id: 'd-1',
            display_order: 1,
            product_count: 3,
          },
          { id: 'c-2', slug: 'bread', name: 'Bread', parent_category_id: 'd-2', product_count: 0 },
        ],
      })

      const response = await request(app).get('/api/products/categories').expect(200)

      expect(response.body.ok).toBe(true)
      const { departments } = response.body.data
      expect(departments.map((d) => d.slug)).toEqual(['dept-drinks', 'dept-food'])
      expect(departments[0]).toMatchObject({ product_count: 3 })
      expect(departments[0].categories).toEqual([
        expect.objectContaining({
          id: 'c-1',
          name_ar: 'مشروبات',
          icon_key: 'coffee',
          product_count: 3,
        }),
      ])
      // Admin/supplier view (no restaurant) keeps empty nodes.
      expect(departments[1].categories[0]).toMatchObject({ id: 'c-2', product_count: 0 })
      const sql = String(db.query.mock.calls[0][0])
      expect(sql).toContain('COUNT(DISTINCT p.id)')
      expect(sql).toContain('pc.supplier_id IS NULL')
    })
  })

  describe('removed supplier /categories CRUD', () => {
    it('old supplier /categories CRUD is 404', async () => {
      const id = '11111111-1111-4111-8111-111111111111'
      await request(app).post('/api/products/categories').send({ name: 'Mine' }).expect(404)
      await request(app).patch(`/api/products/categories/${id}`).send({ name: 'X' }).expect(404)
      await request(app).delete(`/api/products/categories/${id}`).expect(404)
      expect(db.query).not.toHaveBeenCalled()
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

    it('filters by a department or category id', async () => {
      const categoryId = '00000000-0000-4000-8000-000000000001'
      db.query
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        })
        .mockResolvedValueOnce({
          rows: [{ total: '0' }],
        })

      const response = await request(app).get(`/api/products?categoryId=${categoryId}`).expect(200)

      expect(response.body.ok).toBe(true)
      const [listSql, listParams] = db.query.mock.calls[0]
      expect(String(listSql)).toContain('lc.parent_category_id = $1::uuid')
      expect(listParams).toContain(categoryId)
    })

    it('the old category= text filter is gone', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })

      await request(app).get('/api/products?category=Dairy').expect(200)

      const [listSql, listParams] = db.query.mock.calls[0]
      expect(String(listSql)).not.toContain('p.category =')
      expect(listParams).not.toContain('Dairy')
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
      const stock = await import('../services/supplier-stock.service.js')
      vi.mocked(stock.overlayProductRowsWithAuthoritativeStock).mockResolvedValueOnce([
        { id: 'p1', available_qty: 5, created_at: '2026-01-01T00:00:00.000Z' },
        { id: 'p2', available_qty: 0, created_at: '2026-01-01T00:00:00.000Z' },
      ])

      // inStock offset fill: one batch query (no separate COUNT)
      db.query.mockResolvedValueOnce({
        rows: [
          { id: 'p1', available_qty: 5, created_at: '2026-01-01T00:00:00.000Z' },
          { id: 'p2', available_qty: 0, created_at: '2026-01-01T00:00:00.000Z' },
        ],
        rowCount: 2,
      })

      const response = await request(app).get('/api/products?inStock=true').expect(200)

      expect(stock.overlayProductRowsWithAuthoritativeStock).toHaveBeenCalled()
      expect(response.body.data.products).toHaveLength(1)
      expect(response.body.data.products[0].id).toBe('p1')
      expect(response.body.data.pagination.total).toBe(1)
    })
  })

  describe('GET /api/products/:id', () => {
    it('should return product by id', async () => {
      db.query
        .mockResolvedValueOnce({
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
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // restaurant access link

      const response = await request(app).get('/api/products/prod-1').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.product.id).toBe('prod-1')
      expect(response.body.data.product.available_qty).toBe(25)
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
        .mockResolvedValueOnce({
          rows: [{ id: LEAF_ID, name: 'Cheese', parent_category_id: 'dept-1', is_leaf: true }],
        }) // leaf category check
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
        .mockResolvedValueOnce({ rows: [] }) // replace product shelves

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
          category: 'legacy text is ignored',
          category_id: LEAF_ID,
        })
        .expect(201)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.product.name).toBe('New Product')
      expect(response.body.data.product.shelf_ids).toEqual([])
      expect(db.withTransaction).toHaveBeenCalledTimes(1)
      const [insertSql, insertValues] = db.query.mock.calls[2]
      expect(insertSql).toMatch(
        /INSERT INTO product \(supplier_id, sku, name, name_ar, description, description_ar, brand, category_id,/
      )
      expect(insertValues).toContain(LEAF_ID)
      expect(insertValues).not.toContain('legacy text is ignored')
    })

    it('create without category is 400', async () => {
      const response = await request(app)
        .post('/api/products')
        .send({ sku: 'SKU002', name: 'No category' })
        .expect(400)
      expect(response.body.error).toMatchObject({
        name: 'VALIDATION_ERROR',
        code: 'chooseCategory',
      })
      expect(db.withTransaction).not.toHaveBeenCalled()
    })

    it('department id rejected', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: LEAF_ID, name: 'Dairy', parent_category_id: null, is_leaf: false }],
      })
      const response = await request(app)
        .post('/api/products')
        .send({ sku: 'SKU003', name: 'Dept', category_id: LEAF_ID })
        .expect(400)
      expect(response.body.error.code).toBe('categoryNotLeaf')
      expect(db.withTransaction).not.toHaveBeenCalled()
    })

    it('foreign shelf rejected', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: LEAF_ID, name: 'Cheese', parent_category_id: 'dept-1', is_leaf: true }],
        })
        .mockResolvedValueOnce({ rows: [] }) // none of the shelves are the supplier's
      const response = await request(app)
        .post('/api/products')
        .send({
          sku: 'SKU004',
          name: 'Shelved',
          category_id: LEAF_ID,
          shelfIds: ['33333333-3333-4333-8333-333333333333'],
        })
        .expect(400)
      expect(response.body.error.code).toBe('foreignShelf')
      expect(db.query.mock.calls[1][1]).toEqual([
        ['33333333-3333-4333-8333-333333333333'],
        'supplier-1',
      ])
      expect(db.withTransaction).not.toHaveBeenCalled()
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

    it('rejects initial stock on another supplier warehouse', async () => {
      db.query.mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .post('/api/products')
        .send({
          sku: 'SKU-WH',
          name: 'Warehouse Product',
          category_id: LEAF_ID,
          warehouse_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          initialStock: 12,
        })
        .expect(400)

      expect(response.body.ok).toBe(false)
      expect(response.body.error.message).toMatch(/Warehouse not found/)
      expect(db.withTransaction).not.toHaveBeenCalled()
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
        .mockResolvedValueOnce({ rows: [] }) // shelf ids for the response

      const response = await request(app)
        .patch('/api/products/prod-1')
        .send({
          name: 'Updated Product',
        })
        .expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.product.name).toBe('Updated Product')
      expect(response.body.data.product.shelf_ids).toEqual([])
    })

    it('update with category null is 400 chooseCategory', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'prod-1', supplier_id: 'supplier-1' }] })
      const response = await request(app)
        .patch('/api/products/prod-1')
        .send({ category_id: null })
        .expect(400)
      expect(response.body.error.code).toBe('chooseCategory')
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
