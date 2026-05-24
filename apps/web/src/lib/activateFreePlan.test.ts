import { describe, it, expect, vi, beforeEach } from 'vitest'
import { activateFreePlanFromPlans, openFreePlanCheckout } from './activateFreePlan'

const checkoutInitiateMock = vi.fn()
const invalidateTagsMock = vi.fn()
const openPaymentModalMock = vi.fn()

vi.mock('../services/api', () => ({
  api: {
    endpoints: {
      billingCheckout: {
        initiate: (...args: unknown[]) => checkoutInitiateMock(...args),
      },
    },
    util: {
      invalidateTags: (...args: unknown[]) => invalidateTagsMock(...args),
    },
  },
}))

vi.mock('./openPaymentModal', () => ({
  openCheckoutPayment: (...args: unknown[]) => openPaymentModalMock(...args),
}))

describe('activateFreePlan', () => {
  const unwrap = vi.fn()
  const dispatch = vi.fn(() => ({ unwrap })) as unknown as import('../store').AppDispatch

  beforeEach(() => {
    checkoutInitiateMock.mockReset()
    invalidateTagsMock.mockReset()
    openPaymentModalMock.mockReset()
    unwrap.mockReset()
    unwrap.mockResolvedValue({ success: true })
  })

  describe('activateFreePlanFromPlans', () => {
    it('returns error when no free plan exists', async () => {
      const result = await activateFreePlanFromPlans(dispatch, [
        { id: 'p1', code: 'bronze', name: 'Bronze' },
      ])
      expect(result).toEqual({
        ok: false,
        message: 'Free plan is not available. Contact support.',
      })
    })

    it('calls billing checkout without payment method for free plan', async () => {
      const result = await activateFreePlanFromPlans(dispatch, [
        { id: 'free-id', code: 'free', name: 'Free', price_per_month: 0 },
      ])
      expect(result).toEqual({ ok: true })
      expect(checkoutInitiateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'free-id',
          billingCycle: 'MONTHLY',
          idempotencyKey: expect.any(String),
        })
      )
      expect(invalidateTagsMock).toHaveBeenCalledWith(['Subscription', 'Billing', 'User'])
    })

    it('returns API error message on checkout failure', async () => {
      unwrap.mockRejectedValue({
        data: { error: { message: 'Plan not found' } },
      })
      const result = await activateFreePlanFromPlans(dispatch, [
        { id: 'free-id', code: 'free', name: 'Free' },
      ])
      expect(result).toEqual({ ok: false, message: 'Plan not found' })
    })
  })

  describe('openFreePlanCheckout', () => {
    it('returns false when free plan is missing', () => {
      expect(openFreePlanCheckout(dispatch, [])).toBe(false)
      expect(openPaymentModalMock).not.toHaveBeenCalled()
    })

    it('opens checkout modal with zero pricing', () => {
      expect(
        openFreePlanCheckout(dispatch, [
          { id: 'free-id', code: 'free', name: 'Free', price_per_month: 0 },
        ])
      ).toBe(true)
      expect(openPaymentModalMock).toHaveBeenCalledWith(
        dispatch,
        expect.objectContaining({
          planId: 'free-id',
          planCode: 'free',
          planName: 'Free',
          priceMonthly: 0,
        })
      )
    })
  })
})
