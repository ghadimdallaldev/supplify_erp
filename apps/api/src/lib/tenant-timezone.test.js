import { describe, it, expect, vi } from 'vitest'

vi.mock('../config/env.js', () => ({
  config: {
    DEFAULT_TENANT_TIMEZONE: 'Asia/Beirut',
    DELIVERY_ROLLOVER_TIMEZONE: 'Asia/Beirut',
  },
}))

vi.mock('./db.js', () => ({
  query: vi.fn(async () => ({ rows: [{ timezone: 'Europe/London' }] })),
}))

describe('tenant-timezone', () => {
  it('maps a skipped midnight to the first available time on that day', async () => {
    const { zonedWallTimeToUtc } = await import('./tenant-timezone.js')
    expect(zonedWallTimeToUtc('2026-03-29', 0, 0, 0, 0, 'Asia/Beirut').toISOString()).toBe(
      '2026-03-28T22:00:00.000Z'
    )
  })
  it('getZonedDayOfWeek uses IANA timezone', async () => {
    const { getZonedDayOfWeek } = await import('./tenant-timezone.js')
    const mondayUtcEvening = new Date('2026-06-01T22:00:00Z')
    expect(getZonedDayOfWeek(mondayUtcEvening, 'Asia/Beirut')).toBe(2)
  })

  it('getRestaurantTimezone falls back to default', async () => {
    const { query } = await import('./db.js')
    query.mockResolvedValueOnce({ rows: [{ timezone: null }] })
    const { getRestaurantTimezone } = await import('./tenant-timezone.js')
    const tz = await getRestaurantTimezone('r1')
    expect(tz).toBe('Asia/Beirut')
  })
})
