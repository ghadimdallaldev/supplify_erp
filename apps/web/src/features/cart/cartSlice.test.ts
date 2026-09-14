import { describe, expect, it, vi, beforeEach } from 'vitest'
import cartReducer, { addItem } from './cartSlice'
import type { CartItem } from '../../types'

vi.mock('./cartPersistence', () => ({
  loadCartFromStorage: vi.fn(() => null),
  saveCartToStorage: vi.fn(),
}))

const baseProduct = {
  id: 'product-1',
  supplier_id: 'supplier-1',
  sku: 'SKU-1',
  name: 'Test Product',
  unit: 'kg',
  current_price: 10,
  supplier_name: 'Fresh Co',
} as CartItem['product']

function quoteItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'product-1',
    quantity: 5,
    quotedUnitPrice: 9.5,
    quoteRequestSupplierId: 'qrs-1',
    quoteResponseItemId: 'qri-1',
    product: { ...baseProduct, current_price: 9.5 },
    ...overrides,
  }
}

describe('cartSlice addItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves quote lock metadata when merging into an existing cart line', () => {
    const initial = cartReducer(undefined, { type: 'init' })
    const withCatalogItem = cartReducer(
      initial,
      addItem({
        item: {
          productId: 'product-1',
          quantity: 2,
          product: baseProduct,
        },
      })
    )

    const merged = cartReducer(
      withCatalogItem,
      addItem({
        item: quoteItem({ quantity: 3 }),
      })
    )

    const line = merged.items[0]
    expect(line.quantity).toBe(5)
    expect(line.quoteResponseItemId).toBe('qri-1')
    expect(line.quoteRequestSupplierId).toBe('qrs-1')
    expect(line.quotedUnitPrice).toBe(9.5)
    expect(line.product.current_price).toBe(9.5)
  })

  it('keeps quote locks on cart lines that already carry them', () => {
    const initial = cartReducer(undefined, { type: 'init' })
    const withQuote = cartReducer(initial, addItem({ item: quoteItem() }))
    const merged = cartReducer(
      withQuote,
      addItem({
        item: quoteItem({
          quantity: 2,
          quotedUnitPrice: 8.25,
          quoteResponseItemId: 'qri-2',
          quoteRequestSupplierId: 'qrs-2',
        }),
      })
    )

    const line = merged.items[0]
    expect(line.quoteResponseItemId).toBe('qri-2')
    expect(line.quoteRequestSupplierId).toBe('qrs-2')
    expect(line.quotedUnitPrice).toBe(8.25)
  })

  it('clears quote lock metadata when re-adding the same SKU from catalog', () => {
    const initial = cartReducer(undefined, { type: 'init' })
    const withQuote = cartReducer(initial, addItem({ item: quoteItem() }))
    const merged = cartReducer(
      withQuote,
      addItem({
        item: {
          productId: 'product-1',
          quantity: 1,
          product: baseProduct,
        },
      })
    )

    const line = merged.items[0]
    expect(line.quantity).toBe(6)
    expect(line.quoteResponseItemId).toBeUndefined()
    expect(line.quoteRequestSupplierId).toBeUndefined()
    expect(line.quotedUnitPrice).toBeUndefined()
    expect(line.product.current_price).toBe(10)
  })
})
