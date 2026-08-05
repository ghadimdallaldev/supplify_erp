import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockNotifyTenantUsers = vi.fn().mockResolvedValue([{ id: 'notif-1' }])

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('./notification/in-app.js', () => ({
  notifyTenantUsers: (...args) => mockNotifyTenantUsers(...args),
}))

describe('sendReorderReminderDraft', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockNotifyTenantUsers.mockClear()
  })

  it('notifies restaurant and marks draft sent', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'draft-1',
            supplier_id: 'sup-1',
            restaurant_id: 'rest-1',
            subject: 'Reorder reminder',
            body: 'Please reorder soon',
            status: 'draft',
            restaurant_name: 'Cafe One',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'draft-1',
            status: 'sent',
            subject: 'Reorder reminder',
            body: 'Please reorder soon',
          },
        ],
      })

    const { sendReorderReminderDraft } = await import('./supplier-reorder-intelligence.service.js')
    const result = await sendReorderReminderDraft('sup-1', 'draft-1', 'user-1')

    expect(result?.sent).toBe(true)
    expect(result?.status).toBe('sent')
    expect(mockNotifyTenantUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'rest-1',
        tenantType: 'RESTAURANT',
        notificationCategory: 'reorder_cadence_missed',
        title: 'Reorder reminder',
      })
    )
  })

  it('returns null when draft is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const { sendReorderReminderDraft } = await import('./supplier-reorder-intelligence.service.js')
    const result = await sendReorderReminderDraft('sup-1', 'missing', 'user-1')
    expect(result).toBeNull()
    expect(mockNotifyTenantUsers).not.toHaveBeenCalled()
  })
})
