import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

// Mock db before importing routes
vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      permissions: ['CHAT_VIEW'],
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
    }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next(),
  getRequestTenant: vi.fn().mockResolvedValue({
    tenantId: 'rest-1',
    tenantType: 'RESTAURANT',
    tenantName: 'Test Restaurant',
  }),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('rest-1'),
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
}))

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
  checkLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, current: 0, limit: 100, isOverLimit: false }),
  checkUsageWithWarning: vi.fn().mockResolvedValue({
    current: 0,
    limit: 100,
    isUnlimited: false,
    isOverLimit: false,
    isWarning: false,
    usagePercent: 0,
  }),
  checkAndIncrementUsage: vi.fn().mockResolvedValue({ allowed: true }),
  incrementUsage: vi.fn().mockResolvedValue(true),
}))

vi.mock('../services/notification.service.js', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    notifyMessageReceived: vi.fn().mockResolvedValue(null),
  }
})

// Import routes after mocks
import { chatRoutes } from './chat.routes.js'

describe('Chat Routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()

    // Sync db mocks
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.user = mockUser
      req.userData = { ...mockUser, role: 'SUPPLIER', email: 'supplier@example.com' }
      next()
    })
    app.use('/api/chat', chatRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/chat/conversations', () => {
    it('should return list of conversations', async () => {
      db.query
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
        })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })

      const response = await request(app).get('/api/chat/conversations').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.conversations).toHaveLength(1)
      expect(response.body.data.pagination).toEqual({ total: 1, limit: 50, offset: 0 })
    })

    it('applies limit, offset, and uses LATERAL for last message preview', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: 0 }] })

      await request(app).get('/api/chat/conversations?limit=25&offset=10').expect(200)

      const listSql = String(db.query.mock.calls[0][0])
      expect(listSql).toContain('LEFT JOIN LATERAL')
      expect(listSql).toContain('LIMIT $2 OFFSET $3')
      expect(db.query.mock.calls[0][1]).toEqual(['rest-1', 25, 10])
    })
  })

  describe('GET /api/chat/conversations/:conversationId/messages', () => {
    it('should return 404 when user is not a participant (tenant scoping)', async () => {
      const rbac = await import('../lib/rbac.js')
      vi.mocked(rbac.getSupplierIdForRequest).mockResolvedValueOnce('supplier-other')

      db.query.mockResolvedValueOnce({
        rows: [{ id: 'conv-1', supplier_id: 'supplier-1', restaurant_id: 'restaurant-1' }],
      })

      const response = await request(app).get('/api/chat/conversations/conv-1/messages').expect(404)

      expect(response.body.ok).toBe(false)
      expect(response.body.error?.name).toBe('NOT_FOUND')
    })

    it('should return messages when user is participant', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'conv-1', supplier_id: 'supplier-1', restaurant_id: 'restaurant-1' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-1',
              content: 'Hi',
              conversation_id: 'conv-1',
              created_at: new Date(),
              reply_to_content: null,
              reply_to_sender_type: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // Attachments for message ids

      const response = await request(app).get('/api/chat/conversations/conv-1/messages').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.messages).toBeDefined()
      expect(response.body.data.messages).toHaveLength(1)
      expect(response.body.data.messages[0].content).toBe('Hi')
    })
  })

  describe('POST /api/chat/conversations/:conversationId/messages', () => {
    it('should send a message', async () => {
      // Sync db mocks for this test
      const dbModule = await import('../lib/db.js')
      vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))

      // Create a new app instance with RESTAURANT role for this test
      const appRestaurant = express()
      appRestaurant.use(express.json())
      appRestaurant.use((req, res, next) => {
        req.requestId = 'test-request-id'
        req.user = mockUser
        req.userData = {
          ...mockUser,
          role: 'RESTAURANT',
          email: 'restaurant@example.com',
          id: 'user-1',
        }
        next()
      })
      appRestaurant.use('/api/chat', chatRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      appRestaurant.use(errorHandler)

      const rbac = await import('../lib/rbac.js')
      vi.mocked(rbac.getRequestTenant).mockResolvedValue({
        tenantId: 'restaurant-1',
        tenantType: 'RESTAURANT',
        tenantName: 'Test Restaurant',
      })
      vi.mocked(rbac.getRestaurantIdForRequest).mockResolvedValue('restaurant-1')

      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'conv-1', restaurant_id: 'restaurant-1', supplier_id: 'supplier-1' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-1',
              conversation_id: 'conv-1',
              content: 'Hello',
              sender_id: 'restaurant-1',
              sender_type: 'RESTAURANT',
              created_at: new Date(),
              message_type: 'TEXT',
              order_id: null,
              reply_to: null,
            },
          ], // Message insert RETURNING *
        })
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-1',
              conversation_id: 'conv-1',
              content: 'Hello',
              sender_id: 'restaurant-1',
              sender_type: 'RESTAURANT',
              created_at: new Date(),
              message_type: 'TEXT',
              order_id: null,
              reply_to: null,
              reply_to_content: null,
              reply_to_sender_type: null,
              attachments: [],
            },
          ], // Fetch message with attachments
        })

      const response = await request(appRestaurant)
        .post('/api/chat/conversations/conv-1/messages')
        .send({
          content: 'Hello',
        })
        .expect(201)

      expect(response.body.ok).toBe(true)
      // The route returns fullMessages[0], so check if message exists
      expect(response.body.data.message).toBeDefined()
      expect(response.body.data.message.content).toBe('Hello')
    })
  })
})
