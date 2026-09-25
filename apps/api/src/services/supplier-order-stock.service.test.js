import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError } from '../middlewares/errorHandler.js'

vi.mock('./supplier-inventory.service.js', () => ({
  assertAndDeductSupplierStock: vi.fn().mockResolvedValue(undefined),
  assertAndDeductSupplierStockBatch: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./warehouseInventory.js', () => ({
  releaseInventoryForOrder: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./warehouseRouting.js', () => ({
  assignWarehousesToOrder: vi.fn().mockResolvedValue({
    mode: 'single',
    warehouseId: 'wh-1',
    assignments: [{ id: 'owa-1' }],
  }),
}))

vi.mock('./supplier-stock.service.js', () => ({
  supplierUsesWarehouseInventory: vi.fn(),
  ensureDefaultWarehouseForSupplier: vi.fn().mockResolvedValue({ id: 'wh-1' }),
}))

vi.mock('../lib/warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('supplier_id'),
}))

import {
  applyWarehouseInventoryAdjustment,
  reserveStockForPlacedOrder,
  releaseStockForOrder,
  syncWarehouseMirrorFromLegacy,
} from './supplier-order-stock.service.js'
import { assertAndDeductSupplierStockBatch } from './supplier-inventory.service.js'
import { assignWarehousesToOrder } from './warehouseRouting.js'
import { releaseInventoryForOrder } from './warehouseInventory.js'
import { supplierUsesWarehouseInventory } from './supplier-stock.service.js'

