/**
 * Paths that remain reachable when a tenant subscription is locked/suspended
 * so the account can view plan status and complete payment recovery.
 */

export const BILLING_RECOVERY_PREFIXES = [
  '/api/billing',
  '/api/register',
  '/auth',
  '/health',
  '/api/public',
]

export const BILLING_RECOVERY_GET_PATHS = new Set([
  '/api/subscriptions/entitlements',
  '/api/subscriptions/current',
  '/api/subscriptions/plans',
])

export function normalizeRequestPath(reqOrPath) {
  const raw =
    typeof reqOrPath === 'string'
      ? reqOrPath
      : reqOrPath?.originalUrl || reqOrPath?.url || reqOrPath?.path || ''
  return String(raw).split('?')[0]
}

export function isBillingRecoveryPath(method, reqOrPath) {
  const pathname = normalizeRequestPath(reqOrPath)
  const m = String(method || 'GET').toUpperCase()
  if (BILLING_RECOVERY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true
  if ((m === 'GET' || m === 'HEAD') && BILLING_RECOVERY_GET_PATHS.has(pathname)) return true
  return false
}
