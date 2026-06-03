import { beforeEach, describe, it, expect, vi } from 'vitest'
import { buildAccountLockedError, computeBillingAccessState } from './billing-service.js'

const mockQuery = vi.fn()

vi.mock('../db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: async (fn) => fn({ query: (...args) => mockQuery(...args) }),
}))

vi.mock('../platform-settings.js', () => ({
  getFreeSandboxDays: vi.fn().mockResolvedValue(7),
  clampFreeTrialDays: (days, fallback = 7) => {
    const n = Number(days)
    const base = Number.isFinite(n) ? Math.round(n) : fallback
    return Math.min(7, Math.max(3, base))
  },
}))

describe('computeBillingAccessState', () => {
  it('free plan does not require payment', () => {
    const state = computeBillingAccessState({
      plan_code: 'free',
      status: 'ACTIVE',
    })
    expect(state.requiresPayment).toBe(false)
    expect(state.isLocked).toBe(false)
  })

  it('past due with grace period is not locked yet', () => {
    const graceEnd = new Date()
    graceEnd.setDate(graceEnd.getDate() + 3)
    const state = computeBillingAccessState({
      plan_code: 'gold',
      status: 'PAST_DUE',
      past_due_since: new Date().toISOString(),
      grace_period_ends_at: graceEnd.toISOString(),
      account_locked_at: null,
    })
    expect(state.isPastDue).toBe(true)
    expect(state.inGracePeriod).toBe(true)
    expect(state.isLocked).toBe(false)
    expect(state.daysUntilLock).toBeGreaterThan(0)
  })

  it('locked when account_locked_at is set', () => {
    const state = computeBillingAccessState({
      plan_code: 'gold',
      status: 'SUSPENDED',
      account_locked_at: new Date().toISOString(),
    })
    expect(state.isLocked).toBe(true)
  })

  it('pending activation is locked without past-due grace', () => {
    const state = computeBillingAccessState({
      plan_code: 'free',
      status: 'ACTIVE',
      account_locked_at: new Date().toISOString(),
      lock_reason: 'pending_activation',
    })
    expect(state.pendingActivation).toBe(true)
    expect(state.isLocked).toBe(true)
    expect(state.isPastDue).toBe(false)
    expect(state.inGracePeriod).toBe(false)
  })

  it('active paid plan is not locked', () => {
    const state = computeBillingAccessState({
      plan_id: 'plan-gold',
      plan_code: 'gold',
      status: 'ACTIVE',
      account_locked_at: null,
      lock_reason: null,
    })
    expect(state.isLocked).toBe(false)
    expect(state.requiresPayment).toBe(true)
    expect(state.pendingActivation).toBe(false)
  })

  it('active Free Trial with future expiry is not locked', () => {
    const expires = new Date()
    expires.setDate(expires.getDate() + 5)
    const state = computeBillingAccessState({
      plan_code: 'free',
      status: 'ACTIVE',
      account_locked_at: null,
      lock_reason: null,
      free_sandbox_expires_at: expires.toISOString(),
    })
    expect(state.isLocked).toBe(false)
    expect(state.freeSandboxDaysRemaining).toBeGreaterThan(0)
    expect(state.freeSandboxExpired).toBe(false)
  })

  it('expired Free Trial lock reason is flagged', () => {
    const state = computeBillingAccessState({
      plan_code: 'free',
      status: 'ACTIVE',
      account_locked_at: new Date().toISOString(),
      lock_reason: 'free_sandbox_expired',
    })
    expect(state.isLocked).toBe(true)
    expect(state.freeSandboxExpired).toBe(true)
    expect(state.pendingActivation).toBe(false)
  })

  it('SUSPENDED status is locked', () => {
    const state = computeBillingAccessState({
      plan_code: 'silver',
      status: 'SUSPENDED',
      account_locked_at: null,
    })
    expect(state.isLocked).toBe(true)
  })
})

