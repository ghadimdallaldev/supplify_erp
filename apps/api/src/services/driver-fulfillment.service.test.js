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
}))

vi.mock('../lib/fulfillment-exceptions.js', () => ({
  createFulfillmentException: vi.fn(),
}))

vi.mock('./notification.service.js', () => ({
  notifyOrderStatusChange: vi.fn(),
  notifyDriverDeliveryMilestone: vi.fn(),
}))

import { query, withTransaction } from '../lib/db.js'
import { updateDeliveryStatus } from './driver-fulfillment.service.js'
import { notifyOrderStatusChange } from './notification.service.js'

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
})
