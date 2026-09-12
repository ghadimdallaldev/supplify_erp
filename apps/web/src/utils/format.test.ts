import { describe, expect, it } from 'vitest'
import { formatCurrency, formatNumber, formatPrice } from './format'

describe('formatCurrency', () => {
  it('formats standard USD amounts', () => {
    expect(formatCurrency(1234.5)).toMatch(/\$1,234\.50/)
  })

  it('handles null and undefined as zero', () => {
    expect(formatCurrency(null)).toMatch(/\$0\.00/)
    expect(formatCurrency(undefined)).toMatch(/\$0\.00/)
  })

  it('allows whole dollars when maximumFractionDigits is 0', () => {
    expect(() => formatCurrency(1070908.6, { maximumFractionDigits: 0 })).not.toThrow()
    const out = formatCurrency(1070908.6, { maximumFractionDigits: 0 })
    expect(out).toMatch(/\$1,070,909/)
  })

  it('parses string amounts with commas', () => {
    expect(formatCurrency('1,234.56')).toMatch(/\$1,234\.56/)
  })
})

describe('formatNumber', () => {
  it('formats with max fraction digits', () => {
    expect(formatNumber(12.3456, { maximumFractionDigits: 2 })).toBe('12.35')
  })
})

describe('formatPrice', () => {
  it('always uses two decimal places', () => {
    expect(formatPrice(9)).toBe('9.00')
  })
})
