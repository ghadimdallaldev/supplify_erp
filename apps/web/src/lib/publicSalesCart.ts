import type { PublicSupplierProduct } from '../types'

export type PublicCartLine = {
  product: PublicSupplierProduct
  quantity: number
  supplierLocationId: string
}

export type PublicCart = {
  supplierLocationId: string | null
  lines: PublicCartLine[]
}

const KEY = 'supplify.public-sales.cart'

export function readPublicCart(): PublicCart {
  if (typeof window === 'undefined') return { supplierLocationId: null, lines: [] }
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || 'null') as PublicCart | null
    if (!value || !Array.isArray(value.lines)) return { supplierLocationId: null, lines: [] }
    return value
  } catch {
    return { supplierLocationId: null, lines: [] }
  }
}

export function writePublicCart(cart: PublicCart) {
  if (typeof window === 'undefined') return
  if (!cart.lines.length) window.localStorage.removeItem(KEY)
  else window.localStorage.setItem(KEY, JSON.stringify(cart))
}
