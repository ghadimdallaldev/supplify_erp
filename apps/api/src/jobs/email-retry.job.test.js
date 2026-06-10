import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockSendTemplate = vi.fn()
const mockSendEmail = vi.fn()

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

describe('runEmailRetryJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue({ rows: [] })
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
    expect(mockSendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: 'evt:1:retry:1', template: 'billing.trial_ending' })
    )
  })
})
