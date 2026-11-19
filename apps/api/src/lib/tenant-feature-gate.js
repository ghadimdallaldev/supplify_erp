import { requireFeature } from './subscription.js'
import { isFeatureKeyAllowed, featureDisplayName, isDefaultOnFeatureKey } from './feature-keys.js'
import { isFeatureEnabledForTenant, isPlatformFeatureEnabled } from './feature-flags.js'
import { isImpersonating } from './impersonation.js'

function featureDisabledBody(req, featureKey) {
  return {
    ok: false,
    data: null,
    error: {
      name: 'FEATURE_DISABLED',
      code: 'FEATURE_DISABLED',
      message: `${featureDisplayName(featureKey)} is turned off for this account`,
      featureKey,
    },
    requestId: req.requestId,
  }
}

/**
 * Route middleware: block the request when `featureKey` is off for the caller's tenant
 * (tenant override → global override → plan → default). Mount AFTER resolveTenantContext.
 *
 * - Platform ADMIN callers bypass (admin surfaces must keep working) unless they are
 *   impersonating a tenant — then they see exactly what that tenant sees. `adminBypass: false`
 *   disables the bypass entirely.
 * - Requests with no resolved tenant pass through (the route's own auth/role guard decides).
 * - Keys that do not apply to the caller's tenant type pass through (e.g. a restaurant-only
 *   key on a supplier request to a shared router).
 * - Default-on kill switches deny with a plain 403 `FEATURE_DISABLED` (no upgrade paywall, no
 *   BLOCKED_FEATURE conversion event — an admin turned it off, the plan cannot unlock it).
 *   Plan-sold keys deny through `requireFeature` (403 `FEATURE_NOT_AVAILABLE` + upgrade info).
 *
 * The returned function carries `featureKey` so route-coverage tests can find it.
 *
 * @param {string} featureKey
 * @param {{ adminBypass?: boolean }} [options]
 */
export function tenantFeatureGate(featureKey, { adminBypass = true } = {}) {
  const defaultOn = isDefaultOnFeatureKey(featureKey)
  const planGate = defaultOn
    ? null
    : requireFeature(
        featureKey,
        (req) => req.tenantContext?.tenantId,
        (req) => req.tenantContext?.tenantType
      )
  async function tenantFeatureGateMiddleware(req, res, next) {
    try {
      if (adminBypass && req.userData?.role === 'ADMIN' && !isImpersonating(req)) return next()
      const tenant = req.tenantContext
      if (!tenant?.tenantId || !tenant?.tenantType) return next()
      if (!isFeatureKeyAllowed(featureKey, tenant.tenantType)) return next()
      if (planGate) return planGate(req, res, next)
      const enabled = await isFeatureEnabledForTenant(
        tenant.tenantId,
        tenant.tenantType,
        featureKey
      )
      if (enabled) return next()
      return res.status(403).json(featureDisabledBody(req, featureKey))
    } catch (error) {
      return next(error)
    }
  }
  tenantFeatureGateMiddleware.featureKey = featureKey
  return tenantFeatureGateMiddleware
}

/**
 * Public (unauthenticated) route middleware: resolve the owning tenant from the request
 * and 404 when the feature is off for it, so a disabled public surface looks absent.
 *
 * @param {string} featureKey
 * @param {'RESTAURANT'|'SUPPLIER'} tenantType
 * @param {(req: import('express').Request) => Promise<string|null|undefined>} resolveTenantId
 */
export function publicTenantFeatureGate(featureKey, tenantType, resolveTenantId) {
  async function publicTenantFeatureGateMiddleware(req, res, next) {
    try {
      const tenantId = await resolveTenantId(req)
      // Unknown tenant: let the route produce its normal 404.
      if (!tenantId) return next()
      const enabled = await isFeatureEnabledForTenant(tenantId, tenantType, featureKey)
      if (enabled) return next()
      return res.status(404).json(featureDisabledBody(req, featureKey))
    } catch (error) {
      next(error)
    }
  }
  publicTenantFeatureGateMiddleware.featureKey = featureKey
  return publicTenantFeatureGateMiddleware
}

/**
 * Platform-wide (no tenant) kill switch, resolved from the global override only.
 * Disabled → 404 so the surface looks absent.
 *
 * @param {string} featureKey one of PLATFORM_FEATURE_KEYS
 */
export function platformFeatureGate(featureKey) {
  async function platformFeatureGateMiddleware(req, res, next) {
    try {
      if (await isPlatformFeatureEnabled(featureKey)) return next()
      return res.status(404).json(featureDisabledBody(req, featureKey))
    } catch (error) {
      next(error)
    }
  }
  platformFeatureGateMiddleware.featureKey = featureKey
  return platformFeatureGateMiddleware
}
