import { describe, it, expect } from 'vitest'
import { invoiceRemainingBalance } from './invoiceBalance'

describe('invoiceRemainingBalance', () => {
  it('uses remaining_balance when provided', () => {
    expect(invoiceRemainingBalance({ remaining_balance: 25, total_amount: 100 })).toBe(25)
  })

  it('uses balance_due when remaining_balance absent', () => {
    expect(invoiceRemainingBalance({ balance_due: 40, total_amount: 100, total_paid: 60 })).toBe(40)
  })

  it('computes from total minus paid', () => {
    expect(invoiceRemainingBalance({ total_amount: 100, total_paid: 30 })).toBe(70)
  })
})
