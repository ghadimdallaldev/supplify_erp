import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./supplier-stock.service.js', () => ({
  seedMissingWarehouseInventoryForSupplier: vi.fn().mockResolvedValue({
    seeded: 1,
    transferredFromInactive: 0,
  }),
}))

import {
  syncWarehouseFulfillmentOnOrderStatus,
  releaseInventoryForOrder,
  reserveWarehouseStockBatch,
} from './warehouseInventory.js'
import { seedMissingWarehouseInventoryForSupplier } from './supplier-stock.service.js'

function createClient() {
  const queries = []
  return {
    queries,
    query: vi.fn(async (sql, params) => {
      queries.push({ sql, params })
      if (sql.includes('FROM order_warehouse_assignment') && sql.includes('SELECT *')) {
        return {
          rows: [
            {
              id: 'a1',
              order_id: 'order-1',
              order_item_id: null,
              warehouse_id: 'wh-1',
              status: 'pending',
            },
          ],
        }
      }
      if (sql.includes('FROM order_item')) {
        return { rows: [{ product_id: 'p1', quantity: 2 }] }
      }
      return { rows: [] }
    }),
  }
}

describe('warehouseInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks assignments picking when order moves to PROCESSING', async () => {
    const client = createClient()
    await syncWarehouseFulfillmentOnOrderStatus(client, 'order-1', 'PROCESSING', 'PLACED')

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'picking'"), [
      'order-1',
    ])
  })

  it('releases reserved stock when order is cancelled', async () => {
    const client = createClient()
    await releaseInventoryForOrder(client, 'order-1')

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('quantity_reserved = GREATEST'),
      expect.any(Array)
    )
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'failed'"), [
      'order-1',
    ])
  })

  it('heals missing warehouse rows then reserves when supplierId is provided', async () => {
    let lockPass = 0
    const client = {
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM warehouse_inventory') && sql.includes('FOR UPDATE')) {
          lockPass += 1
          if (lockPass === 1) return { rows: [] }
          return { rows: [{ product_id: 'p-1', quantity_available: 10 }] }
        }
        if (sql.includes('UPDATE warehouse_inventory')) return { rows: [] }
        return { rows: [] }
      }),
    }

    await reserveWarehouseStockBatch(client, 'wh-1', [{ productId: 'p-1', quantity: 2 }], {
      supplierId: 'sup-1',
    })

    expect(seedMissingWarehouseInventoryForSupplier).toHaveBeenCalledWith('sup-1', 'wh-1', {
      client,
      productIds: ['p-1'],
    })
    expect(client.query.mock.calls.some((c) => String(c[0]).includes('quantity_reserved'))).toBe(
      true
    )
  })
})
