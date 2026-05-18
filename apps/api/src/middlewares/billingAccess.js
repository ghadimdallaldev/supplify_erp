import { getRequestTenant } from '../lib/rbac.js'
import { getBillingStatus, buildAccountLockedError } from '../lib/billing/billing-service.js'
import { logger } from '../lib/logger.js'

const ALLOW_PREFIXES = ['/api/billing', '/api/register', '/auth', '/health', '/api/public']

const ALLOW_GET_PATHS = new Set([
  '/api/subscriptions/entitlements',
  '/api/subscriptions/current',
  '/api/subscriptions/plans',
])

/**
 * Block tenant API access when subscription account is locked (overdue after grace).
 * Billing and read-only subscription endpoints remain available.
 */
export async function billingAccessMiddleware(req, res, next) {
  if (req.method === 'OPTIONS') return next()

  const path = req.path || req.originalUrl?.split('?')[0] || ''
  if (ALLOW_PREFIXES.some((p) => path.startsWith(p))) return next()
  if (req.method === 'GET' && ALLOW_GET_PATHS.has(path)) return next()

  if (!req.userData) return next()
  if (req.userData.role === 'ADMIN') return next()

  try {
    const tenant = await getRequestTenant(req)
    if (!tenant) return next()

    const billing = await getBillingStatus(tenant.tenantId, tenant.tenantType)
    if (!billing.access.isLocked) return next()

    return res.status(402).json({
      ok: false,
      data: { billing: { access: billing.access, amountDue: billing.amountDue } },
      error: buildAccountLockedError(billing),
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.code === '42P01') return next()
    logger.error('Billing access check failed', { error: error.message })
    return next()
  }
}
