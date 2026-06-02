import { getRequestTenant } from '../lib/rbac.js'
import { getBillingStatus, buildAccountLockedError } from '../lib/billing/billing-service.js'
import { LOCK_REASON_FREE_SANDBOX_EXPIRED } from '../lib/billing/constants.js'
import { isImpersonating } from '../lib/impersonation.js'
import { logger } from '../lib/logger.js'
import { isSupplifyV2 } from '../config/supplifyModel.js'
import {
  getRestaurantWorkspaceMode,
  WORKSPACE_MODE_BUYER_ONLY,
} from '../lib/restaurant-workspace.js'

const ALLOW_PREFIXES = ['/api/billing', '/api/register', '/auth', '/health', '/api/public']

/** V2 buyer-only: allow ordering and linked-supplier flows without paid subscription lock */
const BUYER_ONLY_WRITE_PREFIXES = [
  '/api/orders',
  '/api/products',
  '/api/prices',
  '/api/chat',
  '/api/quick-lists',
  '/api/restaurant-finance',
  '/api/invoices',
  '/api/payments',
  '/api/notifications',
  '/api/restaurants/workspace',
]

const ALLOW_GET_PATHS = new Set([
  '/api/subscriptions/entitlements',
  '/api/subscriptions/current',
  '/api/subscriptions/plans',
])

function isFreeTrialExpiredLock(access) {
  if (!access?.isLocked) return false
  return (
    access.freeSandboxExpired === true || access.lockReason === LOCK_REASON_FREE_SANDBOX_EXPIRED
  )
}

/**
 * Block tenant API access when subscription account is locked (overdue after grace).
 * Billing and read-only subscription endpoints remain available.
 * Expired Free Trial: allow GET (read-only); block writes.
 */
export async function billingAccessMiddleware(req, res, next) {
  if (req.method === 'OPTIONS') return next()

  const path = req.path || req.originalUrl?.split('?')[0] || ''
  if (ALLOW_PREFIXES.some((p) => path.startsWith(p))) return next()
  if (req.method === 'GET' && ALLOW_GET_PATHS.has(path)) return next()

  if (!req.userData) return next()
  // Platform admins bypass locks for admin APIs; impersonation must respect tenant billing state.
  if (req.userData.role === 'ADMIN' && !isImpersonating(req)) return next()

  try {
    const tenant = await getRequestTenant(req)
    if (!tenant) return next()

    const billing = await getBillingStatus(tenant.tenantId, tenant.tenantType)
    if (!billing.access.isLocked) return next()

    if (
      isSupplifyV2() &&
      tenant.tenantType === 'RESTAURANT' &&
      (await getRestaurantWorkspaceMode(tenant.tenantId)) === WORKSPACE_MODE_BUYER_ONLY
    ) {
      if (req.method === 'GET') return next()
      if (BUYER_ONLY_WRITE_PREFIXES.some((p) => path.startsWith(p))) return next()
    }

    if (req.method === 'GET' && isFreeTrialExpiredLock(billing.access)) return next()

    return res.status(402).json({
      ok: false,
      data: { billing: { access: billing.access, amountDue: billing.amountDue } },
      error: buildAccountLockedError(billing),
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.code === '42P01') return next()
    logger.error('Billing access check failed', { error: error.message })
    return res.status(503).json({
      ok: false,
      data: null,
      error: {
        name: 'BILLING_CHECK_UNAVAILABLE',
        message: 'Unable to verify billing status. Try again shortly.',
      },
      requestId: req.requestId,
    })
  }
}
