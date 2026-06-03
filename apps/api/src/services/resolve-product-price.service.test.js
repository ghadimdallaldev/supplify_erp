import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

const RESTAURANT_ID = '11111111-1111-4111-8111-111111111111'
const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222'
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333'
const CONTRACT_ID = '44444444-4444-4444-8444-444444444444'

describe('resolve-product-price.service', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('returns default catalog price when no restaurant context', async () => {
    const { resolveProductPrice } = await import('./resolve-product-price.service.js')
    queryMock.mockResolvedValueOnce({ rows: [{ amount: '12.50', currency: 'USD' }] })

    const result = await resolveProductPrice({
      supplierId: SUPPLIER_ID,
      productId: PRODUCT_ID,
    })

    expect(result.source).toBe('DEFAULT_PRICE')
    expect(result.unitPrice).toBe(12.5)
    expect(result.defaultPrice).toBe(12.5)
    expect(result.contractPriceId).toBeNull()
  })

  it('returns contract price when active contract matches', async () => {
    const { resolveProductPrice } = await import('./resolve-product-price.service.js')
    queryMock
      .mockResolvedValueOnce({ rows: [{ amount: '20.00', currency: 'USD' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: CONTRACT_ID,
            price: '15.00',
            currency: 'USD',
            contract_discount_percentage: '10',
            contract_start_date: null,
            contract_end_date: null,
            min_order_quantity: null,
          },
        ],
      })

    const result = await resolveProductPrice({
      restaurantId: RESTAURANT_ID,
      supplierId: SUPPLIER_ID,
      productId: PRODUCT_ID,
      quantity: 5,
    })

    expect(result.source).toBe('CONTRACT_PRICE')
    expect(result.unitPrice).toBe(15)
    expect(result.defaultPrice).toBe(20)
    expect(result.contractPriceId).toBe(CONTRACT_ID)
    expect(result.discountPercent).toBe(10)
  })

  it('falls back to default when min order quantity not met', async () => {
    const { resolveProductPrice } = await import('./resolve-product-price.service.js')
    queryMock
      .mockResolvedValueOnce({ rows: [{ amount: '20.00', currency: 'USD' }] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await resolveProductPrice({
      restaurantId: RESTAURANT_ID,
      supplierId: SUPPLIER_ID,
      productId: PRODUCT_ID,
      quantity: 2,
    })

    expect(result.source).toBe('DEFAULT_PRICE')
    expect(result.unitPrice).toBe(20)
  })

  it('batch resolves mixed contract and default items', async () => {
    const { resolveProductPricesBatch } = await import('./resolve-product-price.service.js')
    const product2 = '55555555-5555-4555-8555-555555555555'

    queryMock
      .mockResolvedValueOnce({
        rows: [
          { product_id: PRODUCT_ID, amount: '10', currency: 'USD' },
          { product_id: product2, amount: '8', currency: 'USD' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: CONTRACT_ID,
            supplier_id: SUPPLIER_ID,
            product_id: PRODUCT_ID,
            price: '7',
            currency: 'USD',
            contract_discount_percentage: null,
            contract_start_date: null,
            contract_end_date: null,
            min_order_quantity: null,
          },
        ],
      })

    const results = await resolveProductPricesBatch({
      restaurantId: RESTAURANT_ID,
      items: [
        { productId: PRODUCT_ID, supplierId: SUPPLIER_ID, quantity: 1 },
        { productId: product2, supplierId: SUPPLIER_ID, quantity: 1 },
      ],
    })

    expect(results).toHaveLength(2)
    expect(results[0].source).toBe('CONTRACT_PRICE')
    expect(results[0].unitPrice).toBe(7)
    expect(results[1].source).toBe('DEFAULT_PRICE')
    expect(results[1].unitPrice).toBe(8)
  })

  it('enriches products with resolved pricing fields', async () => {
    const { enrichProductsWithResolvedPricing } = await import('./resolve-product-price.service.js')

    queryMock
      .mockResolvedValueOnce({
        rows: [{ product_id: PRODUCT_ID, amount: '12', currency: 'USD' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: CONTRACT_ID,
            supplier_id: SUPPLIER_ID,
            product_id: PRODUCT_ID,
            price: '9',
            currency: 'USD',
            contract_discount_percentage: '25',
            contract_start_date: null,
            contract_end_date: null,
            min_order_quantity: null,
          },
        ],
      })

    const [enriched] = await enrichProductsWithResolvedPricing(
      [
        {
          id: PRODUCT_ID,
          supplier_id: SUPPLIER_ID,
          current_price: 12,
        },
      ],
      RESTAURANT_ID
    )

    expect(enriched.current_price).toBe(9)
    expect(enriched.catalog_price).toBe(12)
    expect(enriched.pricing_source).toBe('CONTRACT_PRICE')
    expect(enriched.contract_price_id).toBe(CONTRACT_ID)
  })
})
