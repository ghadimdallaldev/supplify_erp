import type { AppDispatch } from '../store'
import { api } from '../services/api'
import { openCheckoutPayment } from './openPaymentModal'

type SubscriptionPlanRow = {
  id?: string
  code?: string
  name?: string
  price_per_month?: number | null
  price_per_year?: number | null
  is_active?: boolean
  requires_admin_assignment?: boolean | null
}

function isPublicPaidPlan(plan: SubscriptionPlanRow | undefined) {
  const code = (plan?.code || '').toLowerCase()
  return Boolean(
    plan?.id &&
      code !== 'free' &&
      code !== 'enterprise' &&
      plan.is_active !== false &&
      plan.requires_admin_assignment !== true
  )
}

/** Self-service unlock for new signups: hidden free trial, targeted to the selected paid plan. */
export async function activateFreePlanFromPlans(
  dispatch: AppDispatch,
  plans: SubscriptionPlanRow[] | undefined,
  trialTargetPlanId?: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  const freePlan = plans?.find((p) => (p.code || '').toLowerCase() === 'free')
  if (!freePlan?.id) {
    return { ok: false, message: 'Trial activation is not available. Contact support.' }
  }

  const targetPlan = trialTargetPlanId
    ? plans?.find((p) => p.id === trialTargetPlanId && isPublicPaidPlan(p))
    : plans?.find(isPublicPaidPlan)

  if (!targetPlan?.id) {
    return { ok: false, message: 'Choose a paid plan to start your trial.' }
  }

  const idempotencyKey =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `trial_${Date.now()}`

  try {
    await dispatch(
      api.endpoints.billingCheckout.initiate({
        planId: freePlan.id,
        billingCycle: 'MONTHLY',
        idempotencyKey,
        trialTargetPlanId: targetPlan.id,
      })
    ).unwrap()
    // billingCheckout.onQueryStarted runs refetchAppSession (no duplicate invalidate/refetch here)
    return { ok: true }
  } catch (e: unknown) {
    const message =
      (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
      (e as Error)?.message ||
      'Could not activate the trial.'
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
    planName: freePlan.name || 'Free trial',
    priceMonthly: monthly,
    priceYearly: yearly,
  })
  return true
}
