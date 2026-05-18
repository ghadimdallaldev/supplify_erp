import crypto from 'node:crypto'

/** Admin-recorded or offline payments (bank transfer confirmed manually). */
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
    return {
      status: 'succeeded',
      providerPaymentId: `pi_manual_${crypto.randomUUID()}`,
    }
  },

  async chargeOffSession() {
    return this.charge()
  },
}
