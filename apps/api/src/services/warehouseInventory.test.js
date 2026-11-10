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
  releaseInventoryForFailedDelivery,
  reserveWarehouseStockBatch,
  commitLegacyReservedStockForOrder,
  reopenFailedWarehouseLegs,
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
    expect(client.query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM order_warehouse_assignment[\s\S]*FOR UPDATE/),
      ['order-1']
    )
  })

  it('does not release a line twice when a whole-order leg and an item leg both exist', async () => {
    const calls = []
    const client = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql)
        calls.push({ text, params })
        if (text.includes('SELECT *') && text.includes('FROM order_warehouse_assignment')) {
          return {
            rows: [
              {
                id: 'a-whole',
                order_id: 'order-1',
                order_item_id: null,
                warehouse_id: 'wh-whole',
                status: 'pending',
              },
              {
                id: 'a-item',
                order_id: 'order-1',
                order_item_id: 'item-2',
                warehouse_id: 'wh-item',
                status: 'pending',
              },
            ],
          }
        }
        if (text.includes('FROM order_item oi')) {
          return { rows: [{ product_id: 'p1', quantity: 2 }] }
        }
        if (text.includes('FROM order_item WHERE id')) {
          return { rows: [{ product_id: 'p2', quantity: 1 }] }
        }
        return { rows: [] }
      }),
    }

    await releaseInventoryForOrder(client, 'order-1')

    const releases = calls.filter((call) => call.text.includes('quantity_reserved = GREATEST'))
    expect(releases).toEqual([
      expect.objectContaining({ params: [2, 'wh-whole', 'p1'] }),
      expect.objectContaining({ params: [1, 'wh-item', 'p2'] }),
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

    const acknowledged = {
      query: vi.fn(async (sql) => {
        const text = String(sql)
        if (text.includes('FROM customer_order')) {
          return {
            rows: [
              {
                id: 'order-1',
                status: 'ACKNOWLEDGED',
                restaurant_id: 'rest-1',
                branch_id: null,
                supplier_organization_id: null,
                delivery_location_snapshot: { address: { postalCode: '1100' } },
              },
            ],
          }
        }
        if (text.includes('FROM order_warehouse_assignment') && text.includes('FOR UPDATE')) {
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
        if (text.includes('FROM warehouse') && text.includes('is_active = TRUE')) {
          return { rows: [{ id: 'wh-new', supplier_id: 'sup-1', organization_id: null }] }
        }
        if (text.includes('FROM order_item')) {
          return { rows: [{ id: 'item-1', product_id: 'p1', quantity: 3, supplier_id: 'sup-1' }] }
        }
        if (text.includes('FROM warehouse_inventory') && text.includes('FOR UPDATE')) {
          return { rows: [{ product_id: 'p1', quantity_available: 10 }] }
        }
        if (text.includes('FROM delivery_zone')) {
          return {
            rows: [
              {
                id: 'z1',
                zone_type: 'postal_codes',
                postal_codes: ['1100'],
                warehouse_id: 'wh-new',
              },
            ],
          }
        }
        if (text.includes('UPDATE order_warehouse_assignment')) {
          return { rows: [{ id: 'a1', warehouse_id: 'wh-new', status: 'pending' }] }
        }
        return { rows: [] }
      }),
    }
    const moved = await reassignOrderWarehouseAssignment(acknowledged, {
      orderId: 'order-1',
      assignmentId: 'a1',
      newWarehouseId: 'wh-new',
      supplierId: 'sup-1',
    })
    expect(moved.warehouse_id).toBe('wh-new')

    const shipped = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('FROM customer_order')) {
          return { rows: [{ id: 'order-1', status: 'SHIPPED' }] }
        }
        return { rows: [] }
      }),
    }
    await expect(
      reassignOrderWarehouseAssignment(shipped, {
        orderId: 'order-1',
        assignmentId: 'a1',
        newWarehouseId: 'wh-new',
        supplierId: 'sup-1',
      })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS' })
    expect(
      queries.some((q) => String(q.sql).includes('quantity_available = quantity_available +'))
    ).toBe(true)
    expect(
      queries.some((q) => String(q.sql).includes('quantity_reserved = wi.quantity_reserved +'))
    ).toBe(true)
  })

  describe('dispatched stock restore keeps available in step with on_hand (B6a)', () => {
    function dispatchedClient() {
      return {
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
    }

    it('cancelling a dispatched leg restores quantity_available as well as quantity_on_hand', async () => {
      const client = dispatchedClient()
      await releaseInventoryForOrder(client, 'order-1')

      const restore = client.query.mock.calls.find((c) =>
        String(c[0]).includes('quantity_on_hand = COALESCE(quantity_on_hand, 0) +')
      )
      expect(restore).toBeTruthy()
      expect(String(restore[0])).toContain('quantity_available = quantity_available +')
      expect(restore[1]).toEqual([3, 'wh-1', 'p1'])
    })

    it('a failed delivery of a dispatched leg restores quantity_available as well', async () => {
      const client = dispatchedClient()
      await releaseInventoryForFailedDelivery(client, 'order-1')

      const restore = client.query.mock.calls.find((c) =>
        String(c[0]).includes('quantity_on_hand = COALESCE(quantity_on_hand, 0) +')
      )
      expect(restore).toBeTruthy()
      expect(String(restore[0])).toContain('quantity_available = quantity_available +')
    })
  })

  describe('legacy reserved_qty commit on dispatch (B6c)', () => {
    function legacyClient({ claimed }) {
      return {
        query: vi.fn(async (sql) => {
          if (sql.includes('legacy_stock_committed_at IS NULL')) {
            return { rows: claimed ? [{ id: 'order-1' }] : [] }
          }
          if (sql.includes('FROM order_item')) {
            return {
              rows: [
                { product_id: 'p1', quantity: 2 },
                { product_id: 'p1', quantity: 3 },
                { product_id: 'p2', quantity: 1 },
              ],
            }
          }
          return { rows: [], rowCount: 0 }
        }),
      }
    }

    it('decrements reserved_qty once per product (aggregated) when the order first ships', async () => {
      const client = legacyClient({ claimed: true })
      const result = await commitLegacyReservedStockForOrder(client, 'order-1')

      expect(result).toEqual({ committed: true })
      const update = client.query.mock.calls.find((c) => String(c[0]).includes('UPDATE inventory'))
      expect(update).toBeTruthy()
      expect(String(update[0])).toContain('reserved_qty = GREATEST(0, inv.reserved_qty - src.qty)')
      expect(String(update[0])).not.toContain('available_qty')
      expect(update[1]).toEqual([
        ['p1', 'p2'],
        [5, 1],
      ])
    })

    it('is idempotent: a second commit (claim returns no row) touches nothing', async () => {
      const client = legacyClient({ claimed: false })
      const result = await commitLegacyReservedStockForOrder(client, 'order-1')

      expect(result).toEqual({ committed: false })
      expect(client.query.mock.calls.some((c) => String(c[0]).includes('UPDATE inventory'))).toBe(
        false
      )
    })

    it('only claims orders that have no warehouse legs (warehouse mode commits per leg)', async () => {
      const client = legacyClient({ claimed: false })
      await commitLegacyReservedStockForOrder(client, 'order-1')
      const claim = client.query.mock.calls.find((c) =>
        String(c[0]).includes('legacy_stock_committed_at IS NULL')
      )
      expect(String(claim[0])).toContain('NOT EXISTS')
      expect(String(claim[0])).toContain('order_warehouse_assignment')
    })

    it('syncWarehouseFulfillmentOnOrderStatus commits legacy stock when the order ships', async () => {
      const client = legacyClient({ claimed: true })
      await syncWarehouseFulfillmentOnOrderStatus(client, 'order-1', 'SHIPPED', 'PROCESSING')
      expect(client.query.mock.calls.some((c) => String(c[0]).includes('UPDATE inventory'))).toBe(
        true
      )
    })

    it('syncWarehouseFulfillmentOnOrderStatus does not commit legacy stock before dispatch', async () => {
      const client = legacyClient({ claimed: true })
      await syncWarehouseFulfillmentOnOrderStatus(client, 'order-1', 'PROCESSING', 'ACKNOWLEDGED')
      expect(
        client.query.mock.calls.some((c) => String(c[0]).includes('legacy_stock_committed_at'))
      ).toBe(false)
    })
  })

  describe('reopenFailedWarehouseLegs re-reserves stock for a redelivery (B6b)', () => {
    function reopenClient(failedLegs) {
      const inserted = []
      const client = {
        inserted,
        query: vi.fn(async (sql, params) => {
          if (
            sql.includes('FROM order_warehouse_assignment') &&
            sql.includes("status = 'failed'")
          ) {
            return { rows: failedLegs }
          }
          if (sql.includes('INSERT INTO order_warehouse_assignment')) {
            const row = {
              id: `new-${inserted.length + 1}`,
              order_id: params[0],
              order_item_id: params[1],
              warehouse_id: params[2],
              status: 'pending',
            }
            inserted.push(row)
            return { rows: [row] }
          }
          if (sql.includes('SELECT product_id, quantity_available FROM warehouse_inventory')) {
            return { rows: [{ product_id: 'p1', quantity_available: 10 }] }
          }
          if (sql.includes('FROM order_item')) {
            return { rows: [{ product_id: 'p1', quantity: 4 }] }
          }
          return { rows: [], rowCount: 1 }
        }),
      }
      return client
    }

    it('creates a fresh pending leg, supersedes the failed one and reserves the stock again', async () => {
      const client = reopenClient([
        { id: 'old-1', order_id: 'order-1', order_item_id: null, warehouse_id: 'wh-1' },
      ])
      const legs = await reopenFailedWarehouseLegs(client, 'order-1', { supplierId: 'sup-1' })

      expect(legs).toHaveLength(1)
      expect(legs[0].id).toBe('new-1')
      const insert = client.query.mock.calls.find((c) =>
        String(c[0]).includes('INSERT INTO order_warehouse_assignment')
      )
      expect(insert[1][2]).toBe('wh-1')
      expect(insert[1][4]).toBe('old-1')
      expect(
        client.query.mock.calls.some(
          (c) => String(c[0]).includes("SET status = 'superseded'") && c[1].includes('old-1')
        )
      ).toBe(true)
      const reserve = client.query.mock.calls.find((c) =>
        String(c[0]).includes('quantity_reserved = wi.quantity_reserved +')
      )
      expect(reserve).toBeTruthy()
      expect(reserve[1]).toEqual(['wh-1', ['p1'], [4]])
    })

    it('does nothing when there are no failed legs', async () => {
      const client = reopenClient([])
      const legs = await reopenFailedWarehouseLegs(client, 'order-1')
      expect(legs).toEqual([])
      expect(
        client.query.mock.calls.some((c) =>
          String(c[0]).includes('INSERT INTO order_warehouse_assignment')
        )
      ).toBe(false)
    })
  })
})
