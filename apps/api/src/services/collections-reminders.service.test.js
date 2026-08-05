import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('collections-reminders.service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('sendInvoiceReminder notifies restaurant and records dedup log', async () => {
    const queryMock = vi.fn()
    queryMock.mockImplementation(async (sql) => {
      const s = String(sql)
      if (s.includes('FROM invoice') && s.includes('WHERE id = $1')) {
        return {
          rows: [
            {
              id: 'inv-1',
              invoice_number: 'INV-001',
              restaurant_id: 'rest-1',
              supplier_id: 'sup-1',
              due_date: '2026-06-20',
              balance_due: '150.00',
              total_amount: '150.00',
              status: 'ISSUED',
            },
          ],
        }
      }
      if (s.includes('INSERT INTO invoice_reminder_log')) {
        return { rows: [{ id: 'log-1' }] }
      }
      if (s.includes('UPDATE invoice_reminder_log')) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const notifyTenantUsers = vi
      .fn()
      .mockResolvedValue(Object.assign([{ id: 'n-1' }], { recipientCount: 2 }))

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    vi.doMock('./notification.service.js', () => ({ notifyTenantUsers }))

    const { sendInvoiceReminder } = await import('./collections-reminders.service.js')
    const result = await sendInvoiceReminder('inv-1', 'sup-1', { kind: 'manual', userId: 'user-1' })

    expect(result.sent).toBe(true)
    expect(notifyTenantUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'rest-1',
        tenantType: 'RESTAURANT',
        notificationCategory: 'invoice_reminder_manual',
        referenceId: 'inv-1',
      })
    )
  })

  it('sendInvoiceReminder skips when dedup claim fails', async () => {
    const queryMock = vi.fn()
    queryMock.mockImplementation(async (sql) => {
      const s = String(sql)
      if (s.includes('FROM invoice') && s.includes('WHERE id = $1')) {
        return {
          rows: [
            {
              id: 'inv-1',
              invoice_number: 'INV-001',
              restaurant_id: 'rest-1',
              supplier_id: 'sup-1',
              due_date: '2026-06-20',
              balance_due: '150.00',
              total_amount: '150.00',
              status: 'OVERDUE',
            },
          ],
        }
      }
      if (s.includes('INSERT INTO invoice_reminder_log')) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const notifyTenantUsers = vi.fn()

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    vi.doMock('./notification.service.js', () => ({ notifyTenantUsers }))

    const { sendInvoiceReminder } = await import('./collections-reminders.service.js')
    const result = await sendInvoiceReminder('inv-1', 'sup-1', { kind: 'manual', userId: 'user-1' })

    expect(result.sent).toBe(false)
    expect(result.skipped).toBe(true)
    expect(notifyTenantUsers).not.toHaveBeenCalled()
  })

  it('runCollectionsReminderCheck dryRun counts candidates without notifying', async () => {
    const queryMock = vi.fn()
    queryMock.mockImplementation(async (sql) => {
      const s = String(sql)
      if (s.includes('FROM invoice i') && s.includes('invoice_reminder_log')) {
        return {
          rows: [
            {
              id: 'inv-2',
              invoice_number: 'INV-002',
              restaurant_id: 'rest-2',
              supplier_id: 'sup-2',
              due_date: '2026-06-20',
              balance_due: '80.00',
              total_amount: '80.00',
              status: 'ISSUED',
            },
          ],
        }
      }
      return { rows: [] }
    })

    const notifyTenantUsers = vi.fn()

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    vi.doMock('./notification.service.js', () => ({ notifyTenantUsers }))

    const { runCollectionsReminderCheck } = await import('./collections-reminders.service.js')
    const result = await runCollectionsReminderCheck({ dryRun: true })

    expect(result.dryRun).toBe(true)
    expect(result.candidates).toBeGreaterThan(0)
    expect(result.sent).toBeGreaterThan(0)
    expect(notifyTenantUsers).not.toHaveBeenCalled()
    expect(String(queryMock.mock.calls[0][0])).toContain('FROM subscription sub')
    expect(String(queryMock.mock.calls[0][0])).toContain('sub.account_locked_at IS NULL')
  })

  it('runCollectionsReminderCheck skips sending when supplier locks after candidate scan', async () => {
    const queryMock = vi.fn()
    let candidateReturned = false
    queryMock.mockImplementation(async (sql) => {
      const s = String(sql)
      if (s.includes('FROM invoice i') && s.includes('invoice_reminder_log')) {
        if (candidateReturned) return { rows: [] }
        candidateReturned = true
        return {
          rows: [
            {
              id: 'inv-locked',
              invoice_number: 'INV-LOCKED',
              restaurant_id: 'rest-locked',
              supplier_id: 'sup-locked',
              due_date: '2026-06-20',
              balance_due: '80.00',
              total_amount: '80.00',
              status: 'ISSUED',
            },
          ],
        }
      }
      if (s.includes('FROM subscription')) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const notifyTenantUsers = vi.fn()

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    vi.doMock('./notification.service.js', () => ({ notifyTenantUsers }))

    const { runCollectionsReminderCheck } = await import('./collections-reminders.service.js')
    const result = await runCollectionsReminderCheck()

    expect(result.candidates).toBe(1)
    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(notifyTenantUsers).not.toHaveBeenCalled()
    expect(
      queryMock.mock.calls.some((call) =>
        String(call[0]).includes('INSERT INTO invoice_reminder_log')
      )
    ).toBe(false)
  })
})
