import { describe, it, expect } from 'vitest'
import {
  invoiceIsOverdue,
  invoiceRemainingBalance,
  isCalendarDateBeforeToday,
  localDateKey,
} from './invoiceBalance'

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

  it('treats a due date as overdue only after that calendar day', () => {
    const today = new Date(2026, 8, 25, 15, 0, 0)
    expect(isCalendarDateBeforeToday('2026-09-25', today)).toBe(false)
    expect(isCalendarDateBeforeToday(new Date(2026, 8, 25, 0, 0, 0).toISOString(), today)).toBe(
      false
    )
    expect(isCalendarDateBeforeToday('2026-09-23', today)).toBe(true)
    expect(localDateKey(today)).toBe('2026-09-25')
  })

  it('trusts the restaurant day count instead of the browser clock', () => {
    const today = new Date(2026, 8, 25, 15, 0, 0)
    expect(
      invoiceIsOverdue(
        { due_date: '2026-09-24', days_overdue: 0, balance_due: 10, status: 'ISSUED' },
        today
      )
    ).toBe(false)
    expect(
      invoiceIsOverdue(
        { due_date: '2026-09-25', days_overdue: 1, balance_due: 10, status: 'ISSUED' },
        today
      )
    ).toBe(true)
  })
})
