export type CartLine = {
  cartKey: string
  menuItemId: string
  name: string
  unitPrice: number
  quantity: number
  modifierOptionIds: string[]
  modifierLabels?: string[]
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

function cartStorageKey(slug: string): string {
  return `${CART_KEY_PREFIX}${slug}`
}

export function loadCart(slug: string): CartLine[] {
  if (!slug) return []
  try {
    const raw =
      localStorage.getItem(cartStorageKey(slug)) ?? sessionStorage.getItem(cartStorageKey(slug))
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartLine[]
    if (!Array.isArray(parsed)) return []
    if (
      sessionStorage.getItem(cartStorageKey(slug)) &&
      !localStorage.getItem(cartStorageKey(slug))
    ) {
      localStorage.setItem(cartStorageKey(slug), raw)
      sessionStorage.removeItem(cartStorageKey(slug))
    }
    return parsed.map((line) => ({
      ...line,
      modifierOptionIds: line.modifierOptionIds ?? [],
    }))
  } catch {
    return []
  }
}

export function saveCart(slug: string, lines: CartLine[]) {
  if (!slug) return
  localStorage.setItem(cartStorageKey(slug), JSON.stringify(lines))
}

export function clearCartStorage(slug: string) {
  if (!slug) return
  localStorage.removeItem(cartStorageKey(slug))
  sessionStorage.removeItem(cartStorageKey(slug))
}

export function cartLineTotal(line: CartLine): number {
  return line.unitPrice * line.quantity
}

export function cartTotals(lines: CartLine[]) {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + cartLineTotal(line), 0)
  return { count, total }
}

export function formatModifierLabels(line: CartLine): string | null {
  if (line.modifierLabels?.length) return line.modifierLabels.join(', ')
  if (line.modifierOptionIds.length) return 'Customizations selected'
  return null
}
