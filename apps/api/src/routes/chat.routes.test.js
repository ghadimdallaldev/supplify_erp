import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatRoutes } from './chat.routes.js';
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js';

describe('Chat Routes', () => {
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
    app.use('/api/chat', chatRoutes);
    const { errorHandler } = await import('../middlewares/errorHandler.js');
    app.use(errorHandler);
  });

  describe('GET /api/chat/conversations', () => {
    it('should return list of conversations', async () => {
      db.query.mockResolvedValueOnce({
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

  describe('POST /api/chat/messages', () => {
    it('should send a message', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'msg-1', conversation_id: 'conv-1', message: 'Hello' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'msg-1', conversation_id: 'conv-1', message: 'Hello' }],
        });

      const response = await request(app)
        .post('/api/chat/messages')
        .send({
          conversationId: 'conv-1',
          message: 'Hello',
        })
        .expect(201);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.message.message).toBe('Hello');
    });
  });
});
