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

  it('skips catalog query when catalogByProductId map is provided', async () => {
    const { resolveProductPricesBatch } = await import('./resolve-product-price.service.js')
    const catalog = new Map([[PRODUCT_ID, { amount: 10, currency: 'USD' }]])

    queryMock.mockResolvedValueOnce({ rows: [] })

    const results = await resolveProductPricesBatch({
      restaurantId: RESTAURANT_ID,
      items: [{ productId: PRODUCT_ID, supplierId: SUPPLIER_ID, quantity: 1 }],
      catalogByProductId: catalog,
    })

    expect(results).toHaveLength(1)
    expect(results[0].unitPrice).toBe(10)
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(String(queryMock.mock.calls[0][0])).toContain('restaurant_pricing')
  })

  it('resolves quote price when quoteLocks are provided', async () => {
    const { resolveQuotePrice, resolveProductPricesBatch } = await import(
      './resolve-product-price.service.js'
    )
    const quoteResponseItemId = '66666666-6666-4666-8666-666666666666'
    const quoteRequestSupplierId = '77777777-7777-4777-8777-777777777777'

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: quoteResponseItemId,
            unit_price: '11.50',
            currency: 'USD',
            product_id: PRODUCT_ID,
            supplier_id: SUPPLIER_ID,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ amount: '20.00', currency: 'USD' }] })

    const quoteResult = await resolveQuotePrice({
      restaurantId: RESTAURANT_ID,
      quoteRequestSupplierId,
      quoteResponseItemId,
      productId: PRODUCT_ID,
      supplierId: SUPPLIER_ID,
    })

    expect(quoteResult?.source).toBe('QUOTE_PRICE')
    expect(quoteResult?.unitPrice).toBe(11.5)
    expect(quoteResult?.defaultPrice).toBe(20)
    expect(quoteResult?.quoteResponseItemId).toBe(quoteResponseItemId)

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            quote_response_item_id: quoteResponseItemId,
            unit_price: '11.50',
            currency: 'USD',
            product_id: PRODUCT_ID,
            supplier_id: SUPPLIER_ID,
            quote_request_supplier_id: quoteRequestSupplierId,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ product_id: PRODUCT_ID, amount: '20', currency: 'USD' }],
      })
      .mockResolvedValueOnce({ rows: [] })

    const batchResults = await resolveProductPricesBatch({
      restaurantId: RESTAURANT_ID,
      items: [{ productId: PRODUCT_ID, supplierId: SUPPLIER_ID, quantity: 2 }],
      catalogByProductId: new Map([[PRODUCT_ID, { amount: 20, currency: 'USD' }]]),
      quoteLocks: [
        {
          productId: PRODUCT_ID,
          quoteRequestSupplierId,
          quoteResponseItemId,
        },
      ],
    })

    expect(batchResults[0].source).toBe('QUOTE_PRICE')
    expect(batchResults[0].unitPrice).toBe(11.5)
    expect(batchResults[0].quoteResponseItemId).toBe(quoteResponseItemId)
    expect(String(queryMock.mock.calls[0][0])).toContain("qr.status = 'open'")
  })

  it('resolves quote price for substitute product id in quoteLocks', async () => {
    const { resolveProductPricesBatch } = await import('./resolve-product-price.service.js')
    const quoteResponseItemId = '66666666-6666-4666-8666-666666666666'
    const quoteRequestSupplierId = '77777777-7777-4777-8777-777777777777'
    const substituteProductId = '88888888-8888-4888-8888-888888888888'

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            quote_response_item_id: quoteResponseItemId,
            unit_price: '9.25',
            currency: 'USD',
            product_id: PRODUCT_ID,
            substitute_product_id: substituteProductId,
            supplier_id: SUPPLIER_ID,
            quote_request_supplier_id: quoteRequestSupplierId,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { product_id: PRODUCT_ID, amount: '20', currency: 'USD' },
          { product_id: substituteProductId, amount: '18', currency: 'USD' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })

    const batchResults = await resolveProductPricesBatch({
      restaurantId: RESTAURANT_ID,
      items: [{ productId: substituteProductId, supplierId: SUPPLIER_ID, quantity: 1 }],
      catalogByProductId: new Map([
        [PRODUCT_ID, { amount: 20, currency: 'USD' }],
        [substituteProductId, { amount: 18, currency: 'USD' }],
      ]),
      quoteLocks: [
        {
          productId: substituteProductId,
          quoteRequestSupplierId,
          quoteResponseItemId,
        },
      ],
    })

    expect(batchResults[0].source).toBe('QUOTE_PRICE')
    expect(batchResults[0].unitPrice).toBe(9.25)
    expect(batchResults[0].productId).toBe(substituteProductId)
  })

  it('returns null for quote price when RFQ is not open', async () => {
    const { resolveQuotePrice } = await import('./resolve-product-price.service.js')
    const quoteResponseItemId = '66666666-6666-4666-8666-666666666666'
    const quoteRequestSupplierId = '77777777-7777-4777-8777-777777777777'

    queryMock.mockResolvedValueOnce({ rows: [] })

    const quoteResult = await resolveQuotePrice({
      restaurantId: RESTAURANT_ID,
      quoteRequestSupplierId,
      quoteResponseItemId,
      productId: PRODUCT_ID,
      supplierId: SUPPLIER_ID,
    })

    expect(quoteResult).toBeNull()
    expect(String(queryMock.mock.calls[0][0])).toContain("qr.status = 'open'")
  })

  it('uses CURRENT_DATE in contract query when no explicit date is provided', async () => {
    const { resolveProductPrice } = await import('./resolve-product-price.service.js')
    queryMock
      .mockResolvedValueOnce({ rows: [{ amount: '20.00', currency: 'USD' }] })
      .mockResolvedValueOnce({ rows: [] })

    await resolveProductPrice({
      restaurantId: RESTAURANT_ID,
      supplierId: SUPPLIER_ID,
      productId: PRODUCT_ID,
    })

    const contractSql = String(queryMock.mock.calls[1][0])
    expect(contractSql).toContain('COALESCE($4::date, CURRENT_DATE)')
    expect(queryMock.mock.calls[1][1][3]).toBeNull()
  })

  it('uses local calendar date string for explicit Date values', async () => {
    const { resolveProductPrice } = await import('./resolve-product-price.service.js')
    queryMock
      .mockResolvedValueOnce({ rows: [{ amount: '20.00', currency: 'USD' }] })
      .mockResolvedValueOnce({ rows: [] })

    const localDate = new Date(2026, 0, 15, 22, 0, 0)

    await resolveProductPrice({
      restaurantId: RESTAURANT_ID,
      supplierId: SUPPLIER_ID,
      productId: PRODUCT_ID,
      date: localDate,
    })

    expect(queryMock.mock.calls[1][1][3]).toBe('2026-01-15')
  })

  it('passes through explicit YYYY-MM-DD date strings unchanged', async () => {
    const { resolveProductPrice } = await import('./resolve-product-price.service.js')
    queryMock
      .mockResolvedValueOnce({ rows: [{ amount: '20.00', currency: 'USD' }] })
      .mockResolvedValueOnce({ rows: [] })

    await resolveProductPrice({
      restaurantId: RESTAURANT_ID,
      supplierId: SUPPLIER_ID,
      productId: PRODUCT_ID,
      date: '2026-06-01',
    })

    expect(queryMock.mock.calls[1][1][3]).toBe('2026-06-01')
  })

  it('batch resolver passes null date for CURRENT_DATE semantics', async () => {
    const { resolveProductPricesBatch } = await import('./resolve-product-price.service.js')

    queryMock
      .mockResolvedValueOnce({
        rows: [{ product_id: PRODUCT_ID, amount: '10', currency: 'USD' }],
      })
      .mockResolvedValueOnce({ rows: [] })

    await resolveProductPricesBatch({
      restaurantId: RESTAURANT_ID,
      items: [{ productId: PRODUCT_ID, supplierId: SUPPLIER_ID, quantity: 1 }],
    })

    const contractSql = String(queryMock.mock.calls[1][0])
    expect(contractSql).toContain('COALESCE($4::date, CURRENT_DATE)')
    expect(queryMock.mock.calls[1][1][3]).toBeNull()
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

  it('findOpenQuotedProductsForOrder maps original and substitute product ids', async () => {
    const { findOpenQuotedProductsForOrder } = await import('./resolve-product-price.service.js')
    const substituteProductId = '88888888-8888-4888-8888-888888888888'

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          original_product_id: PRODUCT_ID,
          substitute_product_id: substituteProductId,
          sku: 'SKU-ORIG',
          submitted_at: new Date('2026-09-10T12:00:00Z'),
        },
        {
          original_product_id: PRODUCT_ID,
          substitute_product_id: null,
          sku: 'SKU-OLDER',
          submitted_at: new Date('2026-09-01T12:00:00Z'),
        },
      ],
    })

    const quoted = await findOpenQuotedProductsForOrder({
      restaurantId: RESTAURANT_ID,
      productIds: [PRODUCT_ID, substituteProductId],
    })

    expect(quoted.get(PRODUCT_ID)).toEqual({ sku: 'SKU-ORIG', productId: PRODUCT_ID })
    expect(quoted.get(substituteProductId)).toEqual({
      sku: 'SKU-ORIG',
      productId: substituteProductId,
    })
    expect(String(queryMock.mock.calls[0][0])).toContain("qr.status = 'open'")
    expect(String(queryMock.mock.calls[0][0])).toContain('ORDER BY qr_resp.submitted_at DESC')
  })

  it('findOpenQuotedProductsForOrder returns empty map when no product ids', async () => {
    const { findOpenQuotedProductsForOrder } = await import('./resolve-product-price.service.js')

    const quoted = await findOpenQuotedProductsForOrder({
      restaurantId: RESTAURANT_ID,
      productIds: [],
    })

    expect(quoted.size).toBe(0)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('findOpenQuoteLocksForOrder returns latest locks scoped to supplier', async () => {
    const { findOpenQuoteLocksForOrder } = await import('./resolve-product-price.service.js')

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          original_product_id: PRODUCT_ID,
          substitute_product_id: null,
          quote_request_supplier_id: 'qrs-new',
          quote_response_item_id: 'qri-new',
          submitted_at: new Date('2026-09-10T12:00:00Z'),
        },
        {
          original_product_id: PRODUCT_ID,
          substitute_product_id: null,
          quote_request_supplier_id: 'qrs-old',
          quote_response_item_id: 'qri-old',
          submitted_at: new Date('2026-09-01T12:00:00Z'),
        },
      ],
    })

    const locks = await findOpenQuoteLocksForOrder({
      restaurantId: RESTAURANT_ID,
      productIds: [PRODUCT_ID],
      supplierId: SUPPLIER_ID,
    })

    expect(locks).toEqual([
      {
        productId: PRODUCT_ID,
        quoteRequestSupplierId: 'qrs-new',
        quoteResponseItemId: 'qri-new',
      },
    ])
    expect(String(queryMock.mock.calls[0][0])).toContain('qrs.supplier_id')
  })
})
