import type { CartGroup } from '../types/cart'

export const DEFAULT_CART_CURRENCY = 'USD'

/** Currency of a supplier group: its items' product currency, defaulting to USD. */
export function groupCurrency(group: Pick<CartGroup, 'items'>): string {
  const code = group.items.find((item) => item.product?.currency)?.product.currency
  return (code || DEFAULT_CART_CURRENCY).toUpperCase()
}

/**
 * One subtotal per currency. Different currencies must never be summed into a single
 * number, so the cart shows one total per currency when suppliers differ.
 */
export function currencyTotals(
  groups: Array<Pick<CartGroup, 'items' | 'subtotal'>>
): Array<{ currency: string; subtotal: number }> {
  const totals = new Map<string, number>()
  for (const group of groups) {
    const currency = groupCurrency(group)
    totals.set(currency, (totals.get(currency) ?? 0) + group.subtotal)
  }
  return Array.from(totals, ([currency, subtotal]) => ({ currency, subtotal }))
}
