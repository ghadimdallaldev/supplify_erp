import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js';

// Mock db before importing routes
vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn();
  return {
    query: queryMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
  };
});

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser };
    next();
  }),
  requireRole: () => (req, res, next) => next(),
  optionalAuth: vi.fn(async (req, res, next) => {
    // optionalAuth should set req.userData if available, but not fail if missing
    // In tests, we set it in the middleware, so optionalAuth just passes through
    if (!req.userData) {
      req.userData = { ...mockUser };
    }
    next();
  }),
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
import { suppliersRoutes } from './suppliers.routes.js';

describe('Suppliers Routes', () => {
  let app;
  let db;

  beforeEach(async () => {
    clearAllMocks();
    db = setupMocks();
    
    // Sync db mocks
    const dbModule = await import('../lib/db.js');
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args));
    
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.requestId = 'test-request-id';
      req.user = mockUser;
      req.userData = { ...mockUser, role: 'RESTAURANT', email: 'test@example.com' };
      next();
    });
    app.use('/api/suppliers', suppliersRoutes);
    const { errorHandler } = await import('../middlewares/errorHandler.js');
    app.use(errorHandler);
  });

  describe('GET /api/suppliers', () => {
    it('should return list of suppliers', async () => {
      // Mock: restaurant lookup (for RESTAURANT role with userData), then suppliers query, then count query
      // The route checks if req.userData?.role === 'RESTAURANT' and queries restaurant table
      // Then queries suppliers, then queries count for pagination
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'restaurant-1' }], // Restaurant lookup when role is RESTAURANT
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'supplier-1',
              name: 'Test Supplier',
              contact_email: 'supplier@example.com',
              phone: '1234567890',
              product_count: 5,
              avg_price: 10.50,
              is_followed: false,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total: '1' }], // Count query for pagination
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
      // Mock: restaurant lookup (for RESTAURANT role), then supplier query
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'restaurant-1' }], // Restaurant lookup
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'supplier-1',
            name: 'Test Supplier',
            contact_email: 'supplier@example.com',
            phone: '1234567890',
            address: '123 Main St',
            product_count: 5,
            avg_price: 10.50,
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
