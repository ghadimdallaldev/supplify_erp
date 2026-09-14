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
 * Org child Branch Accounts inherit unlock from the main subscription — never force activate.
 */
export function shouldRedirectToActivate(input: {
  isPlatformAdmin: boolean
  isImpersonating: boolean
  pathname: string
  access?: LayoutBillingAccess | null
  usesOrgBilling?: boolean
}): boolean {
  if (!shouldLoadBillingStatus(input.isPlatformAdmin, input.isImpersonating)) return false
  if (input.usesOrgBilling) return false
  if (!input.access) return false
  const pending = Boolean(input.access.pendingActivation && input.access.isLocked)
  if (!pending) return false
  return !input.pathname.startsWith('/app/activate')
}

/** Activated / unlocked tenant can use the main app shell. */
export function canEnterAppShell(
  access?: LayoutBillingAccess | null,
  opts?: { usesOrgBilling?: boolean }
): boolean {
  if (opts?.usesOrgBilling) return true
  if (!access) return true
  if (access.pendingActivation && access.isLocked) return false
  return true
}
