import { usePublicCart } from './store'
import type { PublicProduct } from './types'

const product = (id: string, supplierId: string, overrides: Partial<PublicProduct> = {}): PublicProduct => ({
  id,
  supplierId,
  name: id,
  sku: id,
  currentPrice: 10,
  orderable: true,
  ...overrides,
})

describe('public storefront cart', () => {
  beforeEach(() => usePublicCart.getState().clear())

  it('keeps products at one underlying supplier location', () => {
    expect(usePublicCart.getState().add('store', product('a', 'supplier-1'))).toBe(true)
    expect(usePublicCart.getState().add('store', product('b', 'supplier-2'))).toBe(false)
    expect(usePublicCart.getState().lines.map((line) => line.product.id)).toEqual(['a'])
  })

  it('starts at MOQ and increments by the order multiple', () => {
    const item = product('a', 'supplier-1', { moq: 6, orderMultiple: 3 })
    usePublicCart.getState().add('store', item)
    expect(usePublicCart.getState().lines[0].quantity).toBe(6)
    usePublicCart.getState().add('store', item)
    expect(usePublicCart.getState().lines[0].quantity).toBe(9)
  })

  it('removes a line below MOQ and resets the cart scope', () => {
    usePublicCart.getState().add('store', product('a', 'supplier-1', { moq: 2 }))
    usePublicCart.getState().setQuantity('a', 1)
    expect(usePublicCart.getState().lines).toEqual([])
    expect(usePublicCart.getState().supplierLocationId).toBeNull()
  })

  it('rebuilds a cart from current reorder products', () => {
    usePublicCart.getState().replace('supplier-store', 'supplier-1', [
      { product: product('a', 'supplier-1', { currentPrice: 14 }), quantity: 6 },
    ])
    expect(usePublicCart.getState()).toMatchObject({
      storefront: 'supplier-store',
      supplierLocationId: 'supplier-1',
      lines: [{ quantity: 6, product: { id: 'a', currentPrice: 14 } }],
    })
  })
})
