import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildLineItemsFromReceiving,
  calculateInvoiceTotals,
  assertNoDuplicateInvoice,
  prorateOrderDiscount,
  supplierShareOfDiscount,
  getAcceptedOrderedValue,
} from './invoice.service.js'
import { ConflictError } from '../middlewares/errorHandler.js'

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
})
