import { describe, it, expect } from 'vitest'
import {
  toDecimal,
  moneyAdd,
  moneyMul,
  moneyDiv,
  pctOf,
  moneyToNumber,
  moneyToString,
  foldInvoiceCurrencyTotals,
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

  it('does not add invoice balances across currencies', () => {
    const single = foldInvoiceCurrencyTotals(
      [{ currency: 'USD', unpaid_total: '40', unpaid_count: 1 }],
      ['unpaid_total'],
      ['unpaid_count']
    )
    expect(single.money.unpaid_total).toBe(40)
    const mixed = foldInvoiceCurrencyTotals(
      [
        { currency: 'USD', unpaid_total: '40', unpaid_count: 1 },
        { currency: 'JOD', unpaid_total: '10', unpaid_count: 2 },
      ],
      ['unpaid_total'],
      ['unpaid_count']
    )
    expect(mixed.mixed).toBe(true)
    expect(mixed.money.unpaid_total).toBeNull()
    expect(mixed.counts.unpaid_count).toBe(3)
    expect(mixed.byCurrency).toEqual([
      expect.objectContaining({ currency: 'USD', unpaid_total: 40 }),
      expect.objectContaining({ currency: 'JOD', unpaid_total: 10 }),
    ])
  })

  it('sums the same currency once and does not fold a blank currency into USD', () => {
    const same = foldInvoiceCurrencyTotals(
      [
        { currency: 'JOD', amount_due: 10 },
        { currency: 'jod', amount_due: 5 },
      ],
      ['amount_due']
    )
    expect(same.mixed).toBe(false)
    expect(same.money.amount_due).toBe(15)
    expect(same.byCurrency).toEqual([{ currency: 'JOD', amount_due: 15 }])

    const blank = foldInvoiceCurrencyTotals(
      [
        { currency: null, amount_due: 10 },
        { currency: 'USD', amount_due: 5 },
      ],
      ['amount_due']
    )
    expect(blank.mixed).toBe(true)
    expect(blank.money.amount_due).toBeNull()
    expect(blank.byCurrency).toEqual([
      { currency: null, amount_due: 10 },
      { currency: 'USD', amount_due: 5 },
    ])
  })

  it('handles Decimal instances', () => {
    const d = toDecimal(5)
    expect(moneyToNumber(moneyAdd(d, 3))).toBe(8)
  })
})
