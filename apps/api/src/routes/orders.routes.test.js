import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js';

// Setup mocks at top level
vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn();
  const withTransactionMock = vi.fn();
  return {
    query: queryMock,
    withTransaction: withTransactionMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
    __withTransactionMock: withTransactionMock,
  };
});

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser };
    next();
  }),
  requireRole: () => (req, res, next) => next(),
  requireOwnership: () => (req, res, next) => next(),
  checkPermission: vi.fn().mockResolvedValue(true),
  upsertUser: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
  getUserBySub: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
}));

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 100, isOverLimit: false }),
  incrementUsage: vi.fn().mockResolvedValue(true),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../services/notification.service.js', () => ({
  notifyOrderStatusChange: vi.fn(),
  createNotification: vi.fn(),
  sendNotification: vi.fn(),
}));

// Import routes after mocks
import { ordersRoutes } from './orders.routes.js';

describe('Orders Routes', () => {
  let app;
  let db;

  beforeEach(async () => {
    clearAllMocks();
    db = setupMocks();
    const dbModule = await import('../lib/db.js');
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args));
    vi.mocked(dbModule.withTransaction).mockImplementation((handler) => db.withTransaction(handler));
    
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.requestId = 'test-request-id';
      req.user = mockUser;
      req.userData = { ...mockUser, role: 'RESTAURANT', email: 'restaurant@example.com' };
      next();
    });
    app.use('/api/orders', ordersRoutes);
    const { errorHandler } = await import('../middlewares/errorHandler.js');
    app.use(errorHandler);
  });

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
              total_amount: 100.50,
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
        });

      const response = await request(app)
        .get('/api/orders')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.orders).toHaveLength(1);
    });

    it('should filter orders by status', async () => {
      // Mock: restaurant lookup, orders query (empty result), count query
      // When orderIds is empty, no items query is made, but count query is still made
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'restaurant-1' }], // Restaurant lookup for RESTAURANT role
        })
        .mockResolvedValueOnce({
          rows: [], // No orders with this status - orderIds will be empty
        })
        .mockResolvedValueOnce({
          rows: [{ total: '0' }], // Count query for pagination (even when no orders)
        });
        // No items query needed when orderIds.length === 0

      const response = await request(app)
        .get('/api/orders?status=PLACED')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.orders).toHaveLength(0);
    });
  });

  describe('GET /api/orders/:id', () => {
    it('should return order details', async () => {
      // Mock: order query, restaurant lookup (for RESTAURANT role), then order items query
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'order-1',
            restaurant_id: 'restaurant-1',
            status: 'PENDING',
            total_amount: 100.50,
            restaurant_name: 'Test Restaurant',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'restaurant-1' }], // Restaurant lookup for permission check
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
        });

      const response = await request(app)
        .get('/api/orders/order-1')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.order.id).toBe('order-1');
      expect(response.body.data.order.items).toHaveLength(1);
    });

    it('should return 404 for non-existent order', async () => {
      // Mock: order query returns empty (order not found)
      // The route queries: order with restaurant join (returns empty), then throws NotFoundError
      // The error handler should catch NotFoundError and return 404
      db.query.mockResolvedValueOnce({
        rows: [], // Order not found - route should throw NotFoundError
      });
      // No restaurant lookup needed since order query returns empty and NotFoundError is thrown immediately

      const response = await request(app)
        .get('/api/orders/non-existent')
        .expect(404);

      expect(response.body.ok).toBe(false);
      expect(response.body.error.name).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/orders', () => {
    it('should create a new order', async () => {
      const productId = '550e8400-e29b-41d4-a716-446655440000';
      const supplierId = '660e8400-e29b-41d4-a716-446655440001';
      const restaurantId = '770e8400-e29b-41d4-a716-446655440002';
      
      // Mock: restaurant lookup, product query (for each item), checkLimit, then transaction queries
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: restaurantId }], // Restaurant lookup
        })
        .mockResolvedValueOnce({
          rows: [{ 
            id: productId, 
            supplier_id: supplierId,
            sku: 'SKU001',
            current_price: 10.05,
            currency: 'USD',
          }], // Product query for first item
        });

      const { checkLimit } = await import('../lib/subscription.js');
      vi.mocked(checkLimit).mockResolvedValueOnce({ 
        allowed: true, 
        current: 0, 
        limit: 100, 
        isOverLimit: false,
        isUnlimited: false,
      });

      // Mock transaction - withTransaction is used, and it returns createdOrders array
      const { withTransaction } = await import('../lib/db.js');
      vi.mocked(withTransaction).mockImplementation(async (handler) => {
        const mockClient = {
          query: vi.fn()
            .mockResolvedValueOnce({ rows: [{ id: 'order-1', status: 'PLACED', total_amount: 0, restaurant_id: restaurantId }] }) // INSERT order
            .mockResolvedValueOnce({ rows: [{ available_qty: 100 }] }) // Check inventory
            .mockResolvedValueOnce({ rows: [{ id: 'item-1', order_id: 'order-1', product_id: productId, supplier_id: supplierId, quantity: 10, unit_price: 10.05, line_total: 100.50 }] }) // INSERT order item
            .mockResolvedValueOnce({}) // UPDATE inventory
            .mockResolvedValueOnce({ rows: [{ id: 'order-1', total_amount: 100.50 }] }), // UPDATE order total
        };
        const result = await handler(mockClient);
        // Return array of created orders (the handler returns createdOrders)
        return [{ id: 'order-1', status: 'PLACED', total_amount: 100.50, restaurant_id: restaurantId, items: [{ id: 'item-1', order_id: 'order-1', product_id: productId, supplier_id: supplierId, quantity: 10, unit_price: 10.05, line_total: 100.50 }] }];
      });

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
        .expect(201);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.order).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({
          items: [],
        })
        .expect(400);

      expect(response.body.ok).toBe(false);
    });
  });

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
          rows: [{ id: 'restaurant-1' }], // Restaurant lookup for permission check
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', status: 'CANCELLED', total_amount: 100.50 }], // UPDATE order (RESTAURANT can only cancel)
        });

      const response = await request(app)
        .patch('/api/orders/order-1')
        .send({
          status: 'CANCELLED',
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.order.status).toBe('CANCELLED');
    });

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
        });

      const response = await request(app)
        .patch('/api/orders/order-1')
        .send({
          status: 'INVALID_STATUS',
        })
        .expect(400);

      expect(response.body.ok).toBe(false);
    });
  });
});
