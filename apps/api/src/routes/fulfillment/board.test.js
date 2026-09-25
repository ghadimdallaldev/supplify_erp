import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    __queryMock: queryMock,
  }
})

vi.mock('../../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => {
    req.tenantContext = { tenantId: 'sup-1', tenantType: 'SUPPLIER', permissions: [] }
    next()
  },
  requirePermission: () => (req, res, next) => next(),
  getRequestTenant: vi.fn(),
}))

vi.mock('../../lib/subscription.js', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../../lib/warehouse-helpers.js', () => ({
  isMultiWarehouseFulfillmentActive: vi.fn().mockResolvedValue(false),
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('supplier_id'),
}))

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('./fulfillment.helpers.js', () => ({
  resolveRouteReorderAccess: vi.fn(),
  parseWarehouseFilter: vi.fn().mockReturnValue(null),
  warehouseFilterClause: vi.fn().mockResolvedValue({ clause: '', params: [], warehouseId: null }),
  mapStopStatus: vi.fn(),
  resolveSupplierId: vi.fn().mockResolvedValue('sup-1'),
  loadStopsForRoutes: vi.fn().mockResolvedValue(new Map()),
}))

import boardRouter, { buildDispatchBaseSelect } from './board.js'

describe('fulfillment board driver_id mapping', () => {
  let app
  let db

  beforeEach(async () => {
    const mod = await import('../../lib/db.js')
    db = mod
    db.query.mockReset()
    app = express()
    app.use((req, res, next) => {
      req.requestId = 'test'
      next()
    })
    app.use('/api/fulfillment', boardRouter)
  })

  it('returns delivery_route.driver_id instead of route UUID', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'route-uuid-1',
            route_number: 'R-100',
            driver_id: 'driver-uuid-9',
            driver_name: 'Alex Driver',
            vehicle_info: 'Van 12',
            scheduled_date: '2026-09-14',
            status: 'IN_PROGRESS',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ out_for_delivery: 0, delivered_today: 0 }] })

    const res = await request(app).get('/api/fulfillment/board').expect(200)

    expect(res.body.data.routes[0].driver_id).toBe('driver-uuid-9')
    expect(res.body.data.routes[0].driver_id).not.toBe('route-uuid-1')
    expect(res.body.data.drivers[0].id).toBe('driver-uuid-9')

    const routesSql = db.query.mock.calls[0][0]
    expect(routesSql).toMatch(/driver_id/)
  })

  it('ties dispatch proof and the live route to the driver assignment', () => {
    const sql = buildDispatchBaseSelect('supplier_id')
    expect(sql).toMatch(/pod\.driver_assignment_id = da\.id/)
    expect(sql).toMatch(/dr\.driver_id = da\.driver_id/)
    expect(sql).not.toMatch(/SELECT DISTINCT order_id FROM proof_of_delivery/)
  })
})
