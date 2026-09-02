import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildLineItemsFromReceiving,
  calculateInvoiceTotals,
  assertNoDuplicateInvoice,
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
})
