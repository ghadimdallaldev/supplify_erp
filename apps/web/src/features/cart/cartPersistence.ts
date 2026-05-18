import type { CartItem } from '../../types'

const CART_KEY_PREFIX = 'supplify_cart_v1'

export type PersistedCart = {
  items: CartItem[]
  drafts: Array<{
    id: string
    name: string
    items: CartItem[]
    createdAt: string
  }>
}

export function getCartStorageKey(email?: string | null): string {
  if (!email) return `${CART_KEY_PREFIX}_guest`
  const safe = email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, '_')
  return `${CART_KEY_PREFIX}_${safe}`
}

export function loadCartFromStorage(email?: string | null): PersistedCart | null {
  try {
    const raw = localStorage.getItem(getCartStorageKey(email))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedCart
    if (!parsed || !Array.isArray(parsed.items)) return null
    return {
      items: parsed.items,
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
    }
  } catch {
    return null
  }
}

export function saveCartToStorage(email: string | null | undefined, data: PersistedCart): void {
  try {
    localStorage.setItem(
      getCartStorageKey(email),
      JSON.stringify({ items: data.items, drafts: data.drafts })
    )
  } catch {
    // private mode / quota
  }
}
