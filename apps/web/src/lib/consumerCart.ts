export type CartLine = {
  cartKey: string
  menuItemId: string
  name: string
  unitPrice: number
  quantity: number
  modifierOptionIds: string[]
  notes?: string
}

export const CART_KEY_PREFIX = 'consumer-cart:'

export function buildCartKey(
  menuItemId: string,
  modifierOptionIds: string[] = [],
  notes?: string | null
): string {
  const sortedMods = [...modifierOptionIds].sort().join(',')
  const notePart = (notes ?? '').trim()
  return `${menuItemId}|${sortedMods}|${notePart}`
}

export function loadCart(slug: string): CartLine[] {
  if (!slug) return []
  try {
    const raw = sessionStorage.getItem(`${CART_KEY_PREFIX}${slug}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartLine[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCart(slug: string, lines: CartLine[]) {
  if (!slug) return
  sessionStorage.setItem(`${CART_KEY_PREFIX}${slug}`, JSON.stringify(lines))
}

export function clearCartStorage(slug: string) {
  if (!slug) return
  sessionStorage.removeItem(`${CART_KEY_PREFIX}${slug}`)
}

export function cartLineTotal(line: CartLine): number {
  return line.unitPrice * line.quantity
}

export function cartTotals(lines: CartLine[]) {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + cartLineTotal(line), 0)
  return { count, total }
}
