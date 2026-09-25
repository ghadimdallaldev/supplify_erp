import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}))

vi.mock('./notification.service.js', () => ({
  notifyTenantUsers: vi.fn(),
}))

vi.mock('./supplier-order-stock.service.js', () => ({
  releaseStockForOrder: vi.fn(),
  reserveStockForPlacedOrder: vi.fn(),
}))

vi.mock('../lib/subscription.js', () => ({
  isFeatureEnabled: vi.fn(),
}))

vi.mock('./resolve-product-price.service.js', () => ({
  resolveProductPrice: vi.fn(),
}))

describe('applyAmendmentItems currency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the order unit price when a quantity change resolves in another currency', async () => {
    const { resolveProductPrice } = await import('./resolve-product-price.service.js')
    resolveProductPrice.mockResolvedValue({
      unitPrice: 3,
      source: 'CONTRACT_PRICE',
      contractPriceId: 'contract-jod',
      currency: 'JOD',
    })

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ order_item_id: 'line-1', requested_quantity: 4, unit_price: 10 }],
        })
        .mockResolvedValueOnce({ rows: [{ change_type: 'quantity_change' }] })
        .mockResolvedValueOnce({
          rows: [
            { restaurant_id: 'rest-1', requested_delivery_date: '2026-09-25', currency: 'USD' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ product_id: 'prod-1', supplier_id: 'sup-1', pricing_source: 'CONTRACT_PRICE' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 40 }] })
        .mockResolvedValueOnce({ rows: [{ discount: 0 }] })
        .mockResolvedValueOnce({ rows: [] }),
    }

    const { applyAmendmentItems } = await import('./order-amendments.service.js')
    await applyAmendmentItems(client, 'order-1', 'amend-1')

    const quantityUpdate = client.query.mock.calls.find((call) =>
      String(call[0]).includes('SET quantity = $1, line_total = $2, unit_price = $3')
    )
    expect(quantityUpdate?.[1]).toEqual([4, 40, 10, 'line-1', 'order-1'])
  })

  it('rejects a substitute priced in another currency', async () => {
    const { resolveProductPrice } = await import('./resolve-product-price.service.js')
    resolveProductPrice.mockResolvedValue({
      unitPrice: 3,
      source: 'DEFAULT_PRICE',
      contractPriceId: null,
      currency: 'JOD',
    })

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              order_item_id: 'line-1',
              substitute_product_id: 'prod-2',
              requested_quantity: 1,
              unit_price: 10,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ change_type: 'item_substitution' }] })
        .mockResolvedValueOnce({
          rows: [
            { restaurant_id: 'rest-1', requested_delivery_date: '2026-09-25', currency: 'USD' },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ supplier_id: 'sup-1' }] }),
    }

    const { applyAmendmentItems } = await import('./order-amendments.service.js')
    await expect(applyAmendmentItems(client, 'order-1', 'amend-1')).rejects.toThrow(/currency/i)
  })
})
