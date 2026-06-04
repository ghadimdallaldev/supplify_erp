import type { AppDispatch } from '../store'
import { api } from '../services/api'
import { refetchAppSession } from './refetchAppSession'
import { openCheckoutPayment } from './openPaymentModal'

type SubscriptionPlanRow = {
  id?: string
  code?: string
  name?: string
  price_per_month?: number | null
  price_per_year?: number | null
}

/** Self-service unlock for new signups on the Free tier (no card required). */
export async function activateFreePlanFromPlans(
  dispatch: AppDispatch,
  plans: SubscriptionPlanRow[] | undefined
): Promise<{ ok: true } | { ok: false; message: string }> {
  const freePlan = plans?.find((p) => (p.code || '').toLowerCase() === 'free')
  if (!freePlan?.id) {
    return { ok: false, message: 'Free plan is not available. Contact support.' }
  }

  const monthly = Number(freePlan.price_per_month ?? 0)
  const yearly = freePlan.price_per_year != null ? Number(freePlan.price_per_year) : monthly * 12

  const idempotencyKey =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `free_${Date.now()}`

  try {
    await dispatch(
      api.endpoints.billingCheckout.initiate({
        planId: freePlan.id,
        billingCycle: 'MONTHLY',
        idempotencyKey,
      })
    ).unwrap()
    dispatch(api.util.invalidateTags(['Subscription', 'Billing', 'User']))
    await refetchAppSession(dispatch)
    return { ok: true }
  } catch (e: unknown) {
    const message =
      (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
      (e as Error)?.message ||
      'Could not activate the free plan.'
    return { ok: false, message }
  }
}

export function openFreePlanCheckout(
  dispatch: AppDispatch,
  plans: SubscriptionPlanRow[] | undefined
) {
  const freePlan = plans?.find((p) => (p.code || '').toLowerCase() === 'free')
  if (!freePlan?.id) return false
  const monthly = Number(freePlan.price_per_month ?? 0)
  const yearly = freePlan.price_per_year != null ? Number(freePlan.price_per_year) : monthly * 12
  openCheckoutPayment(dispatch, {
    planId: freePlan.id,
    planCode: 'free',
    planName: freePlan.name || 'Free',
    priceMonthly: monthly,
    priceYearly: yearly,
  })
  return true
}
