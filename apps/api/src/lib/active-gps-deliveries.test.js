import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('./delivery-tracking-payload.js', () => ({
  isGpsTrackingEnabled: vi.fn(() => true),
  buildTrackingPayload: vi.fn(() => ({ enabled: true, hasLocation: true, isStale: false })),
}))

describe('active-gps-deliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockReset()
  })

  it('filters active GPS delivery scan to unlocked suppliers', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const { fetchActiveGpsDeliveryRows } = await import('./active-gps-deliveries.js')
    await fetchActiveGpsDeliveryRows()

    const sql = String(mockQuery.mock.calls[0][0])
    expect(sql).toContain('FROM subscription sub')
    expect(sql).toContain('sub.account_locked_at IS NULL')
    expect(sql).toContain("sub.tenant_type = 'SUPPLIER'")
  })
})
