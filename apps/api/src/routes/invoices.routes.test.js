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
import { invoicesRoutes } from './invoices.routes.js';

describe('Invoices Routes', () => {
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
      req.userData = { ...mockUser, role: 'SUPPLIER', email: 'supplier@example.com' }; // Use SUPPLIER role
      next();
    });
    app.use('/api/invoices', invoicesRoutes);
    const { errorHandler } = await import('../middlewares/errorHandler.js');
    app.use(errorHandler);
  });

  describe('GET /api/invoices', () => {
    it('should return list of invoices', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'invoice-1',
            order_id: 'order-1',
            total_amount: 100.50,
            status: 'PENDING',
          },
        ],
      });

      const response = await request(app)
        .get('/api/invoices')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.invoices).toHaveLength(1);
    });
  });

  describe('GET /api/invoices/:id', () => {
    it('should return invoice details', async () => {
      // Mock: invoice query, tenant check (supplier lookup), then line items query
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'invoice-1',
            order_id: 'order-1',
            total_amount: 100.50,
            status: 'PENDING',
            supplier_id: 'supplier-1',
            restaurant_id: 'restaurant-1',
            restaurant_name: 'Test Restaurant',
            supplier_name: 'Test Supplier',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'supplier-1' }], // Tenant scoping: supplier lookup by email must match invoice.supplier_id
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'line-1', invoice_id: 'invoice-1', product_id: 'prod-1', quantity: 10, unit_price: 10.05 },
          ],
        });

      const response = await request(app)
        .get('/api/invoices/invoice-1')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.invoice.id).toBe('invoice-1');
    });
  });
});
