import { describe, expect, it } from 'vitest'
import { buildOrderTimeline } from './orderTimeline'

const baseOrder = {
  id: 'order-1',
  status: 'DELIVERED',
  placed_at: '2026-05-24T14:28:00.000Z',
  created_at: '2026-05-24T14:28:00.000Z',
  updated_at: '2026-05-25T10:00:00.000Z',
  items: [{ supplier_name: 'Test Supplier', product_name: 'Item A' }],
}

describe('buildOrderTimeline', () => {
  it('marks fulfillment steps completed for DELIVERED (restaurant)', () => {
    const events = buildOrderTimeline({ order: baseOrder, viewerRole: 'RESTAURANT' })
    const placed = events.find((e) => e.id === 'placed')
    const delivered = events.find((e) => e.id === 'delivered')
    const received = events.find((e) => e.id === 'received')

    expect(placed?.state).toBe('completed')
    expect(delivered?.state).toBe('completed')
    expect(received?.state).toBe('current')
    expect(placed?.timestamp).toBeTruthy()
    expect(delivered?.timestamp).toBeTruthy()
  })

  it('uses supplier-specific labels and ends at delivered', () => {
    const events = buildOrderTimeline({ order: baseOrder, viewerRole: 'SUPPLIER' })
    const placed = events.find((e) => e.id === 'placed')
    const delivered = events.find((e) => e.id === 'delivered')
    const received = events.find((e) => e.id === 'received')

    expect(placed?.title).toBe('Order received')
    expect(delivered?.title).toBe('Marked delivered')
    expect(delivered?.state).toBe('completed')
    expect(received).toBeUndefined()
  })

  it('marks fulfillment steps completed for legacy COMPLETED (restaurant)', () => {
    const events = buildOrderTimeline({
      order: { ...baseOrder, status: 'COMPLETED' },
      viewerRole: 'RESTAURANT',
    })
    const delivered = events.find((e) => e.id === 'delivered')
    const received = events.find((e) => e.id === 'received')

    expect(delivered?.state).toBe('completed')
    expect(received?.state).toBe('current')
  })

  it('does not leave placed as current when status is DELIVERED', () => {
    const events = buildOrderTimeline({ order: baseOrder })
    const placed = events.find((e) => e.id === 'placed')
    expect(placed?.state).not.toBe('current')
    expect(placed?.state).not.toBe('upcoming')
  })

  it('includes driver milestones for restaurant when assignment provided', () => {
    const events = buildOrderTimeline({
      order: { ...baseOrder, status: 'SHIPPED' },
      viewerRole: 'RESTAURANT',
      deliveryAssignment: {
        status: 'out_for_delivery',
        driverName: 'Ali',
        assignedAt: '2026-05-25T08:00:00.000Z',
      },
    })
    expect(events.find((e) => e.id === 'driver-assigned')).toBeDefined()
    expect(events.find((e) => e.id === 'driver-out-for-delivery')).toBeDefined()
    expect(events.filter((e) => e.title === 'Delivered').length).toBeLessThanOrEqual(1)
  })

  it('does not show a separate approval step for legacy PENDING_APPROVAL', () => {
    const events = buildOrderTimeline({
      order: { ...baseOrder, status: 'PENDING_APPROVAL' },
      viewerRole: 'RESTAURANT',
    })
    expect(events.find((e) => e.id === 'approval')).toBeUndefined()
    expect(events.find((e) => e.id === 'placed')?.state).toBe('current')
  })
})
