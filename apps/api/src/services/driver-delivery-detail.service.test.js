import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

import { getDriverDeliveryDetail } from './driver-delivery-detail.service.js'

describe('driver-delivery-detail.service', () => {
  beforeEach(() => queryMock.mockReset())

  it('returns supplier-scoped operational data with snapshot destination and effective date', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            order_id: 'order-1',
            order_status: 'SHIPPED',
            requested_delivery_date: '2026-09-20',
            order_created_at: '2026-09-01',
            delivery_location_snapshot: {
              label: 'Loading dock',
              latitude: 33.9,
              longitude: 35.5,
              address: '12 Market Street',
            },
            restaurant_name: 'Test Restaurant',
            restaurant_address: { city: 'Beirut' },
            branch_id: 'branch-1',
            branch_name: 'Downtown',
            branch_address: '12 Market Street',
            assignment_id: 'assignment-1',
            driver_id: 'driver-1',
            warehouse_assignment_id: 'warehouse-1',
            assignment_status: 'assigned',
            assigned_at: '2026-09-15T08:00:00.000Z',
            scheduled_delivery_date: null,
            route_id: 'route-1',
            route_number: 'R-001',
            route_date: '2026-09-19',
            route_stop_id: 'stop-1',
            sequence_number: 2,
            pod_available: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'item-1', quantity: '6', item_name: 'Tomatoes', sku: 'TOM-01' }],
      })

    const detail = await getDriverDeliveryDetail('order-1', 'supplier-1')

    expect(detail.destination).toMatchObject({
      source: 'snapshot',
      label: 'Loading dock',
      address: '12 Market Street',
      latitude: 33.9,
      longitude: 35.5,
    })
    expect(detail.items).toEqual([{ id: 'item-1', name: 'Tomatoes', sku: 'TOM-01', quantity: 6 }])
    expect(detail.scheduledDeliveryDate).toBe('2026-09-19')
    expect(detail.assignment).toMatchObject({ id: 'assignment-1', driverId: 'driver-1' })
    expect(detail.route).toMatchObject({ id: 'route-1', stopId: 'stop-1' })
    expect(detail.podAvailable).toBe(false)
  })
})
