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
  commitDispatchInventoryForAssignment: vi.fn(),
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

vi.mock('../lib/pod-requirement.js', () => ({
  assertPodPresentWhenRequired: vi.fn().mockResolvedValue(undefined),
}))

import { query, withTransaction } from '../lib/db.js'
import {
  updateDeliveryStatus,
  completeDeliveryWithProof,
  submitProofOfDelivery,
  assignDriverToOrder,
  reassignDriver,
  listProofsOfDelivery,
  confirmProofOfDelivery,
} from './driver-fulfillment.service.js'
import { notifyOrderStatusChange } from './notification.service.js'
import { invalidateDispatchCacheForSupplier } from '../lib/dispatch-cache.js'
import {
  allWarehouseAssignmentsDelivered,
  markWarehouseAssignmentDelivered,
  commitDispatchInventoryForAssignment,
  syncWarehouseFulfillmentOnOrderStatus,
  releaseInventoryForAssignment,
  releaseInventoryForFailedDelivery,
} from './warehouseInventory.js'

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

    query.mockResolvedValueOnce({ rows: [assignment] }) // unlocked peek

    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    clientQuery
      .mockResolvedValueOnce({ rows: [assignment] }) // locked resolve
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE driver_assignments
      .mockResolvedValueOnce({ rows: [] }) // warehouse lookup (no WH assignment)
      .mockResolvedValueOnce({ rows: [{ status: 'SHIPPED' }] }) // order status
      .mockResolvedValueOnce({ rows: [] }) // UPDATE customer_order DELIVERED
      .mockResolvedValueOnce({ rows: [] }) // UPDATE order_warehouse_assignment
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'delivered', driver_name: 'Ali' }],
      })
      .mockResolvedValueOnce({
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
    expect(invalidateDispatchCacheForSupplier).toHaveBeenCalledWith('sup-1')
  })

  it('refuses to mark every warehouse leg delivered from an untied driver assignment', async () => {
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
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'SHIPPED' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'leg-a' }, { id: 'leg-b' }] })

    await expect(
      updateDeliveryStatus({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'delivered',
      })
    ).rejects.toThrow(/warehouse_assignment_id/)
    expect(markWarehouseAssignmentDelivered).not.toHaveBeenCalled()
  })

  it('refuses to fail every warehouse leg from an untied driver assignment', async () => {
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
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'leg-a' }, { id: 'leg-b' }] })

    await expect(
      updateDeliveryStatus({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'failed',
        failureReason: 'Gate closed',
      })
    ).rejects.toThrow(/warehouse_assignment_id/)
    expect(releaseInventoryForFailedDelivery).not.toHaveBeenCalled()
    expect(releaseInventoryForAssignment).not.toHaveBeenCalled()
  })

  it('saves POD and completes the exact delivery leg in one transaction', async () => {
    const assignment = {
      id: 'da-1',
      order_id: 'order-1',
      supplier_id: 'sup-1',
      driver_id: 'drv-1',
      status: 'out_for_delivery',
      warehouse_assignment_id: null,
    }
    const proof = { id: 'pod-1', order_id: 'order-1', file_key: 'uploads/pod.jpg' }

    // The outer ownership check and the proof-save ownership check both pass.
    query
      .mockResolvedValueOnce({ rows: [{ id: 'order-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'order-1' }] })
    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))
    clientQuery
      .mockResolvedValueOnce({ rows: [{ id: assignment.id }] }) // proof assignment scope
      .mockResolvedValueOnce({ rows: [proof] }) // POD upsert
      .mockResolvedValueOnce({ rows: [assignment] }) // locked assignment
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // assignment delivered
      .mockResolvedValueOnce({ rows: [] }) // warehouse lookup
      .mockResolvedValueOnce({ rows: [{ status: 'SHIPPED' }] }) // parent order lock
      .mockResolvedValueOnce({ rows: [] }) // parent delivered
      .mockResolvedValueOnce({ rows: [] }) // warehouse legs
      .mockResolvedValueOnce({ rows: [{ ...assignment, status: 'delivered', driver_name: 'Ali' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'order-1', restaurant_id: 'rest-1', supplier_name: 'Sup', restaurant_name: 'Rest' },
        ],
      })

    const result = await completeDeliveryWithProof({
      supplierId: 'sup-1',
      orderId: 'order-1',
      driverAssignmentId: assignment.id,
      fileKey: proof.file_key,
      userId: 'driver-user-1',
    })

    expect(withTransaction).toHaveBeenCalledTimes(1)
    expect(result).toEqual(
      expect.objectContaining({
        proof,
        assignment: expect.objectContaining({ status: 'delivered' }),
      })
    )
    const proofUpsert = clientQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO proof_of_delivery')
    )
    const assignmentUpdate = clientQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('UPDATE driver_assignments')
    )
    expect(proofUpsert).toBeTruthy()
    expect(assignmentUpdate).toBeTruthy()
    expect(clientQuery.mock.calls.indexOf(proofUpsert)).toBeLessThan(
      clientQuery.mock.calls.indexOf(assignmentUpdate)
    )
  })
  it('does not notify when the delivery-status transaction fails', async () => {
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
    withTransaction.mockImplementationOnce(async (fn) => {
      await fn({ query: clientQuery })
      throw new Error('commit failed')
    })

    clientQuery
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'SHIPPED' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'delivered', driver_name: 'Ali' }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'order-1', restaurant_id: 'rest-1', supplier_name: 'Sup', restaurant_name: 'Rest' },
        ],
      })

    await expect(
      updateDeliveryStatus({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'delivered',
      })
    ).rejects.toThrow(/commit failed/)

    expect(notifyOrderStatusChange).not.toHaveBeenCalled()
    expect(invalidateDispatchCacheForSupplier).not.toHaveBeenCalled()
  })

  it('rejects driver delivered when order is not yet SHIPPED', async () => {
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
      .mockResolvedValueOnce({ rows: [assignment] }) // locked resolve
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'PROCESSING' }] })

    await expect(
      updateDeliveryStatus({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'delivered',
      })
    ).rejects.toThrow(/must be shipped first/)
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
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'PROCESSING' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'out_for_delivery', driver_name: 'Ali' }],
      })
      .mockResolvedValueOnce({
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
    expect(updateCall?.[1]?.at(-2)).toBe('da-1')
    expect(updateCall?.[1]?.at(-1)).toBe('assigned')
    const shippedUpdate = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("status = 'SHIPPED'")
    )
    expect(shippedUpdate).toBeTruthy()
    expect(syncWarehouseFulfillmentOnOrderStatus).toHaveBeenCalledWith(
      expect.anything(),
      'order-1',
      'SHIPPED',
      'PROCESSING'
    )
  })

  it('refuses to dispatch every warehouse leg from an untied driver assignment', async () => {
    const assignment = {
      id: 'da-1',
      order_id: 'order-1',
      supplier_id: 'sup-1',
      driver_id: 'drv-1',
      status: 'picked_up',
      warehouse_assignment_id: null,
    }

    query.mockResolvedValueOnce({ rows: [assignment] })
    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))
    clientQuery
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'PROCESSING' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'leg-a' }, { id: 'leg-b' }] })

    await expect(
      updateDeliveryStatus({
        supplierId: 'sup-1',
        orderId: 'order-1',
        status: 'out_for_delivery',
      })
    ).rejects.toThrow(/warehouse_assignment_id/)
    expect(syncWarehouseFulfillmentOnOrderStatus).not.toHaveBeenCalled()
    expect(commitDispatchInventoryForAssignment).not.toHaveBeenCalled()
  })

  it('commits stock for the warehouse leg that goes out for delivery', async () => {
    const assignment = {
      id: 'da-1',
      order_id: 'order-1',
      supplier_id: 'sup-1',
      driver_id: 'drv-1',
      status: 'picked_up',
      warehouse_assignment_id: 'wh-a',
    }

    query.mockResolvedValueOnce({ rows: [assignment] })
    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))
    clientQuery
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [{ warehouse_id: 'warehouse-a' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'SHIPPED' }] })
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'out_for_delivery', driver_name: 'Ali' }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'order-1', restaurant_id: 'rest-1', supplier_name: 'Sup', restaurant_name: 'Rest' },
        ],
      })

    await updateDeliveryStatus({
      supplierId: 'sup-1',
      orderId: 'order-1',
      status: 'out_for_delivery',
      driverAssignmentId: 'da-1',
    })

    expect(commitDispatchInventoryForAssignment).toHaveBeenCalledWith(
      expect.anything(),
      'order-1',
      'wh-a'
    )
    expect(syncWarehouseFulfillmentOnOrderStatus).not.toHaveBeenCalled()
  })

  it('submitProofOfDelivery upserts proof for the driver assignment', async () => {
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
      (c) => typeof c[0] === 'string' && c[0].includes('ON CONFLICT (driver_assignment_id)')
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
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [{ warehouse_id: 'warehouse-b' }] })
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'picked_up', driver_name: 'Ali' }],
      })
      .mockResolvedValueOnce({
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
    expect(updateCall?.[1]?.at(-2)).toBe('da-b')
    expect(updateCall?.[1]?.at(-1)).toBe('assigned')
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
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [{ warehouse_id: 'warehouse-a' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'SHIPPED' }] })
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'delivered', driver_name: 'Ali' }],
      })
      .mockResolvedValueOnce({
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
      .mockResolvedValueOnce({ rows: [{ id: 'order-1' }] })
      .mockResolvedValueOnce({ rows: [assignment] })
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
    expect(String(clientQuery.mock.calls[0][0])).toMatch(/FOR UPDATE/)
    expect(String(clientQuery.mock.calls[1][0])).toMatch(/FOR UPDATE/)
    const reassignUpdate = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("status = 'reassigned'")
    )
    expect(reassignUpdate?.[1]?.[1]).toBe('da-b')
  })

  it('reassignDriver moves a rescheduled leg to a new driver', async () => {
    const assignment = {
      id: 'da-r',
      order_id: 'order-1',
      supplier_id: 'sup-1',
      driver_id: 'drv-1',
      status: 'rescheduled',
      warehouse_assignment_id: 'wh-a',
      scheduled_delivery_date: '2026-06-02',
    }

    query.mockResolvedValueOnce({ rows: [assignment] })

    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    clientQuery
      .mockResolvedValueOnce({ rows: [{ id: 'order-1' }] })
      .mockResolvedValueOnce({ rows: [assignment] })
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
      driverAssignmentId: 'da-r',
      reason: 'Original driver is off',
    })

    expect(result.driver_id).toBe('drv-2')
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
      .mockResolvedValueOnce({
        rows: [{ id: 'order-1', status: 'PLACED' }],
      })
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
      assignAllWarehouseLegs: true,
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

  it('does not assign every warehouse leg unless asked', async () => {
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

    await expect(
      assignDriverToOrder({
        supplierId: 'sup-1',
        orderId: 'order-1',
        driverId: 'drv-1',
        assignedByUserId: 'user-1',
      })
    ).rejects.toThrow(/warehouse_assignment_id/)
    expect(withTransaction).not.toHaveBeenCalled()
  })

  it('reschedules without assigning the notes column twice', async () => {
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
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...assignment, status: 'rescheduled', driver_name: 'Ali' }],
      })
      .mockResolvedValueOnce({
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
      status: 'rescheduled',
      notes: 'Gate closed',
    })

    const assignmentUpdate = clientQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('UPDATE driver_assignments SET')
    )
    expect(assignmentUpdate).toBeTruthy()
    expect(String(assignmentUpdate[0]).match(/notes\s*=/g)).toHaveLength(1)
  })

  it('returns every proof for an order and can limit the list to one driver', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'pod-1' }, { id: 'pod-2' }] })
    const rows = await listProofsOfDelivery('order-1')
    expect(rows).toHaveLength(2)
    expect(String(query.mock.calls[0][0])).not.toMatch(/LIMIT 1/)

    query.mockResolvedValueOnce({ rows: [{ id: 'pod-1' }] })
    await listProofsOfDelivery('order-1', { driverId: 'drv-1' })
    const scoped = query.mock.calls.at(-1)
    expect(String(scoped[0])).toMatch(/da\.driver_id = \$2/)
    expect(scoped[1]).toEqual(['order-1', 'drv-1'])
  })

  it('confirms only proofs the restaurant has not already confirmed', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'pod-open' }] })
    const proof = await confirmProofOfDelivery('order-1', 'rest-1', 'user-1')
    expect(proof.id).toBe('pod-open')
    expect(String(query.mock.calls[0][0])).toMatch(/confirmed_at IS NULL/)

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'order-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'pod-done' }] })
    const already = await confirmProofOfDelivery('order-1', 'rest-1', 'user-1')
    expect(already.id).toBe('pod-done')
  })
})
