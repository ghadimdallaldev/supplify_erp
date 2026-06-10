import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockWithTransaction = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (fn) => mockWithTransaction(fn),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/billing/billing-service.js', () => ({
  getSubscriptionForBilling: vi
    .fn()
    .mockResolvedValue({ status: 'PAST_DUE', past_due_since: new Date() }),
  markSubscriptionPastDue: vi.fn(),
  lockSubscriptionAccount: vi.fn(),
}))

vi.mock('../lib/billing/gateway-registry.js', () => ({
  getBillingGateway: vi.fn(),
}))

vi.mock('../lib/subscription.js', () => ({
  invalidateTenantSubscriptionCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/notification.service.js', () => ({
  notifyBillingRenewed: vi.fn().mockResolvedValue(undefined),
  notifyBillingPaymentFailed: vi.fn().mockResolvedValue(undefined),
  notifyBillingAccountLocked: vi.fn().mockResolvedValue(undefined),
}))

describe('runSubscriptionBillingJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue({ rows: [] })
    mockWithTransaction.mockImplementation(async (fn) => {
      const client = { query: mockQuery }
      return fn(client)
    })
  })

  it('returns zero counts when no subscriptions are due', async () => {
    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    const result = await runSubscriptionBillingJob()
    expect(result).toEqual({ renewed: 0, locked: 0, pastDue: 0 })
  })

  it('skips gracefully when billing tables are not migrated', async () => {
    const err = new Error('missing relation')
    err.code = '42P01'
    mockQuery.mockRejectedValueOnce(err)

    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    const result = await runSubscriptionBillingJob()
    expect(result.skipped).toBe(true)
  })
})
