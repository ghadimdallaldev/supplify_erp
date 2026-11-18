import { describe, expect, it } from 'vitest'
import { formatRunSheetAmount, formatRunSheetTotal } from './runSheetMoney'

describe('run sheet currency display', () => {
  it('shows each currency without presenting a combined dollar balance', () => {
    const text = formatRunSheetTotal(null, [
      { currency: 'USD', totalBalanceDue: 20 },
      { currency: 'EUR', totalBalanceDue: 30 },
    ])
    expect(text).toContain('$20.00')
    expect(text).toContain('€30.00')
    expect(text).not.toContain('50.00')
  })
  it('preserves a single foreign currency on totals and invoice rows', () => {
    expect(formatRunSheetTotal(30, [{ currency: 'EUR', totalBalanceDue: 30 }])).toBe('€30.00')
    expect(formatRunSheetAmount(30, 'EUR')).toBe('€30.00')
  })
  it('does not convert missing-currency balances into USD', () => {
    expect(formatRunSheetTotal(30, [{ currency: null, totalBalanceDue: 30 }])).toBe('30.00')
    expect(formatRunSheetAmount(30, null)).toBe('30.00')
  })
  it('keeps legacy payloads readable and null totals unknown', () => {
    expect(formatRunSheetTotal(20)).toBe('$20.00')
    expect(formatRunSheetTotal(null)).toBe('—')
  })
})
