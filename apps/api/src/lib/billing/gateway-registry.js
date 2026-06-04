import { config } from '../../config/env.js'
import { logger } from '../logger.js'
import { stubGateway } from './providers/stub.js'
import { manualGateway } from './providers/manual.js'

const registry = new Map([
  ['stub', stubGateway],
  ['manual', manualGateway],
])

/**
 * Resolve a payment gateway implementation by provider id.
 * Additional providers (stripe, wish_money, bank_transfer) register here when integrated.
 */
export function getBillingGateway(providerId) {
  const id = (providerId || config.BILLING_GATEWAY || 'stub').toLowerCase()
  if (config.APP_ENV === 'prod' && config.PAYMENTS_MODE === 'mock') {
    throw new Error('PAYMENTS_MODE=mock is not allowed in production')
  }
  const gateway = registry.get(id)
  if (!gateway) {
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
