import { describe, it, expect } from 'vitest'
import { buildAccountLockedError, computeBillingAccessState } from './billing-service.js'

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
