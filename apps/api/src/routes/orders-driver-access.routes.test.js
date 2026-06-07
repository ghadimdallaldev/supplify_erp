/**
 * Driver delivery endpoints must not require ORDERS_VIEW (drivers only have DRIVER_DELIVERIES_*).
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
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
  requireFeature: () => (_req, _res, next) => next(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/driver-rbac.js', () => ({
  isDriverOnlyPermissions: vi.fn(
    (perms) =>
      Array.isArray(perms) &&
      perms.every((p) => p === P.DRIVER_DELIVERIES_VIEW || p === P.DRIVER_DELIVERIES_MANAGE)
  ),
  requireLinkedDriver: vi.fn().mockResolvedValue('driver-1'),
  assertDriverAssignmentAccess: vi.fn().mockResolvedValue({ driverId: 'driver-1' }),
  assertDriverStatusUpdate: vi.fn(),
}))

const updateDeliveryStatusMock = vi.fn()

vi.mock('../services/driver-fulfillment.service.js', () => ({
  assignDriverToOrder: vi.fn(),
  updateDeliveryStatus: (...args) => updateDeliveryStatusMock(...args),
  reassignDriver: vi.fn(),
  submitProofOfDelivery: vi.fn(),
  confirmProofOfDelivery: vi.fn(),
  getProofOfDelivery: vi.fn(),
  getActiveDriverAssignment: vi.fn(),
}))

vi.mock('../services/driver-location.service.js', () => ({
  recordDriverLocation: vi.fn().mockResolvedValue({ trackingEnabled: true, stored: true }),
  getOrderTracking: vi.fn(),
  isGpsTrackingEnabled: () => true,
}))

function attachDriverContext(req, _res, next) {
  req.requestId = 'driver-access-test'
  req.userData = { id: 'driver-user-1', role: 'SUPPLIER', email: 'driver@test.com' }
  req.tenantContext = {
    permissions: [P.DRIVER_DELIVERIES_VIEW, P.DRIVER_DELIVERIES_MANAGE],
    tenantId: 'supplier-1',
    tenantType: 'SUPPLIER',
  }
  next()
}

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    requireAuth: (req, res, next) => next(),
    resolveTenantContext: (req, res, next) => next(),
    getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
    getRequestTenant: vi.fn().mockResolvedValue({
      tenantId: 'supplier-1',
      tenantType: 'SUPPLIER',
      tenantName: 'Test Supplier',
    }),
  }
})

import { ordersRoutes } from './orders.routes.js'

describe('driver order delivery routes without ORDERS_VIEW', () => {
  let app

  beforeEach(async () => {
    vi.clearAllMocks()
    updateDeliveryStatusMock.mockResolvedValue({ id: 'assign-1', status: 'out_for_delivery' })
    const { errorHandler } = await import('../middlewares/errorHandler.js')

    app = express()
    app.use(express.json())
    app.use(attachDriverContext)
    app.use('/api/orders', ordersRoutes)
    app.use(errorHandler)
  })

  it('allows PATCH delivery-status with driver-only permissions', async () => {
    const res = await request(app)
      .patch('/api/orders/order-1/delivery-status')
      .send({ status: 'out_for_delivery' })
      .expect(200)

    expect(updateDeliveryStatusMock).toHaveBeenCalled()
    expect(res.body.ok).toBe(true)
  })

  it('allows POST location with driver-only permissions', async () => {
    const res = await request(app)
      .post('/api/orders/order-1/location')
      .send({ latitude: 33.89, longitude: 35.5 })
      .expect(200)

    expect(res.body.ok).toBe(true)
  })

  it('still blocks GET /api/orders list without ORDERS_VIEW', async () => {
    const res = await request(app).get('/api/orders').expect(403)

    expect(res.body.error?.message).toMatch(/ORDERS_VIEW/)
  })
})
