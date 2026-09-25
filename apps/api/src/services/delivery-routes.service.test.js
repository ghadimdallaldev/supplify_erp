import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError } from '../middlewares/errorHandler.js'

const queryMock = vi.fn()
const clientQueryMock = vi.fn()
let committedOps = []
let pendingOps = []
let txShouldFailAfterFn = false

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: async (fn) => {
    pendingOps = []
    const client = {
      query: async (...args) => {
        pendingOps.push({ sql: String(args[0]), params: args[1] })
        return clientQueryMock(...args)
      },
    }
    try {
      const result = await fn(client)
      if (txShouldFailAfterFn) {
        throw new Error('simulated commit failure')
      }
      committedOps.push(...pendingOps)
      return result
    } catch (error) {
      pendingOps = []
      throw error
    }
  },
}))

const assertSupplierOwnsOrderMock = vi.fn().mockResolvedValue({ id: 'o1', status: 'SHIPPED' })
const updateDeliveryStatusMock = vi.fn().mockResolvedValue({})
const listActiveDriverAssignmentsMock = vi.fn().mockResolvedValue([])
const runDeliveryPostCommitEffectsMock = vi.fn(async (effects = []) => {
  for (const effect of effects) await effect()
})
const notifyEffectMock = vi.fn()

vi.mock('./driver-fulfillment.service.js', () => ({
  assertSupplierOwnsOrder: (...args) => assertSupplierOwnsOrderMock(...args),
  updateDeliveryStatus: (...args) => updateDeliveryStatusMock(...args),
  listActiveDriverAssignments: (...args) => listActiveDriverAssignmentsMock(...args),
  runDeliveryPostCommitEffects: (...args) => runDeliveryPostCommitEffectsMock(...args),
  DRIVER_STATUS_TRANSITIONS: {
    assigned: ['picked_up', 'out_for_delivery', 'failed', 'reassigned', 'rescheduled'],
    picked_up: ['out_for_delivery', 'failed', 'rescheduled'],
    out_for_delivery: ['delivered', 'failed', 'rescheduled'],
    rescheduled: ['assigned'],
  },
}))

const invalidateDispatchCacheForSupplierMock = vi.fn()

vi.mock('../lib/dispatch-cache.js', () => ({
  invalidateDispatchCacheForSupplier: (...args) => invalidateDispatchCacheForSupplierMock(...args),
}))

vi.mock('../lib/delivery-zone-join.js', () => ({
  getDeliveryZoneJoinSql: vi.fn().mockResolvedValue(''),
}))

vi.mock('./driver-location.service.js', () => ({
  getLatestLocationsForDrivers: vi.fn().mockResolvedValue(new Map()),
}))

