import { describe, it, expect } from 'vitest'
import {
  toDecimal,
  moneyAdd,
  moneyMul,
  moneyDiv,
  pctOf,
  moneyToNumber,
  moneyToString,
} from './money.js'

describe('money.js', () => {
  it('adds without float drift', () => {
    expect(moneyToString(moneyAdd(0.1, 0.2), 2)).toBe('0.30')
  })

  it('multiplies quantities and prices', () => {
    expect(moneyToNumber(moneyMul(2.5, 4.2), 4)).toBe(10.5)
  })

  it('divides safely with zero guard', () => {
    expect(moneyToNumber(moneyDiv(10, 0))).toBe(0)
    expect(moneyToNumber(moneyDiv(10, 4), 2)).toBe(2.5)
  })

  it('computes percentage of total', () => {
    expect(moneyToNumber(pctOf(25, 100), 2)).toBe(25)
  })

  it('handles Decimal instances', () => {
    const d = toDecimal(5)
    expect(moneyToNumber(moneyAdd(d, 3))).toBe(8)
  })
})
