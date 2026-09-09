import { stubGateway } from './providers/stub.js'
import { manualGateway } from './providers/manual.js'
import { stripeGateway, isStripeConfigured } from './providers/stripe.js'
import { config } from '../../config/env.js'
import { logger } from '../logger.js'

const registry = new Map([
  ['stub', stubGateway],
  ['manual', manualGateway],
])

if (isStripeConfigured()) {
  registry.set('stripe', stripeGateway)
  logger.info('Stripe billing gateway registered')
}

/**
 * Resolve a payment gateway implementation by provider id.
 * Stripe registers when STRIPE_SECRET_KEY / PAYMENTS_SECRET_KEY is configured.
 */
export function getBillingGateway(providerId) {
  const id = (providerId || config.BILLING_GATEWAY || 'stub').toLowerCase()
  if (config.APP_ENV === 'prod' && config.PAYMENTS_MODE === 'mock') {
    throw new Error('PAYMENTS_MODE=mock is not allowed in production')
  }
  if (config.PAYMENTS_MODE === 'live' && id === 'stub') {
    throw new Error(
      'BILLING_GATEWAY=stub is not allowed with PAYMENTS_MODE=live (use BILLING_GATEWAY=manual for pilot, or a registered PSP)'
    )
  }
  if (id === 'stripe' && !registry.has('stripe')) {
    if (config.PAYMENTS_MODE === 'live') {
      throw new Error(
        'Stripe gateway requested but STRIPE_SECRET_KEY / PAYMENTS_SECRET_KEY is not configured'
      )
    }
    logger.warn('Stripe requested but not configured; falling back to stub')
    return stubGateway
  }
  const gateway = registry.get(id)
  if (!gateway) {
    if (config.PAYMENTS_MODE === 'live') {
      throw new Error(
        `Unknown billing gateway "${id}" while PAYMENTS_MODE=live — refusing stub fallback`
      )
    }
    logger.warn('Unknown billing gateway; falling back to stub', { providerId: id })
    return stubGateway
  }
  return gateway
}

export function registerBillingGateway(providerId, implementation) {
  registry.set(providerId.toLowerCase(), implementation)
}

export function listBillingGateways() {
  return [...registry.keys()]
}
