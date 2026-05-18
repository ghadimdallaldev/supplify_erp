import crypto from 'node:crypto'
import { logger } from '../../logger.js'

/**
 * Development / placeholder gateway.
 * Simulates tokenization and charges without touching real payment networks.
 * Replace with Stripe, Wish Money, or bank APIs via registerBillingGateway().
 */
export const stubGateway = {
  id: 'stub',

  async tokenizePaymentMethod({ type, card }) {
    if (type === 'CARD') {
      const digits = String(card?.number || '').replace(/\D/g, '')
      if (digits.length < 13 || digits.length > 19) {
        throw Object.assign(new Error('Invalid card number'), { code: 'invalid_card' })
      }
      const last4 = digits.slice(-4)
      const brand = digits.startsWith('4') ? 'visa' : digits.startsWith('5') ? 'mastercard' : 'card'
      return {
        providerCustomerId: `cus_stub_${crypto.randomUUID()}`,
        providerPaymentMethodId: `pm_stub_${crypto.randomUUID()}`,
        type: 'CARD',
        brand,
        last4,
        expMonth: parseInt(card?.expMonth, 10) || null,
        expYear: parseInt(card?.expYear, 10) || null,
      }
    }
    if (type === 'BANK_ACCOUNT') {
      const last4 = String(card?.accountLast4 || '0000').slice(-4)
      return {
        providerCustomerId: `cus_stub_${crypto.randomUUID()}`,
        providerPaymentMethodId: `pm_stub_bank_${crypto.randomUUID()}`,
        type: 'BANK_ACCOUNT',
        brand: null,
        last4,
        bankName: card?.bankName || 'Bank',
      }
    }
    throw Object.assign(new Error('Unsupported payment method type'), { code: 'unsupported_type' })
  },

  async charge({ amount, currency, providerPaymentMethodId, idempotencyKey, metadata }) {
    logger.info('Stub gateway charge', {
      amount,
      currency,
      providerPaymentMethodId,
      idempotencyKey,
      metadata,
    })
    // Simulate occasional failure for testing (card ending in 0000)
    if (String(providerPaymentMethodId || '').includes('fail')) {
      return {
        status: 'failed',
        providerPaymentId: `pi_stub_${crypto.randomUUID()}`,
        failureCode: 'card_declined',
        failureMessage: 'Your card was declined (stub).',
      }
    }
    return {
      status: 'succeeded',
      providerPaymentId: `pi_stub_${crypto.randomUUID()}`,
    }
  },

  async chargeOffSession({ amount, currency, providerPaymentMethodId, idempotencyKey }) {
    return this.charge({ amount, currency, providerPaymentMethodId, idempotencyKey })
  },
}
