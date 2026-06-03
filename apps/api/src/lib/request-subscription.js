import { getSubscriptionForBilling } from './billing/billing-service.js'
import { getTenantSubscription } from './subscription.js'

/**
 * Load billing subscription row once per request (any non-cancelled status).
 * @param {import('express').Request} req
 * @param {{ tenantId: string, tenantType: string }} tenant
 */
export async function resolveRequestBillingSubscription(req, tenant) {
  if (req._billingSubscriptionResolved) {
    return req.billingSubscription ?? null
  }
  req._billingSubscriptionResolved = true
  if (!tenant?.tenantId || !tenant?.tenantType) {
    req.billingSubscription = null
    return null
  }
  req.billingSubscription = await getSubscriptionForBilling(tenant.tenantId, tenant.tenantType)
  return req.billingSubscription
}

/**
 * Load active/trialing subscription for feature gates once per request.
 * @param {import('express').Request} req
 * @param {{ tenantId: string, tenantType: string }} tenant
 */
export async function resolveRequestSubscription(req, tenant) {
  if (req.subscription) return req.subscription
  if (!tenant?.tenantId || !tenant?.tenantType) return null
  req.subscription = await getTenantSubscription(tenant.tenantId, tenant.tenantType)
  return req.subscription
}
