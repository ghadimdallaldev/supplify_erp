/**
 * Centralized number and currency formatting so all values are dynamic, correct, and consistently formatted.
 * Use these everywhere monetary or numeric values are displayed.
 */

const defaultLocale = undefined // use user's locale
const defaultCurrency = 'USD'

/** Format a numeric value (currency). Handles number, string, null, undefined; always returns a string. */
export function formatCurrency(
  value: number | string | null | undefined,
  options: { currency?: string; minimumFractionDigits?: number; maximumFractionDigits?: number } = {}
): string {
  const num = toNumber(value)
  const { currency = defaultCurrency, minimumFractionDigits = 2, maximumFractionDigits = 2 } = options
  return new Intl.NumberFormat(defaultLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(num)
}

/** Format a plain number (no currency symbol). */
export function formatNumber(
  value: number | string | null | undefined,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}
): string {
  const num = toNumber(value)
  const { minimumFractionDigits = 0, maximumFractionDigits = 2 } = options
  return new Intl.NumberFormat(defaultLocale, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(num)
}

/** Format with exactly 2 decimal places (e.g. for prices in tables). */
export function formatPrice(value: number | string | null | undefined): string {
  const num = toNumber(value)
  return new Intl.NumberFormat(defaultLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/** Coerce to number safely; NaN becomes 0. */
function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  const n = parseFloat(String(value).replace(/,/g, ''))
  return Number.isNaN(n) ? 0 : n
}
