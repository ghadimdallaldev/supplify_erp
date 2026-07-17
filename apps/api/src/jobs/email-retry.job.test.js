import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockSendTemplate = vi.fn()
const mockSendEmail = vi.fn()
const mockIsTenantIdUnlocked = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../config/env.js', () => ({
  config: {
    EMAIL_RETRY_MAX_ATTEMPTS: 3,
    EMAIL_RETRY_LOOKBACK_DAYS: 7,
  },
}))

vi.mock('../services/email/email.service.js', () => ({
  sendTemplateEmail: (...args) => mockSendTemplate(...args),
  sendEmail: (...args) => mockSendEmail(...args),
}))

vi.mock('../lib/background-write-locks.js', () => ({
  isTenantIdUnlockedForBackgroundWrites: (...args) => mockIsTenantIdUnlocked(...args),
}))

describe('runEmailRetryJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue({ rows: [] })
    mockIsTenantIdUnlocked.mockResolvedValue(true)
  })

  it('retries failed emails with stored template payload', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'log1',
            event_key: 'evt:1',
            event_type: 'billing',
            recipient: 'a@b.com',
            tenant_id: 't1',
            subject: 'Hello',
            retry_payload: {
              template: 'billing.trial_ending',
              data: { message: 'Hi' },
              to: 'a@b.com',
            },
            retry_count: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })

    mockSendTemplate.mockResolvedValueOnce({ sent: true })

    const { runEmailRetryJob } = await import('./email-retry.job.js')
    const result = await runEmailRetryJob()

    expect(result.retried).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(result.skipped).toBe(0)
    expect(mockSendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: 'evt:1:retry:1', template: 'billing.trial_ending' })
    )
    expect(String(mockQuery.mock.calls[0][0])).toContain('sub.account_locked_at IS NULL')
    expect(String(mockQuery.mock.calls[0][0])).toContain(
      'sub.tenant_id = email_delivery_log.tenant_id'
    )
    expect(String(mockQuery.mock.calls[0][0])).toContain("event_type LIKE 'billing%'")
  })
  it('skips retry when a known tenant locks after scan', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'log-locked',
          event_key: 'evt:locked',
          event_type: 'order_new',
          recipient: 'locked@example.com',
          tenant_id: 'tenant-locked',
          subject: 'Hello',
          retry_payload: {
            template: 'notification.generic',
            data: { message: 'Hi' },
          },
          retry_count: 0,
        },
      ],
    })
    mockIsTenantIdUnlocked.mockResolvedValueOnce(false)

    const { runEmailRetryJob } = await import('./email-retry.job.js')
    const result = await runEmailRetryJob()

    expect(result).toMatchObject({ scanned: 1, retried: 0, succeeded: 0, skipped: 1 })
    expect(mockIsTenantIdUnlocked).toHaveBeenCalledWith({ tenantId: 'tenant-locked' })
    expect(mockSendTemplate).not.toHaveBeenCalled()
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })
  it('allows billing lifecycle retries even when the tenant is locked', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'log-billing',
            event_key: 'evt:billing',
            event_type: 'billing_trial_ending_soon',
            recipient: 'billing@example.com',
            tenant_id: 'tenant-locked',
            subject: 'Trial ending',
            retry_payload: {
              template: 'billing.trial_ending',
              data: { message: 'Hi' },
            },
            retry_count: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
    mockIsTenantIdUnlocked.mockResolvedValueOnce(false)
    mockSendTemplate.mockResolvedValueOnce({ sent: true })

    const { runEmailRetryJob } = await import('./email-retry.job.js')
    const result = await runEmailRetryJob()

    expect(result).toMatchObject({ scanned: 1, retried: 1, succeeded: 1, skipped: 0 })
    expect(mockIsTenantIdUnlocked).not.toHaveBeenCalled()
    expect(mockSendTemplate).toHaveBeenCalledOnce()
  })
})
