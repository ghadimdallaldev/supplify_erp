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

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal)
})

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, current: 0, limit: 100, isOverLimit: false }),
  checkAndIncrementUsage: vi.fn().mockResolvedValue({ allowed: true }),
  incrementUsage: vi.fn().mockResolvedValue(true),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
  requireFeature: () => (req, res, next) => next(),
  getTenantSubscription: vi.fn().mockResolvedValue({ plan_name: 'gold' }),
  getRecommendedPlanNames: vi.fn().mockResolvedValue([]),
  buildLimitExceededPayload: vi.fn(),
}))

vi.mock('../services/promotions.service.js', () => ({
  applyBestPromotionToOrder: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/audit.js', () => ({
  writeAuditLog: vi.fn(),
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
  notifyOrderStatusChange: vi.fn(),
  createNotification: vi.fn(),
  sendNotification: vi.fn(),
}))

vi.mock('../services/warehouseRouting.js', () => ({
  assignWarehousesToOrder: vi.fn().mockResolvedValue({ mode: 'single', assignments: [] }),
}))

vi.mock('../services/warehouseInventory.js', () => ({
  syncWarehouseFulfillmentOnOrderStatus: vi.fn().mockResolvedValue(undefined),
  releaseInventoryForOrder: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/resolve-product-price.service.js', () => ({
  resolveProductPricesBatch: vi.fn(),
}))

vi.mock('../services/supplier-inventory.service.js', () => ({
  assertAndDeductSupplierStock: vi.fn().mockResolvedValue(undefined),
  restoreSupplierStockForOrder: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/restaurant-workspace.js', () => ({
  assertBuyerCanOrderFromSuppliers: vi.fn().mockResolvedValue(undefined),
}))

// Import routes after mocks
import { ordersRoutes } from './orders.routes.js'

