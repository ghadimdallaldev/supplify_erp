import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

// Setup mocks at top level
vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  const withTransactionMock = vi.fn()
  return {
    query: queryMock,
    withTransaction: withTransactionMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
    __withTransactionMock: withTransactionMock,
  }
})

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  requireOwnership: () => (req, res, next) => next(),
  checkPermission: vi.fn().mockResolvedValue(true),
  upsertUser: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
  getUserBySub: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
}))

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, current: 0, limit: 100, isOverLimit: false }),
  incrementUsage: vi.fn().mockResolvedValue(true),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import routes after mocks
import { restaurantsRoutes } from './restaurants.routes.js'

describe('Restaurants Routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))
    vi.mocked(dbModule.withTransaction).mockImplementation((handler) => db.withTransaction(handler))

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.user = mockUser
      req.userData = { ...mockUser, role: 'ADMIN' } // Use ADMIN to see all restaurants
      next()
    })
    app.use('/api/restaurants', restaurantsRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/restaurants', () => {
    it('should return list of restaurants', async () => {
      // For ADMIN role, it queries restaurants with count
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'restaurant-1',
              name: 'Test Restaurant',
              contact_email: 'restaurant@example.com',
              total_orders: '10',
              total_spent: '1000.50',
              latest_order: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total: '1' }],
        })

      const response = await request(app).get('/api/restaurants').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.restaurants).toHaveLength(1)
    })
  })

  describe('GET /api/restaurants/:id', () => {
    it('should return restaurant details', async () => {
      // Mock: restaurant query with order stats
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'restaurant-1',
            name: 'Test Restaurant',
            contact_email: 'restaurant@example.com',
            total_orders: 10,
            total_spent: 1000.5,
          },
        ],
      })

      const response = await request(app).get('/api/restaurants/restaurant-1').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.restaurant.id).toBe('restaurant-1')
    })
  })
})
