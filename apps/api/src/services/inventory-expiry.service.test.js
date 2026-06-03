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

  it('skips duplicate grouped notifications same day', async () => {
    const queryMock = vi.fn()
    queryMock.mockImplementation(async (sql) => {
      const s = String(sql)
      if (s.includes('FROM restaurant r')) return { rows: [{ id: 'r1' }] }
      if (s.includes('inventory_expiry_notification_log') && s.includes('SELECT 1')) {
        return { rows: [{ '': 1 }] }
      }
      if (s.includes('FROM restaurant_inventory_lot')) {
        return {
          rows: [
            {
              id: 'l1',
              restaurant_id: 'r1',
              expiry_date: '2026-06-08',
              item_name: 'Milk',
              quantity: 1,
              unit: 'L',
              is_archived: false,
            },
          ],
        }
      }
      if (s.includes('restaurant_inventory_settings')) return { rows: [{ expiring_soon_days: 7 }] }
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