describe('Orders Routes', () => {
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
      req.userData = { ...mockUser, role: 'RESTAURANT', email: 'restaurant@example.com' }
      next()
    })
    app.use('/api/orders', ordersRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/orders', () => {
    it('should return list of orders for restaurant', async () => {
      // Mock: restaurant lookup, orders query, order items query
      // The orders query uses DISTINCT and LEFT JOINs, so we need to mock it properly
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'restaurant-1' }], // Restaurant lookup
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'order-1',
              restaurant_id: 'restaurant-1',
              status: 'PENDING',
              total_amount: 100.5,
              created_at: new Date(),
              restaurant_name: 'Test Restaurant',
              restaurant_slug: 'test-restaurant',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'item-1',
              order_id: 'order-1',
              product_id: 'prod-1',
              quantity: 10,
              product_name: 'Test Product',
              product_sku: 'SKU001',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total: '1' }], // Count query for pagination
        })

      const response = await request(app).get('/api/orders').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.orders).toHaveLength(1)
    })

    it('should filter orders by search query', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'order-abc-12345678',
              restaurant_id: 'restaurant-1',
              status: 'PLACED',
              total_amount: 50,
              created_at: new Date(),
              placed_at: new Date(),
              restaurant_name: 'Cafe Roma',
              restaurant_slug: 'cafe-roma',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })

      const response = await request(app).get('/api/orders?q=Cafe').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.orders).toHaveLength(1)
      const listSql = db.query.mock.calls[0][0]
      expect(listSql).toContain('ILIKE')
      expect(listSql).toContain('r.name')
    })

    it('should filter orders by status', async () => {
      // getRequestTenant is mocked, so no restaurant lookup; mock orders query (empty) and count
      db.query
        .mockResolvedValueOnce({
          rows: [], // No orders with this status - orderIds will be empty
        })
        .mockResolvedValueOnce({
          rows: [{ total: '0' }], // Count query for pagination (even when no orders)
        })

      const response = await request(app).get('/api/orders?status=PLACED').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.orders).toHaveLength(0)
    })
  })

  describe('GET /api/orders/:id', () => {
    it('should return order details', async () => {
      // getRequestTenant is mocked with restaurant-1, so no restaurant lookup; mock order query then order items
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'order-1',
              restaurant_id: 'restaurant-1',
              status: 'PENDING',
              total_amount: 100.5,
              restaurant_name: 'Test Restaurant',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'item-1',
              order_id: 'order-1',
              product_id: 'prod-1',
              quantity: 10,
              unit_price: 10.05,
              product_name: 'Test Product',
              product_sku: 'SKU001',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })

      const response = await request(app).get('/api/orders/order-1').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.order.id).toBe('order-1')
      expect(response.body.data.order.items).toHaveLength(1)
      expect(response.body.data.order.appliedPromotion).toBeNull()
    })

    it('should include applied promotion when promotion_usages exists', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'order-1',
              restaurant_id: 'restaurant-1',
              status: 'PLACED',
              total_amount: 90,
              restaurant_name: 'Test Restaurant',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'item-1',
              order_id: 'order-1',
              product_id: 'prod-1',
              quantity: 10,
              unit_price: 10,
              product_name: 'Test Product',
              product_sku: 'SKU001',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              promotion_id: 'promo-1',
              discount_applied: 10,
              promotion_name: 'Summer Sale',
              promotion_type: 'percentage_discount',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      const response = await request(app).get('/api/orders/order-1').expect(200)

      expect(response.body.data.order.appliedPromotion).toMatchObject({
        promotionId: 'promo-1',
        promotionName: 'Summer Sale',
        discountAmount: 10,
      })
    })

    it('should return 404 for non-existent order', async () => {
      // Mock: order query returns empty (order not found)
      // The route queries: order with restaurant join (returns empty), then throws NotFoundError
      // The error handler should catch NotFoundError and return 404
      db.query.mockResolvedValueOnce({
        rows: [], // Order not found - route should throw NotFoundError
      })
      // No restaurant lookup needed since order query returns empty and NotFoundError is thrown immediately

      const response = await request(app).get('/api/orders/non-existent').expect(404)

      expect(response.body.ok).toBe(false)
      expect(response.body.error.name).toBe('NOT_FOUND')
    })
  })

  describe('POST /api/orders', () => {
    it('should create a new order', async () => {
      const productId = '550e8400-e29b-41d4-a716-446655440000'
      const supplierId = '660e8400-e29b-41d4-a716-446655440001'
      const restaurantId = '770e8400-e29b-41d4-a716-446655440002'

      const rbac = await import('../lib/rbac.js')
      vi.mocked(rbac.getRestaurantIdForRequest).mockResolvedValueOnce(restaurantId)

      // Mock: supplier ids for buyer link guard, then product batch query
      db.query
        .mockResolvedValueOnce({
          rows: [{ supplier_id: supplierId }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: productId,
              supplier_id: supplierId,
              sku: 'SKU001',
              current_price: 10.05,
              currency: 'USD',
            },
          ],
        })

      const { resolveProductPricesBatch } = await import(
        '../services/resolve-product-price.service.js'
      )
      vi.mocked(resolveProductPricesBatch).mockResolvedValueOnce([
        {
          productId,
          supplierId,
          quantity: 10,
          unitPrice: 10.05,
          source: 'DEFAULT_PRICE',
          defaultPrice: 10.05,
          contractPriceId: null,
        },
      ])

      const { checkAndIncrementUsage } = await import('../lib/subscription.js')
      vi.mocked(checkAndIncrementUsage).mockResolvedValueOnce({
        allowed: true,
        current: 0,
        limit: 100,
      })

      // Mock transaction - withTransaction is used, and it returns createdOrders array
      const { withTransaction } = await import('../lib/db.js')
      vi.mocked(withTransaction).mockImplementation(async (handler) => {
        const mockClient = {
          query: vi
            .fn()
            .mockResolvedValueOnce({
              rows: [
                {
                  id: 'order-1',
                  status: 'PLACED',
                  total_amount: 0,
                  restaurant_id: restaurantId,
                },
              ],
            }) // INSERT order
            .mockResolvedValueOnce({
              rows: [
                {
                  id: 'item-1',
                  order_id: 'order-1',
                  product_id: productId,
                  supplier_id: supplierId,
                  quantity: 10,
                  unit_price: 10.05,
                  line_total: 100.5,
                },
              ],
            }) // INSERT order item
            .mockResolvedValueOnce({ rows: [] }) // UPDATE order total + placed_at
            .mockResolvedValueOnce({
              rows: [
                { id: supplierId, multi_warehouse_enabled: false, fulfillment_mode: 'single' },
              ],
            }), // supplier for warehouse assignment
        }
        return handler(mockClient)
      })

      const response = await request(app)
        .post('/api/orders')
        .send({
          items: [
            {
              productId: productId,
              quantity: 10,
            },
          ],
        })
        .expect(201)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.order).toBeDefined()
    })

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({
          items: [],
        })
        .expect(400)

      expect(response.body.ok).toBe(false)
    })
  })

  describe('PATCH /api/orders/:id', () => {
    it('should update order status', async () => {
      // Mock: order query, first item query (for supplier_id), restaurant lookup, UPDATE order
      // RESTAURANT can only cancel orders
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', status: 'PENDING', restaurant_id: 'restaurant-1' }], // Order query
        })
        .mockResolvedValueOnce({
          rows: [{ supplier_id: 'supplier-1' }], // First item query for supplier_id
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', status: 'CANCELLED', total_amount: 100.5 }], // UPDATE order
        })
        .mockResolvedValueOnce({
          rows: [{ product_id: 'prod-1', quantity: 1 }], // Restore stock: order items
        })
        .mockResolvedValueOnce({}) // Restore stock: inventory update
        .mockResolvedValueOnce({
          rows: [{ id: 'restaurant-1', name: 'Test Restaurant' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'supplier-1', name: 'Test Supplier' }],
        })

      const response = await request(app)
        .patch('/api/orders/order-1')
        .send({
          status: 'CANCELLED',
        })
        .expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.order.status).toBe('CANCELLED')
    })

    it('should reject invalid status', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', status: 'PENDING', restaurant_id: 'restaurant-1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ supplier_id: 'supplier-1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'restaurant-1' }],
        })

      const response = await request(app)
        .patch('/api/orders/order-1')
        .send({
          status: 'INVALID_STATUS',
        })
        .expect(400)

      expect(response.body.ok).toBe(false)
    })
  })
})
