import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentsRoutes } from './payments.routes.js';
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js';

describe('Payments Routes', () => {
  let app;
  let db;

  beforeEach(async () => {
    clearAllMocks();
    db = setupMocks();
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.requestId = 'test-request-id';
      req.user = mockUser;
      req.userData = { ...mockUser };
      next();
    });
    app.use('/api/payments', paymentsRoutes);
    const { errorHandler } = await import('../middlewares/errorHandler.js');
    app.use(errorHandler);
  });

  describe('GET /api/payments', () => {
    it('should return list of payments', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'payment-1',
            invoice_id: 'invoice-1',
            amount: 100.50,
            payment_method: 'CASH',
            paid_at: new Date(),
          },
        ],
      });

      const response = await request(app)
        .get('/api/payments')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.payments).toHaveLength(1);
    });
  });

  describe('POST /api/payments', () => {
    it('should create a payment', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'invoice-1', restaurant_id: 'restaurant-1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'payment-1', invoice_id: 'invoice-1', amount: 100.50 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'invoice-1', status: 'PAID' }],
        });

      const response = await request(app)
        .post('/api/payments')
        .send({
          invoiceId: 'invoice-1',
          amount: 100.50,
          paymentMethod: 'CASH',
        })
        .expect(201);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.payment.amount).toBe(100.50);
    });
  });
});
