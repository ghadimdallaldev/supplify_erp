import { describe, it, expect, vi, beforeEach } from 'vitest'
import { activateFreePlanFromPlans, openFreePlanCheckout } from './activateFreePlan'

const checkoutInitiateMock = vi.fn()
const openPaymentModalMock = vi.fn()

vi.mock('../services/api', () => ({
  api: {
    endpoints: {
      billingCheckout: {
        initiate: (...args: unknown[]) => checkoutInitiateMock(...args),
      },
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
    openPaymentModalMock.mockReset()
    unwrap.mockReset()
    unwrap.mockResolvedValue({ success: true })
  })

  describe('activateFreePlanFromPlans', () => {
    it('returns error when no free trial plan exists', async () => {
      const result = await activateFreePlanFromPlans(dispatch, [
        { id: 'p1', code: 'silver', name: 'Silver' },
      ])
      expect(result).toEqual({
        ok: false,
        message: 'Trial activation is not available. Contact support.',
      })
    })

    it('returns error when no paid trial target exists', async () => {
      const result = await activateFreePlanFromPlans(dispatch, [
        { id: 'free-id', code: 'free', name: 'Free', price_per_month: 0 },
      ])
      expect(result).toEqual({
        ok: false,
        message: 'Choose a paid plan to start your trial.',
      })
      expect(checkoutInitiateMock).not.toHaveBeenCalled()
    })

    it('ignores enterprise and admin-only plans as trial targets', async () => {
      const result = await activateFreePlanFromPlans(dispatch, [
        { id: 'free-id', code: 'free', name: 'Free', price_per_month: 0 },
        { id: 'enterprise-id', code: 'enterprise', name: 'Enterprise' },
        {
          id: 'custom-id',
          code: 'platinum',
          name: 'Restaurant Custom',
          requires_admin_assignment: true,
        },
      ])
      expect(result).toEqual({
        ok: false,
        message: 'Choose a paid plan to start your trial.',
      })
      expect(checkoutInitiateMock).not.toHaveBeenCalled()
    })

    it('calls billing checkout for hidden free trial with selected paid target', async () => {
      const result = await activateFreePlanFromPlans(
        dispatch,
        [
          { id: 'free-id', code: 'free', name: 'Free', price_per_month: 0 },
          { id: 'target-id', code: 'silver', name: 'Restaurant Growth' },
        ],
        'target-id'
      )
      expect(result).toEqual({ ok: true })
      expect(checkoutInitiateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'free-id',
          billingCycle: 'MONTHLY',
          idempotencyKey: expect.any(String),
          trialTargetPlanId: 'target-id',
        })
      )
    })

    it('defaults trial target to the first public paid plan', async () => {
      const result = await activateFreePlanFromPlans(dispatch, [
        { id: 'free-id', code: 'free', name: 'Free', price_per_month: 0 },
        { id: 'target-id', code: 'gold', name: 'Restaurant Scale' },
      ])
      expect(result).toEqual({ ok: true })
      expect(checkoutInitiateMock).toHaveBeenCalledWith(
        expect.objectContaining({ trialTargetPlanId: 'target-id' })
      )
    })

    it('returns API error message on checkout failure', async () => {
      unwrap.mockRejectedValue({
        data: { error: { message: 'Plan not found' } },
      })
      const result = await activateFreePlanFromPlans(dispatch, [
        { id: 'free-id', code: 'free', name: 'Free' },
        { id: 'target-id', code: 'silver', name: 'Restaurant Growth' },
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
