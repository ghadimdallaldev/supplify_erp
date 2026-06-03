import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError } from '../middlewares/errorHandler.js'

vi.mock('./warehouseInventory.js', () => ({
  releaseInventoryForOrder: vi.fn().mockResolvedValue(undefined),
}))

import {
  assertAndDeductSupplierStock,
  restoreSupplierStockForOrder,
} from './supplier-inventory.service.js'
import { releaseInventoryForOrder } from './warehouseInventory.js'

describe('supplier-inventory.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deducts available stock when enough inventory exists', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ available_qty: 10 }] })
        .mockResolvedValueOnce({}),
    }

    await assertAndDeductSupplierStock(client, 'prod-1', 1, { sku: 'SKU-1' })

    expect(client.query).toHaveBeenCalledTimes(2)
    expect(client.query.mock.calls[1][0]).toContain('available_qty = available_qty - $1')
  })

  it('throws when stock is insufficient', async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({ rows: [{ available_qty: 0.5 }] }),
    }

    await expect(
      assertAndDeductSupplierStock(client, 'prod-1', 1, { sku: 'SKU-1' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('restores stock for cancelled order items', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ product_id: 'prod-1', quantity: 1 }],
        })
        .mockResolvedValueOnce({}),
    }

    await restoreSupplierStockForOrder(client, 'order-1')

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('available_qty = available_qty + $1'),
      [1, 'prod-1']
    )
    expect(releaseInventoryForOrder).toHaveBeenCalledWith(client, 'order-1')
  })
})
