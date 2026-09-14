import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./supplier-stock.service.js', () => ({
  seedMissingWarehouseInventoryForSupplier: vi.fn().mockResolvedValue({
    seeded: 1,
    transferredFromInactive: 0,
  }),
}))

vi.mock('../lib/warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('supplier_id'),
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
      if (sql.includes('FROM customer_order')) {
        return {
          rows: [
            {
              id: 'order-1',
              status: 'PLACED',
              supplier_organization_id: null,
              delivery_location_snapshot: null,
            },
          ],
        }
      }
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
        return { rows: [{ id: 'item-1', product_id: 'p1', quantity: 2, supplier_id: 'sup-1' }] }
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

  it('restores on_hand when cancelling dispatched warehouse assignments', async () => {
    const client = {
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM order_warehouse_assignment') && sql.includes('SELECT *')) {
          return {
            rows: [
              {
                id: 'a-dispatched',
                order_id: 'order-1',
                order_item_id: null,
                warehouse_id: 'wh-1',
                status: 'dispatched',
              },
            ],
          }
        }
        if (sql.includes('FROM order_item')) {
          return { rows: [{ product_id: 'p1', quantity: 3 }] }
        }
        return { rows: [] }
      }),
    }

    await releaseInventoryForOrder(client, 'order-1')

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('quantity_on_hand = COALESCE(quantity_on_hand, 0) +'),
      [3, 'wh-1', 'p1']
    )
    expect(
      client.query.mock.calls.some((c) => String(c[0]).includes('quantity_reserved = GREATEST'))
    ).toBe(false)
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

  it('atomically reassigns warehouse: release old then reserve new', async () => {
    const queries = []
    const client = {
      query: vi.fn(async (sql, params) => {
        queries.push({ sql, params })
        if (sql.includes('FROM customer_order')) {
          return {
            rows: [
              {
                id: 'order-1',
                status: 'PLACED',
                supplier_organization_id: null,
                delivery_location_snapshot: null,
              },
            ],
          }
        }
        if (sql.includes('FROM order_warehouse_assignment') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                id: 'a1',
                order_id: 'order-1',
                order_item_id: null,
                warehouse_id: 'wh-old',
                status: 'pending',
              },
            ],
          }
        }
        if (sql.includes('FROM warehouse') && sql.includes('is_active = TRUE')) {
          return { rows: [{ id: 'wh-new', supplier_id: 'sup-1', organization_id: null }] }
        }
        if (sql.includes('FROM order_item')) {
          return { rows: [{ id: 'item-1', product_id: 'p1', quantity: 3, supplier_id: 'sup-1' }] }
        }
        if (sql.includes('FROM warehouse_inventory') && sql.includes('FOR UPDATE')) {
          return { rows: [{ product_id: 'p1', quantity_available: 10 }] }
        }
        if (sql.includes('UPDATE order_warehouse_assignment')) {
          return {
            rows: [
              {
                id: 'a1',
                order_id: 'order-1',
                warehouse_id: 'wh-new',
                status: 'pending',
                assigned_by: 'manual',
              },
            ],
          }
        }
        return { rows: [] }
      }),
    }

    const { reassignOrderWarehouseAssignment } = await import('./warehouseInventory.js')
    const result = await reassignOrderWarehouseAssignment(client, {
      orderId: 'order-1',
      assignmentId: 'a1',
      newWarehouseId: 'wh-new',
      supplierId: 'sup-1',
    })

    expect(result.warehouse_id).toBe('wh-new')
    expect(
      queries.some((q) => String(q.sql).includes('quantity_available = quantity_available +'))
    ).toBe(true)
    expect(
      queries.some((q) => String(q.sql).includes('quantity_reserved = wi.quantity_reserved +'))
    ).toBe(true)
  })
})
