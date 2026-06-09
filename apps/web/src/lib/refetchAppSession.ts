import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit'
import { api } from '../services/api'
import { perfLog } from './perfLog'
import type { User } from '../types'

type AppDispatch = ThunkDispatch<unknown, unknown, UnknownAction>

export function shouldRefetchTenantBilling(role?: User['role'] | null): boolean {
  return role === 'RESTAURANT' || role === 'SUPPLIER'
}

/**
 * Force-refresh auth, registration, billing, and entitlements after mutations
 * that change workspace access (signup, activation, checkout, unlock).
 */
export async function refetchAppSession(dispatch: AppDispatch): Promise<void> {
  const t0 = performance.now()
  const me = await dispatch(
    api.endpoints.getMe.initiate(undefined, { forceRefetch: true })
  ).unwrap()

  const tasks: Promise<unknown>[] = [
    dispatch(api.endpoints.getRegisterStatus.initiate(undefined, { forceRefetch: true }))
      .unwrap()
      .catch(() => undefined),
  ]

  if (shouldRefetchTenantBilling(me?.role)) {
    tasks.push(
      dispatch(api.endpoints.getBillingStatus.initiate(undefined, { forceRefetch: true }))
        .unwrap()
        .catch(() => undefined),
      dispatch(api.endpoints.getEntitlements.initiate(undefined, { forceRefetch: true }))
        .unwrap()
        .catch(() => undefined)
    )
  }

  await Promise.all(tasks)
  perfLog('session.refetch', { durationMs: Math.round(performance.now() - t0) })
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
