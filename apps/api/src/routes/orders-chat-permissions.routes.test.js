/**
 * Route-level permission enforcement for orders create and chat send.
 * Uses real requirePermission / guards (not mocked away).
 */
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_KEYS as P } from '../lib/permission-keys.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() },
}))

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi.fn().mockResolvedValue({ allowed: true, isOverLimit: false }),
  checkAndIncrementUsage: vi.fn().mockResolvedValue({ allowed: true }),
  checkUsageWithWarning: vi.fn().mockResolvedValue({ isWarning: false }),
  incrementUsage: vi.fn(),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
  requireFeature: () => (_req, _res, next) => next(),
  getTenantSubscription: vi.fn().mockResolvedValue({ plan_name: 'Silver' }),
  getRecommendedPlanNames: vi.fn().mockResolvedValue([]),
  buildLimitExceededPayload: vi.fn().mockReturnValue({
    name: 'LIMIT_EXCEEDED',
    message: 'Daily chat limit reached',
  }),
}))

vi.mock('../services/promotions.service.js', () => ({
  applyBestPromotionToOrder: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/audit.js', () => ({ writeAuditLog: vi.fn() }))
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock('../services/notification.service.js', () => ({
  notifyOrderStatusChange: vi.fn(),
  notifyMessageReceived: vi.fn(),
}))
vi.mock('../services/warehouseRouting.js', () => ({
  assignWarehousesToOrder: vi.fn().mockResolvedValue({ mode: 'single', assignments: [] }),
}))
vi.mock('../services/warehouseInventory.js', () => ({
  syncWarehouseFulfillmentOnOrderStatus: vi.fn(),
  releaseInventoryForOrder: vi.fn(),
}))
vi.mock('../services/supplier-inventory.service.js', () => ({
  assertAndDeductSupplierStock: vi.fn(),
  restoreSupplierStockForOrder: vi.fn(),
}))

function attachTestContext(permissions, role = 'RESTAURANT') {
  return (req, _res, next) => {
    req.requestId = 'perm-test'
    req._testPermissions = permissions
    req.userData = {
      id: 'user-1',
      role,
      email: role === 'SUPPLIER' ? 'supplier@test.com' : 'restaurant@test.com',
    }
    req.tenantContext = {
      permissions,
      tenantId: role === 'SUPPLIER' ? 'supplier-1' : 'restaurant-1',
      tenantType: role,
    }
    next()
  }
}

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    requireAuth: (req, res, next) => next(),
    resolveTenantContext: (req, res, next) => next(),
    getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
    getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
    getRequestTenant: vi.fn().mockImplementation((req) =>
      Promise.resolve({
        tenantId: req.tenantContext?.tenantId,
        tenantType: req.tenantContext?.tenantType,
        tenantName: 'Test',
      })
    ),
  }
})

import { ordersRoutes } from './orders.routes.js'
import { chatRoutes } from './chat.routes.js'
import { query } from '../lib/db.js'

