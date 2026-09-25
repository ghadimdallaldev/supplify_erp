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

function denyMissingPermission(res, req, key) {
  return res.status(403).json({
    ok: false,
    data: null,
    error: { name: 'FORBIDDEN', message: `Missing permission: ${key}` },
    requestId: req.requestId,
  })
}

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    req.userData = req.userData || { ...mockUser }
    next()
  }),
  requireRole: () => (req, res, next) => next(),
  requireOwnership: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      tenantId: 'restaurant-1',
      tenantType: req.userData?.role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT',
      permissions: req.userData?.permissions || ['ORDERS_VIEW', 'SETTINGS_EDIT', 'ADMIN_ACCESS'],
    }
    next()
  },
  resolveAdminContext: (req, res, next) => {
    req.adminContext = req.adminContext || {
      permissions: req.userData?.adminPermissions || ['ADMIN_ACCESS'],
    }
    next()
  },
  requirePermission: (key) => (req, res, next) => {
    const perms = [
      ...(req.tenantContext?.permissions || []),
      ...(req.adminContext?.permissions || []),
    ]
    if (perms.includes(key) || perms.includes(key.replace(/_VIEW$/, '_MANAGE'))) return next()
    return denyMissingPermission(res, req, key)
  },
  requireAnyPermission:
    (...keys) =>
    (req, res, next) => {
      const perms = [
        ...(req.tenantContext?.permissions || []),
        ...(req.adminContext?.permissions || []),
      ]
      if (keys.some((key) => perms.includes(key))) return next()
      return denyMissingPermission(res, req, keys.join('|'))
    },
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
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
    const { getSupplierIdForRequest, getRestaurantIdForRequest } = await import('../lib/rbac.js')
    vi.mocked(getSupplierIdForRequest).mockResolvedValue('supplier-1')
    vi.mocked(getRestaurantIdForRequest).mockResolvedValue('restaurant-1')

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      req.user = mockUser
      req.userData = { ...mockUser, role: 'ADMIN' }
      next()
    })
    app.use('/api/restaurants', restaurantsRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /api/restaurants', () => {
    it('denies supplier drivers without ORDERS_VIEW', async () => {
      const localApp = express()
      localApp.use(express.json())
      localApp.use((req, res, next) => {
        req.requestId = 'test-request-id'
        req.userData = {
          ...mockUser,
          role: 'SUPPLIER',
          permissions: ['DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE'],
        }
        next()
      })
      localApp.use('/api/restaurants', restaurantsRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      localApp.use(errorHandler)

      const response = await request(localApp).get('/api/restaurants').expect(403)
      expect(response.body.error.name).toBe('FORBIDDEN')
    })

    it('should return list of restaurants', async () => {
      // Admin impersonating a supplier lists linked restaurants only
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

  describe('POST /api/restaurants/:id/logo', () => {
    it('denies logo updates without SETTINGS_EDIT', async () => {
      const localApp = express()
      localApp.use(express.json())
      localApp.use((req, res, next) => {
        req.requestId = 'test-request-id'
        req.userData = { ...mockUser, role: 'RESTAURANT', permissions: ['SETTINGS_VIEW'] }
        next()
      })
      localApp.use('/api/restaurants', restaurantsRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      localApp.use(errorHandler)

      const response = await request(localApp)
        .post('/api/restaurants/restaurant-1/logo')
        .send({ logoUrl: 'https://cdn.example/logo.png' })
        .expect(403)

      expect(response.body.error.name).toBe('FORBIDDEN')
    })
  })

  describe('PATCH /api/restaurants/:id', () => {
    it('denies an authenticated user from updating another tenant restaurant', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'restaurant-other', name: 'Other Restaurant' }],
      })

      const response = await request(app)
        .patch('/api/restaurants/restaurant-other')
        .send({ name: 'Hijacked' })
        .expect(403)

      expect(response.body.error.name).toBe('FORBIDDEN')
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

    it('denies RESTAURANT role when tenant id does not match', async () => {
      const rbac = await import('../lib/rbac.js')
      vi.mocked(rbac.getRestaurantIdForRequest).mockResolvedValueOnce('restaurant-other')

      db.query.mockResolvedValueOnce({
        rows: [{ id: 'restaurant-1', name: 'Test Restaurant' }],
      })

      const localApp = express()
      localApp.use(express.json())
      localApp.use((req, res, next) => {
        req.requestId = 'test-request-id'
        req.userData = { ...mockUser, role: 'RESTAURANT' }
        next()
      })
      localApp.use('/api/restaurants', restaurantsRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      localApp.use(errorHandler)

      const response = await request(localApp).get('/api/restaurants/restaurant-1').expect(403)

      expect(response.body.error.name).toBe('FORBIDDEN')
    })

    it('denies SUPPLIER without ORDERS_VIEW', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'restaurant-1', name: 'Test Restaurant' }],
      })

      const localApp = express()
      localApp.use(express.json())
      localApp.use((req, res, next) => {
        req.requestId = 'test-request-id'
        req.userData = {
          ...mockUser,
          role: 'SUPPLIER',
          permissions: ['DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE'],
        }
        next()
      })
      localApp.use('/api/restaurants', restaurantsRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      localApp.use(errorHandler)

      const response = await request(localApp).get('/api/restaurants/restaurant-1').expect(403)
      expect(response.body.error.name).toBe('FORBIDDEN')
    })

    it('allows SUPPLIER when restaurant has active connection', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'restaurant-1',
              name: 'Test Restaurant',
              tax_id: 'secret-tax',
              vat_number: 'secret-vat',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })

      const localApp = express()
      localApp.use(express.json())
      localApp.use((req, res, next) => {
        req.requestId = 'test-request-id'
        req.userData = { ...mockUser, role: 'SUPPLIER' }
        next()
      })
      localApp.use('/api/restaurants', restaurantsRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      localApp.use(errorHandler)

      const response = await request(localApp).get('/api/restaurants/restaurant-1').expect(200)

      expect(response.body.data.restaurant.id).toBe('restaurant-1')
      expect(response.body.data.restaurant.tax_id).toBeUndefined()
      expect(response.body.data.restaurant.vat_number).toBeUndefined()
    })
  })
})
