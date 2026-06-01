import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkOverdueInvoices } from './invoice-overdue.job.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('../services/notification.service.js', () => ({
  notifyInvoiceOverdue: vi.fn(),
}))

describe('checkOverdueInvoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifies only when atomic update returns a row', async () => {
    const { query } = await import('../lib/db.js')
    const { notifyInvoiceOverdue } = await import('../services/notification.service.js')

    query
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1' }, { id: 'inv-2' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'inv-1',
            invoice_number: 'INV-1',
            total_amount: 10,
            due_date: '2026-05-01',
            restaurant_id: 'r1',
            supplier_id: 's1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })

    const result = await checkOverdueInvoices()

    expect(result.notified).toBe(1)
    expect(notifyInvoiceOverdue).toHaveBeenCalledOnce()
  })
})
