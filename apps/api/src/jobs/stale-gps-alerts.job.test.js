import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockNotify = vi.fn()
const mockListStale = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('../lib/active-gps-deliveries.js', () => ({
  listStaleGpsDeliveries: (...args) => mockListStale(...args),
}))

vi.mock('../services/notification.service.js', () => ({
  notifyTenantUsers: (...args) => mockNotify(...args),
}))

vi.mock('../lib/delivery-tracking-payload.js', () => ({
  isGpsTrackingEnabled: vi.fn(() => true),
}))

describe('runStaleGpsAlertsJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockReset()
    mockNotify.mockReset()
    mockListStale.mockReset()
  })

  it('skips alert logs and notifications when the supplier is locked after scan', async () => {
    mockListStale.mockResolvedValueOnce([
      {
        assignmentId: 'da-1',
        orderId: 'ord-1',
        supplierId: 'sup-locked',
        orderNumber: 'ORD-1',
      },
    ])
    mockQuery.mockResolvedValue({ rows: [] })

    const { runStaleGpsAlertsJob } = await import('./stale-gps-alerts.job.js')
    const result = await runStaleGpsAlertsJob()

    expect(result).toMatchObject({ scanned: 1, notified: 0, skipped: 1 })
    expect(mockNotify).not.toHaveBeenCalled()
    expect(
      mockQuery.mock.calls.some((call) =>
        String(call[0]).includes('INSERT INTO gps_stale_alert_log')
      )
    ).toBe(false)
    expect(String(mockQuery.mock.calls[0][0])).toContain('FROM subscription')
    expect(String(mockQuery.mock.calls[0][0])).toContain('account_locked_at IS NULL')
  })

  it('claims and notifies unlocked stale GPS deliveries', async () => {
    mockListStale.mockResolvedValueOnce([
      {
        assignmentId: 'da-1',
        orderId: 'ord-1',
        supplierId: 'sup-1',
        orderNumber: 'ORD-1',
      },
    ])
    mockQuery
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'alert-1' }] })
    mockNotify.mockResolvedValueOnce([{ id: 'n1' }])

    const { runStaleGpsAlertsJob } = await import('./stale-gps-alerts.job.js')
    const result = await runStaleGpsAlertsJob()

    expect(result).toMatchObject({ scanned: 1, notified: 1, skipped: 0 })
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'sup-1', tenantType: 'SUPPLIER' })
    )
  })
})