describe('orders and chat permission routes', () => {
  let ordersApp
  let chatApp

  beforeEach(async () => {
    vi.clearAllMocks()
    const { errorHandler } = await import('../middlewares/errorHandler.js')

    ordersApp = express()
    ordersApp.use(express.json())
    ordersApp.use('/api/orders', ordersRoutes)
    ordersApp.use(errorHandler)

    chatApp = express()
    chatApp.use(express.json())
    chatApp.use('/api/chat', chatRoutes)
    chatApp.use(errorHandler)
  })

  describe('POST /api/orders', () => {
    it('returns 403 when tenant has ORDERS_VIEW but not ORDERS_CREATE', async () => {
      const app = express()
      app.use(express.json())
      app.use(attachTestContext([P.ORDERS_VIEW], 'RESTAURANT'))
      app.use('/api/orders', ordersRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      app.use(errorHandler)

      const res = await request(app)
        .post('/api/orders')
        .send({
          items: [{ productId: '00000000-0000-4000-8000-000000000001', quantity: 1 }],
        })

      expect(res.status).toBe(403)
      expect(res.body.error?.message).toMatch(/ORDERS_CREATE|Missing one of/i)
    })

    it('does not return 403 for ORDERS_CREATE before validation (400/201)', async () => {
      const app = express()
      app.use(express.json())
      app.use(attachTestContext([P.ORDERS_VIEW, P.ORDERS_CREATE], 'RESTAURANT'))
      app.use('/api/orders', ordersRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      app.use(errorHandler)

      vi.mocked(query).mockResolvedValue({ rows: [] })

      const res = await request(app)
        .post('/api/orders')
        .send({
          items: [{ productId: '00000000-0000-4000-8000-000000000001', quantity: 1 }],
        })

      expect(res.status).not.toBe(403)
    })

    it('returns 403 for supplier role on restaurant POST /', async () => {
      const app = express()
      app.use(express.json())
      app.use(attachTestContext([P.ORDERS_VIEW, P.ORDERS_CREATE, P.ORDERS_MANAGE], 'SUPPLIER'))
      app.use('/api/orders', ordersRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      app.use(errorHandler)

      const res = await request(app)
        .post('/api/orders')
        .send({
          items: [{ productId: '00000000-0000-4000-8000-000000000001', quantity: 1 }],
        })

      expect(res.status).toBe(403)
    })
  })

  describe('GET /api/orders', () => {
    it('allows ORDERS_VIEW without ORDERS_CREATE', async () => {
      const app = express()
      app.use(express.json())
      app.use(attachTestContext([P.ORDERS_VIEW], 'RESTAURANT'))
      app.use('/api/orders', ordersRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      app.use(errorHandler)

      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ id: 'restaurant-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })

      const res = await request(app).get('/api/orders')
      expect(res.status).not.toBe(403)
    })
  })

  describe('chat permissions', () => {
    it('allows GET conversations with CHAT_VIEW only', async () => {
      const app = express()
      app.use(express.json())
      app.use(attachTestContext([P.CHAT_VIEW], 'RESTAURANT'))
      app.use('/api/chat', chatRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      app.use(errorHandler)

      vi.mocked(query).mockResolvedValueOnce({ rows: [] })

      const res = await request(app).get('/api/chat/conversations')
      expect(res.status).not.toBe(403)
    })

    it('returns 403 for POST message without CHAT_SEND', async () => {
      const app = express()
      app.use(express.json())
      app.use(attachTestContext([P.CHAT_VIEW], 'RESTAURANT'))
      app.use('/api/chat', chatRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      app.use(errorHandler)

      const res = await request(app)
        .post('/api/chat/conversations/00000000-0000-4000-8000-000000000099/messages')
        .send({ content: 'hello' })

      expect(res.status).toBe(403)
      expect(res.body.error?.message).toMatch(/CHAT_SEND|Missing one of/i)
    })

    it('returns 403 when conversation belongs to another tenant', async () => {
      const app = express()
      app.use(express.json())
      app.use(attachTestContext([P.CHAT_VIEW, P.CHAT_SEND], 'RESTAURANT'))
      app.use('/api/chat', chatRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      app.use(errorHandler)

      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          {
            id: '00000000-0000-4000-8000-000000000099',
            supplier_id: 'supplier-1',
            restaurant_id: 'other-restaurant',
          },
        ],
      })

      const res = await request(app)
        .post('/api/chat/conversations/00000000-0000-4000-8000-000000000099/messages')
        .send({ content: 'hello' })

      expect(res.status).toBe(403)
      expect(res.body.error?.message).toMatch(/Access denied/i)
    })

    it('returns 403 when daily chat limit exceeded after permission passes', async () => {
      const sub = await import('../lib/subscription.js')
      vi.mocked(sub.checkAndIncrementUsage).mockResolvedValueOnce({
        allowed: false,
        current: 10,
        limit: 10,
      })
      vi.mocked(sub.getTenantSubscription).mockResolvedValueOnce({ plan_name: 'Silver' })
      vi.mocked(sub.getRecommendedPlanNames).mockResolvedValueOnce(['Gold'])
      vi.mocked(sub.buildLimitExceededPayload).mockReturnValueOnce({
        name: 'LIMIT_EXCEEDED',
        message: 'Daily chat limit reached (10/10). Upgrade your plan to send more chats.',
      })

      const app = express()
      app.use(express.json())
      app.use(attachTestContext([P.CHAT_VIEW, P.CHAT_SEND], 'RESTAURANT'))
      app.use('/api/chat', chatRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      app.use(errorHandler)

      const res = await request(app)
        .post('/api/chat/conversations/00000000-0000-4000-8000-000000000099/messages')
        .send({ content: 'hello' })

      expect(res.status).toBe(403)
      expect(res.body.error?.message).toMatch(/Daily chat limit/i)
    })
  })
})
