import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  syncWarehouseFulfillmentOnOrderStatus,
  releaseInventoryForOrder,
} from './warehouseInventory.js'

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
})
