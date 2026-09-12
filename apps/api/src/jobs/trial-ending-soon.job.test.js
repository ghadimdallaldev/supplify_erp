import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockNotify = vi.fn().mockResolvedValue({ id: 'n1' })

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('../services/notification.service.js', () => ({
  notifyBillingTrialEnding: (...args) => mockNotify(...args),
}))

describe('runTrialEndingSoonJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.JOB_DRY_RUN
  })

  it('skips notification when dedup claim fails', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ tenant_id: 't1', tenant_type: 'RESTAURANT', expiry_date: '2026-06-13' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const { runTrialEndingSoonJob } = await import('./trial-ending-soon.job.js')
    const result = await runTrialEndingSoonJob()

    expect(result.skipped).toBe(1)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('notifies when dedup claim succeeds', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ tenant_id: 't1', tenant_type: 'RESTAURANT', expiry_date: '2026-06-13' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'log1' }] })
      .mockResolvedValueOnce({ rows: [] })

    const { runTrialEndingSoonJob } = await import('./trial-ending-soon.job.js')
    const result = await runTrialEndingSoonJob()

    expect(result.notified).toBe(1)
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', tenantType: 'RESTAURANT', daysLeft: 2 })
    )
  })
})
