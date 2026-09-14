import { describe, it, expect } from 'vitest'
import {
  computeRemainingBalance,
  assertValidStatusTransition,
  calculateInvoiceTotals,
  invoiceToCsvRow,
  INVOICE_CSV_HEADER,
} from './invoice.service.js'
import { ValidationError } from '../middlewares/errorHandler.js'

describe('invoice.service calculations', () => {
  it('computeRemainingBalance prefers balance_due when set', () => {
    expect(
      computeRemainingBalance({ total_amount: 100, balance_due: 40, paid_amount: 60 }, 60)
    ).toBe(40)
  })

  it('computeRemainingBalance falls back to total minus paid', () => {
    expect(computeRemainingBalance({ total_amount: 100 }, 25)).toBe(75)
  })

  it('calculateInvoiceTotals applies tax and discount', () => {
    const lines = [{ line_total: 100 }, { line_total: 50 }]
    const result = calculateInvoiceTotals(lines, { taxRate: 10, orderDiscount: 20 })
    expect(result.itemsSubtotal).toBe(150)
    expect(result.subtotal).toBe(130)
    expect(result.taxAmount).toBe(13)
    expect(result.totalAmount).toBe(143)
    expect(result.extraLines).toHaveLength(1)
    expect(result.extraLines[0].sku).toBe('DISCOUNT')
  })

  it('assertValidStatusTransition blocks invalid moves', () => {
    expect(() => assertValidStatusTransition('PAID', 'VOID')).toThrow(ValidationError)
    expect(() => assertValidStatusTransition('ISSUED', 'VOID')).not.toThrow()
  })

  it('invoiceToCsvRow includes financial columns', () => {
    const row = invoiceToCsvRow({
      invoice_number: 'INV-1',
      order_id: 'ord-1',
      supplier_name: 'Sup',
      restaurant_name: 'Rest',
      branch_name: 'Main',
      invoice_date: '2026-06-01',
      due_date: '2026-06-15',
      status: 'ISSUED',
      subtotal: 100,
      tax_amount: 10,
      total_amount: 110,
      total_paid: 0,
      remaining_balance: 110,
      currency: 'USD',
    })
    expect(row).toContain('INV-1')
    expect(row).toContain('110')
    expect(INVOICE_CSV_HEADER).toContain('Balance')
  })
})
