import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError } from '../middlewares/errorHandler.js'

import {
  assertAndDeductSupplierStock,
  assertAndDeductSupplierStockBatch,
} from './supplier-inventory.service.js'

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

  it('deducts multiple products in a batch', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            { product_id: 'prod-1', available_qty: 10 },
            { product_id: 'prod-2', available_qty: 5 },
          ],
        })
        .mockResolvedValueOnce({}),
    }

    await assertAndDeductSupplierStockBatch(client, [
      { productId: 'prod-1', quantity: 2, sku: 'SKU-1' },
      { productId: 'prod-2', quantity: 1, sku: 'SKU-2' },
    ])

    expect(client.query).toHaveBeenCalledTimes(2)
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(client.query.mock.calls[1][0]).toContain('unnest')
  })

  it('throws when batch stock is insufficient', async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [{ product_id: 'prod-1', available_qty: 0.5 }],
      }),
    }

    await expect(
      assertAndDeductSupplierStockBatch(client, [
        { productId: 'prod-1', quantity: 1, sku: 'SKU-1' },
      ])
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('aggregates duplicate product lines before batch deduct', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ product_id: 'prod-1', available_qty: 10 }],
        })
        .mockResolvedValueOnce({}),
    }

    await assertAndDeductSupplierStockBatch(client, [
      { productId: 'prod-1', quantity: 3, sku: 'SKU-1' },
      { productId: 'prod-1', quantity: 4, sku: 'SKU-1' },
    ])

    expect(client.query.mock.calls[1][1][1]).toEqual([7])
  })
})
