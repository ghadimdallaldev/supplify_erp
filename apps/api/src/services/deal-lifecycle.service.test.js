import { describe, expect, it } from 'vitest'
import {
  resolveStatusAfterApproval,
  resolveScheduledOrActive,
  isRestaurantVisibleDeal,
  getRestaurantIneligibilityMessage,
  getDealDiscountDisplayLabel,
  shouldResetApprovalOnEdit,
  isPendingAdminReview,
} from './deal-lifecycle.service.js'

describe('deal-lifecycle.service', () => {
  const baseDeal = {
    id: 'd1',
    status: 'pending_approval',
    payment_status: 'not_required',
    starts_at: new Date(Date.now() - 86400000).toISOString(),
    ends_at: new Date(Date.now() + 86400000 * 7).toISOString(),
    usage_count: 0,
    usage_limit: null,
  }

  it('approve with no activation fee goes active when start date passed', () => {
    const next = resolveStatusAfterApproval(baseDeal, { activationAmount: 0 })
    expect(next.status).toBe('active')
    expect(next.payment_status).toBe('not_required')
  })

  it('approve with activation fee goes to approved_pending_payment', () => {
    const next = resolveStatusAfterApproval(baseDeal, { activationAmount: 29 })
    expect(next.status).toBe('approved_pending_payment')
    expect(next.payment_status).toBe('pending')
  })

  it('scheduled when start date is in the future after payment', () => {
    const future = {
      ...baseDeal,
      starts_at: new Date(Date.now() + 86400000 * 3).toISOString(),
    }
    const next = resolveScheduledOrActive(future, { payment_status: 'paid' })
    expect(next.status).toBe('scheduled')
  })

  it('restaurants only see active paid deals in date range', () => {
    expect(isRestaurantVisibleDeal({ ...baseDeal, status: 'active', payment_status: 'paid' })).toBe(
      true
    )
    expect(
      isRestaurantVisibleDeal({
        ...baseDeal,
        status: 'pending_approval',
        payment_status: 'not_required',
      })
    ).toBe(false)
    expect(
      isRestaurantVisibleDeal({
        ...baseDeal,
        status: 'active',
        payment_status: 'pending',
      })
    ).toBe(false)
  })

  it('ineligibility messages for pending and expired deals', () => {
    expect(
      getRestaurantIneligibilityMessage({ ...baseDeal, status: 'pending_approval' })
    ).toContain('awaiting admin approval')
    expect(getRestaurantIneligibilityMessage({ ...baseDeal, status: 'expired' })).toContain(
      'expired'
    )
  })

  it('discount display labels by deal type', () => {
    expect(
      getDealDiscountDisplayLabel({ type: 'percentage_discount', discount_value: 10 }, 5)
    ).toBe('10% discount applied')
    expect(
      getDealDiscountDisplayLabel({ type: 'buy_x_get_y', buy_quantity: 5, get_quantity: 1 }, 0)
    ).toContain('Buy 5 Get 1')
  })

  it('important field edits after approval require resubmit', () => {
    const existing = { status: 'active', discount_value: 10, type: 'percentage_discount' }
    expect(shouldResetApprovalOnEdit(existing, { discountValue: 15 })).toBe(true)
    expect(shouldResetApprovalOnEdit(existing, { name: 'New title' })).toBe(false)
  })

  it('isPendingAdminReview accepts legacy pending_approval', () => {
    expect(isPendingAdminReview({ status: 'pending_approval' })).toBe(true)
  })
})
