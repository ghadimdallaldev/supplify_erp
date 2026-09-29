import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rootQuery: vi.fn(),
  withTransaction: vi.fn(),
  resolveScope: vi.fn(),
  prices: vi.fn(),
  zoneMatches: vi.fn(),
  reserve: vi.fn(),
  insertItems: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  query: (...args) => mocks.rootQuery(...args),
  withTransaction: (...args) => mocks.withTransaction(...args),
}))
vi.mock('./public-supplier-catalog.service.js', () => ({
  resolvePublicSupplierByIdOrSlug: (...args) => mocks.resolveScope(...args),
}))
vi.mock('./resolve-product-price.service.js', () => ({
  getDefaultCatalogPricesBatch: (...args) => mocks.prices(...args),
}))
vi.mock('./warehouseRouting.js', () => ({
  restaurantMatchesZone: (...args) => mocks.zoneMatches(...args),
}))
vi.mock('./warehouseInventory.js', () => ({
  reserveWarehouseStockBatch: (...args) => mocks.reserve(...args),
}))
vi.mock('./order-create.service.js', () => ({
  insertOrderItemsBatch: (...args) => mocks.insertItems(...args),
}))
vi.mock('./order-placement-idempotency.service.js', () => ({
  hashOrderPlacementPayload: vi.fn(() => 'request-hash'),
  claimOrderPlacementKey: (...args) => mocks.claim(...args),
  completeOrderPlacementKey: (...args) => mocks.complete(...args),
}))

import {
  createPublicOrder,
  getGuestPublicOrder,
  previewPublicOrder,
} from './public-sales.service.js'

const productId = '11111111-1111-4111-8111-111111111111'
const otherProductId = '22222222-2222-4222-8222-222222222222'
const supplierId = '33333333-3333-4333-8333-333333333333'
const otherSupplierId = '44444444-4444-4444-8444-444444444444'
const warehouseId = '55555555-5555-4555-8555-555555555555'

function product(id = productId, supplier = supplierId, overrides = {}) {
  return {
    id,
    supplier_id: supplier,
    name: id === productId ? 'Produce box' : 'Second item',
    sku: id === productId ? 'BOX-1' : 'ITEM-2',
    unit: 'case',
    moq: 2,
    order_multiple: 2,
    supplier_name: 'Public Supplier',
    organization_id: null,
    minimum_order_amount: 0,
    default_warehouse_id: warehouseId,
    fulfillment_mode: 'WAREHOUSE',
    multi_warehouse_enabled: false,
    ...overrides,
  }
}

function configRow(overrides = {}) {
  return {
    supplier_id: supplierId,
    slug: 'public-supplier',
    name: 'Public Supplier',
    public_catalog_enabled: true,
    enabled: true,
    payment_methods: ['CASH_ON_PICKUP', 'CASH_ON_DELIVERY', 'BANK_TRANSFER'],
    bank_transfer_instructions: 'Transfer before fulfillment',
    pickup_warehouse_id: warehouseId,
    pickup_warehouse_name: 'Main warehouse',
    pickup_address: { line1: 'Warehouse road' },
    delivery_warehouse_ids: [warehouseId],
    ...overrides,
  }
}

function previewDb({
  products = [product()],
  config = configRow(),
  stock = products.map((row) => ({
    warehouse_id: warehouseId,
    product_id: row.id,
    quantity_available: 100,
  })),
  zones = [{ id: 'zone-1', warehouse_id: warehouseId, delivery_fee: 4, min_order_amount: 0 }],
} = {}) {
  return vi.fn(async (sql) => {
    if (sql.includes('FROM product p') && sql.includes('JOIN supplier s')) return { rows: products }
    if (sql.includes('FROM supplier s') && sql.includes('supplier_public_sales_config')) {
      return { rows: [config] }
    }
    if (sql.includes('FROM warehouse WHERE')) {
      return {
        rows: [{ id: warehouseId, name: 'Main warehouse', address: { line1: 'Warehouse road' } }],
      }
    }
    if (sql.includes('FROM warehouse_inventory wi')) return { rows: stock }
    if (sql.includes('FROM delivery_zone')) return { rows: zones }
    throw new Error(`Unexpected SQL in test: ${sql}`)
  })
}

