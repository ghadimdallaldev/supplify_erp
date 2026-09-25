import { describe, it, expect } from 'vitest'
import { evaluateCancelWindow, assertDepositAcknowledged } from './reservation-policy.js'

describe('reservation-policy', () => {
  it('blocks cancel inside the window', () => {
    const hours = {
      _booking: { cancelWindowHours: 24 },
    }
    const scheduledAt = new Date(Date.now() + 6 * 60 * 60 * 1000) // 6h out
    const result = evaluateCancelWindow(hours, scheduledAt)
    expect(result.allowed).toBe(false)
    expect(result.cancelWindowHours).toBe(24)
  })

  it('allows cancel outside the window', () => {
    const hours = {
      _booking: { cancelWindowHours: 2 },
    }
    const scheduledAt = new Date(Date.now() + 10 * 60 * 60 * 1000)
    expect(evaluateCancelWindow(hours, scheduledAt).allowed).toBe(true)
  })

  it('requires deposit ack when mode is fixed', () => {
    const hours = { _booking: { depositMode: 'fixed', depositAmount: 20 } }
    expect(() => assertDepositAcknowledged(hours, false)).toThrow(/deposit/i)
    expect(assertDepositAcknowledged(hours, true).required).toBe(true)
  })

  it('skips deposit ack when the amount is zero', () => {
    expect(
      assertDepositAcknowledged({ _booking: { depositMode: 'percent', depositPercent: 0 } }, false)
        .required
    ).toBe(false)
  })

  it('skips deposit ack when mode is none', () => {
    expect(assertDepositAcknowledged({ _booking: { depositMode: 'none' } }, false).required).toBe(
      false
    )
  })
})
