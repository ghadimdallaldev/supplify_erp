/**
 * Centralized number and currency formatting so all values are dynamic, correct, and consistently formatted.
 * Use these everywhere monetary or numeric values are displayed.
 */

import { getFormatLocale } from '../i18n/formatters'

const defaultCurrency = 'USD'

/** Intl requires 0 <= minimumFractionDigits <= maximumFractionDigits <= 20 */
function normalizeFractionDigits(
  minimumFractionDigits: number,
  maximumFractionDigits: number
): { minimumFractionDigits: number; maximumFractionDigits: number } {
  const max = Math.min(Math.max(0, maximumFractionDigits), 20)
  const min = Math.min(Math.max(0, minimumFractionDigits), max)
  return { minimumFractionDigits: min, maximumFractionDigits: max }
}

/** Format a numeric value (currency). Handles number, string, null, undefined; always returns a string. */
export function formatCurrency(
  value: number | string | null | undefined,
  options: {
    currency?: string
    minimumFractionDigits?: number
    maximumFractionDigits?: number
  } = {}
): string {
  const num = toNumber(value)
  const { currency = defaultCurrency } = options
  let minimumFractionDigits = options.minimumFractionDigits ?? 2
  const maximumFractionDigits = options.maximumFractionDigits ?? 2
  if (
    options.maximumFractionDigits !== undefined &&
    options.minimumFractionDigits === undefined &&
    maximumFractionDigits < minimumFractionDigits
  ) {
    minimumFractionDigits = maximumFractionDigits
  }
  const digits = normalizeFractionDigits(minimumFractionDigits, maximumFractionDigits)
  return new Intl.NumberFormat(getFormatLocale(), {
    style: 'currency',
    currency,
    ...digits,
  }).format(num)
}

/** Format a plain number (no currency symbol). */
export function formatNumber(
  value: number | string | null | undefined,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}
): string {
  const num = toNumber(value)
  const digits = normalizeFractionDigits(
    options.minimumFractionDigits ?? 0,
    options.maximumFractionDigits ?? 2
  )
  return new Intl.NumberFormat(getFormatLocale(), digits).format(num)
}

/** Format with exactly 2 decimal places (e.g. for prices in tables). */
export function formatPrice(value: number | string | null | undefined): string {
  const num = toNumber(value)
  return new Intl.NumberFormat(getFormatLocale(), {
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
