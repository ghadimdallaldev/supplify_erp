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

// Import routes after mocks
import { pricesRoutes } from './prices.routes.js';

describe('Prices Routes', () => {
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
      req.userData = { ...mockUser, role: 'SUPPLIER', email: 'supplier@example.com' };
      next();
    });
    app.use('/api/prices', pricesRoutes);
    const { errorHandler } = await import('../middlewares/errorHandler.js');
    app.use(errorHandler);
  });

  describe('GET /api/prices/product/:productId', () => {
    it('should return product prices', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'price-1',
            product_id: 'prod-1',
            amount: 10.50,
            currency: 'USD',
            product_name: 'Test Product',
            sku: 'SKU001',
          },
        ],
      });

      const response = await request(app)
        .get('/api/prices/product/prod-1')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.prices).toHaveLength(1);
    });
  });

  describe('POST /api/prices', () => {
    it('should create a price', async () => {
      // Mock: product ownership check, then INSERT price
      const productId = '550e8400-e29b-41d4-a716-446655440000';
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: productId, supplier_id: 'supplier-1', contact_email: 'supplier@example.com' }], // Product ownership check
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'price-1', product_id: productId, amount: 10.50, currency: 'USD' }], // INSERT price
        });

      const response = await request(app)
        .post('/api/prices')
        .send({
          productId: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID format
          amount: 10.50,
          currency: 'USD',
          minQty: 1,
        })
        .expect(201);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.price.amount).toBe(10.50);
    });
  });
});
