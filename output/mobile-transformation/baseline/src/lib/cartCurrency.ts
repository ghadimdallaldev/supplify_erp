import type { CartItem } from '../store/cartStore'

export function currencyCode(currency?: string | null) {
  return currency?.trim().toUpperCase() || 'USD'
}

export function moneyTotals(lines: Array<{ currency?: string | null; amount: number }>) {
  const totals = new Map<string, number>()
  for (const line of lines) {
    const currency = currencyCode(line.currency)
    totals.set(currency, (totals.get(currency) ?? 0) + line.amount)
  }
  return Array.from(totals, ([currency, subtotal]) => ({ currency, subtotal }))
}

export function cartCurrencyTotals(items: CartItem[]) {
  return moneyTotals(
    items.map(({ product, quantity }) => ({
      currency: product.currency,
      amount: Number(product.current_price ?? 0) * quantity,
    }))
  )
}

export function cartSupplierSummaries(items: CartItem[]) {
  const suppliers = new Map<string, { name: string; items: CartItem[] }>()
  for (const item of items) {
    const id = item.product.supplier_id ?? ''
    const group = suppliers.get(id) ?? { name: item.product.supplier_name || 'Supplier', items: [] }
    group.items.push(item)
    suppliers.set(id, group)
  }
  return Array.from(suppliers, ([id, group]) => ({
    id,
    name: group.name,
    totals: cartCurrencyTotals(group.items),
    lineCount: group.items.length,
  }))
}

export function cartCurrencyError(items: CartItem[]): string | null {
  const mixed = cartSupplierSummaries(items).find((group) => group.totals.length > 1)
  return mixed
    ? `${mixed.name} has products in different currencies. Place a separate order for each currency.`
    : null
}
