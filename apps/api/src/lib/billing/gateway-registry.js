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
  const id = (providerId || process.env.BILLING_GATEWAY || 'stub').toLowerCase()
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
