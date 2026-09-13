import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
const clientQueryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (fn) => fn({ query: (...args) => clientQueryMock(...args) }),
}))

const assertSupplierOwnsOrderMock = vi.fn().mockResolvedValue({ id: 'o1', status: 'SHIPPED' })

vi.mock('./driver-fulfillment.service.js', () => ({
  assertSupplierOwnsOrder: (...args) => assertSupplierOwnsOrderMock(...args),
  updateDeliveryStatus: vi.fn().mockResolvedValue({}),
  getActiveDriverAssignment: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/dispatch-cache.js', () => ({
  invalidateDispatchCacheForSupplier: vi.fn(),
}))

vi.mock('../lib/delivery-zone-join.js', () => ({
  getDeliveryZoneJoinSql: vi.fn().mockResolvedValue(''),
}))

describe('delivery-routes.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
    clientQueryMock.mockReset()
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

    queryMock
      .mockResolvedValueOnce({ rows: [routeRow] })
      .mockResolvedValueOnce({ rows: stopRows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [routeRow] })
      .mockResolvedValueOnce({ rows: stopRows })
      .mockResolvedValueOnce({ rows: [] })

    clientQueryMock.mockResolvedValue({ rowCount: 1 })

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

    queryMock
      .mockResolvedValueOnce({ rows: [routeRow] })
      .mockResolvedValueOnce({ rows: stopRows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [routeRow] })
      .mockResolvedValueOnce({ rows: stopRows })
      .mockResolvedValueOnce({ rows: [] })

    clientQueryMock.mockResolvedValue({ rowCount: 1 })

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
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseRoute, status: 'CANCELLED', driver_name: 'Alex' }] })
      .mockResolvedValueOnce({ rows: [] })
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
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseRoute, status: 'CANCELLED' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    await cancelDeliveryRoute('s1', 'r1')

    const releaseCall = clientQueryMock.mock.calls.find(([sql]) =>
      sql.includes("SET status = 'reassigned'")
    )
    expect(releaseCall).toBeDefined()
    expect(releaseCall[1][0]).toBe('s1')
    expect(releaseCall[1][1]).toEqual(['o1', 'o2'])
    expect(releaseCall[1][2]).toEqual(
      expect.arrayContaining(['assigned', 'picked_up', 'out_for_delivery', 'rescheduled'])
    )
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
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...routeRow, driver_name: 'Alex' }] })
      .mockResolvedValueOnce({ rows: stopRows })
      .mockResolvedValueOnce({ rows: [] })

    const route = await buildDriverRouteFromAssignments('s1', 'd1')
    expect(route.stops.length).toBe(2)
  })
})
