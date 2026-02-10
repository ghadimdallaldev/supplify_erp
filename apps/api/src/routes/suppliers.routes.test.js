import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { suppliersRoutes } from './suppliers.routes.js';
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js';

describe('Suppliers Routes', () => {
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
    app.use('/api/suppliers', suppliersRoutes);
    const { errorHandler } = await import('../middlewares/errorHandler.js');
    app.use(errorHandler);
  });

  describe('GET /api/suppliers', () => {
    it('should return list of suppliers', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'supplier-1',
            name: 'Test Supplier',
            email: 'supplier@example.com',
            phone: '1234567890',
          },
        ],
      });

      const response = await request(app)
        .get('/api/suppliers')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.suppliers).toHaveLength(1);
    });
  });

  describe('GET /api/suppliers/:id', () => {
    it('should return supplier details', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'supplier-1',
          name: 'Test Supplier',
          email: 'supplier@example.com',
        }],
      });

      const response = await request(app)
        .get('/api/suppliers/supplier-1')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.supplier.id).toBe('supplier-1');
    });
  });
});
