import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  const clientQuery = vi.fn()
  return {
    query: queryMock,
    withTransaction: vi.fn(async (fn) => fn({ query: clientQuery })),
    pool: { query: queryMock },
  }
})

vi.mock('./warehouseInventory.js', () => ({
  syncWarehouseFulfillmentOnOrderStatus: vi.fn(),
  releaseInventoryForFailedDelivery: vi.fn(),
  markWarehouseAssignmentDelivered: vi.fn(),
  releaseInventoryForAssignment: vi.fn(),
  allWarehouseAssignmentsTerminal: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/fulfillment-exceptions.js', () => ({
  createFulfillmentException: vi.fn(),
}))

vi.mock('./notification.service.js', () => ({
  notifyOrderStatusChange: vi.fn(),
  notifyDriverDeliveryMilestone: vi.fn(),
}))

vi.mock('./storage/storage.service.js', () => ({
  buildObjectPublicUrl: vi.fn((key) => `https://cdn.example/${key}`),
}))

vi.mock('../lib/dispatch-cache.js', () => ({
  invalidateDispatchCacheForSupplier: vi.fn(),
}))

import { query, withTransaction } from '../lib/db.js'
import {
  updateDeliveryStatus,
  submitProofOfDelivery,
  assignDriverToOrder,
} from './driver-fulfillment.service.js'
import { notifyOrderStatusChange } from './notification.service.js'
import { invalidateDispatchCacheForSupplier } from '../lib/dispatch-cache.js'

describe('driver-fulfillment.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets customer_order.status to DELIVERED when assignment is delivered', async () => {
    const assignment = {
      id: 'da-1',
      order_id: 'order-1',
      supplier_id: 'sup-1',
      driver_id: 'drv-1',
      status: 'out_for_delivery',
      warehouse_assignment_id: null,
    }

    query.mockResolvedValueOnce({ rows: [assignment] })

    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'SHIPPED' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'delivered', driver_name: 'Ali' }],
      })

    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'order-1',
          restaurant_id: 'rest-1',
          supplier_name: 'Sup',
          restaurant_name: 'Rest',
        },
      ],
    })

    await updateDeliveryStatus({
      supplierId: 'sup-1',
      orderId: 'order-1',
      status: 'delivered',
    })

    const deliveredUpdate = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("status = 'DELIVERED'")
    )
    expect(deliveredUpdate).toBeTruthy()
    expect(notifyOrderStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1' }),
      'DELIVERED'
    )
  })

  it('returns existing assignment when status is unchanged (idempotent)', async () => {
    const assignment = {
      id: 'da-1',
      order_id: 'order-1',
      supplier_id: 'sup-1',
      driver_id: 'drv-1',
      status: 'out_for_delivery',
      warehouse_assignment_id: null,
    }

    query.mockResolvedValueOnce({ rows: [assignment] })

    const result = await updateDeliveryStatus({
      supplierId: 'sup-1',
      orderId: 'order-1',
      status: 'out_for_delivery',
    })

    expect(result).toEqual(assignment)
    expect(withTransaction).not.toHaveBeenCalled()
  })

  it('allows assigned to transition directly to out_for_delivery', async () => {
    const assignment = {
      id: 'da-1',
      order_id: 'order-1',
      supplier_id: 'sup-1',
      driver_id: 'drv-1',
      status: 'assigned',
      warehouse_assignment_id: null,
    }

    query.mockResolvedValueOnce({ rows: [assignment] })

    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'out_for_delivery', driver_name: 'Ali' }],
      })

    query.mockResolvedValueOnce({
      rows: [
        { id: 'order-1', restaurant_id: 'rest-1', supplier_name: 'Sup', restaurant_name: 'Rest' },
      ],
    })

    await updateDeliveryStatus({
      supplierId: 'sup-1',
      orderId: 'order-1',
      status: 'out_for_delivery',
    })

    const updateCall = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE driver_assignments')
    )
    expect(updateCall?.[1]?.[0]).toBe('out_for_delivery')
  })

  it('submitProofOfDelivery upserts proof with ON CONFLICT (order_id)', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 'order-1', status: 'DELIVERED', restaurant_id: 'rest-1' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'da-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pod-1',
            order_id: 'order-1',
            file_key: 'pod/photo.jpg',
            recipient_name: 'Manager',
          },
        ],
      })

    const proof = await submitProofOfDelivery({
      orderId: 'order-1',
      supplierId: 'sup-1',
      fileKey: 'pod/photo.jpg',
      recipientName: 'Manager',
      userId: 'user-1',
    })

    const upsertCall = query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('ON CONFLICT (order_id)')
    )
    expect(upsertCall).toBeTruthy()
    expect(upsertCall[0]).toContain('COALESCE(EXCLUDED.file_key')
    expect(upsertCall[1][0]).toBe('order-1')
    expect(proof.file_key).toBe('pod/photo.jpg')
    expect(invalidateDispatchCacheForSupplier).toHaveBeenCalledWith('sup-1')
  })

  it('assignDriverToOrder creates legs for every open warehouse assignment', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 'order-1', status: 'PLACED', restaurant_id: 'rest-1' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'drv-1', warehouse_id: null }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'wh-a', warehouse_id: 'warehouse-a' },
          { id: 'wh-b', warehouse_id: 'warehouse-b' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'order-1', restaurant_id: 'rest-1', restaurant_name: 'Rest' }],
      })
      .mockResolvedValueOnce({ rows: [{ full_name: 'Ali' }] })

    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'da-a', order_id: 'order-1', warehouse_assignment_id: 'wh-a' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'da-b', order_id: 'order-1', warehouse_assignment_id: 'wh-b' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await assignDriverToOrder({
      supplierId: 'sup-1',
      orderId: 'order-1',
      driverId: 'drv-1',
      assignedByUserId: 'user-1',
    })

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    const inserts = clientQuery.mock.calls.filter((c) =>
      String(c[0]).includes('INSERT INTO driver_assignments')
    )
    expect(inserts).toHaveLength(2)
    expect(inserts[0][1][1]).toBe('wh-a')
    expect(inserts[1][1][1]).toBe('wh-b')
    expect(invalidateDispatchCacheForSupplier).toHaveBeenCalledWith('sup-1')
  })
})
