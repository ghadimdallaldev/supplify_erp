import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenError, errorHandler } from '../middlewares/errorHandler.js'

const listDeliveryRoutesMock = vi.fn()
const getDeliveryRouteMock = vi.fn()
const createDeliveryRouteMock = vi.fn()
const getLinkedDriverIdMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ id: 'supplier-1' }] }),
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = req.tenantContext || {
      tenantId: 'supplier-1',
      tenantType: 'SUPPLIER',
      permissions: ['FULFILLMENT_VIEW', 'FULFILLMENT_MANAGE'],
    }
    next()
  },
  requirePermission: (perm) => (req, res, next) => {
    const perms = req.tenantContext?.permissions ?? []
    if (!perms.includes(perm)) {
      return res.status(403).json({
        ok: false,
        error: { name: 'FORBIDDEN', message: 'Insufficient permission' },
      })
    }
    next()
  },
  getRequestTenant: vi.fn().mockResolvedValue({ tenantId: 'supplier-1', tenantType: 'SUPPLIER' }),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('../lib/warehouse-helpers.js', () => ({
  isMultiWarehouseFulfillmentActive: vi.fn().mockReturnValue(false),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../services/delivery-routes.service.js', () => ({
  listDeliveryRoutes: (...args) => listDeliveryRoutesMock(...args),
  getDeliveryRoute: (...args) => getDeliveryRouteMock(...args),
  createDeliveryRoute: (...args) => createDeliveryRouteMock(...args),
  updateDeliveryRoute: vi.fn(),
  reorderRouteStops: vi.fn(),
  reorderRouteStopsByOrder: vi.fn(),
  setNextRouteStop: vi.fn(),
  updateRouteStop: vi.fn(),
  cancelDeliveryRoute: vi.fn(),
  getDriverActiveRoute: vi.fn(),
  buildDriverRouteFromAssignments: vi.fn(),
}))

vi.mock('../lib/driver-rbac.js', () => ({
  isDriverOnlyPermissions: (perms) =>
    perms.includes('DRIVER_DELIVERIES_VIEW') && !perms.includes('FULFILLMENT_MANAGE'),
  getLinkedDriverId: (...args) => getLinkedDriverIdMock(...args),
}))

import { fulfillmentRoutes } from './fulfillment.routes.js'

describe('Fulfillment routes — delivery route planning', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    getLinkedDriverIdMock.mockResolvedValue('driver-a')

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      req.userData = { id: 'user-1', email: 's@test.com', role: 'SUPPLIER' }
      next()
    })
    app.use('/api/fulfillment', fulfillmentRoutes)
    app.use(errorHandler)
  })

  it('POST /routes creates a route for supplier staff', async () => {
    createDeliveryRouteMock.mockResolvedValueOnce({
      id: 'route-1',
      routeNumber: 'R-20260528-001',
      routeLabel: 'Morning',
      status: 'PLANNED',
      stops: [],
    })

    const res = await request(app)
      .post('/api/fulfillment/routes')
      .send({
        order_ids: ['11111111-1111-4111-8111-111111111111'],
        driver_id: '22222222-2222-4222-8222-222222222222',
        scheduled_date: '2026-05-28',
        route_label: 'Morning',
      })
      .expect(201)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.route.id).toBe('route-1')
    expect(createDeliveryRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 'supplier-1',
        driverId: '22222222-2222-4222-8222-222222222222',
      })
    )
  })

  it('GET /routes/:id returns 403 when driver views another drivers route', async () => {
    getDeliveryRouteMock.mockRejectedValueOnce(
      new ForbiddenError('You can only view your own routes')
    )

    const driverApp = express()
    driverApp.use(express.json())
    driverApp.use((req, res, next) => {
      req.requestId = 'test-req'
      req.userData = { id: 'driver-user', email: 'd@test.com', role: 'SUPPLIER' }
      req.tenantContext = {
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: ['FULFILLMENT_VIEW', 'DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE'],
      }
      next()
    })
    driverApp.use('/api/fulfillment', fulfillmentRoutes)
    driverApp.use(errorHandler)

    const res = await request(driverApp).get('/api/fulfillment/routes/other-route').expect(403)

    expect(res.body.ok).toBe(false)
    expect(getDeliveryRouteMock).toHaveBeenCalledWith('supplier-1', 'other-route', {
      driverIdScope: 'driver-a',
    })
  })

  it('GET /dispatch applies day window and bucket limit in SQL', async () => {
    const { query } = await import('../lib/db.js')
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM customer_order o')) {
        return { rows: [] }
      }
      return { rows: [{ id: 'supplier-1' }] }
    })

    const res = await request(app).get('/api/fulfillment/dispatch?days=7').expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.windowDays).toBe(7)
    expect(res.body.data.bucketLimit).toBe(500)
    const sqlCalls = query.mock.calls.map((c) => c[0])
    expect(sqlCalls.some((sql) => sql.includes("INTERVAL '1 day'"))).toBe(true)
    expect(sqlCalls.some((sql) => sql.includes('LIMIT'))).toBe(true)
  })

  it('GET /routes/active works for driver-only permissions without FULFILLMENT_VIEW', async () => {
    const { getDriverActiveRoute } = await import('../services/delivery-routes.service.js')
    getDriverActiveRoute.mockResolvedValueOnce({ id: 'route-1', stops: [] })

    const driverApp = express()
    driverApp.use(express.json())
    driverApp.use((req, res, next) => {
      req.requestId = 'test-req'
      req.userData = { id: 'driver-user', email: 'd@test.com', role: 'SUPPLIER' }
      req.tenantContext = {
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: ['DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE'],
      }
      next()
    })
    driverApp.use('/api/fulfillment', fulfillmentRoutes)
    driverApp.use(errorHandler)

    const res = await request(driverApp).get('/api/fulfillment/routes/active').expect(200)

    expect(res.body.ok).toBe(true)
    expect(getDriverActiveRoute).toHaveBeenCalledWith('supplier-1', 'driver-a')
  })

  it('GET /routes lists only scoped routes for driver-only users', async () => {
    listDeliveryRoutesMock.mockResolvedValueOnce([])

    const driverApp = express()
    driverApp.use(express.json())
    driverApp.use((req, res, next) => {
      req.requestId = 'test-req'
      req.userData = { id: 'driver-user', email: 'd@test.com', role: 'SUPPLIER' }
      req.tenantContext = {
        tenantId: 'supplier-1',
        tenantType: 'SUPPLIER',
        permissions: ['FULFILLMENT_VIEW', 'DRIVER_DELIVERIES_VIEW'],
      }
      next()
    })
    driverApp.use('/api/fulfillment', fulfillmentRoutes)
    driverApp.use(errorHandler)

    await request(driverApp).get('/api/fulfillment/routes').expect(200)

    expect(listDeliveryRoutesMock).toHaveBeenCalledWith('supplier-1', {
      includeCancelled: false,
      driverId: 'driver-a',
    })
  })
})
