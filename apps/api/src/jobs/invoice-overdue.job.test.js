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

vi.mock('../lib/background-write-locks.js', () => ({
  isTenantUnlockedForBackgroundWrites: vi.fn(),
}))

describe('checkOverdueInvoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifies only when atomic update returns a row', async () => {
    const { query } = await import('../lib/db.js')
    const { notifyInvoiceOverdue } = await import('../services/notification.service.js')
    const { isTenantUnlockedForBackgroundWrites } = await import('../lib/background-write-locks.js')
    isTenantUnlockedForBackgroundWrites.mockResolvedValue(true)

    query
      .mockResolvedValueOnce({
        rows: [
          { id: 'inv-1', restaurant_id: 'r1', supplier_id: 's1' },
          { id: 'inv-2', restaurant_id: 'r2', supplier_id: 's2' },
        ],
      })
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
    expect(result.skippedLocked).toBe(0)
    expect(notifyInvoiceOverdue).toHaveBeenCalledOnce()
    expect(String(query.mock.calls[0][0])).toContain('sub.account_locked_at IS NULL')
    expect(String(query.mock.calls[0][0])).toContain('sub.tenant_id = invoice.supplier_id')
    expect(String(query.mock.calls[0][0])).toContain('sub.tenant_id = invoice.restaurant_id')
  })
  it('skips overdue update and notification when either tenant locks after scan', async () => {
    const { query } = await import('../lib/db.js')
    const { notifyInvoiceOverdue } = await import('../services/notification.service.js')
    const { isTenantUnlockedForBackgroundWrites } = await import('../lib/background-write-locks.js')

    query.mockResolvedValueOnce({
      rows: [{ id: 'inv-locked', restaurant_id: 'rest-locked', supplier_id: 'supplier-1' }],
    })
    isTenantUnlockedForBackgroundWrites.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const result = await checkOverdueInvoices()

    expect(result).toEqual({ processed: 1, notified: 0, skippedLocked: 1 })
    expect(query).toHaveBeenCalledTimes(1)
    expect(notifyInvoiceOverdue).not.toHaveBeenCalled()
  })
})
