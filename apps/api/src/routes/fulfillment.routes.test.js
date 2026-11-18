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
vi.mock('../lib/cache.js', () => ({
  getCache: vi.fn(),
  setCache: vi.fn(async () => {}),
  deleteCache: vi.fn(),
  deleteCacheByPrefix: vi.fn(async () => {}),
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
  rolesIncludeOwner: (roles) => Array.isArray(roles) && roles.includes('Owner'),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('../lib/warehouse-helpers.js', () => ({
  isMultiWarehouseFulfillmentActive: vi.fn().mockReturnValue(false),
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('supplier_id'),
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

  function driverApp(
    permissions = ['DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE'],
    roles = []
  ) {
    const driver = express()
    driver.use(express.json())
    driver.use((req, _res, next) => {
      req.requestId = 'driver-route-regression'
      req.userData = { id: 'driver-user', role: 'SUPPLIER' }
      req.tenantContext = { tenantId: 'supplier-1', tenantType: 'SUPPLIER', permissions, roles }
      next()
    })
    driver.use('/api/fulfillment', fulfillmentRoutes)
    driver.use(errorHandler)
    return driver
  }

  it('lets drivers build from their own assignments without supplier board permission', async () => {
    const { buildDriverRouteFromAssignments } = await import(
      '../services/delivery-routes.service.js'
    )
    buildDriverRouteFromAssignments.mockResolvedValue({ id: 'route-1', stops: [] })
    await request(driverApp())
      .post('/api/fulfillment/routes/build-from-assignments')
      .send({})
      .expect(201)
    expect(buildDriverRouteFromAssignments).toHaveBeenCalledWith(
      'supplier-1',
      'driver-a',
      expect.anything()
    )
  })

  it.each(['/routes/today', '/routes/active', '/routes/own-route', '/routes'])(
    'lets a driver read their route at %s without supplier board permission',
    async (path) => {
      const { getDriverActiveRoute } = await import('../services/delivery-routes.service.js')
      getDriverActiveRoute.mockResolvedValue({ id: 'route-1', stops: [] })
      getDeliveryRouteMock.mockResolvedValue({ id: 'own-route', driverId: 'driver-a', stops: [] })
      listDeliveryRoutesMock.mockResolvedValue([])
      await request(driverApp(['DRIVER_DELIVERIES_VIEW']))
        .get('/api/fulfillment' + path)
        .expect(200)
    }
  )

  it.each([
    [
      'post',
      '/routes/route-1/stops/reorder',
      { stop_ids: ['11111111-1111-4111-8111-111111111111'] },
      'reorderRouteStops',
    ],
    [
      'patch',
      '/routes/route-1/stops/reorder',
      { stops: [{ orderId: '11111111-1111-4111-8111-111111111111', stopSequence: 1 }] },
      'reorderRouteStopsByOrder',
    ],
    [
      'patch',
      '/routes/route-1/next-stop',
      { orderId: '11111111-1111-4111-8111-111111111111' },
      'setNextRouteStop',
    ],
  ])('lets drivers use the scoped %s %s handler', async (method, path, body, serviceName) => {
    const services = await import('../services/delivery-routes.service.js')
    services[serviceName].mockResolvedValue({ id: 'route-1', stops: [] })
    await request(driverApp())
      [method]('/api/fulfillment' + path)
      .send(body)
      .expect(200)
    expect(services[serviceName]).toHaveBeenCalledWith('supplier-1', 'route-1', expect.anything(), {
      driverIdScope: 'driver-a',
    })
  })

  it('keeps driver-only access out of supplier mutations and requires manage for route actions', async () => {
    await request(driverApp()).post('/api/fulfillment/routes').send({}).expect(403)
    await request(driverApp())
      .patch('/api/fulfillment/routes/route-1')
      .send({ route_label: 'Changed' })
      .expect(403)
    await request(driverApp()).get('/api/fulfillment/dispatch').expect(403)
    await request(driverApp(['DRIVER_DELIVERIES_VIEW']))
      .post('/api/fulfillment/routes/build-from-assignments')
      .send({})
      .expect(403)
    await request(driverApp(['DRIVER_DELIVERIES_VIEW']))
      .patch('/api/fulfillment/routes/route-1/next-stop')
      .send({ orderId: '11111111-1111-4111-8111-111111111111' })
      .expect(403)
  })

  it('passes the linked driver scope through a stop mutation and refuses an unlinked caller', async () => {
    const { updateRouteStop } = await import('../services/delivery-routes.service.js')
    getDeliveryRouteMock.mockResolvedValue({ id: 'route-1', driverId: 'driver-a', stops: [] })
    updateRouteStop.mockResolvedValue({ id: 'route-1', stops: [] })
    await request(driverApp())
      .patch('/api/fulfillment/routes/route-1/stops/stop-1')
      .send({ notes: 'At gate' })
      .expect(200)
    expect(updateRouteStop).toHaveBeenCalledWith(
      'supplier-1',
      'route-1',
      'stop-1',
      expect.objectContaining({ driverIdScope: 'driver-a' })
    )
    expect(getDeliveryRouteMock).toHaveBeenCalledWith('supplier-1', 'route-1', {
      driverIdScope: 'driver-a',
    })
    getLinkedDriverIdMock.mockResolvedValue(null)
    updateRouteStop.mockClear()
    await request(driverApp())
      .patch('/api/fulfillment/routes/route-1/stops/stop-1')
      .send({ notes: 'At gate' })
      .expect(403)
    expect(updateRouteStop).not.toHaveBeenCalled()
  })

  it('retains trusted Owner stop management without requiring explicit permission rows', async () => {
    const { updateRouteStop } = await import('../services/delivery-routes.service.js')
    getDeliveryRouteMock.mockResolvedValue({ id: 'route-1', stops: [] })
    updateRouteStop.mockResolvedValue({ id: 'route-1', stops: [] })
    await request(driverApp([], ['Owner']))
      .patch('/api/fulfillment/routes/route-1/stops/stop-1')
      .send({ notes: 'Supplier note' })
      .expect(200)
    expect(updateRouteStop).toHaveBeenCalledWith(
      'supplier-1',
      'route-1',
      'stop-1',
      expect.objectContaining({ driverIdScope: null })
    )
  })

  it('denies a stop write to a view-only driver', async () => {
    const { updateRouteStop } = await import('../services/delivery-routes.service.js')
    await request(driverApp(['DRIVER_DELIVERIES_VIEW']))
      .patch('/api/fulfillment/routes/route-1/stops/stop-1')
      .send({ notes: 'Unauthorized' })
      .expect(403)
    expect(updateRouteStop).not.toHaveBeenCalled()
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
    expect(res.body.data.bucketLimit).toBe(200)
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

  it('POST /routes/:id/optimize works for a driver without FULFILLMENT_VIEW', async () => {
    const routeId = '33333333-3333-4333-8333-333333333333'
    getDeliveryRouteMock.mockResolvedValue({
      id: routeId,
      status: 'IN_PROGRESS',
      stops: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sequenceNumber: 1,
          status: 'PENDING',
          destinationCoordinatesAvailable: true,
          destinationLatitude: 33.8,
          destinationLongitude: 35.5,
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          sequenceNumber: 2,
          status: 'PENDING',
          destinationCoordinatesAvailable: true,
          destinationLatitude: 33.9,
          destinationLongitude: 35.6,
        },
      ],
    })
    const { reorderRouteStops } = await import('../services/delivery-routes.service.js')
    reorderRouteStops.mockResolvedValue({ id: routeId, stops: [] })

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

    const res = await request(driverApp)
      .post(`/api/fulfillment/routes/${routeId}/optimize`)
      .send({ apply: true })
      .expect(200)

    expect(res.body.ok).toBe(true)
    expect(getDeliveryRouteMock).toHaveBeenCalledWith('supplier-1', routeId, {
      driverIdScope: 'driver-a',
    })
    expect(reorderRouteStops).toHaveBeenCalledWith('supplier-1', routeId, expect.any(Array), {
      driverIdScope: 'driver-a',
    })
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
