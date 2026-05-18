import type { AppDispatch } from '../store'
import { openPaymentModal, openPayOverdueModal } from '../features/billing/billingSlice'

export function openCheckoutPayment(
  dispatch: AppDispatch,
  plan: {
    planId: string
    planCode: string
    planName: string
    priceMonthly: number
    priceYearly: number | null
  }
) {
  dispatch(
    openPaymentModal({
      mode: 'checkout',
      plan: {
        planId: plan.planId,
        planCode: plan.planCode,
        planName: plan.planName,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
      },
    })
  )
}

export function openOverduePayment(dispatch: AppDispatch) {
  dispatch(openPayOverdueModal())
}
