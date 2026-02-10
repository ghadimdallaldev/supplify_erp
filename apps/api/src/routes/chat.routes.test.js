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
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 100, isOverLimit: false }),
  checkUsageWithWarning: vi.fn().mockResolvedValue({ 
    current: 0, 
    limit: 100, 
    isUnlimited: false, 
    isOverLimit: false, 
    isWarning: false, 
    usagePercent: 0 
  }),
  incrementUsage: vi.fn().mockResolvedValue(true),
}));

// Import routes after mocks
import { chatRoutes } from './chat.routes.js';

describe('Chat Routes', () => {
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
      req.userData = { ...mockUser, role: 'SUPPLIER', email: 'supplier@example.com' };
      next();
    });
    app.use('/api/chat', chatRoutes);
    const { errorHandler } = await import('../middlewares/errorHandler.js');
    app.use(errorHandler);
  });

  describe('GET /api/chat/conversations', () => {
    it('should return list of conversations', async () => {
      // Mock: supplier lookup, then conversations query
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'supplier-1' }], // Supplier lookup
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'conv-1',
              restaurant_id: 'restaurant-1',
              supplier_id: 'supplier-1',
              last_message: 'Hello',
              last_message_at: new Date(),
            },
          ],
        });

      const response = await request(app)
        .get('/api/chat/conversations')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.conversations).toHaveLength(1);
    });
  });

  describe('POST /api/chat/conversations/:conversationId/messages', () => {
    it('should send a message', async () => {
      // Create a new app instance with RESTAURANT role for this test
      const appRestaurant = express();
      appRestaurant.use(express.json());
      appRestaurant.use((req, res, next) => {
        req.requestId = 'test-request-id';
        req.user = mockUser;
        req.userData = { ...mockUser, role: 'RESTAURANT', email: 'restaurant@example.com' };
        next();
      });
      appRestaurant.use('/api/chat', chatRoutes);
      const { errorHandler } = await import('../middlewares/errorHandler.js');
      appRestaurant.use(errorHandler);

      // Mock: restaurant lookup, usage check, conversation check, restaurant verification, message insert
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'restaurant-1' }], // Restaurant lookup for tenantId
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'conv-1', restaurant_id: 'restaurant-1', supplier_id: 'supplier-1' }], // Conversation check
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'restaurant-1' }], // Restaurant verification (must match conversation.restaurant_id)
        })
        .mockResolvedValueOnce({
          rows: [{ 
            id: 'msg-1', 
            conversation_id: 'conv-1', 
            content: 'Hello',
            sender_id: 'restaurant-1',
            sender_type: 'RESTAURANT',
            created_at: new Date(),
          }], // Message insert
        });

      const response = await request(appRestaurant)
        .post('/api/chat/conversations/conv-1/messages')
        .send({
          content: 'Hello',
        })
        .expect(201);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.message.content).toBe('Hello');
    });
  });
});