describe('public sales service validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveScope.mockResolvedValue({ supplierIds: [supplierId, otherSupplierId] })
    mocks.prices.mockResolvedValue(
      new Map([
        [productId, { amount: 10, currency: 'USD' }],
        [otherProductId, { amount: 5, currency: 'USD' }],
      ])
    )
    mocks.zoneMatches.mockReturnValue(true)
  })

  it('calculates the authoritative subtotal, delivery fee, and total from default prices', async () => {
    const db = previewDb()
    const result = await previewPublicOrder(
      'public-supplier',
      {
        items: [{ productId, quantity: 2 }],
        fulfillmentMethod: 'DELIVERY',
        deliveryAddress: { line1: 'Street', city: 'Beirut', country: 'LB' },
        paymentMethod: 'CASH_ON_DELIVERY',
      },
      db
    )
    expect(result).toMatchObject({ subtotal: 20, deliveryFee: 4, total: 24, currency: 'USD' })
    expect(result.items[0]).toMatchObject({ unitPrice: 10, pricingSource: 'DEFAULT_PRICE' })
  })

  it('fails closed when no configured delivery zone matches', async () => {
    mocks.zoneMatches.mockReturnValue(false)
    await expect(
      previewPublicOrder(
        'public-supplier',
        {
          items: [{ productId, quantity: 2 }],
          fulfillmentMethod: 'DELIVERY',
          deliveryAddress: { line1: 'Street', city: 'Outside', country: 'LB' },
          paymentMethod: 'CASH_ON_DELIVERY',
        },
        previewDb()
      )
    ).rejects.toMatchObject({ code: 'ZONE_INELIGIBLE' })
  })

  it('rejects mixed underlying supplier tenants', async () => {
    await expect(
      previewPublicOrder(
        'public-supplier',
        {
          items: [
            { productId, quantity: 2 },
            { productId: otherProductId, quantity: 2 },
          ],
          fulfillmentMethod: 'PICKUP',
          paymentMethod: 'CASH_ON_PICKUP',
        },
        previewDb({ products: [product(), product(otherProductId, otherSupplierId)] })
      )
    ).rejects.toMatchObject({ code: 'NO_SINGLE_FULFILLMENT_LOCATION' })
  })

  it.each([
    [1, 'at least 2'],
    [3, 'multiples of 2'],
  ])(
    'rejects quantity %s when MOQ/order-multiple rules are not satisfied',
    async (quantity, text) => {
      await expect(
        previewPublicOrder(
          'public-supplier',
          {
            items: [{ productId, quantity }],
            fulfillmentMethod: 'PICKUP',
            paymentMethod: 'CASH_ON_PICKUP',
          },
          previewDb()
        )
      ).rejects.toThrow(text)
    }
  )

  it('rejects an order below the supplier minimum', async () => {
    await expect(
      previewPublicOrder(
        'public-supplier',
        {
          items: [{ productId, quantity: 2 }],
          fulfillmentMethod: 'PICKUP',
          paymentMethod: 'CASH_ON_PICKUP',
        },
        previewDb({ products: [product(productId, supplierId, { minimum_order_amount: 30 })] })
      )
    ).rejects.toThrow('at least 30.00')
  })

  it('isolates stock checks to explicitly selected public warehouses', async () => {
    const db = previewDb()
    await previewPublicOrder(
      'public-supplier',
      {
        items: [{ productId, quantity: 2 }],
        fulfillmentMethod: 'PICKUP',
        paymentMethod: 'CASH_ON_PICKUP',
      },
      db
    )
    const warehouseCall = db.mock.calls.find(([sql]) => sql.includes('FROM warehouse WHERE'))
    expect(warehouseCall[1]).toEqual([supplierId, [warehouseId]])
  })

  it('returns a successful idempotent replay before rechecking reserved stock', async () => {
    const replay = { order: { id: 'existing-order' }, supplierName: 'Public Supplier' }
    mocks.rootQuery.mockResolvedValue({ rows: [{ supplier_id: supplierId }] })
    mocks.claim.mockResolvedValue({ enabled: true, replay, id: 'claim-1' })
    mocks.withTransaction.mockImplementation((callback) =>
      callback({
        query: vi.fn(() => {
          throw new Error('stock must not be queried on replay')
        }),
      })
    )
    const result = await createPublicOrder({
      idOrSlug: 'public-supplier',
      input: {
        items: [{ productId, quantity: 2 }],
        fulfillmentMethod: 'PICKUP',
        paymentMethod: 'CASH_ON_PICKUP',
        customer: { name: 'Guest User', phone: '+96170000000' },
      },
      actor: null,
      idempotencyKey: 'checkout-attempt-1',
    })
    expect(result).toEqual({ ...replay, trackingToken: null, replay: true })
    expect(mocks.reserve).not.toHaveBeenCalled()
  })

  it('hashes guest tracking tokens before database lookup and rejects revoked/invalid tokens', async () => {
    const db = vi.fn().mockResolvedValue({ rows: [] })
    const token = 'raw-guest-token-that-is-long-enough-123456'
    await expect(getGuestPublicOrder(token, db)).rejects.toThrow('Order not found')
    const hash = db.mock.calls[0][1][0]
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toBe(token)
  })
})
