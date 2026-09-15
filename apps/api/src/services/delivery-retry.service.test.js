import { beforeEach, describe, expect, it, vi } from 'vitest'

const withTransactionMock = vi.fn()
const reserveWarehouseStockBatchMock = vi.fn().mockResolvedValue(undefined)
const invalidateDispatchCacheMock = vi.fn().mockResolvedValue(undefined)
const getWarehouseSupplierColumnMock = vi.fn().mockResolvedValue('supplier_id')

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: (...args) => withTransactionMock(...args),
}))
vi.mock('./warehouseInventory.js', () => ({
  reserveWarehouseStockBatch: (...args) => reserveWarehouseStockBatchMock(...args),
}))
vi.mock('../lib/dispatch-cache.js', () => ({
  invalidateDispatchCacheForSupplier: (...args) => invalidateDispatchCacheMock(...args),
}))
vi.mock('../lib/warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: (...args) => getWarehouseSupplierColumnMock(...args),
}))

import { retryFailedDelivery } from './delivery-retry.service.js'

describe('delivery-retry.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires a reason before creating another fulfillment attempt', async () => {
    await expect(
      retryFailedDelivery({
        orderId: 'order-1',
        supplierId: 'supplier-1',
        sourceDriverAssignmentId: 'driver-attempt-1',
        driverId: 'driver-2',
        reason: '  ',
      })
    ).rejects.toMatchObject({ name: 'ValidationError' })
    expect(withTransactionMock).not.toHaveBeenCalled()
  })

  it('supersedes failed attempts, reserves a new warehouse leg, and links the driver attempt', async () => {
    const sourceDriver = {
      id: 'driver-attempt-1',
      order_id: 'order-1',
      supplier_id: 'supplier-1',
      warehouse_assignment_id: 'warehouse-attempt-1',
      scheduled_delivery_date: '2026-09-15',
    }
    const sourceWarehouse = {
      id: 'warehouse-attempt-1',
      order_id: 'order-1',
      order_item_id: 'item-1',
      warehouse_id: 'warehouse-1',
      status: 'failed',
    }
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'order-1', status: 'SHIPPED' }] })
        .mockResolvedValueOnce({ rows: [sourceDriver] })
        .mockResolvedValueOnce({ rows: [{ id: 'driver-2' }] })
        .mockResolvedValueOnce({ rows: [sourceWarehouse] })
        .mockResolvedValueOnce({ rows: [{ id: 'warehouse-2', supplier_id: 'supplier-1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'item-1', product_id: 'product-1', quantity: 4, supplier_id: 'supplier-1' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'warehouse-attempt-2' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'driver-attempt-2' }] })
        .mockResolvedValueOnce({ rows: [] }),
    }
    withTransactionMock.mockImplementation(async (handler) => handler(client))

    const result = await retryFailedDelivery({
      orderId: 'order-1',
      supplierId: 'supplier-1',
      sourceDriverAssignmentId: 'driver-attempt-1',
      driverId: 'driver-2',
      warehouseId: 'warehouse-2',
      reason: 'Customer requested a new delivery window',
      assignedByUserId: 'user-1',
    })

    expect(result).toMatchObject({
      sourceDriverAssignmentId: 'driver-attempt-1',
      driverAssignment: { id: 'driver-attempt-2' },
      warehouseAssignment: { id: 'warehouse-attempt-2' },
    })
    expect(reserveWarehouseStockBatchMock).toHaveBeenCalledWith(
      client,
      'warehouse-2',
      [{ productId: 'product-1', quantity: 4 }],
      { supplierId: 'supplier-1' }
    )
    expect(
      client.query.mock.calls.some(([sql]) => String(sql).includes("status = 'superseded'"))
    ).toBe(true)
    expect(invalidateDispatchCacheMock).toHaveBeenCalledWith('supplier-1')
  })
})
