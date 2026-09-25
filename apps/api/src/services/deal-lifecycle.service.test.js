import { describe, expect, it } from 'vitest'
import {
  resolveStatusAfterApproval,
  resolveScheduledOrActive,
  resolveInitialDealStatus,
  resolveResumeStatus,
  getDealFieldError,
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

  it('restaurants only see active paid deals in live boost window', () => {
    const liveBoost = {
      boost_start_at: new Date(Date.now() - 86400000).toISOString(),
      boost_end_at: new Date(Date.now() + 86400000 * 7).toISOString(),
    }
    expect(
      isRestaurantVisibleDeal({
        ...baseDeal,
        status: 'active',
        payment_status: 'paid',
        ...liveBoost,
      })
    ).toBe(true)
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

  it('saving a deal keeps it a draft until submit', () => {
    expect(resolveInitialDealStatus(false)).toBe('draft')
    expect(resolveInitialDealStatus(true)).toBe('pending_approval')
  })

  it('rejects discounts that would not apply', () => {
    const base = {
      description: 'Weekend produce special',
      startsAt: '2026-09-25T10:00:00.000Z',
      ctaType: 'order_now',
    }
    expect(getDealFieldError({ ...base, type: 'percentage_discount', discountValue: 0 })).toMatch(
      /100/
    )
    expect(getDealFieldError({ ...base, type: 'percentage_discount', discountValue: 150 })).toMatch(
      /100/
    )
    expect(getDealFieldError({ ...base, type: 'percentage_discount', discountValue: 10 })).toBe(
      null
    )
    expect(getDealFieldError({ ...base, type: 'fixed_discount', discountValue: 0 })).toMatch(
      /greater than zero/
    )
    expect(
      getDealFieldError({
        ...base,
        type: 'buy_x_get_y',
        buyQuantity: 2,
        getQuantity: 1,
      })
    ).toBe(null)
    expect(getDealFieldError({ ...base, type: 'free_shipping' })).toBe(null)
    expect(
      getDealFieldError({
        ...base,
        type: 'percentage_discount',
        discountValue: 10,
        description: '  ',
      })
    ).toMatch(/Describe/)
  })

  it('expires a paused deal whose boost window has ended', () => {
    expect(
      resolveResumeStatus({
        status: 'paused',
        payment_status: 'paid',
        starts_at: '2026-01-01T00:00:00.000Z',
        ends_at: null,
        boost_end_at: '2026-01-02T00:00:00.000Z',
      })
    ).toBe('expired')
  })

  it('active deal without boost window is not restaurant-visible', () => {
    expect(
      isRestaurantVisibleDeal({
        status: 'active',
        payment_status: 'not_required',
        starts_at: new Date(Date.now() - 86400000).toISOString(),
        ends_at: null,
        boost_start_at: null,
        boost_end_at: null,
      })
    ).toBe(false)
  })
})
