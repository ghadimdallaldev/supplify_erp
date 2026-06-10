import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeExpiryStatus } from '../lib/inventory-expiry-status.js'

describe('inventory-expiry status', () => {
  const now = new Date('2026-06-03T12:00:00Z')

  it('returns expired for past dates', () => {
    expect(computeExpiryStatus('2026-06-01', 7, now)).toBe('expired')
  })

  it('returns expiring_soon within threshold', () => {
    expect(computeExpiryStatus('2026-06-08', 7, now)).toBe('expiring_soon')
    expect(computeExpiryStatus('2026-06-03', 7, now)).toBe('expiring_soon')
  })

  it('returns safe beyond threshold', () => {
    expect(computeExpiryStatus('2026-06-15', 7, now)).toBe('safe')
  })

  it('returns null for missing date', () => {
    expect(computeExpiryStatus(null, 7, now)).toBeNull()
  })
})

describe('inventory-expiry notification dedup', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('skips duplicate grouped notifications when dedup claim fails', async () => {
    const queryMock = vi.fn()
    queryMock.mockImplementation(async (sql) => {
      const s = String(sql)
      if (s.includes('GROUP BY l.restaurant_id')) {
        return {
          rows: [
            {
              restaurant_id: 'r1',
              expiring_soon_days: 7,
              expired_count: 0,
              expiring_soon_count: 2,
            },
          ],
        }
      }
      if (s.includes('inventory_expiry_notification_log') && s.includes('INSERT')) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    vi.doMock('./notification.service.js', () => ({
      notifyTenantUsers: vi.fn().mockResolvedValue([{ id: 'n1' }]),
    }))

    const { runExpiryReminderCheck } = await import('./inventory-expiry.service.js')
    const result = await runExpiryReminderCheck({ restaurantId: 'r1' })
    expect(result.notificationsSent).toBe(0)
  })
})
