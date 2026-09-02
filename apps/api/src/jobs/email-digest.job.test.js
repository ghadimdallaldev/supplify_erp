import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockSendTemplate = vi.fn()
const mockIsTenantUnlocked = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../config/env.js', () => ({
  config: { EMAIL_DIGEST_LOOKBACK_HOURS: 24 },
}))

vi.mock('../services/email/email.service.js', () => ({
  sendTemplateEmail: (...args) => mockSendTemplate(...args),
}))

vi.mock('../lib/background-write-locks.js', () => ({
  isTenantUnlockedForBackgroundWrites: (...args) => mockIsTenantUnlocked(...args),
}))

describe('runEmailDigestJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue({ rows: [] })
    mockIsTenantUnlocked.mockResolvedValue(true)
    mockSendTemplate.mockResolvedValue({ sent: true })
  })

  it('sends digests only after scanning for unlocked tenant subscribers', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user-1',
            user_type: 'RESTAURANT',
            email: 'owner@example.com',
            tenant_id: 'restaurant-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'digest-1' }] })
      .mockResolvedValueOnce({
        rows: [
          { title: 'A', message: 'B', notification_category: 'orders', created_at: '2026-07-17' },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })

    const { runEmailDigestJob } = await import('./email-digest.job.js')
    const result = await runEmailDigestJob()

    const scanSql = String(mockQuery.mock.calls[0][0])
    expect(scanSql).toContain('JOIN subscription sub')
    expect(scanSql).toContain('sub.account_locked_at IS NULL')
    expect(scanSql).toContain("np.user_type = 'ADMIN' OR tenant.tenant_id IS NOT NULL")
    expect(mockIsTenantUnlocked).toHaveBeenCalledWith({
      tenantId: 'restaurant-1',
      tenantType: 'RESTAURANT',
    })
    expect(mockSendTemplate).toHaveBeenCalledOnce()
    expect(result.sent).toBe(1)
  })

  it('skips digest claim and send when a tenant locks after scan', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'user-locked',
          user_type: 'SUPPLIER',
          email: 'supplier@example.com',
          tenant_id: 'supplier-locked',
        },
      ],
    })
    mockIsTenantUnlocked.mockResolvedValueOnce(false)

    const { runEmailDigestJob } = await import('./email-digest.job.js')
    const result = await runEmailDigestJob()

    expect(result.scanned).toBe(1)
    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockSendTemplate).not.toHaveBeenCalled()
  })
})
