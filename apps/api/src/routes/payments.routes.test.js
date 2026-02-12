import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js';

// Mock db before importing routes
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
import { paymentsRoutes } from './payments.routes.js';

describe('Payments Routes', () => {
  let app;
  let db;

  beforeEach(async () => {
    clearAllMocks();
    db = setupMocks();
    
    // Sync db mocks
    const dbModule = await import('../lib/db.js');
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args));
    vi.mocked(dbModule.withTransaction).mockImplementation((...args) => db.withTransaction(...args));
    
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.requestId = 'test-request-id';
      req.user = mockUser;
      req.userData = { ...mockUser, role: 'SUPPLIER', email: 'supplier@example.com' };
      next();
    });
    app.use('/api/payments', paymentsRoutes);
    const { errorHandler } = await import('../middlewares/errorHandler.js');
    app.use(errorHandler);
  });

  describe('GET /api/payments/invoice/:invoiceId', () => {
    it('should return list of payments for invoice', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'payment-1',
            invoice_id: 'invoice-1',
            amount: 100.50,
            payment_method: 'CASH',
            payment_date: new Date(),
          },
        ],
      });

      const response = await request(app)
        .get('/api/payments/invoice/invoice-1')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.payments).toHaveLength(1);
    });
  });

  describe('POST /api/payments', () => {
    it('should create a payment', async () => {
      // Mock: invoice lookup (with supplier join), then payment insert
      // The route doesn't use withTransaction, it queries directly
      db.query
        .mockResolvedValueOnce({
          rows: [{ 
            id: '00000000-0000-0000-0000-000000000001', 
            restaurant_id: 'restaurant-1',
            supplier_id: 'supplier-1',
            contact_email: 'supplier@example.com', // From supplier join
            total_amount: 100.50,
            balance_due: 100.50,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ 
            id: 'payment-1', 
            invoice_id: '00000000-0000-0000-0000-000000000001', 
            payment_amount: 100.50,
            payment_method: 'CASH',
            payment_number: 'PAY-1234567890',
            status: 'COMPLETED',
          }],
        });

      const response = await request(app)
        .post('/api/payments')
        .send({
          invoice_id: '00000000-0000-0000-0000-000000000001', // Valid UUID format
          payment_amount: 100.50,
          payment_method: 'CASH',
          payment_date: new Date().toISOString().split('T')[0], // Date string (YYYY-MM-DD)
        })
        .expect(201);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.payment.payment_amount).toBe(100.50);
    });
  });
});
