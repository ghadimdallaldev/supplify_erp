import { describe, expect, it } from 'vitest'
import { currencyTotals, groupCurrency } from './cartCurrency'

const group = (currency: string | undefined, subtotal: number) =>
  ({ items: [{ product: { currency } }], subtotal }) as never

describe('cartCurrency', () => {
  it('defaults to USD when products carry no currency', () => {
    expect(groupCurrency(group(undefined, 5))).toBe('USD')
  })

  it('sums groups that share a currency', () => {
    expect(currencyTotals([group('USD', 10), group(undefined, 5)])).toEqual([
      { currency: 'USD', subtotal: 15 },
    ])
  })

  it('keeps one total per currency when currencies differ', () => {
    expect(currencyTotals([group('USD', 10), group('eur', 7), group('EUR', 3)])).toEqual([
      { currency: 'USD', subtotal: 10 },
      { currency: 'EUR', subtotal: 10 },
    ])
  })
})
