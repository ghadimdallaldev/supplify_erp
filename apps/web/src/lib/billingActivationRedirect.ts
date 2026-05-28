/** Billing access fields used for activation redirect and banners. */
export type LayoutBillingAccess = {
  pendingActivation?: boolean
  isLocked?: boolean
  freeSandboxExpired?: boolean
  lockReason?: string | null
  isPastDue?: boolean
}

export function shouldLoadBillingStatus(
  isPlatformAdmin: boolean,
  isImpersonating: boolean
): boolean {
  return !isPlatformAdmin || isImpersonating
}

/**
 * Pending-activation tenants must land on /app/activate (unless already there).
 */
export function shouldRedirectToActivate(input: {
  isPlatformAdmin: boolean
  isImpersonating: boolean
  pathname: string
  access?: LayoutBillingAccess | null
}): boolean {
  if (!shouldLoadBillingStatus(input.isPlatformAdmin, input.isImpersonating)) return false
  if (!input.access) return false
  const pending = Boolean(input.access.pendingActivation && input.access.isLocked)
  if (!pending) return false
  return !input.pathname.startsWith('/app/activate')
}

/** Activated / unlocked tenant can use the main app shell. */
export function canEnterAppShell(access?: LayoutBillingAccess | null): boolean {
  if (!access) return true
  if (access.pendingActivation && access.isLocked) return false
  return true
}
