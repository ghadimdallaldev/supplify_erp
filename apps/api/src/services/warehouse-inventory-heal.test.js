import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('../lib/warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('supplier_id'),
  isDefaultWarehouse: (w) => Boolean(w.is_default || w.is_main),
}))

vi.mock('../lib/subscription.js', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('../lib/org-billing-tenant.js', () => ({
  resolveOrgBillingTenantId: vi.fn(async (id) => id),
}))

vi.mock('./supplier-inventory.service.js', () => ({
  upsertWarehouseInventoryFromInventory: vi.fn().mockResolvedValue(undefined),
}))

import { seedMissingWarehouseInventoryForSupplier } from './supplier-stock.service.js'
import { upsertWarehouseInventoryFromInventory } from './supplier-inventory.service.js'

describe('seedMissingWarehouseInventoryForSupplier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('seeds default warehouse from legacy when product has no active WH row', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ product_id: 'p-1', available_qty: 12, reserved_qty: 1 }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    }

    const result = await seedMissingWarehouseInventoryForSupplier('sup-1', 'wh-default', {
      client,
      productIds: ['p-1'],
    })

    expect(result.seeded).toBe(1)
    expect(upsertWarehouseInventoryFromInventory).toHaveBeenCalledWith(client, {
      warehouseId: 'wh-default',
      productId: 'p-1',
      availableQty: 12,
      reservedQty: 1,
    })
  })

  it('transfers inactive warehouse stock to target instead of using legacy', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ product_id: 'p-1', available_qty: 99, reserved_qty: 0 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              product_id: 'p-1',
              quantity_available: 7,
              quantity_reserved: 2,
              warehouse_id: 'wh-old',
            },
          ],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
    }

    const result = await seedMissingWarehouseInventoryForSupplier('sup-1', 'wh-default', {
      client,
      productIds: ['p-1'],
    })

    expect(result.seeded).toBe(1)
    expect(result.transferredFromInactive).toBe(1)
    expect(upsertWarehouseInventoryFromInventory).not.toHaveBeenCalled()
    expect(
      client.query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO warehouse_inventory'))
    ).toBe(true)
  })

  it('skips products that already have active warehouse inventory elsewhere', async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }),
    }

    const result = await seedMissingWarehouseInventoryForSupplier('sup-1', 'wh-default', {
      client,
      productIds: ['p-1'],
    })

    expect(result.seeded).toBe(0)
    expect(upsertWarehouseInventoryFromInventory).not.toHaveBeenCalled()
  })
})
