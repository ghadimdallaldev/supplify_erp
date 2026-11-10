import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildLineItemsFromReceiving,
  calculateInvoiceTotals,
  assertNoDuplicateInvoice,
  prorateOrderDiscount,
  supplierShareOfDiscount,
  getAcceptedOrderedValue,
  findInvoiceForOrder,
  getOrderAdjustments,
  updateInvoiceStatus,
  createInvoiceFromReceiving,
} from './invoice.service.js'
import { ConflictError } from '../middlewares/errorHandler.js'

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

describe('invoice receiving helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('buildLineItemsFromReceiving filters non-accepted lines', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            product_id: 'p1',
            order_item_id: 'oi1',
            product_name: 'Tomato',
            sku: 'TOM',
            quantity: 5,
            unit_price: 2,
          },
        ],
      }),
    }
    const lines = await buildLineItemsFromReceiving(client, 'report-1')
    expect(lines).toHaveLength(1)
    expect(lines[0].line_total).toBe(10)
    expect(client.query.mock.calls[0][0]).toContain("quality_status = 'ACCEPTED'")
  })

  it('assertNoDuplicateInvoice throws when invoice exists', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'inv-1' }] }),
    }
    await expect(
      assertNoDuplicateInvoice(client, { orderId: 'ord-1', supplierId: 'sup-1' })
    ).rejects.toThrow(ConflictError)
  })

  it('calculateInvoiceTotals with zero lines returns zero total', () => {
    const result = calculateInvoiceTotals([], { taxRate: 5 })
    expect(result.totalAmount).toBe(0)
  })

  it('prorateOrderDiscount scales promotion discount for partial receive', () => {
    expect(prorateOrderDiscount(20, 50, 100)).toBe(10)
    expect(prorateOrderDiscount(20, 100, 100)).toBe(20)
    expect(prorateOrderDiscount(20, 0, 100)).toBe(0)
  })

  it('keeps the full discount when accepted quantity matches the order even if the billed price changed', async () => {
    const supplierDiscount = supplierShareOfDiscount(20, 100, 100)
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ ordered_value: 100 }] }),
    }
    const acceptedOrderedValue = await getAcceptedOrderedValue(client, 'report-1')
    expect(prorateOrderDiscount(supplierDiscount, acceptedOrderedValue, 100)).toBe(20)
    expect(client.query.mock.calls[0][0]).toContain('expected_unit_price')
    expect(supplierShareOfDiscount(20, 40, 100)).toBe(8)
  })

  it('calculateInvoiceTotals applies prorated discount on partial subtotal', () => {
    const lines = [{ line_total: 50 }]
    const prorated = prorateOrderDiscount(20, 50, 100)
    const result = calculateInvoiceTotals(lines, { taxRate: 0, orderDiscount: prorated })
    expect(result.totalAmount).toBe(40)
    expect(result.extraLines[0].line_total).toBe(-10)
  })

  it('findInvoiceForOrder ignores voided invoices so a corrected one can be issued', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await findInvoiceForOrder(client, { orderId: 'ord-1', supplierId: 'sup-1' })
    expect(client.query.mock.calls[0][0]).toContain("status <> 'VOID'")
  })

  it('assertNoDuplicateInvoice passes when only a voided invoice exists', async () => {
    // The query filters VOID out, so the database returns no row for it.
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await expect(
      assertNoDuplicateInvoice(client, { orderId: 'ord-1', supplierId: 'sup-1' })
    ).resolves.toBeUndefined()
  })

  it('getOrderAdjustments adds the loyalty redemption to the order discount', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ order_discount: '5.00', delivery_discount: '1.00', loyalty_discount: '3.50' }],
      }),
    }
    const adj = await getOrderAdjustments(client, 'ord-1')
    expect(adj.orderDiscount).toBe(8.5)
    expect(adj.promotionDiscount).toBe(5)
    expect(adj.loyaltyDiscount).toBe(3.5)
    expect(adj.deliveryDiscount).toBe(1)
    const sql = client.query.mock.calls[0][0]
    expect(sql).toContain('loyalty_ledger')
    expect(sql).toContain("entry_type = 'REDEEM'")
  })
})

