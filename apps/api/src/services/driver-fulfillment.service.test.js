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
  allWarehouseAssignmentsDelivered: vi.fn().mockResolvedValue(true),
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
  reassignDriver,
} from './driver-fulfillment.service.js'
import { notifyOrderStatusChange } from './notification.service.js'
import { invalidateDispatchCacheForSupplier } from '../lib/dispatch-cache.js'
import { allWarehouseAssignmentsDelivered } from './warehouseInventory.js'

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

  it('requires assignment id when multiple active driver legs exist', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'da-a', order_id: 'order-1', supplier_id: 'sup-1', status: 'assigned' },
        { id: 'da-b', order_id: 'order-1', supplier_id: 'sup-1', status: 'picked_up' },
      ],
    })

    await expect(
      updateDeliveryStatus({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'out_for_delivery',
      })
    ).rejects.toThrow(/driver_assignment_id or warehouse_assignment_id/)
  })

  it('updates the specified driver assignment when driver_assignment_id is provided', async () => {
    const assignment = {
      id: 'da-b',
      order_id: 'order-1',
      supplier_id: 'sup-1',
      driver_id: 'drv-1',
      status: 'assigned',
      warehouse_assignment_id: 'wh-b',
    }

    query.mockResolvedValueOnce({ rows: [assignment] })

    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ warehouse_id: 'warehouse-b' }] })
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'picked_up', driver_name: 'Ali' }],
      })

    query.mockResolvedValueOnce({
      rows: [
        { id: 'order-1', restaurant_id: 'rest-1', supplier_name: 'Sup', restaurant_name: 'Rest' },
      ],
    })

    const result = await updateDeliveryStatus({
      supplierId: 'sup-1',
      orderId: 'order-1',
      status: 'picked_up',
      driverAssignmentId: 'da-b',
    })

    expect(result.status).toBe('picked_up')
    const updateCall = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE driver_assignments')
    )
    expect(updateCall?.[1]?.slice(-1)[0]).toBe('da-b')
  })

  it('does not mark order DELIVERED when warehouse legs are mixed delivered and failed', async () => {
    const assignment = {
      id: 'da-1',
      order_id: 'order-1',
      supplier_id: 'sup-1',
      driver_id: 'drv-1',
      status: 'out_for_delivery',
      warehouse_assignment_id: 'wh-a',
    }

    query.mockResolvedValueOnce({ rows: [assignment] })
    allWarehouseAssignmentsDelivered.mockResolvedValueOnce(false)

    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ warehouse_id: 'warehouse-a' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'SHIPPED' }] })
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'delivered', driver_name: 'Ali' }],
      })

    query.mockResolvedValueOnce({
      rows: [
        { id: 'order-1', restaurant_id: 'rest-1', supplier_name: 'Sup', restaurant_name: 'Rest' },
      ],
    })

    await updateDeliveryStatus({
      supplierId: 'sup-1',
      orderId: 'order-1',
      status: 'delivered',
      driverAssignmentId: 'da-1',
    })

    const deliveredUpdate = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("status = 'DELIVERED'")
    )
    expect(deliveredUpdate).toBeFalsy()
    expect(notifyOrderStatusChange).not.toHaveBeenCalled()
  })

  it('reassignDriver requires assignment id when multiple active legs exist', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'da-a', order_id: 'order-1', supplier_id: 'sup-1', status: 'assigned' },
        { id: 'da-b', order_id: 'order-1', supplier_id: 'sup-1', status: 'picked_up' },
      ],
    })

    await expect(
      reassignDriver({
        supplierId: 'sup-1',
        orderId: 'order-1',
        driverId: 'drv-2',
      })
    ).rejects.toThrow(/driver_assignment_id or warehouse_assignment_id/)
  })

  it('reassignDriver targets the specified driver assignment', async () => {
    const assignment = {
      id: 'da-b',
      order_id: 'order-1',
      supplier_id: 'sup-1',
      driver_id: 'drv-1',
      status: 'picked_up',
      warehouse_assignment_id: 'wh-b',
      scheduled_delivery_date: '2026-06-01',
    }

    query.mockResolvedValueOnce({ rows: [assignment] })

    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    clientQuery
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'drv-2' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'da-new', order_id: 'order-1', driver_id: 'drv-2', status: 'assigned' }],
      })
      .mockResolvedValueOnce({ rowCount: 0 })

    const result = await reassignDriver({
      supplierId: 'sup-1',
      orderId: 'order-1',
      driverId: 'drv-2',
      driverAssignmentId: 'da-b',
      assignedByUserId: 'user-1',
    })

    expect(result.driver_id).toBe('drv-2')
    const reassignUpdate = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("status = 'reassigned'")
    )
    expect(reassignUpdate?.[1]?.[1]).toBe('da-b')
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
