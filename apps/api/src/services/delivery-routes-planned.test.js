import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
const clientQueryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (fn) => fn({ query: (...args) => clientQueryMock(...args) }),
}))

vi.mock('./driver-fulfillment.service.js', () => ({
  assertSupplierOwnsOrder: vi.fn().mockResolvedValue({ id: 'o1', status: 'PLACED' }),
  updateDeliveryStatus: vi.fn().mockResolvedValue({}),
  getActiveDriverAssignment: vi.fn().mockResolvedValue(null),
}))

describe('delivery-routes planned assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
    clientQueryMock.mockReset()
  })

  it('allows PLACED orders on planned route without driver assignment', async () => {
    const { createDeliveryRoute } = await import('./delivery-routes.service.js')

    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', full_name: 'Alex', vehicle_type: null, vehicle_plate: null }],
      })
      .mockResolvedValueOnce({ rows: [] })

    clientQueryMock
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'r1',
            route_number: 'R-1',
            route_label: null,
            area: null,
            driver_id: 'd1',
            driver_name: 'Alex',
            vehicle_info: null,
            status: 'PLANNED',
            scheduled_date: '2026-06-07',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ address_json: {} }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const route = await createDeliveryRoute({
      supplierId: 's1',
      orderIds: ['11111111-1111-4111-8111-111111111111'],
      driverId: '22222222-2222-4222-8222-222222222222',
      scheduledDate: '2026-06-07',
    })

    expect(route.status).toBe('PLANNED')
    const assignmentInsert = clientQueryMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO driver_assignments')
    )
    expect(assignmentInsert).toBeUndefined()
  })

  it('rejects route activation when no orders are dispatch-ready', async () => {
    const { updateDeliveryRoute } = await import('./delivery-routes.service.js')
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
      scheduled_date: '2026-06-07',
      started_at: null,
      completed_at: null,
    }
    const stopRow = {
      id: 'stop-1',
      route_id: 'r1',
      order_id: 'o1',
      sequence_number: 1,
      status: 'PLANNED',
      restaurant_name: 'Cafe',
      address_json: {},
      total_amount: 10,
      item_count: 1,
      notes: null,
      completed_at: null,
      assignment_status: null,
      delivery_area: 'Downtown',
    }

    queryMock
      .mockResolvedValueOnce({ rows: [{ ...routeRow }] })
      .mockResolvedValueOnce({ rows: [stopRow] })
      .mockResolvedValueOnce({ rows: [] })

    clientQueryMock
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [routeRow] })
      .mockResolvedValueOnce({ rows: [stopRow] })
      .mockResolvedValueOnce({ rows: [{ status: 'PLACED' }] })

    await expect(
      updateDeliveryRoute('s1', 'r1', { status: 'IN_PROGRESS', userId: 'u1' })
    ).rejects.toThrow(/ready for dispatch/i)
  })
})