describe('updateInvoiceStatus void guard', () => {
  function makeClient({ status = 'PARTIALLY_PAID', completed = 0, credits = 0 }) {
    return {
      query: vi.fn(async (sql) => {
        const text = String(sql)
        if (text.includes('SELECT * FROM invoice WHERE id')) {
          return { rows: [{ id: 'inv-1', status }] }
        }
        if (text.includes('completed_payments')) {
          return { rows: [{ completed_payments: completed, applied_credits: credits }] }
        }
        if (text.includes('UPDATE invoice')) return { rows: [{ id: 'inv-1', status: 'VOID' }] }
        return { rows: [] }
      }),
    }
  }

  it('refuses to void an invoice that has completed payments', async () => {
    const client = makeClient({ completed: 2, credits: 0 })
    await expect(updateInvoiceStatus(client, 'inv-1', { status: 'VOID' })).rejects.toMatchObject({
      name: 'ConflictError',
      statusCode: 409,
      message: expect.stringContaining('2 completed payments'),
    })
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE invoice'))).toBe(
      false
    )
  })

  it('refuses to void an invoice with applied credit notes and names them', async () => {
    const client = makeClient({ status: 'OVERDUE', completed: 1, credits: 1 })
    await expect(updateInvoiceStatus(client, 'inv-1', { status: 'VOID' })).rejects.toThrow(
      /1 applied credit note\. Reverse them first/
    )
  })

  it('voids an invoice without any settlement', async () => {
    const client = makeClient({ status: 'ISSUED', completed: 0 })
    const result = await updateInvoiceStatus(client, 'inv-1', { status: 'VOID', userId: 'u1' })
    expect(result.status).toBe('VOID')
  })
})

describe('createInvoiceFromReceiving with a prior manual invoice', () => {
  const order = { id: 'ord-1', branch_id: null, currency: 'USD' }
  const report = { id: 'rep-1' }

  function makeClient({ payments = 0, invoiceTotal = 100 }) {
    const calls = []
    const invoiceRow = {
      id: 'inv-1',
      status: 'ISSUED',
      tax_rate: 0,
      tax_included: false,
      total_amount: invoiceTotal,
    }
    const client = {
      calls,
      query: vi.fn(async (sql, params) => {
        const text = String(sql)
        calls.push({ text, params })
        if (text.includes('FROM invoice') && text.includes("status <> 'VOID'")) {
          return { rows: [invoiceRow] }
        }
        if (text.includes('SELECT * FROM invoice WHERE id')) return { rows: [invoiceRow] }
        if (text.includes('FROM receiving_line_item rli') && text.includes('product_sku')) {
          // 6 of 10 units accepted at 10.00
          return {
            rows: [
              {
                product_id: 'p1',
                order_item_id: 'oi1',
                product_name: 'Tomato',
                sku: 'T',
                quantity: 6,
                unit_price: 10,
              },
            ],
          }
        }
        if (text.includes('promotion_usages')) return { rows: [{}] }
        if (text.includes('ordered_value')) return { rows: [{ ordered_value: 60 }] }
        if (text.includes('FROM order_item')) return { rows: [{ subtotal: 100 }] }
        if (text.includes('payment_count')) return { rows: [{ payment_count: payments }] }
        if (text.includes('UPDATE invoice')) {
          return { rows: [{ id: 'inv-1', total_amount: params[3], balance_due: params[3] }] }
        }
        return { rows: [] }
      }),
    }
    return client
  }

  it('rewrites lines and totals of an unpaid manual invoice to the accepted quantities', async () => {
    const client = makeClient({ payments: 0, invoiceTotal: 100 })
    const result = await createInvoiceFromReceiving(client, {
      order,
      report,
      supplierId: 'sup-1',
      restaurantId: 'r-1',
    })
    expect(result.created).toBe(false)
    expect(result.adjusted).toBe(true)
    expect(result.invoice.total_amount).toBe(60)
    expect(client.calls.some((c) => c.text.includes('DELETE FROM invoice_line_item'))).toBe(true)
    const inserted = client.calls.filter((c) => c.text.includes('INSERT INTO invoice_line_item'))
    expect(inserted).toHaveLength(1)
    expect(inserted[0].params[4]).toBe(6)
    expect(inserted[0].params[6]).toBe(60)
  })

  it('keeps a paid manual invoice and reports the over-billed difference', async () => {
    const client = makeClient({ payments: 1, invoiceTotal: 100 })
    const result = await createInvoiceFromReceiving(client, {
      order,
      report,
      supplierId: 'sup-1',
      restaurantId: 'r-1',
    })
    expect(result.adjusted).toBe(false)
    expect(result.overbilledAmount).toBe(40)
    expect(client.calls.some((c) => c.text.includes('DELETE FROM invoice_line_item'))).toBe(false)
    expect(client.calls.some((c) => c.text.includes('UPDATE invoice'))).toBe(false)
  })
})
