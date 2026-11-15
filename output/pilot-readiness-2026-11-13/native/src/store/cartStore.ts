import { create } from 'zustand'
import type { Product } from '../types/supplify'
import { getProductMoq, normalizeCartQuantity } from '../lib/orderQuantityRules'
import { randomUUID } from 'expo-crypto'
import type { CheckoutAttempt, CheckoutPayload } from '../types/checkout'

export type QuoteLock = {
  quotedUnitPrice?: number | null
  quoteRequestSupplierId: string
  quoteResponseItemId: string
}

export type CartItem = {
  product: Product
  quantity: number
  notes?: string
  quoteLock?: QuoteLock
}

type CartState = {
  items: CartItem[]
  checkoutAttempt: CheckoutAttempt | null
  beginCheckout: (payload: CheckoutPayload) => CheckoutAttempt
  finishCheckout: (key: string, outcome: 'success' | 'rejected' | 'uncertain') => void
  addItem: (product: Product, quantity?: number, quoteLock?: QuoteLock) => void
  updateQuantity: (productId: string, quantity: number) => void
  updateItemResolvedPrice: (
    productId: string,
    currentPrice: number,
    pricingSource?: Product['pricing_source'],
    catalogPrice?: number | null
  ) => void
  removeItem: (productId: string) => void
  clear: () => void
  reset: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  checkoutAttempt: null,
  beginCheckout: (payload) => {
    const previous = get().checkoutAttempt
    const attempt: CheckoutAttempt = previous
      ? { ...previous, status: 'submitting' }
      : { key: randomUUID(), payload: JSON.parse(JSON.stringify(payload)), status: 'submitting' }
    set({ checkoutAttempt: attempt })
    return attempt
  },
  finishCheckout: (key, outcome) => {
    if (get().checkoutAttempt?.key !== key) return
    if (outcome === 'success') set({ items: [], checkoutAttempt: null })
    else if (outcome === 'rejected') set({ checkoutAttempt: null })
    else set((state) => ({
      checkoutAttempt: state.checkoutAttempt ? { ...state.checkoutAttempt, status: 'uncertain' } : null,
    }))
  },
  addItem: (product, quantity, quoteLock) =>
    set((state) => {
      if (state.checkoutAttempt) return state
      const delta = quantity ?? getProductMoq(product)
      const existing = state.items.find((item) => item.product.id === product.id)
      if (existing) {
        const nextQty = normalizeCartQuantity(existing.quantity + delta, product)
        // Catalog re-add (no quoteResponseItemId) clears stale quote locks.
        const nextQuoteLock = quoteLock?.quoteResponseItemId ? quoteLock : undefined
        return {
          items: state.items.map((item) =>
            item.product.id === product.id
              ? { ...item, product, quantity: nextQty, quoteLock: nextQuoteLock }
              : item
          ),
        }
      }
      return {
        items: [
          ...state.items,
          { product, quantity: normalizeCartQuantity(delta, product), quoteLock },
        ],
      }
    }),
  updateQuantity: (productId, quantity) =>
    set((state) => {
      if (state.checkoutAttempt) return state
      const existing = state.items.find((item) => item.product.id === productId)
      if (!existing) return state
      if (quantity <= 0) {
        return { items: state.items.filter((item) => item.product.id !== productId) }
      }
      const nextQty = normalizeCartQuantity(quantity, existing.product)
      return {
        items: state.items.map((item) =>
          item.product.id === productId ? { ...item, quantity: nextQty } : item
        ),
      }
    }),
  updateItemResolvedPrice: (productId, currentPrice, pricingSource, catalogPrice) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              product: {
                ...item.product,
                current_price: currentPrice,
                pricing_source: pricingSource ?? item.product.pricing_source,
                catalog_price:
                  catalogPrice !== undefined
                    ? (catalogPrice ?? undefined)
                    : item.product.catalog_price,
              },
            }
          : item
      ),
    })),
  removeItem: (productId) =>
    set((state) => state.checkoutAttempt ? state : ({ items: state.items.filter((item) => item.product.id !== productId) })),
  clear: () => set((state) => state.checkoutAttempt ? state : { items: [], checkoutAttempt: null }),
  reset: () => set({ items: [], checkoutAttempt: null }),
}))