describe('buildAccountLockedError', () => {
  it('returns pending activation message and upgrade path', () => {
    const err = buildAccountLockedError({
      amountDue: 0,
      access: {
        pendingActivation: true,
        lockReason: 'pending_activation',
        gracePeriodEndsAt: null,
      },
    })
    expect(err.name).toBe('ACCOUNT_LOCKED')
    expect(err.message).toMatch(/not activated/i)
    expect(err.details.pendingActivation).toBe(true)
    expect(err.details.upgradeUrl).toBe('/app/activate')
  })

  it('returns overdue message when not pending activation', () => {
    const err = buildAccountLockedError({
      amountDue: 50,
      access: {
        pendingActivation: false,
        lockReason: 'payment_overdue',
        gracePeriodEndsAt: null,
      },
    })
    expect(err.message).toMatch(/overdue/i)
    expect(err.details.amountDue).toBe(50)
  })

  it('returns Free Trial expired message', () => {
    const err = buildAccountLockedError({
      amountDue: 0,
      access: {
        pendingActivation: false,
        freeSandboxExpired: true,
        lockReason: 'free_sandbox_expired',
      },
    })
    expect(err.message).toBe(
      'Your Free Trial has expired. Upgrade your plan to continue using Supplify.'
    )
    expect(err.details.freeSandboxExpired).toBe(true)
    expect(err.details.lockReason).toBe('free_sandbox_expired')
  })
})

describe('checkoutSubscription free plan', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  it('unlocks pending_activation when confirming free plan', async () => {
    const { checkoutSubscription } = await import('./billing-service.js')

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'plan-free',
            code: 'free',
            name: 'Free',
            tenant_type: 'SUPPLIER',
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            tenant_id: 'sup-1',
            tenant_type: 'SUPPLIER',
            plan_id: 'plan-free',
            lock_reason: 'pending_activation',
            account_locked_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await checkoutSubscription({
      tenantId: 'sup-1',
      tenantType: 'SUPPLIER',
      planId: 'plan-free',
      billingCycle: 'MONTHLY',
    })

    expect(result?.success).toBe(true)
    expect(result?.activated).toBe(true)
    expect(result?.pendingActivation).toBe(false)

    const updateCall = mockQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('UPDATE subscription SET')
    )
    expect(updateCall?.[0]).toMatch(/account_locked_at = NULL/)
    expect(updateCall?.[0]).toMatch(/lock_reason = NULL/)
    expect(updateCall?.[0]).toMatch(/free_sandbox_expires_at/)
  })
})

describe('extendFreeSandboxTrial', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  it('extends expiry and clears lock for free plan', async () => {
    const { extendFreeSandboxTrial } = await import('./billing-service.js')
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-free',
            tenant_id: 'r1',
            tenant_type: 'RESTAURANT',
            plan_code: 'free',
            lock_reason: 'free_sandbox_expired',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'sub-free', free_sandbox_expires_at: new Date().toISOString() }],
      })

    const result = await extendFreeSandboxTrial('sub-free', { days: 5, adminUserId: 'admin-1' })

    expect(result.freeTrialDays).toBe(5)
    const updateCall = mockQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('free_sandbox_expires_at')
    )
    expect(updateCall?.[0]).toMatch(/account_locked_at = NULL/)
    expect(updateCall?.[0]).toMatch(/lock_reason = NULL/)
  })

  it('rejects extension for non-free plans', async () => {
    const { extendFreeSandboxTrial } = await import('./billing-service.js')
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'sub-gold', plan_code: 'gold', tenant_id: 'r1', tenant_type: 'RESTAURANT' }],
    })

    await expect(extendFreeSandboxTrial('sub-gold', { days: 5 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })
})

describe('unlockSubscriptionAccount', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  it('extends Free Trial when lock_reason is free_sandbox_expired', async () => {
    const { unlockSubscriptionAccount } = await import('./billing-service.js')
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-free',
            tenant_id: 'r1',
            tenant_type: 'RESTAURANT',
            plan_code: 'free',
            lock_reason: 'free_sandbox_expired',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    await unlockSubscriptionAccount('sub-free', { unlockedBy: 'admin', adminUserId: 'a1' })

    const updateCall = mockQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('free_sandbox_expires_at')
    )
    expect(updateCall).toBeTruthy()
  })
})
