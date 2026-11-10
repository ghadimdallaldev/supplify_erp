import crypto from 'node:crypto'
import { config } from '../../../config/env.js'

/**
 * Admin-recorded or offline payments (bank transfer confirmed manually).
 *
 * SECURITY: manual charges auto-settle only while `manual` is the server-configured gateway
 * (pilot mode, BILLING_GATEWAY=manual). Once a real PSP is configured, a payment method that
 * was stored under `manual` can never settle an invoice on its own.
 */
const MANUAL_PENDING_RESULT = () => ({
  status: 'requires_admin_confirmation',
  providerPaymentId: `pi_manual_${crypto.randomUUID()}`,
  failureCode: 'MANUAL_PAYMENT_REQUIRES_ADMIN_CONFIRMATION',
  failureMessage:
    'Manual payments are not settled automatically. Contact support to confirm your payment.',
})

function manualCharge() {
  if (config.BILLING_GATEWAY !== 'manual') return MANUAL_PENDING_RESULT()
  return {
    status: 'succeeded',
    providerPaymentId: `pi_manual_${crypto.randomUUID()}`,
  }
}

export const manualGateway = {
  id: 'manual',

  async tokenizePaymentMethod({ type, card }) {
    return {
      providerCustomerId: null,
      providerPaymentMethodId: `pm_manual_${crypto.randomUUID()}`,
      type: type === 'BANK_ACCOUNT' ? 'BANK_ACCOUNT' : 'MANUAL',
      brand: null,
      last4: card?.accountLast4 || card?.reference?.slice(-4) || '0000',
      bankName: card?.bankName || 'Manual',
    }
  },

  async charge() {
    return manualCharge()
  },

  async chargeOffSession() {
    return manualCharge()
  },
}
