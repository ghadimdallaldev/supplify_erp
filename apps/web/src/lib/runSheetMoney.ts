import { formatCurrency, formatPrice } from '../utils/format'

export type RunSheetCurrencyTotal = { currency: string | null; totalBalanceDue: number }

export function formatRunSheetAmount(amount: number, currency?: string | null) {
  if (currency === null) return formatPrice(amount)
  return formatCurrency(amount, { currency: currency || 'USD' })
}

export function formatRunSheetTotal(amount: number | null, groups?: RunSheetCurrencyTotal[]) {
  if (groups?.length) {
    return groups.map((row) => formatRunSheetAmount(row.totalBalanceDue, row.currency)).join(' · ')
  }
  return amount == null ? '—' : formatRunSheetAmount(amount)
}
