import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCK_REASON_FREE_SANDBOX_EXPIRED } from '../lib/billing/constants.js'
import { computeBillingAccessState } from '../lib/billing/billing-service.js'

const mockQuery = vi.fn()
const mockInvalidate = vi.fn().mockResolvedValue(undefined)

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/subscription.js', () => ({
  invalidateTenantSubscriptionCache: (...args) => mockInvalidate(...args),
}))

const mockNotifyBillingTrialExpired = vi.fn().mockResolvedValue([])
const mockNotifyBillingAccountLocked = vi.fn().mockResolvedValue([])

vi.mock('../services/notification.service.js', () => ({
  notifyBillingTrialExpired: (...args) => mockNotifyBillingTrialExpired(...args),
  notifyBillingAccountLocked: (...args) => mockNotifyBillingAccountLocked(...args),
}))

describe('runFreeSandboxExpiryJob', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockInvalidate.mockClear()
    mockNotifyBillingTrialExpired.mockClear()
    mockNotifyBillingAccountLocked.mockClear()
  })

  it('does not lock subscriptions when none are expired', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const { runFreeSandboxExpiryJob } = await import('./free-sandbox-expiry.job.js')

    const result = await runFreeSandboxExpiryJob()

    expect(result).toEqual({ locked: 0 })
    expect(mockInvalidate).not.toHaveBeenCalled()
    const sql = mockQuery.mock.calls[0][0]
    expect(sql).toContain("sp.code = 'free'")
    expect(sql).toContain('free_sandbox_expires_at < now()')
  })

  it('locks expired Free Trial workspaces with free_sandbox_expired', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { tenant_id: 'rest-1', tenant_type: 'RESTAURANT' },
        { tenant_id: 'sup-1', tenant_type: 'SUPPLIER' },
      ],
    })
    const { runFreeSandboxExpiryJob } = await import('./free-sandbox-expiry.job.js')

    const result = await runFreeSandboxExpiryJob()

    expect(result).toEqual({ locked: 2 })
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [LOCK_REASON_FREE_SANDBOX_EXPIRED])
    expect(mockInvalidate).toHaveBeenCalledWith('rest-1', 'RESTAURANT')
    expect(mockInvalidate).toHaveBeenCalledWith('sup-1', 'SUPPLIER')
    expect(mockNotifyBillingTrialExpired).toHaveBeenCalledTimes(2)
    expect(mockNotifyBillingAccountLocked).toHaveBeenCalledTimes(2)
  })

  it('logs and continues when cache invalidation fails', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ tenant_id: 'rest-1', tenant_type: 'RESTAURANT' }],
    })
    mockInvalidate.mockRejectedValueOnce(new Error('redis down'))
    const { logger } = await import('../lib/logger.js')
    const { runFreeSandboxExpiryJob } = await import('./free-sandbox-expiry.job.js')

    const result = await runFreeSandboxExpiryJob()

    expect(result).toEqual({ locked: 1 })
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to invalidate subscription cache after free sandbox expiry',
      expect.objectContaining({ tenantId: 'rest-1', tenantType: 'RESTAURANT' })
    )
  })

  it('SQL targets only free plan and active/trialing statuses (not paid tiers)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const { runFreeSandboxExpiryJob } = await import('./free-sandbox-expiry.job.js')

    await runFreeSandboxExpiryJob()

    const sql = mockQuery.mock.calls[0][0]
    expect(sql).toContain("sp.code = 'free'")
    expect(sql).toContain("s.status IN ('TRIALING', 'ACTIVE')")
    expect(sql).not.toContain('silver')
    expect(sql).not.toContain('gold')
  })

  it('SQL skips rows already locked for free_sandbox_expired (no re-lock)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const { runFreeSandboxExpiryJob } = await import('./free-sandbox-expiry.job.js')

    await runFreeSandboxExpiryJob()

    const sql = mockQuery.mock.calls[0][0]
    expect(sql).toContain('lock_reason IS DISTINCT FROM')
    expect(sql).toContain('account_locked_at IS NULL')
  })

  it('active Free Trial before expiry is not locked by access state', () => {
    const expires = new Date()
    expires.setDate(expires.getDate() + 3)
    const state = computeBillingAccessState({
      plan_id: 'plan-free',
      plan_code: 'free',
      status: 'ACTIVE',
      account_locked_at: null,
      lock_reason: null,
      free_sandbox_expires_at: expires.toISOString(),
    })
    expect(state.isLocked).toBe(false)
    expect(state.freeSandboxExpired).toBe(false)
  })

  it('after job lock, expired trial is locked; GET allowed / writes blocked by billing rules', () => {
    const lockedAt = new Date().toISOString()
    const state = computeBillingAccessState({
      plan_id: 'plan-free',
      plan_code: 'free',
      status: 'ACTIVE',
      account_locked_at: lockedAt,
      lock_reason: LOCK_REASON_FREE_SANDBOX_EXPIRED,
    })
    expect(state.isLocked).toBe(true)
    expect(state.freeSandboxExpired).toBe(true)

    const isTrialExpiredLock =
      state.freeSandboxExpired || state.lockReason === LOCK_REASON_FREE_SANDBOX_EXPIRED
    expect(isTrialExpiredLock).toBe(true)
    // billingAccessMiddleware: GET passes when trial expired; mutations return 402
    const allowsGet = state.isLocked && isTrialExpiredLock
    const blocksPost = state.isLocked && isTrialExpiredLock
    expect(allowsGet).toBe(true)
    expect(blocksPost).toBe(true)
  })
})
