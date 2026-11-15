import { create } from 'zustand'
import type { PublicProduct } from './types'

export type PublicCartLine = {
  product: PublicProduct
  quantity: number
  supplierLocationId: string
}

type PublicCartState = {
  supplierLocationId: string | null
  storefront: string | null
  lines: PublicCartLine[]
  add: (storefront: string, product: PublicProduct) => boolean
  replace: (
    storefront: string,
    supplierLocationId: string,
    lines: Array<{ product: PublicProduct; quantity: number }>
  ) => void
  setQuantity: (productId: string, quantity: number) => void
  clear: () => void
}

export const usePublicCart = create<PublicCartState>((set, get) => ({
  supplierLocationId: null,
  storefront: null,
  lines: [],
  add: (storefront, product) => {
    const location = product.supplierId || ''
    const current = get()
    if (current.supplierLocationId && current.supplierLocationId !== location) return false
    const step = Math.max(1, product.orderMultiple || 1)
    const minimum = Math.max(step, product.moq || 1)
    const existing = current.lines.find((line) => line.product.id === product.id)
    set({
      storefront,
      supplierLocationId: location,
      lines: existing
        ? current.lines.map((line) =>
            line.product.id === product.id ? { ...line, quantity: line.quantity + step } : line
          )
        : [...current.lines, { product, quantity: minimum, supplierLocationId: location }],
    })
    return true
  },
  replace: (storefront, supplierLocationId, lines) =>
    set({
      storefront,
      supplierLocationId,
      lines: lines.map((line) => ({ ...line, supplierLocationId })),
    }),
  setQuantity: (productId, quantity) =>
    set((state) => {
      const lines = state.lines
        .map((line) =>
          line.product.id === productId
            ? quantity < Math.max(1, line.product.moq || 1)
              ? null
              : { ...line, quantity }
            : line
        )
        .filter((line): line is PublicCartLine => Boolean(line))
      return {
        lines,
        supplierLocationId: lines[0]?.supplierLocationId || null,
        storefront: lines.length ? state.storefront : null,
      }
    }),
  clear: () => set({ supplierLocationId: null, storefront: null, lines: [] }),
}))