describe('delivery-routes.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
    clientQueryMock.mockReset()
    committedOps = []
    pendingOps = []
    txShouldFailAfterFn = false
    updateDeliveryStatusMock.mockResolvedValue({})
    listActiveDriverAssignmentsMock.mockResolvedValue([])
  })

  it('rejects order already on active route', async () => {
    const { createDeliveryRoute } = await import('./delivery-routes.service.js')
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'r2', route_number: 'R-OLD', status: 'PLANNED' }],
    })
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'd1', full_name: 'Alex', vehicle_type: null, vehicle_plate: null }],
    })

    await expect(
      createDeliveryRoute({
        supplierId: 's1',
        orderIds: ['11111111-1111-4111-8111-111111111111'],
        driverId: '22222222-2222-4222-8222-222222222222',
        scheduledDate: '2026-05-28',
      })
    ).rejects.toThrow(/already on route/i)
  })

  it('lists routes for supplier', async () => {
    const { listDeliveryRoutes } = await import('./delivery-routes.service.js')
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'r1',
            route_number: 'R-1',
            route_label: 'Run A',
            area: 'North',
            driver_id: 'd1',
            driver_name: 'Alex',
            driver_name_legacy: null,
            vehicle_info: null,
            status: 'PLANNED',
            scheduled_date: '2026-05-28',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })

    const routes = await listDeliveryRoutes('s1')
    expect(routes).toHaveLength(1)
    expect(routes[0].routeLabel).toBe('Run A')
    expect(routes[0].area).toBe('North')
    expect(routes[0].stops).toBe(0)
    expect(Array.isArray(routes[0].stops)).toBe(false)
  })

  it('listDeliveryRoutes returns stop count not stop objects', async () => {
    const { listDeliveryRoutes } = await import('./delivery-routes.service.js')
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'r1',
            route_number: 'R-1',
            route_label: 'Run A',
            area: 'North',
            driver_id: 'd1',
            driver_name: 'Alex',
            driver_name_legacy: null,
            vehicle_info: null,
            status: 'IN_PROGRESS',
            scheduled_date: '2026-05-28',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'stop-1',
            route_id: 'r1',
            order_id: 'o1',
            sequence_number: 1,
            status: 'PLANNED',
            restaurant_name: 'Cafe One',
            delivery_area: 'Downtown',
            address_json: {},
            total_amount: 100,
            item_count: 3,
            notes: null,
            completed_at: null,
            assignment_status: 'assigned',
          },
        ],
      })

    const routes = await listDeliveryRoutes('s1')
    expect(routes[0].stops).toBe(1)
    expect(typeof routes[0].stops).toBe('number')
  })

  it('does not add an order that was routed while the request was in flight', async () => {
    const { addOrdersToPlannedRoute } = await import('./delivery-routes.service.js')
    const orderId = '11111111-1111-4111-8111-111111111111'
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'r1',
            route_number: 'R-1',
            route_label: null,
            area: null,
            driver_id: null,
            driver_name: null,
            vehicle_info: null,
            status: 'PLANNED',
            scheduled_date: '2026-06-07',
            started_at: null,
            completed_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    clientQueryMock.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('MAX(sequence_number)')) return { rows: [{ n: 0 }] }
      if (text.includes('SELECT id FROM route_stop WHERE route_id')) return { rows: [] }
      if (text.includes('FOR UPDATE')) return { rows: [{ id: orderId }] }
      if (text.includes('SELECT dr.id, dr.route_number')) {
        return { rows: [{ id: 'r-other', route_number: 'R-9', status: 'PLANNED' }] }
      }
      return { rows: [] }
    })

    await expect(
      addOrdersToPlannedRoute({
        supplierId: 's1',
        routeId: 'r1',
        orderIds: [orderId],
        userId: 'u1',
      })
    ).rejects.toThrow(/already on route R-9/)
    expect(
      clientQueryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO route_stop'))
    ).toBe(false)
  })

  it('getActiveRouteForOrder returns route when on active run', async () => {
    const { getActiveRouteForOrder } = await import('./delivery-routes.service.js')
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'r1', route_number: 'R-1', status: 'IN_PROGRESS' }],
    })
    const found = await getActiveRouteForOrder('o1', 's1')
    expect(found?.route_number).toBe('R-1')
  })

  it('rejects invalid driver on create', async () => {
    const { createDeliveryRoute } = await import('./delivery-routes.service.js')
    queryMock.mockResolvedValueOnce({ rows: [] })

    await expect(
      createDeliveryRoute({
        supplierId: 's1',
        orderIds: ['11111111-1111-4111-8111-111111111111'],
        driverId: '22222222-2222-4222-8222-222222222222',
        scheduledDate: '2026-05-28',
      })
    ).rejects.toThrow(/driver not found/i)
  })

  it('driver cannot view another drivers route', async () => {
    const { getDeliveryRoute } = await import('./delivery-routes.service.js')
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'r1',
          route_number: 'R-1',
          route_label: 'R-1',
          area: null,
          driver_id: 'other-driver',
          driver_name: 'Other',
          driver_name_legacy: null,
          vehicle_info: null,
          status: 'PLANNED',
          scheduled_date: '2026-05-28',
          started_at: null,
          completed_at: null,
        },
      ],
    })

    await expect(getDeliveryRoute('s1', 'r1', { driverIdScope: 'my-driver' })).rejects.toThrow(
      /own routes/i
    )
  })

  it('reorders stops in sequence', async () => {
    const { reorderRouteStops } = await import('./delivery-routes.service.js')
    const routeRow = {
      id: 'r1',
      route_number: 'R-1',
      route_label: 'R-1',
      area: null,
      driver_id: 'd1',
      driver_name: 'Alex',
      driver_name_legacy: null,
      vehicle_info: null,
      status: 'PLANNED',
      scheduled_date: '2026-05-28',
      started_at: null,
      completed_at: null,
    }
    const stopRows = [
      {
        id: 'stop-a',
        route_id: 'r1',
        order_id: 'o1',
        sequence_number: 1,
        status: 'PLANNED',
        restaurant_name: 'A',
        address_json: {},
        total_amount: 0,
        item_count: 0,
        notes: null,
        completed_at: null,
        assignment_status: null,
      },
      {
        id: 'stop-b',
        route_id: 'r1',
        order_id: 'o2',
        sequence_number: 2,
        status: 'PLANNED',
        restaurant_name: 'B',
        address_json: {},
        total_amount: 0,
        item_count: 0,
        notes: null,
        completed_at: null,
        assignment_status: null,
      },
    ]

    queryMock.mockResolvedValueOnce({ rows: [routeRow] }).mockResolvedValueOnce({ rows: stopRows })

    clientQueryMock.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('FROM delivery_route')) return { rows: [routeRow] }
      if (text.includes('FROM route_stop')) return { rows: stopRows }
      return { rowCount: 1 }
    })

    const result = await reorderRouteStops('s1', 'r1', ['stop-b', 'stop-a'])
    expect(result.stops).toHaveLength(2)
    expect(clientQueryMock).toHaveBeenCalled()
  })

  it('rejects reorder on completed route', async () => {
    const { reorderRouteStops } = await import('./delivery-routes.service.js')
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'r1',
          route_number: 'R-1',
          route_label: 'R-1',
          area: null,
          driver_id: 'd1',
          driver_name: 'Alex',
          driver_name_legacy: null,
          vehicle_info: null,
          status: 'COMPLETED',
          scheduled_date: '2026-05-28',
          started_at: null,
          completed_at: null,
        },
      ],
    })
    queryMock.mockResolvedValueOnce({ rows: [] })

    await expect(reorderRouteStops('s1', 'r1', ['stop-a'])).rejects.toThrow(/finished route/i)
  })

  it('driver cannot reorder another drivers route', async () => {
    const { reorderRouteStops } = await import('./delivery-routes.service.js')
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'r1',
          route_number: 'R-1',
          route_label: 'R-1',
          area: null,
          driver_id: 'other-driver',
          driver_name: 'Other',
          driver_name_legacy: null,
          vehicle_info: null,
          status: 'PLANNED',
          scheduled_date: '2026-05-28',
          started_at: null,
          completed_at: null,
        },
      ],
    })

    await expect(
      reorderRouteStops('s1', 'r1', ['stop-a'], { driverIdScope: 'my-driver' })
    ).rejects.toThrow(/own routes/i)
  })

  it('setNextRouteStop moves target to front of active stops', async () => {
    const { setNextRouteStop } = await import('./delivery-routes.service.js')
    const routeRow = {
      id: 'r1',
      route_number: 'R-1',
      route_label: 'R-1',
      area: null,
      driver_id: 'd1',
      driver_name: 'Alex',
      driver_name_legacy: null,
      vehicle_info: null,
      status: 'IN_PROGRESS',
      scheduled_date: '2026-05-28',
      started_at: null,
      completed_at: null,
    }
    const stopRows = [
      {
        id: 'stop-a',
        route_id: 'r1',
        order_id: '11111111-1111-4111-8111-111111111111',
        sequence_number: 1,
        status: 'PLANNED',
        restaurant_name: 'A',
        address_json: {},
        destination_latitude: null,
        destination_longitude: null,
        total_amount: 0,
        item_count: 0,
        notes: null,
        completed_at: null,
        assignment_status: null,
      },
      {
        id: 'stop-b',
        route_id: 'r1',
        order_id: '22222222-2222-4222-8222-222222222222',
        sequence_number: 2,
        status: 'PLANNED',
        restaurant_name: 'B',
        address_json: {},
        destination_latitude: null,
        destination_longitude: null,
        total_amount: 0,
        item_count: 0,
        notes: null,
        completed_at: null,
        assignment_status: null,
      },
    ]

    queryMock.mockResolvedValueOnce({ rows: [routeRow] }).mockResolvedValueOnce({ rows: stopRows })

    clientQueryMock.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('FROM delivery_route')) return { rows: [routeRow] }
      if (text.includes('FROM route_stop')) return { rows: stopRows }
      return { rowCount: 1 }
    })

    await setNextRouteStop('s1', 'r1', '22222222-2222-4222-8222-222222222222')
    expect(clientQueryMock).toHaveBeenCalled()
  })

  it('cancelled route sets status CANCELLED', async () => {
    const { cancelDeliveryRoute } = await import('./delivery-routes.service.js')
    const baseRoute = {
      id: 'r1',
      route_number: 'R-1',
      route_label: 'R-1',
      area: null,
      driver_id: 'd1',
      driver_name: 'Alex',
      driver_name_legacy: null,
      vehicle_info: null,
      status: 'PLANNED',
      scheduled_date: '2026-05-28',
      started_at: null,
      completed_at: null,
    }

    // The UPDATE and the driver release now run on the transaction client, so only
    // the two getDeliveryRoute reads go through `query`.
    queryMock
      .mockResolvedValueOnce({ rows: [{ ...baseRoute, driver_name: 'Alex' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseRoute, status: 'CANCELLED', driver_name: 'Alex' }] })
      .mockResolvedValueOnce({ rows: [] })

    const route = await cancelDeliveryRoute('s1', 'r1')
    expect(route.status).toBe('CANCELLED')
  })

  it('cancelling a route releases the drivers still holding its stops', async () => {
    const { cancelDeliveryRoute } = await import('./delivery-routes.service.js')
    const baseRoute = {
      id: 'r1',
      route_number: 'R-1',
      route_label: 'R-1',
      area: null,
      driver_id: 'd1',
      driver_name: 'Alex',
      vehicle_info: null,
      status: 'PLANNED',
      scheduled_date: '2026-05-28',
      started_at: null,
      completed_at: null,
    }
    const stopRows = [
      { id: 'st1', route_id: 'r1', order_id: 'o1', status: 'PLANNED', sequence_number: 1 },
      { id: 'st2', route_id: 'r1', order_id: 'o2', status: 'PLANNED', sequence_number: 2 },
    ]

    queryMock
      .mockResolvedValueOnce({ rows: [baseRoute] })
      .mockResolvedValueOnce({ rows: stopRows })
      .mockResolvedValueOnce({ rows: [{ ...baseRoute, status: 'CANCELLED' }] })
      .mockResolvedValueOnce({ rows: [] })

    await cancelDeliveryRoute('s1', 'r1')

    const releaseCall = clientQueryMock.mock.calls.find(([sql]) =>
      sql.includes("SET status = 'reassigned'")
    )
    expect(releaseCall).toBeDefined()
    expect(releaseCall[1][0]).toBe('s1')
    expect(releaseCall[1][1]).toEqual(['o1', 'o2'])
    expect(releaseCall[1][2]).toBe('d1')
    expect(releaseCall[1][3]).toEqual(
      expect.arrayContaining(['assigned', 'picked_up', 'out_for_delivery', 'rescheduled'])
    )
    expect(releaseCall[0]).toMatch(/driver_id = \$3/)
    expect(releaseCall[0]).not.toMatch(/status = 'delivered'/)
  })

  it('buildDriverRouteFromAssignments requires at least 2 eligible deliveries', async () => {
    const { buildDriverRouteFromAssignments } = await import('./delivery-routes.service.js')
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', full_name: 'Alex', vehicle_type: null, vehicle_plate: null }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            order_id: 'o1',
            assignment_status: 'assigned',
            created_at: new Date(),
            order_status: 'SHIPPED',
            address_json: {},
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })

    await expect(buildDriverRouteFromAssignments('s1', 'd1')).rejects.toThrow(/at least 2/i)
  })

  it('createDeliveryRoute assigns driver to every pending warehouse leg', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111'

    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', full_name: 'Alex', vehicle_type: null, vehicle_plate: null }],
      })
      .mockResolvedValueOnce({ rows: [] })

    clientQueryMock.mockImplementation(async (sql, params) => {
      const text = String(sql)
      if (text.includes('SELECT dr.id, dr.route_number')) return { rows: [] }
      if (text.includes('AS date_part')) return { rows: [{ date_part: '20260528', n: 0 }] }
      if (text.includes('COUNT(*)::int AS n')) return { rows: [{ n: 0 }] }
      if (text.includes('INSERT INTO delivery_route')) {
        return {
          rows: [
            {
              id: 'r1',
              route_number: 'R-20260528-001',
              route_label: null,
              area: null,
              driver_id: 'd1',
              driver_name: 'Alex',
              vehicle_info: null,
              status: 'PLANNED',
              scheduled_date: '2026-05-28',
            },
          ],
        }
      }
      if (text.includes('SELECT r.address_json')) return { rows: [{ address_json: {} }] }
      if (text.includes('INSERT INTO route_stop')) return { rows: [{ id: 'stop-1' }] }
      if (text.includes('order_warehouse_assignment') && text.includes('status NOT IN')) {
        return { rows: [{ id: 'wh-a' }, { id: 'wh-b' }] }
      }
      if (text.includes('FROM driver_assignments da') && text.includes('warehouse_assignment_id')) {
        return { rows: [] }
      }
      if (text.includes('INSERT INTO driver_assignments')) {
        return { rows: [{ id: `da-${params[1]}`, warehouse_assignment_id: params[1] }] }
      }
      if (text.includes('FROM route_stop rs')) {
        return {
          rows: [
            {
              id: 'stop-1',
              route_id: 'r1',
              order_id: orderId,
              sequence_number: 1,
              status: 'PLANNED',
              restaurant_name: 'Cafe',
              address_json: {},
              total_amount: 100,
              item_count: 2,
              notes: null,
              completed_at: null,
              assignment_status: 'assigned',
              destination_latitude: null,
              destination_longitude: null,
              delivery_area: 'North',
            },
          ],
        }
      }
      return { rows: [] }
    })

    const { createDeliveryRoute } = await import('./delivery-routes.service.js')
    await createDeliveryRoute({
      supplierId: 's1',
      orderIds: [orderId],
      driverId: 'd1',
      scheduledDate: '2026-05-28',
    })

    const inserts = clientQueryMock.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO driver_assignments')
    )
    expect(inserts).toHaveLength(2)
    expect(inserts[0][1][1]).toBe('wh-a')
    expect(inserts[1][1][1]).toBe('wh-b')
  })

  it('refuses to plan a route over a failed delivery attempt', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111'
    const { createDeliveryRoute } = await import('./delivery-routes.service.js')

    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', full_name: 'Alex', vehicle_type: null, vehicle_plate: null }],
      })
      .mockResolvedValueOnce({ rows: [] })

    clientQueryMock.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('SELECT dr.id, dr.route_number')) return { rows: [] }
      if (text.includes('AS date_part')) return { rows: [{ date_part: '20260528', n: 0 }] }
      if (text.includes('COUNT(*)::int AS n')) return { rows: [{ n: 0 }] }
      if (text.includes('INSERT INTO delivery_route')) {
        return {
          rows: [
            {
              id: 'r1',
              route_number: 'R-20260528-001',
              status: 'PLANNED',
              driver_id: 'd1',
              scheduled_date: '2026-05-28',
            },
          ],
        }
      }
      if (text.includes('SELECT r.address_json')) return { rows: [{ address_json: {} }] }
      if (text.includes('INSERT INTO route_stop')) return { rows: [{ id: 'stop-1' }] }
      if (text.includes('order_warehouse_assignment') && text.includes('status NOT IN')) {
        return { rows: [{ id: 'wh-a' }] }
      }
      if (text.includes('FROM driver_assignments da') && text.includes('warehouse_assignment_id')) {
        return { rows: [{ id: 'da-failed', driver_id: 'd1', status: 'failed' }] }
      }
      return { rows: [] }
    })

    await expect(
      createDeliveryRoute({
        supplierId: 's1',
        orderIds: [orderId],
        driverId: 'd1',
        scheduledDate: '2026-05-28',
      })
    ).rejects.toThrow(/Retry that delivery/)
    expect(committedOps.some((op) => String(op.sql).includes('INSERT INTO delivery_route'))).toBe(
      false
    )
  })

  it('releases a cancelled order on the caller transaction', async () => {
    const { releaseOrderFromPlannedRoutes } = await import('./delivery-routes.service.js')
    const clientQuery = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] })

    const result = await releaseOrderFromPlannedRoutes('order-1', 'supplier-1', {
      query: clientQuery,
    })

    expect(result.releasedStops).toBe(1)
    expect(String(clientQuery.mock.calls[0][0])).toMatch(/DELETE FROM route_stop/)
    expect(String(clientQuery.mock.calls[1][0])).toMatch(/status = 'reassigned'/)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('does not take a warehouse leg that another driver already holds', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111'
    const { createDeliveryRoute } = await import('./delivery-routes.service.js')

    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', full_name: 'Alex', vehicle_type: null, vehicle_plate: null }],
      })
      .mockResolvedValueOnce({ rows: [] })

    clientQueryMock.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('SELECT dr.id, dr.route_number')) return { rows: [] }
      if (text.includes('AS date_part')) return { rows: [{ date_part: '20260528', n: 0 }] }
      if (text.includes('COUNT(*)::int AS n')) return { rows: [{ n: 0 }] }
      if (text.includes('INSERT INTO delivery_route')) {
        return {
          rows: [
            {
              id: 'r1',
              route_number: 'R-20260528-001',
              status: 'PLANNED',
              driver_id: 'd1',
              scheduled_date: '2026-05-28',
            },
          ],
        }
      }
      if (text.includes('SELECT r.address_json')) return { rows: [{ address_json: {} }] }
      if (text.includes('INSERT INTO route_stop')) return { rows: [{ id: 'stop-1' }] }
      if (text.includes('order_warehouse_assignment') && text.includes('status NOT IN')) {
        return { rows: [{ id: 'wh-a' }] }
      }
      if (text.includes('FROM driver_assignments da') && text.includes('warehouse_assignment_id')) {
        return { rows: [{ id: 'da-other', driver_id: 'd-other', status: 'assigned' }] }
      }
      return { rows: [] }
    })

    await expect(
      createDeliveryRoute({
        supplierId: 's1',
        orderIds: [orderId],
        driverId: 'd1',
        scheduledDate: '2026-05-28',
      })
    ).rejects.toThrow(/another driver/)

    expect(
      clientQueryMock.mock.calls.some(
        ([sql]) =>
          String(sql).includes('UPDATE driver_assignments SET status') &&
          String(sql).includes('reassigned')
      )
    ).toBe(false)
  })

  it('keeps a pickup that is already in progress when the order is planned onto that driver', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111'
    const { createDeliveryRoute } = await import('./delivery-routes.service.js')

    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', full_name: 'Alex', vehicle_type: null, vehicle_plate: null }],
      })
      .mockResolvedValueOnce({ rows: [] })

    clientQueryMock.mockImplementation(async (sql) => {
      const text = String(sql)
      if (text.includes('SELECT dr.id, dr.route_number')) return { rows: [] }
      if (text.includes('AS date_part')) return { rows: [{ date_part: '20260528', n: 0 }] }
      if (text.includes('COUNT(*)::int AS n')) return { rows: [{ n: 0 }] }
      if (text.includes('INSERT INTO delivery_route')) {
        return {
          rows: [
            {
              id: 'r1',
              route_number: 'R-20260528-001',
              status: 'PLANNED',
              driver_id: 'd1',
              driver_name: 'Alex',
              scheduled_date: '2026-05-28',
            },
          ],
        }
      }
      if (text.includes('SELECT r.address_json')) return { rows: [{ address_json: {} }] }
      if (text.includes('INSERT INTO route_stop')) return { rows: [{ id: 'stop-1' }] }
      if (text.includes('order_warehouse_assignment') && text.includes('status NOT IN')) {
        return { rows: [{ id: 'wh-a' }] }
      }
      if (text.includes('FROM driver_assignments da') && text.includes('warehouse_assignment_id')) {
        return { rows: [{ id: 'da-live', driver_id: 'd1', status: 'picked_up' }] }
      }
      if (text.includes('FROM route_stop rs')) {
        return {
          rows: [
            {
              id: 'stop-1',
              route_id: 'r1',
              order_id: orderId,
              sequence_number: 1,
              status: 'PLANNED',
              restaurant_name: 'Cafe',
              address_json: {},
              total_amount: 10,
              item_count: 1,
              notes: null,
              completed_at: null,
              assignment_status: 'picked_up',
              destination_latitude: null,
              destination_longitude: null,
              delivery_area: null,
            },
          ],
        }
      }
      return { rows: [] }
    })

    await createDeliveryRoute({
      supplierId: 's1',
      orderIds: [orderId],
      driverId: 'd1',
      scheduledDate: '2026-05-28',
    })

    expect(
      clientQueryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO driver_assignments')
      )
    ).toBe(false)
    expect(
      clientQueryMock.mock.calls.some(([sql]) => String(sql).includes("status = 'reassigned'"))
    ).toBe(false)
  })

  it('buildDriverRouteFromAssignments returns existing route when already sufficient', async () => {
    const { buildDriverRouteFromAssignments } = await import('./delivery-routes.service.js')
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', full_name: 'Alex', vehicle_type: null, vehicle_plate: null }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'r1' }] })

    const routeRow = {
      id: 'r1',
      route_number: 'R-1',
      route_label: "Alex — Today's route",
      area: null,
      driver_id: 'd1',
      driver_name: 'Alex',
      driver_name_legacy: null,
      vehicle_info: null,
      status: 'IN_PROGRESS',
      scheduled_date: '2026-06-07',
      started_at: null,
      completed_at: null,
    }
    const stopRows = [
      {
        id: 'stop-a',
        route_id: 'r1',
        order_id: 'o1',
        sequence_number: 1,
        status: 'PLANNED',
        restaurant_name: 'A',
        address_json: {},
        total_amount: 0,
        item_count: 0,
        notes: null,
        completed_at: null,
        assignment_status: 'assigned',
        destination_latitude: null,
        destination_longitude: null,
        delivery_area: 'Area',
      },
      {
        id: 'stop-b',
        route_id: 'r1',
        order_id: 'o2',
        sequence_number: 2,
        status: 'PLANNED',
        restaurant_name: 'B',
        address_json: {},
        total_amount: 0,
        item_count: 0,
        notes: null,
        completed_at: null,
        assignment_status: 'assigned',
        destination_latitude: null,
        destination_longitude: null,
        delivery_area: 'Area',
      },
    ]

    queryMock
      .mockResolvedValueOnce({ rows: [{ ...routeRow, driver_name: 'Alex' }] })
      .mockResolvedValueOnce({ rows: stopRows })
      .mockResolvedValueOnce({ rows: [{ ...routeRow, driver_name: 'Alex' }] })
      .mockResolvedValueOnce({ rows: stopRows })

    const route = await buildDriverRouteFromAssignments('s1', 'd1')
    expect(route.stops.length).toBe(2)
  })

  describe('updateRouteStop atomicity', () => {
    const routeId = 'r1'
    const stopId = 'stop-1'
    const orderId = 'o1'

    function mockSuccessfulRouteReload({
      routeStatus = 'IN_PROGRESS',
      stopStatus = 'COMPLETED',
    } = {}) {
      const routeRow = {
        id: routeId,
        route_number: 'R-1',
        route_label: 'R-1',
        area: null,
        driver_id: 'd1',
        driver_name: 'Alex',
        driver_name_legacy: null,
        vehicle_info: null,
        status: routeStatus,
        scheduled_date: '2026-05-28',
        started_at: null,
        completed_at: routeStatus === 'COMPLETED' ? new Date() : null,
      }
      const stopRows = [
        {
          id: stopId,
          route_id: routeId,
          order_id: orderId,
          sequence_number: 1,
          status: stopStatus,
          restaurant_name: 'Cafe',
          address_json: {},
          total_amount: 0,
          item_count: 0,
          notes: null,
          completed_at: null,
          assignment_status: 'delivered',
          destination_latitude: null,
          destination_longitude: null,
          delivery_area: 'North',
        },
      ]
      queryMock
        .mockResolvedValueOnce({ rows: [routeRow] })
        .mockResolvedValueOnce({ rows: stopRows })
    }

    it('rolls back earlier assignment work when a later leg fails', async () => {
      const { updateRouteStop } = await import('./delivery-routes.service.js')

      listActiveDriverAssignmentsMock.mockResolvedValueOnce([
        { id: 'da-a', status: 'out_for_delivery', supplier_id: 's1', driver_id: 'd1' },
        { id: 'da-b', status: 'out_for_delivery', supplier_id: 's1', driver_id: 'd1' },
      ])

      updateDeliveryStatusMock
        .mockImplementationOnce(async ({ client, postCommitEffects }) => {
          await client.query('UPDATE driver_assignments SET status = $1 WHERE id = $2', [
            'delivered',
            'da-a',
          ])
          postCommitEffects.push(() => notifyEffectMock('leg-a'))
          return { id: 'da-a', status: 'delivered' }
        })
        .mockImplementationOnce(async () => {
          throw new ValidationError('Cannot transition from out_for_delivery to delivered')
        })

      clientQueryMock.mockImplementation(async (sql) => {
        const text = String(sql)
        if (text.includes('FROM delivery_route') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: routeId, status: 'IN_PROGRESS', driver_id: 'd1' }] }
        }
        if (text.includes('FROM route_stop') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: stopId, order_id: orderId, status: 'IN_TRANSIT', notes: null }] }
        }
        return { rows: [], rowCount: 1 }
      })

      await expect(
        updateRouteStop('s1', routeId, stopId, { status: 'DELIVERED', userId: 'u1' })
      ).rejects.toThrow(/Cannot transition/)

      expect(committedOps).toHaveLength(0)
      expect(notifyEffectMock).not.toHaveBeenCalled()
      expect(invalidateDispatchCacheForSupplierMock).not.toHaveBeenCalled()
      expect(
        pendingOps.some((op) => op.sql.includes('UPDATE route_stop')) ||
          committedOps.some((op) => op.sql.includes('UPDATE route_stop'))
      ).toBe(false)
    })

    it('does not commit stop/route changes or side effects when commit fails', async () => {
      const { updateRouteStop } = await import('./delivery-routes.service.js')
      txShouldFailAfterFn = true

      listActiveDriverAssignmentsMock.mockResolvedValueOnce([
        { id: 'da-a', status: 'out_for_delivery', supplier_id: 's1', driver_id: 'd1' },
      ])

      updateDeliveryStatusMock.mockImplementationOnce(async ({ client, postCommitEffects }) => {
        await client.query('UPDATE driver_assignments SET status = $1 WHERE id = $2', [
          'delivered',
          'da-a',
        ])
        postCommitEffects.push(() => notifyEffectMock('delivered'))
        return { id: 'da-a', status: 'delivered' }
      })

      clientQueryMock.mockImplementation(async (sql) => {
        const text = String(sql)
        if (text.includes('FROM delivery_route') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: routeId, status: 'IN_PROGRESS', driver_id: 'd1' }] }
        }
        if (text.includes('FROM route_stop') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: stopId, order_id: orderId, status: 'IN_TRANSIT', notes: null }] }
        }
        if (text.includes('SELECT status FROM route_stop')) {
          return { rows: [{ status: 'COMPLETED' }] }
        }
        return { rows: [], rowCount: 1 }
      })

      await expect(
        updateRouteStop('s1', routeId, stopId, { status: 'DELIVERED', userId: 'u1' })
      ).rejects.toThrow(/simulated commit failure/)

      expect(committedOps).toHaveLength(0)
      expect(notifyEffectMock).not.toHaveBeenCalled()
      expect(runDeliveryPostCommitEffectsMock).not.toHaveBeenCalled()
      expect(invalidateDispatchCacheForSupplierMock).not.toHaveBeenCalled()
    })

    it('advances multi-leg assignments, completes the final stop, and notifies after commit', async () => {
      const { updateRouteStop } = await import('./delivery-routes.service.js')

      listActiveDriverAssignmentsMock.mockResolvedValueOnce([
        { id: 'da-a', status: 'out_for_delivery', supplier_id: 's1', driver_id: 'd1' },
        { id: 'da-b', status: 'out_for_delivery', supplier_id: 's1', driver_id: 'd1' },
      ])

      updateDeliveryStatusMock.mockImplementation(
        async ({ client, postCommitEffects, driverAssignmentId }) => {
          await client.query('UPDATE driver_assignments SET status = $1 WHERE id = $2', [
            'delivered',
            driverAssignmentId,
          ])
          postCommitEffects.push(() => notifyEffectMock(driverAssignmentId))
          return { id: driverAssignmentId, status: 'delivered' }
        }
      )

      clientQueryMock.mockImplementation(async (sql) => {
        const text = String(sql)
        if (text.includes('FROM delivery_route') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: routeId, status: 'IN_PROGRESS', driver_id: 'd1' }] }
        }
        if (text.includes('FROM route_stop') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: stopId, order_id: orderId, status: 'IN_TRANSIT', notes: null }] }
        }
        if (text.includes('SELECT status FROM route_stop')) {
          return { rows: [{ status: 'COMPLETED' }] }
        }
        return { rows: [], rowCount: 1 }
      })

      mockSuccessfulRouteReload({ routeStatus: 'COMPLETED', stopStatus: 'COMPLETED' })

      const result = await updateRouteStop('s1', routeId, stopId, {
        status: 'DELIVERED',
        userId: 'u1',
      })

      expect(updateDeliveryStatusMock).toHaveBeenCalledTimes(2)
      expect(updateDeliveryStatusMock.mock.calls[0][0].client).toBeTruthy()
      expect(updateDeliveryStatusMock.mock.calls[1][0].client).toBe(
        updateDeliveryStatusMock.mock.calls[0][0].client
      )
      expect(committedOps.some((op) => op.sql.includes('UPDATE route_stop'))).toBe(true)
      expect(
        committedOps.some(
          (op) => op.sql.includes('UPDATE delivery_route') && op.sql.includes("'COMPLETED'")
        )
      ).toBe(true)
      expect(runDeliveryPostCommitEffectsMock).toHaveBeenCalled()
      expect(notifyEffectMock).toHaveBeenCalledWith('da-a')
      expect(notifyEffectMock).toHaveBeenCalledWith('da-b')
      expect(invalidateDispatchCacheForSupplierMock).toHaveBeenCalledWith('s1')
      expect(result.status).toBe('COMPLETED')
    })

    it('leaves the route IN_PROGRESS when other stops remain open', async () => {
      const { updateRouteStop } = await import('./delivery-routes.service.js')

      listActiveDriverAssignmentsMock.mockResolvedValueOnce([
        { id: 'da-a', status: 'out_for_delivery', supplier_id: 's1', driver_id: 'd1' },
      ])
      updateDeliveryStatusMock.mockResolvedValueOnce({ id: 'da-a', status: 'delivered' })

      clientQueryMock.mockImplementation(async (sql) => {
        const text = String(sql)
        if (text.includes('FROM delivery_route') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: routeId, status: 'IN_PROGRESS', driver_id: 'd1' }] }
        }
        if (text.includes('FROM route_stop') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: stopId, order_id: orderId, status: 'IN_TRANSIT', notes: null }] }
        }
        if (text.includes('SELECT status FROM route_stop')) {
          return { rows: [{ status: 'COMPLETED' }, { status: 'PLANNED' }] }
        }
        return { rows: [], rowCount: 1 }
      })

      mockSuccessfulRouteReload({ routeStatus: 'IN_PROGRESS', stopStatus: 'COMPLETED' })

      const result = await updateRouteStop('s1', routeId, stopId, {
        status: 'DELIVERED',
        userId: 'u1',
      })

      expect(
        committedOps.some(
          (op) => op.sql.includes('UPDATE delivery_route') && op.sql.includes("'COMPLETED'")
        )
      ).toBe(false)
      expect(result.status).toBe('IN_PROGRESS')
    })

    it('rejects invalid route-stop transitions before mutating the stop', async () => {
      const { updateRouteStop } = await import('./delivery-routes.service.js')

      clientQueryMock.mockImplementation(async (sql) => {
        const text = String(sql)
        if (text.includes('FROM delivery_route') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: routeId, status: 'IN_PROGRESS', driver_id: 'd1' }] }
        }
        if (text.includes('FROM route_stop') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: stopId, order_id: orderId, status: 'PLANNED', notes: null }] }
        }
        return { rows: [], rowCount: 1 }
      })

      await expect(
        updateRouteStop('s1', routeId, stopId, { status: 'DELIVERED', userId: 'u1' })
      ).rejects.toThrow(/Cannot transition stop from PLANNED to COMPLETED/)

      expect(updateDeliveryStatusMock).not.toHaveBeenCalled()
      expect(committedOps).toHaveLength(0)
    })

    it('does not deliver another driver when the route stop is completed', async () => {
      const { updateRouteStop } = await import('./delivery-routes.service.js')

      listActiveDriverAssignmentsMock.mockResolvedValueOnce([
        { id: 'da-a', status: 'out_for_delivery', supplier_id: 's1', driver_id: 'd1' },
        { id: 'da-other', status: 'out_for_delivery', supplier_id: 's1', driver_id: 'd2' },
      ])
      updateDeliveryStatusMock.mockResolvedValueOnce({ id: 'da-a', status: 'delivered' })

      clientQueryMock.mockImplementation(async (sql) => {
        const text = String(sql)
        if (text.includes('FROM delivery_route') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: routeId, status: 'IN_PROGRESS', driver_id: 'd1' }] }
        }
        if (text.includes('FROM route_stop') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: stopId, order_id: orderId, status: 'IN_TRANSIT', notes: null }] }
        }
        if (text.includes('SELECT status FROM route_stop')) {
          return { rows: [{ status: 'COMPLETED' }, { status: 'PLANNED' }] }
        }
        return { rows: [], rowCount: 1 }
      })

      mockSuccessfulRouteReload({ routeStatus: 'IN_PROGRESS', stopStatus: 'COMPLETED' })

      await updateRouteStop('s1', routeId, stopId, { status: 'DELIVERED', userId: 'u1' })

      expect(updateDeliveryStatusMock).toHaveBeenCalledTimes(1)
      expect(updateDeliveryStatusMock.mock.calls[0][0].driverAssignmentId).toBe('da-a')
    })
  })
})
