import { getRequestTenant } from '../lib/rbac.js'
import { resolveRequestBillingSubscription } from '../lib/request-subscription.js'
import {
  getBillingStatus,
  computeBillingAccessState,
  buildAccountLockedError,
} from '../lib/billing/billing-service.js'
import { startStage, mark } from './request-timing.js'
import { LOCK_REASON_FREE_SANDBOX_EXPIRED } from '../lib/billing/constants.js'
import { isImpersonating } from '../lib/impersonation.js'
import { logger } from '../lib/logger.js'

const ALLOW_PREFIXES = ['/api/billing', '/api/register', '/auth', '/health', '/api/public']

const ALLOW_GET_PATHS = new Set([
  '/api/subscriptions/entitlements',
  '/api/subscriptions/current',
  '/api/subscriptions/plans',
])

/** GET paths that must stay blocked when billing locks the tenant (including read-only trial expiry). */
const SENSITIVE_GET_PREFIXES = ['/api/reports/']

function isSensitiveReadPath(path) {
  if (SENSITIVE_GET_PREFIXES.some((prefix) => path.startsWith(prefix))) return true
  if (path.includes('/export')) return true
  if (/^\/api\/invoices\/[^/]+\/pdf$/.test(path)) return true
  return false
}

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
 *
 * Perf: uses a single lean query to check lock state. Only falls back to full
 * getBillingStatus (payment methods + invoices) when the account is actually locked,
 * which is the rare path. The common path (not locked) costs 1 DB query.
 */
export async function billingAccessMiddleware(req, res, next) {
  if (req.method === 'OPTIONS') return next()

  const path = req.path || req.originalUrl?.split('?')[0] || ''
  if (ALLOW_PREFIXES.some((p) => path.startsWith(p))) return next()
  if (req.method === 'GET' && ALLOW_GET_PATHS.has(path)) return next()

  if (!req.userData) return next()
  // Platform admins bypass locks for admin APIs; impersonation must respect tenant billing state.
  if (req.userData.role === 'ADMIN' && !isImpersonating(req)) return next()

  startStage(req, 'billing')
  try {
    const tenant = await getRequestTenant(req)
    if (!tenant) {
      mark(req, 'billing')
      return next()
    }

    const subscription = await resolveRequestBillingSubscription(req, tenant)
    const access = computeBillingAccessState(subscription)
    if (!access.isLocked) {
      mark(req, 'billing')
      return next()
    }

    if (req.method === 'GET' && isFreeTrialExpiredLock(access)) {
      if (isSensitiveReadPath(path)) {
        const billing = await getBillingStatus(tenant.tenantId, tenant.tenantType)
        mark(req, 'billing')
        return res.status(402).json({
          ok: false,
          data: { billing: { access: billing.access, amountDue: billing.amountDue } },
          error: buildAccountLockedError(billing),
          requestId: req.requestId,
        })
      }
      mark(req, 'billing')
      return next()
    }

    if (req.method === 'GET' && isSensitiveReadPath(path)) {
      const billing = await getBillingStatus(tenant.tenantId, tenant.tenantType)
      mark(req, 'billing')
      return res.status(402).json({
        ok: false,
        data: { billing: { access: billing.access, amountDue: billing.amountDue } },
        error: buildAccountLockedError(billing),
        requestId: req.requestId,
      })
    }

    // Slow path (locked): fetch full billing status for the response payload.
    const billing = await getBillingStatus(tenant.tenantId, tenant.tenantType)
    mark(req, 'billing')
    return res.status(402).json({
      ok: false,
      data: { billing: { access: billing.access, amountDue: billing.amountDue } },
      error: buildAccountLockedError(billing),
      requestId: req.requestId,
    })
  } catch (error) {
    mark(req, 'billing')
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
