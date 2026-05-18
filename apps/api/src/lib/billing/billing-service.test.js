import { describe, it, expect } from 'vitest'
import { computeBillingAccessState } from './billing-service.js'

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
