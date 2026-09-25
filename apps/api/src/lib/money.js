import Decimal from 'decimal.js'

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export const MONEY_SCALE = 4
export const DISPLAY_MONEY_SCALE = 2
export const PCT_SCALE = 4

/**
 * @param {unknown} value
 * @returns {Decimal}
 */
export function toDecimal(value) {
  if (value instanceof Decimal) return value
  if (value === null || value === undefined || value === '') return new Decimal(0)
  const n = Number(value)
  if (!Number.isFinite(n)) return new Decimal(0)
  return new Decimal(n)
}

/**
 * @param {unknown} value
 * @param {number} [scale]
 * @returns {string}
 */
export function moneyToString(value, scale = MONEY_SCALE) {
  return toDecimal(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toFixed(scale)
}

/**
 * @param {unknown} value
 * @param {number} [scale]
 * @returns {number}
 */
export function moneyToNumber(value, scale = MONEY_SCALE) {
  return Number(moneyToString(value, scale))
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {Decimal}
 */
export function moneyAdd(a, b) {
  return toDecimal(a).plus(toDecimal(b))
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {Decimal}
 */
export function moneySub(a, b) {
  return toDecimal(a).minus(toDecimal(b))
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {Decimal}
 */
export function moneyMul(a, b) {
  return toDecimal(a).times(toDecimal(b))
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {Decimal}
 */
export function moneyDiv(a, b) {
  const divisor = toDecimal(b)
  if (divisor.isZero()) return new Decimal(0)
  return toDecimal(a).div(divisor)
}

/**
 * @param {unknown} value
 * @param {unknown} total
 * @returns {Decimal}
 */
export function pctOf(value, total) {
  const t = toDecimal(total)
  if (t.isZero()) return new Decimal(0)
  return moneyDiv(value, t).times(100)
}

/**
 * @param {unknown} part
 * @param {unknown} pct - percentage e.g. 30 for 30%
 * @returns {Decimal}
 */
export function applyPct(part, pct) {
  const p = toDecimal(pct)
  if (p.isZero()) return new Decimal(0)
  return moneyDiv(part, p.div(100))
}

/**
 * @param {unknown} oldVal
 * @param {unknown} newVal
 * @returns {Decimal | null}
 */
export function pctChange(oldVal, newVal) {
  const oldD = toDecimal(oldVal)
  if (oldD.isZero()) return null
  return moneyDiv(moneySub(newVal, oldVal), oldVal).times(100)
}

/**
 * Sum money fields only when every row shares one currency.
 * Counts are always added. A missing currency is treated as USD.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {string[]} moneyKeys
 * @param {string[]} [countKeys]
 */
function invoiceCurrencyCode(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

export function foldInvoiceCurrencyTotals(rows, moneyKeys, countKeys = []) {
  const list = Array.isArray(rows) ? rows : []
  const groups = new Map()
  for (const row of list) {
    const currency = invoiceCurrencyCode(row.currency)
    const key = currency || ''
    if (!groups.has(key)) {
      const bucket = { currency }
      for (const moneyKey of moneyKeys) bucket[moneyKey] = 0
      for (const countKey of countKeys) bucket[countKey] = 0
      groups.set(key, bucket)
    }
    const bucket = groups.get(key)
    for (const moneyKey of moneyKeys) bucket[moneyKey] += Number(row[moneyKey]) || 0
    for (const countKey of countKeys) bucket[countKey] += Number(row[countKey]) || 0
  }
  const byCurrency = [...groups.values()]
  const labeled = new Set(byCurrency.map((row) => row.currency).filter(Boolean))
  const mixed = labeled.size > 1 || (labeled.size > 0 && byCurrency.some((row) => !row.currency))
  const money = {}
  for (const key of moneyKeys) {
    money[key] = mixed ? null : list.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)
  }
  const counts = {}
  for (const key of countKeys) {
    counts[key] = list.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)
  }
  return { mixed, money, counts, byCurrency }
}

export { Decimal }
