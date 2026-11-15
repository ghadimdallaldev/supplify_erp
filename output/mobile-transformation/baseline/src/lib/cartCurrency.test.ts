import {
  cartCurrencyError,
  cartCurrencyTotals,
  cartSupplierSummaries,
  moneyTotals,
} from './cartCurrency'
import type { CartItem } from '../store/cartStore'

const line = (supplier: string, currency: string, price: number, quantity = 1): CartItem => ({
  product: {
    id: `${supplier}-${currency}`,
    supplier_id: supplier,
    supplier_name: supplier,
    name: 'Product',
    sku: 'SKU',
    currency,
    current_price: price,
  },
  quantity,
})

describe('checkout currency presentation', () => {
  it('keeps USD and LBP separate across suppliers', () => {
    const items = [line('Coffee', 'USD', 10, 2), line('Dairy', 'LBP', 100000, 3)]
    expect(cartCurrencyTotals(items)).toEqual([
      { currency: 'USD', subtotal: 20 },
      { currency: 'LBP', subtotal: 300000 },
    ])
    expect(cartCurrencyError(items)).toBeNull()
    expect(cartSupplierSummaries(items).map((group) => group.totals)).toEqual([
      [{ currency: 'USD', subtotal: 20 }],
      [{ currency: 'LBP', subtotal: 300000 }],
    ])
  })

  it('requires separate orders when one supplier has mixed currencies', () => {
    expect(cartCurrencyError([line('Coffee', 'USD', 10), line('Coffee', 'LBP', 100000)])).toMatch(
      /Coffee.*separate order/
    )
  })

  it('normalizes codes and keeps dashboard order values separate', () => {
    expect(
      moneyTotals([
        { currency: ' usd ', amount: 10 },
        { currency: 'USD', amount: 5 },
        { currency: 'LBP', amount: 200000 },
      ])
    ).toEqual([
      { currency: 'USD', subtotal: 15 },
      { currency: 'LBP', subtotal: 200000 },
    ])
  })
})
