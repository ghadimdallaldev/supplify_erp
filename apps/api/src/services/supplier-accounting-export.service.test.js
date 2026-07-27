import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('supplier-accounting-export.service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('parseExportDateRange defaults to last 30 days', async () => {
    const { parseExportDateRange } = await import('./supplier-accounting-export.service.js')
    const range = parseExportDateRange({})
    expect(range.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const fromMs = new Date(range.from).getTime()
    const toMs = new Date(range.to).getTime()
    expect(toMs >= fromMs).toBe(true)
  })

  it('parseExportDateRange rejects inverted range', async () => {
    const { parseExportDateRange } = await import('./supplier-accounting-export.service.js')
    expect(() => parseExportDateRange({ from: '2026-06-01', to: '2026-05-01' })).toThrow(
      /from must be before to/
    )
  })

  it('exportInvoicesCsv filters by supplier, date range, and status', async () => {
    const queryMock = vi.fn()
    queryMock.mockResolvedValue({
      rows: [
        {
          invoice_number: 'INV-001',
          invoice_date: '2026-06-01',
          due_date: '2026-07-01',
          status: 'ISSUED',
          total_amount: '100.00',
          paid_amount: '0.00',
          balance_due: '100.00',
          restaurant_name: 'Cafe Alpha',
        },
      ],
    })

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    const { exportInvoicesCsv } = await import('./supplier-accounting-export.service.js')
    const csv = await exportInvoicesCsv('sup-1', {
      from: '2026-06-01',
      to: '2026-06-30',
      status: 'ISSUED',
    })

    expect(queryMock).toHaveBeenCalledOnce()
    const [sql, params] = queryMock.mock.calls[0]
    expect(String(sql)).toContain('i.supplier_id = $1')
    expect(String(sql)).toContain('i.status = $4')
    expect(params).toEqual(['sup-1', '2026-06-01', '2026-06-30', 'ISSUED'])
    expect(csv).toContain(
      'Invoice Number,Invoice Date,Due Date,Status,Total,Paid,Balance,Restaurant'
    )
    expect(csv).toContain('INV-001')
    expect(csv).toContain('Cafe Alpha')
  })

  it('exportInvoicesQuickBooksCsv includes QuickBooks column headers', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        {
          invoice_number: 'INV-002',
          restaurant_name: 'Bistro Beta',
          invoice_date: '2026-06-10',
          due_date: '2026-07-10',
          payment_terms: 'Net 30',
          notes: 'Thanks',
          description: 'Produce delivery',
          quantity: 2,
          unit_price: '25.00',
          line_total: '50.00',
        },
      ],
    })

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    const { exportInvoicesQuickBooksCsv } = await import('./supplier-accounting-export.service.js')
    const csv = await exportInvoicesQuickBooksCsv('sup-1', {
      from: '2026-06-01',
      to: '2026-06-30',
    })

    expect(csv).toContain('*InvoiceNo,*Customer,*InvoiceDate,*DueDate')
    expect(csv).toContain('INV-002')
    expect(csv).toContain('Produce delivery')
    expect(csv).toContain('50.00')
  })

  it('exportPaymentsCsv lists payment and invoice context', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        {
          payment_number: 'PAY-100',
          payment_date: '2026-06-15',
          payment_amount: '75.00',
          payment_method: 'BANK_TRANSFER',
          payment_reference: 'REF-1',
          status: 'COMPLETED',
          bank_name: 'Chase',
          notes: 'On time',
          invoice_number: 'INV-001',
          restaurant_name: 'Cafe Alpha',
        },
      ],
    })

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    const { exportPaymentsCsv } = await import('./supplier-accounting-export.service.js')
    const csv = await exportPaymentsCsv('sup-1', { from: '2026-06-01', to: '2026-06-30' })

    expect(csv).toContain('Payment Number,Payment Date,Amount,Method')
    expect(csv).toContain('PAY-100')
    expect(csv).toContain('INV-001')
    expect(csv).toContain('Cafe Alpha')
  })

  it('exportArSummaryCsv aggregates aging buckets per restaurant', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        {
          restaurant_name: 'Cafe Alpha',
          invoice_count: 3,
          total_balance: '250.00',
          aging_current: '100.00',
          aging_0_7: '50.00',
          aging_8_30: '75.00',
          aging_31_60: '25.00',
          aging_60_plus: '0.00',
        },
      ],
    })

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    const { exportArSummaryCsv } = await import('./supplier-accounting-export.service.js')
    const csv = await exportArSummaryCsv('sup-1')

    expect(queryMock).toHaveBeenCalledOnce()
    const params = queryMock.mock.calls[0][1]
    expect(params[0]).toBe('sup-1')
    expect(csv).toContain('Restaurant,Open Invoices,Total Balance')
    expect(csv).toContain('Cafe Alpha')
    expect(csv).toContain('250.00')
    expect(csv).toContain('75.00')
  })
})
