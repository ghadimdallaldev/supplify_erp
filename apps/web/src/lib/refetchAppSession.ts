import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit'
import { api } from '../services/api'

type AppDispatch = ThunkDispatch<unknown, unknown, UnknownAction>

/**
 * Force-refresh auth, registration, billing, and entitlements after mutations
 * that change workspace access (signup, activation, checkout, unlock).
 */
export async function refetchAppSession(dispatch: AppDispatch): Promise<void> {
  await Promise.all([
    dispatch(api.endpoints.getMe.initiate(undefined, { forceRefetch: true })).unwrap(),
    dispatch(api.endpoints.getRegisterStatus.initiate(undefined, { forceRefetch: true })).unwrap(),
    dispatch(api.endpoints.getBillingStatus.initiate(undefined, { forceRefetch: true })).unwrap(),
    dispatch(api.endpoints.getEntitlements.initiate(undefined, { forceRefetch: true }))
      .unwrap()
      .catch(() => undefined),
  ])
}

/** True when cached user role and register status disagree (stale userBySub cache). */
export function hasStaleRegistrationState(input: {
  role?: string | null
  needsSetup?: boolean
}): boolean {
  if (input.role !== 'PENDING') return false
  return input.needsSetup === false
}

/** True when billing still reports pending activation. */
export function isBillingPendingActivation(
  access?: {
    pendingActivation?: boolean
    isLocked?: boolean
  } | null
): boolean {
  return Boolean(access?.pendingActivation && access?.isLocked)
}

export function canLeaveActivationPage(
  access?: { pendingActivation?: boolean; isLocked?: boolean } | null
): boolean {
  return !isBillingPendingActivation(access)
}