describe('supplier-order-stock.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses warehouse path only when supplier has warehouses', async () => {
    supplierUsesWarehouseInventory.mockResolvedValue(true)
    const client = { query: vi.fn() }

    const result = await reserveStockForPlacedOrder(client, {
      supplierId: 'sup-1',
      supplier: { id: 'sup-1', default_warehouse_id: 'wh-1' },
      order: { id: 'ord-1', restaurant_id: 'r-1' },
      orderItems: [{ product_id: 'p-1', quantity: 2 }],
      multiWarehouseActive: false,
      legacyLineItems: [{ productId: 'p-1', quantity: 2, sku: 'SKU' }],
    })

    expect(result.mode).toBe('warehouse')
    expect(assignWarehousesToOrder).toHaveBeenCalled()
    expect(assertAndDeductSupplierStockBatch).not.toHaveBeenCalled()
  })

  it('uses legacy path only when no warehouses', async () => {
    supplierUsesWarehouseInventory.mockResolvedValue(false)
    const client = { query: vi.fn() }

    const result = await reserveStockForPlacedOrder(client, {
      supplierId: 'sup-1',
      supplier: { id: 'sup-1' },
      order: { id: 'ord-1' },
      orderItems: [{ product_id: 'p-1', quantity: 2 }],
      legacyLineItems: [{ productId: 'p-1', quantity: 2, sku: 'SKU' }],
    })

    expect(result.mode).toBe('legacy')
    expect(assertAndDeductSupplierStockBatch).toHaveBeenCalled()
    expect(assignWarehousesToOrder).not.toHaveBeenCalled()
  })

  it('fails closed when warehouse mode cannot assign stock', async () => {
    supplierUsesWarehouseInventory.mockResolvedValue(true)
    assignWarehousesToOrder.mockResolvedValueOnce({ mode: 'none', assignments: [] })
    const client = { query: vi.fn() }

    await expect(
      reserveStockForPlacedOrder(client, {
        supplierId: 'sup-1',
        supplier: { id: 'sup-1', default_warehouse_id: 'wh-1' },
        order: { id: 'ord-1' },
        orderItems: [{ product_id: 'p-1', quantity: 2 }],
        legacyLineItems: [{ productId: 'p-1', quantity: 2 }],
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(assertAndDeductSupplierStockBatch).not.toHaveBeenCalled()
  })

  it('releases warehouse stock when assignments exist', async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({ rows: [{ id: 'owa-1' }] }),
    }

    const result = await releaseStockForOrder(client, 'ord-1')
    expect(result.mode).toBe('warehouse')
    expect(releaseInventoryForOrder).toHaveBeenCalledWith(client, 'ord-1')
  })

  it('restores legacy inventory when no warehouse assignments', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ product_id: 'p-1', quantity: 3 }] })
        .mockResolvedValueOnce({}),
    }

    const result = await releaseStockForOrder(client, 'ord-1')
    expect(result.mode).toBe('legacy')
    expect(releaseInventoryForOrder).not.toHaveBeenCalled()
    expect(client.query.mock.calls[2][0]).toContain('FROM unnest($1::uuid[], $2::numeric[])')
    expect(client.query.mock.calls[2][0]).toContain('available_qty = inv.available_qty + src.qty')
  })

  it('maps warehouse insufficient stock to ValidationError', async () => {
    supplierUsesWarehouseInventory.mockResolvedValue(true)
    assignWarehousesToOrder.mockRejectedValueOnce(
      new Error('Insufficient stock at warehouse for product p-1')
    )
    const client = { query: vi.fn() }

    await expect(
      reserveStockForPlacedOrder(client, {
        supplierId: 'sup-1',
        supplier: { id: 'sup-1', default_warehouse_id: 'wh-1' },
        order: { id: 'ord-1' },
        orderItems: [{ product_id: 'p-1', quantity: 2 }],
        legacyLineItems: [{ productId: 'p-1', quantity: 2 }],
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects mirroring legacy stock onto another supplier warehouse', async () => {
    supplierUsesWarehouseInventory.mockResolvedValue(true)
    const client = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }),
    }

    await expect(
      syncWarehouseMirrorFromLegacy(client, {
        supplierId: 'sup-1',
        productId: 'p-1',
        availableQty: 10,
        warehouseId: 'foreign-wh',
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))).toBe(false)
  })

  it('applies a delta instead of overwriting multi-warehouse stock', async () => {
    supplierUsesWarehouseInventory.mockResolvedValue(true)
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'wh-1' }] })
        .mockResolvedValueOnce({ rows: [{ available_qty: 80, reserved_qty: 0 }] })
        .mockResolvedValueOnce({}),
    }

    const result = await syncWarehouseMirrorFromLegacy(client, {
      supplierId: 'sup-1',
      productId: 'p-1',
      availableQty: 90,
      reservedQty: 0,
      warehouseId: 'wh-1',
    })

    expect(result).toEqual({ warehouseId: 'wh-1', available: 90, reserved: 0 })
    const upsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO warehouse_inventory')
    )
    expect(upsert?.[1]?.[2]).toBe(10)
    expect(upsert?.[0]).toMatch(/warehouse_inventory\.quantity_available \+ \$3/)
  })

  it('applies warehouse adjustments from warehouse totals, not a stale inventory row', async () => {
    supplierUsesWarehouseInventory.mockResolvedValue(true)
    const client = {
      query: vi.fn().mockImplementation(async (sql) => {
        const text = String(sql)
        if (text.includes('SELECT id FROM warehouse')) return { rows: [{ id: 'wh-1' }] }
        if (text.includes('COALESCE(SUM')) {
          return { rows: [{ available_qty: 100, reserved_qty: 0 }] }
        }
        if (text.includes('FROM warehouse_inventory') && text.includes('warehouse_id = $1')) {
          return { rows: [{ available_qty: 100 }] }
        }
        return { rows: [] }
      }),
    }

    const result = await applyWarehouseInventoryAdjustment(client, {
      supplierId: 'sup-1',
      productId: 'p-1',
      adjustmentType: 'OUT',
      quantity: 10,
      warehouseId: 'wh-1',
    })

    expect(result.applied).toBe(true)
    const upsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO warehouse_inventory')
    )
    expect(upsert?.[1]?.[2]).toBe(-10)
    const legacyMirror = client.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO inventory')
    )
    expect(legacyMirror).toBeTruthy()
  })

  it('rejects a warehouse OUT that exceeds that warehouse quantity', async () => {
    supplierUsesWarehouseInventory.mockResolvedValue(true)
    const client = {
      query: vi.fn().mockImplementation(async (sql) => {
        const text = String(sql)
        if (text.includes('SELECT id FROM warehouse')) return { rows: [{ id: 'wh-1' }] }
        if (text.includes('COALESCE(SUM')) {
          return { rows: [{ available_qty: 100, reserved_qty: 0 }] }
        }
        if (text.includes('FROM warehouse_inventory') && text.includes('warehouse_id = $1')) {
          return { rows: [{ available_qty: 5 }] }
        }
        return { rows: [] }
      }),
    }

    await expect(
      applyWarehouseInventoryAdjustment(client, {
        supplierId: 'sup-1',
        productId: 'p-1',
        adjustmentType: 'OUT',
        quantity: 10,
        warehouseId: 'wh-1',
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))).toBe(false)
  })
})
