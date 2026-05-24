import { beforeEach, describe, it, expect, vi } from 'vitest'
import { buildAccountLockedError, computeBillingAccessState } from './billing-service.js'

const mockQuery = vi.fn()

vi.mock('../db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: async (fn) => fn({ query: (...args) => mockQuery(...args) }),
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
  })
})
