import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('../config/env.js', () => ({
  config: { DEFAULT_TENANT_TIMEZONE: 'Asia/Beirut', DELIVERY_ROLLOVER_TIMEZONE: 'Asia/Beirut' },
}))
vi.mock('./db.js', () => ({ query: (...a) => queryMock(...a) }))

const { getSupplierTimezone, isValidTimeZone } = await import('./tenant-timezone.js')

describe('supplier timezone validation (driver run sheet 500)', () => {
  beforeEach(() => queryMock.mockReset())

  it('recognises valid and invalid IANA zones', () => {
    expect(isValidTimeZone('Asia/Beirut')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(undefined)).toBe(false)
  })

  it('falls back to the platform default instead of passing an unknown zone to SQL', async () => {
    queryMock.mockResolvedValue({ rows: [{ tz: 'Not/AZone' }] })
    await expect(getSupplierTimezone('s1')).resolves.toBe('Asia/Beirut')
  })

  it('keeps a valid supplier zone', async () => {
    queryMock.mockResolvedValue({ rows: [{ tz: 'Europe/Paris' }] })
    await expect(getSupplierTimezone('s1')).resolves.toBe('Europe/Paris')
  })
})
