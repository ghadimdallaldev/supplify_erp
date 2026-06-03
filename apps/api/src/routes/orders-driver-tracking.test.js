import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundError, errorHandler } from '../middlewares/errorHandler.js'

const getOrderTrackingMock = vi.fn()

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next(),
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
  getRequestTenant: vi.fn(),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/driver-rbac.js', () => ({
  isDriverOnlyPermissions: () => false,
  assertDriverAssignmentAccess: vi.fn(),
}))

vi.mock('../services/driver-location.service.js', () => ({
  getOrderTracking: (...args) => getOrderTrackingMock(...args),
  isGpsTrackingEnabled: () => true,
  recordDriverLocation: vi.fn(),
}))

vi.mock('../services/driver-fulfillment.service.js', () => ({
  assignDriverToOrder: vi.fn(),
  updateDeliveryStatus: vi.fn(),
  reassignDriver: vi.fn(),
  submitProofOfDelivery: vi.fn(),
  confirmProofOfDelivery: vi.fn(),
  getProofOfDelivery: vi.fn(),
}))

import { getRequestTenant } from '../lib/rbac.js'
import { ordersDriverRoutes } from './orders-driver.routes.js'

describe('GET /api/orders/:id/tracking', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      req.userData = { id: 'user-1', role: 'RESTAURANT' }
      req.tenantContext = { permissions: ['ORDERS_VIEW'] }
      next()
    })
    app.use('/api/orders', ordersDriverRoutes)
    app.use(errorHandler)
  })

  it('returns sanitized restaurant tracking for own order', async () => {
    vi.mocked(getRequestTenant).mockResolvedValueOnce({
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
    })
    getOrderTrackingMock.mockResolvedValueOnce({
      orderId: 'order-1',
      orderReference: 'ORD-order-1',
      trackingEnabled: true,
      etaAvailable: false,
      delivery: { status: 'out_for_delivery', label: 'Out for delivery' },
      tracking: { enabled: true, hasLocation: true, isStale: false, latestLocation: null },
    })

    const res = await request(app).get('/api/orders/order-1/tracking').expect(200)

    expect(getOrderTrackingMock).toHaveBeenCalledWith({
      orderId: 'order-1',
      restaurantId: 'rest-1',
    })
    expect(res.body.data).not.toHaveProperty('routeId')
    expect(res.body.data.delivery).toBeDefined()
  })

  it('propagates not found for wrong restaurant order', async () => {
    vi.mocked(getRequestTenant).mockResolvedValueOnce({
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
    })
    getOrderTrackingMock.mockRejectedValueOnce(new NotFoundError('Order not found'))

    await request(app).get('/api/orders/other-order/tracking').expect(404)
  })

  it('returns supplier tracking shape unchanged', async () => {
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      req.userData = { id: 'user-1', role: 'SUPPLIER' }
      req.tenantContext = {
        permissions: ['FULFILLMENT_VIEW', 'FULFILLMENT_MANAGE'],
      }
      next()
    })
    app.use('/api/orders', ordersDriverRoutes)
    app.use(errorHandler)

    vi.mocked(getRequestTenant).mockResolvedValueOnce({
      tenantId: 'supplier-1',
      tenantType: 'SUPPLIER',
    })
    getOrderTrackingMock.mockResolvedValueOnce({
      orderId: 'order-1',
      orderRef: 'order-1',
      assignment: { id: 'da-1', status: 'assigned', driverId: 'd1' },
      routeNumber: 'R-42',
      tracking: { enabled: true, hasLocation: false },
    })

    const res = await request(app).get('/api/orders/order-1/tracking').expect(200)

    expect(getOrderTrackingMock).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: 'supplier-1' })
    )
    expect(res.body.data.assignment).toBeDefined()
    expect(res.body.data.routeNumber).toBe('R-42')
  })

  it('returns 403 for admin without supplier context', async () => {
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      req.userData = { id: 'admin-1', role: 'ADMIN' }
      req.tenantContext = { permissions: ['FULFILLMENT_VIEW'] }
      next()
    })
    app.use('/api/orders', ordersDriverRoutes)
    app.use(errorHandler)

    vi.mocked(getRequestTenant).mockResolvedValueOnce({
      tenantId: null,
      tenantType: 'ADMIN',
    })

    const { getSupplierIdForRequest } = await import('../lib/rbac.js')
    vi.mocked(getSupplierIdForRequest).mockResolvedValueOnce(null)

    await request(app).get('/api/orders/order-1/tracking').expect(403)
    expect(getOrderTrackingMock).not.toHaveBeenCalled()
  })
})
