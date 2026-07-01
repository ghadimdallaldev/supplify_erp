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

export { Decimal }
