import { describe, expect, it, vi } from 'vitest'
import { listInvoiceAnomalies } from './restaurant-invoice-anomaly-intelligence.service.js'

describe('listInvoiceAnomalies', () => {
  it('reports only observed line comparisons without assigning a fraud score', async () => {
    const dbQuery = vi.fn(async () => ({
      rows: [
        {
          invoice_id: 'i1',
          invoice_number: 'INV-1',
          invoice_date: '2026-09-01',
          invoice_total: '120',
          currency: 'USD',
          supplier_id: 's1',
          supplier_name: 'Fresh Co',
          invoice_line_id: 'l1',
          product_id: 'p1',
          description: 'Tomatoes',
          invoice_quantity: '12',
          ordered_quantity: '10',
          invoice_unit_price: '10',
          ordered_unit_price: '8',
          active_contract_price: '7',
          prior_invoice_unit_price: '8',
          duplicate_linked_invoice: false,
        },
      ],
    }))
    const result = await listInvoiceAnomalies('restaurant-1', {}, dbQuery)
    expect(result.invoices[0].lines[0]).toMatchObject({
      invoiceQuantity: 12,
      orderedQuantity: 10,
      invoiceUnitPrice: 10,
      orderedUnitPrice: 8,
      activeContractPrice: 7,
      priorInvoiceUnitPrice: 8,
      priceMovementPct: 25,
      signals: [
        'quantity_exceeds_order',
        'price_above_order_snapshot',
        'price_above_active_contract',
        'price_movement_above_threshold',
      ],
    })
    expect(result).not.toHaveProperty('fraudScore')
  })

  it('uses the restaurant scope and clamps the client window', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await listInvoiceAnomalies('restaurant-1', { days: 9999, limit: 999 }, dbQuery)
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining('invoice_line_item'), [
      'restaurant-1',
      365,
      expect.any(String),
    ])
    expect(dbQuery.mock.calls[0][0]).toContain('AT TIME ZONE')
    expect(dbQuery.mock.calls[0][0]).toContain('duplicate_linked_invoices')
  })
})
