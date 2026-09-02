import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenError, NotFoundError, errorHandler } from '../middlewares/errorHandler.js'

const recordDriverLocationMock = vi.fn()

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
  isDriverOnlyPermissions: vi.fn(() => false),
  requireLinkedDriver: vi.fn().mockResolvedValue('driver-1'),
  assertDriverAssignmentAccess: vi.fn(),
}))

vi.mock('../services/driver-location.service.js', () => ({
  recordDriverLocation: (...args) => recordDriverLocationMock(...args),
  isGpsTrackingEnabled: () => true,
  getOrderTracking: vi.fn(),
}))

vi.mock('../services/driver-fulfillment.service.js', () => ({
  assignDriverToOrder: vi.fn(),
  updateDeliveryStatus: vi.fn(),
  reassignDriver: vi.fn(),
  submitProofOfDelivery: vi.fn(),
  confirmProofOfDelivery: vi.fn(),
  getProofOfDelivery: vi.fn(),
  getActiveDriverAssignment: vi.fn().mockResolvedValue({
    driver_id: 'driver-1',
    status: 'out_for_delivery',
  }),
}))

import { ordersDriverRoutes } from './orders-driver.routes.js'

describe('POST /api/orders/:id/location', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      req.userData = { id: 'user-1', role: 'SUPPLIER' }
      req.tenantContext = {
        permissions: ['FULFILLMENT_MANAGE', 'ORDERS_VIEW'],
      }
      next()
    })
    app.use('/api/orders', ordersDriverRoutes)
    app.use(errorHandler)
  })

  it('records location for fulfillment manager', async () => {
    recordDriverLocationMock.mockResolvedValueOnce({
      trackingEnabled: true,
      stored: true,
    })

    const res = await request(app)
      .post('/api/orders/order-1/location')
      .send({ latitude: 33.89, longitude: 35.5 })
      .expect(200)

    expect(recordDriverLocationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 'supplier-1',
        orderId: 'order-1',
        driverId: 'driver-1',
      })
    )
    expect(res.body.data.stored).toBe(true)
  })

  it('returns 404 when order not owned by supplier', async () => {
    recordDriverLocationMock.mockRejectedValueOnce(new NotFoundError('Order not found'))

    await request(app)
      .post('/api/orders/other-order/location')
      .send({ latitude: 33.89, longitude: 35.5 })
      .expect(404)
  })

  it('returns 400 for invalid coordinates via service validation', async () => {
    const { ValidationError } = await import('../middlewares/errorHandler.js')
    recordDriverLocationMock.mockRejectedValueOnce(
      new ValidationError('latitude or longitude out of range')
    )

    await request(app)
      .post('/api/orders/order-1/location')
      .send({ latitude: 999, longitude: 35.5 })
      .expect(400)
  })
})

describe('POST /api/orders/:id/location — restaurant blocked', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      req.userData = { id: 'user-r', role: 'RESTAURANT' }
      req.tenantContext = { permissions: ['ORDERS_VIEW'] }
      next()
    })
    app.use('/api/orders', ordersDriverRoutes)
    app.use(errorHandler)
  })

  it('returns 403 for restaurant role', async () => {
    await request(app)
      .post('/api/orders/order-1/location')
      .send({ latitude: 33.89, longitude: 35.5 })
      .expect(403)

    expect(recordDriverLocationMock).not.toHaveBeenCalled()
  })
})
