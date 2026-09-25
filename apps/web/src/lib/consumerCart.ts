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

function roundMoney(value: number) {
  return Math.round(Number(value) * 100) / 100
}

type MenuPriceItem = {
  id: string
  name: string
  base_price: number
  is_available?: boolean
  modifierGroups?: Array<{
    options: Array<{ id: string; price_delta: number }>
  }>
}

export type PricedCartLine = CartLine & { unavailable: boolean }

/**
 * Reprice a stored cart against the menu the guest is about to order from.
 * Returns null until that menu has loaded.
 */
export function priceCartAgainstMenu(
  lines: CartLine[],
  categories: Array<{ items: MenuPriceItem[] }> | undefined
): { lines: PricedCartLine[]; unavailable: PricedCartLine[]; priceChanged: boolean } | null {
  if (!categories) return null
  const items = new Map(
    categories.flatMap((category) => category.items.map((item) => [item.id, item]))
  )
  let priceChanged = false
  const priced = lines.map((line) => {
    const item = items.get(line.menuItemId)
    if (!item || item.is_available === false) {
      return { ...line, unavailable: true }
    }
    const options = new Map<string, number>()
    for (const group of item.modifierGroups ?? []) {
      for (const option of group.options) options.set(option.id, Number(option.price_delta))
    }
    let modifierTotal = 0
    for (const optionId of line.modifierOptionIds ?? []) {
      const delta = options.get(optionId)
      if (delta == null) return { ...line, unavailable: true }
      modifierTotal += delta
    }
    const unitPrice = roundMoney(Number(item.base_price) + modifierTotal)
    if (unitPrice < 0) return { ...line, unavailable: true }
    if (unitPrice !== roundMoney(line.unitPrice)) priceChanged = true
    return { ...line, name: item.name, unitPrice, unavailable: false }
  })
  return {
    lines: priced,
    unavailable: priced.filter((line) => line.unavailable),
    priceChanged,
  }
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
