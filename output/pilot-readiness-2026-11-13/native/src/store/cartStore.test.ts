import { useCartStore } from './cartStore'
import type { Product } from '../types/supplify'

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `checkout-${Math.random()}`) }))

const product: Product = { id: 'p1', supplier_id: 's1', sku: 'SKU', name: 'Tomatoes', current_price: 2 }
const packProduct: Product = {
  ...product,
  id: 'p2',
  sku: 'PACK',
  moq: 6,
  order_multiple: 6,
}

describe('cartStore', () => {
  beforeEach(() => useCartStore.getState().reset())

  it('adds and increments products', () => {
    useCartStore.getState().addItem(product)
    useCartStore.getState().addItem(product, 2)
    expect(useCartStore.getState().items[0].quantity).toBe(3)
  })

  it('defaults first add to MOQ and snaps pack multiples', () => {
    useCartStore.getState().addItem(packProduct)
    expect(useCartStore.getState().items[0].quantity).toBe(6)
    useCartStore.getState().addItem(packProduct, 1)
    expect(useCartStore.getState().items[0].quantity).toBe(12)
  })

  it('removes products when quantity reaches zero', () => {
    useCartStore.getState().addItem(product)
    useCartStore.getState().updateQuantity(product.id, 0)
    expect(useCartStore.getState().items).toEqual([])
  })

  it('preserves quote price-lock identifiers through cart updates', () => {
    useCartStore.getState().addItem(product, 3, {
      quotedUnitPrice: 1.5,
      quoteRequestSupplierId: 'qrs1',
      quoteResponseItemId: 'qri1',
    })
    useCartStore.getState().updateQuantity(product.id, 4)
    expect(useCartStore.getState().items[0].quoteLock).toEqual({
      quotedUnitPrice: 1.5,
      quoteRequestSupplierId: 'qrs1',
      quoteResponseItemId: 'qri1',
    })
  })

  it('overwrites quote lock when merging a new quote for the same product', () => {
    useCartStore.getState().addItem(product, 1, {
      quotedUnitPrice: 1.5,
      quoteRequestSupplierId: 'qrs1',
      quoteResponseItemId: 'qri1',
    })
    useCartStore.getState().addItem(product, 2, {
      quotedUnitPrice: 1.1,
      quoteRequestSupplierId: 'qrs2',
      quoteResponseItemId: 'qri2',
    })
    expect(useCartStore.getState().items[0].quantity).toBe(3)
    expect(useCartStore.getState().items[0].quoteLock).toEqual({
      quotedUnitPrice: 1.1,
      quoteRequestSupplierId: 'qrs2',
      quoteResponseItemId: 'qri2',
    })
  })

  it('clears quote lock when re-adding the same SKU from catalog', () => {
    useCartStore.getState().addItem(product, 1, {
      quotedUnitPrice: 1.5,
      quoteRequestSupplierId: 'qrs1',
      quoteResponseItemId: 'qri1',
    })
    useCartStore.getState().addItem(product, 2)
    expect(useCartStore.getState().items[0].quantity).toBe(3)
    expect(useCartStore.getState().items[0].quoteLock).toBeUndefined()
  })

  it('reuses the original key and payload after an uncertain result and a screen remount', () => {
    const cart = useCartStore.getState()
    cart.addItem(product, 2)
    const payload = { items: [{ productId: product.id, quantity: 2 }], branchId: 'branch-a' }
    const first = cart.beginCheckout(payload)
    payload.items[0].quantity = 99
    cart.finishCheckout(first.key, 'uncertain')
    cart.updateQuantity(product.id, 5)
    cart.addItem(packProduct)
    cart.removeItem(product.id)
    cart.clear()
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0].quantity).toBe(2)
    const retry = useCartStore.getState().beginCheckout({ items: [], branchId: 'other' })
    expect(retry.key).toBe(first.key)
    expect(retry.payload).toEqual({ items: [{ productId: product.id, quantity: 2 }], branchId: 'branch-a' })
    cart.finishCheckout(retry.key, 'success')
    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().checkoutAttempt).toBeNull()
  })

  it('allows corrections after an explicit checkout rejection', () => {
    const cart = useCartStore.getState()
    cart.addItem(product)
    const first = cart.beginCheckout({ items: [{ productId: product.id, quantity: 1 }] })
    cart.finishCheckout(first.key, 'rejected')
    cart.updateQuantity(product.id, 4)
    const next = cart.beginCheckout({ items: [{ productId: product.id, quantity: 4 }] })
    expect(next.key).not.toBe(first.key)
    expect(next.payload.items[0].quantity).toBe(4)
  })

  it('does not clear a new workspace cart when an old checkout finishes', () => {
    const cart = useCartStore.getState()
    cart.addItem(product)
    const old = cart.beginCheckout({ items: [{ productId: product.id, quantity: 1 }] })
    cart.reset()
    cart.addItem(packProduct)
    cart.finishCheckout(old.key, 'success')
    expect(useCartStore.getState().items[0].product.id).toBe(packProduct.id)
  })
})
