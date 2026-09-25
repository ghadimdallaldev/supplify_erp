import { describe, it, expect } from 'vitest'
import {
  computeRemainingBalance,
  assertValidStatusTransition,
  calculateInvoiceTotals,
  formatInvoiceCalendarDate,
  overdueDaysOnRestaurantCalendar,
  invoiceToCsvRow,
  INVOICE_CSV_HEADER,
  paymentTermsToDays,
  assertInvoiceAcceptsPayment,
  assertCreditApplication,
  getSupplierTaxConfig,
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

  it('calculateInvoiceTotals extracts tax when the price already includes it', () => {
    const result = calculateInvoiceTotals([{ line_total: 110 }], { taxRate: 10, taxIncluded: true })
    expect(result.subtotal).toBe(100)
    expect(result.taxAmount).toBe(10)
    expect(result.totalAmount).toBe(110)
  })

  it('assertValidStatusTransition blocks invalid moves', () => {
    expect(() => assertValidStatusTransition('PAID', 'VOID')).toThrow(ValidationError)
    expect(() => assertValidStatusTransition('ISSUED', 'VOID')).not.toThrow()
  })

  it('keeps a DATE value on its calendar day', () => {
    expect(formatInvoiceCalendarDate('2026-09-25')).toBe('2026-09-25')
    expect(formatInvoiceCalendarDate(new Date(2026, 8, 25))).toBe('2026-09-25')
    const row = invoiceToCsvRow({
      invoice_number: 'INV-1',
      invoice_date: new Date(2026, 8, 25),
      due_date: new Date(2026, 9, 1),
      status: 'ISSUED',
      currency: 'JOD',
    })
    expect(row).toContain('2026-09-25')
    expect(row).toContain('2026-10-01')
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

  it('treats cash on delivery and Arabic COD terms as due immediately', () => {
    expect(paymentTermsToDays('Net 15')).toBe(15)
    expect(paymentTermsToDays('Cash on Delivery')).toBe(0)
    expect(paymentTermsToDays('الدفع عند التسليم')).toBe(0)
    expect(paymentTermsToDays('Due on receipt')).toBe(0)
    expect(paymentTermsToDays('Monthly account')).toBe(30)
  })

  it('rejects credit that is not tied to a credit note', () => {
    expect(() => assertCreditApplication({ creditAmount: 20, creditNoteId: null })).toThrow(
      /credit note/i
    )
    expect(() => assertCreditApplication({ creditAmount: 20, creditNoteId: 'cn-1' })).not.toThrow()
    expect(() => assertCreditApplication({ creditAmount: 0, creditNoteId: null })).not.toThrow()
  })

  it('counts overdue days on the restaurant calendar', () => {
    const invoice = {
      status: 'ISSUED',
      balance_due: 40,
      due_date: '2026-09-24',
      restaurant_timezone: 'Asia/Beirut',
    }
    expect(overdueDaysOnRestaurantCalendar(invoice, new Date('2026-09-24T18:00:00.000Z'))).toBe(0)
    expect(overdueDaysOnRestaurantCalendar(invoice, new Date('2026-09-24T21:30:00.000Z'))).toBe(1)
    expect(
      overdueDaysOnRestaurantCalendar(
        { ...invoice, balance_due: 0 },
        new Date('2026-09-24T21:30:00.000Z')
      )
    ).toBe(0)
  })

  it('rejects payments on void and draft invoices', () => {
    expect(() => assertInvoiceAcceptsPayment({ status: 'VOID' })).toThrow(ValidationError)
    expect(() => assertInvoiceAcceptsPayment({ status: 'DRAFT' })).toThrow(ValidationError)
    expect(() => assertInvoiceAcceptsPayment({ status: 'ISSUED' })).not.toThrow()
  })

  it('selects the tax rate that is in effect on the supplier local day', async () => {
    const client = {
      query: async () => ({ rows: [{ tax_rate: 16, tax_type: 'VAT', tax_name: 'VAT' }] }),
    }
    const spy = client.query
    let sql = ''
    let params = []
    client.query = async (text, values) => {
      sql = text
      params = values
      return spy()
    }
    const config = await getSupplierTaxConfig(client, 'supplier-1')
    expect(config.tax_rate).toBe(16)
    expect(sql).toContain('AT TIME ZONE')
    expect(sql).toContain('last_order_timezone')
    expect(params[0]).toBe('supplier-1')
    expect(params[1]).toEqual(expect.any(String))
  })
})
