import { formatCurrency } from '../utils/format'

/** Format plan price for admin cards (no decimals, comma separators). */
export function formatPlanPrice(value: number | string | null | undefined, suffix = '/mo'): string {
  const formatted = formatCurrency(value, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return `${formatted}${suffix}`
}
