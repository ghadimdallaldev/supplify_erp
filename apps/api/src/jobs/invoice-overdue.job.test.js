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

vi.mock('../lib/org-billing-tenant.js', () => ({
  resolveOrgBillingTenantId: vi.fn(async (tenantId) => tenantId),
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
      .mockResolvedValueOnce({ rows: [{ restaurant_ok: true, supplier_ok: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'inv-1',
            invoice_number: 'INV-1',
            total_amount: 10,
            balance_due: 4,
            due_date: '2026-05-01',
            restaurant_id: 'r1',
            supplier_id: 's1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ restaurant_ok: true, supplier_ok: true }] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await checkOverdueInvoices()

    expect(result.notified).toBe(1)
    expect(result.skippedLocked).toBe(0)
    expect(notifyInvoiceOverdue).toHaveBeenCalledOnce()
    expect(String(query.mock.calls[1][0])).toContain('sub.account_locked_at IS NULL')
    expect(String(query.mock.calls[1][0])).toContain('SUPPLIER')
    expect(String(query.mock.calls[1][0])).toContain('RESTAURANT')
    expect(String(query.mock.calls[0][0])).toContain('AT TIME ZONE')
    expect(String(query.mock.calls[0][0])).toContain('r.timezone')
  })
  it('marks the invoice OVERDUE but skips the notification when a tenant locks after scan', async () => {
    const { query } = await import('../lib/db.js')
    const { notifyInvoiceOverdue } = await import('../services/notification.service.js')
    const { isTenantUnlockedForBackgroundWrites } = await import('../lib/background-write-locks.js')

    query.mockResolvedValueOnce({
      rows: [{ id: 'inv-locked', restaurant_id: 'rest-locked', supplier_id: 'supplier-1' }],
    })
    query.mockResolvedValueOnce({ rows: [{ restaurant_ok: true, supplier_ok: true }] })
    query.mockResolvedValueOnce({ rows: [{ id: 'inv-locked' }] })
    isTenantUnlockedForBackgroundWrites.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const result = await checkOverdueInvoices()

    expect(result).toEqual({ processed: 1, notified: 0, skippedLocked: 1 })
    expect(query).toHaveBeenCalledTimes(3)
    const statusUpdate = String(query.mock.calls[2][0])
    expect(statusUpdate).toContain("SET status = 'OVERDUE'")
    expect(statusUpdate).not.toContain('overdue_notified_at')
    expect(notifyInvoiceOverdue).not.toHaveBeenCalled()
  })

  it('marks the invoice OVERDUE when the subscription check fails, without notifying', async () => {
    const { query } = await import('../lib/db.js')
    const { notifyInvoiceOverdue } = await import('../services/notification.service.js')

    query
      .mockResolvedValueOnce({
        rows: [{ id: 'inv-sub', restaurant_id: 'r1', supplier_id: 's1' }],
      })
      .mockResolvedValueOnce({ rows: [{ restaurant_ok: false, supplier_ok: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-sub' }] })

    const result = await checkOverdueInvoices()

    expect(result).toEqual({ processed: 1, notified: 0, skippedLocked: 1 })
    expect(String(query.mock.calls[2][0])).toContain("SET status = 'OVERDUE'")
    expect(notifyInvoiceOverdue).not.toHaveBeenCalled()
  })
})
