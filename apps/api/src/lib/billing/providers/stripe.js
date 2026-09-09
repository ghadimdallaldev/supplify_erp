/**
 * Stripe billing gateway — Visa/Mastercard via PaymentIntents.
 * Activates when PAYMENTS_SECRET_KEY or STRIPE_SECRET_KEY is set and provider is stripe.
 * Uses Stripe REST (no required SDK) so the monorepo can ship without a hard dep;
 * optional `stripe` package is used when installed.
 */
import crypto from 'node:crypto'
import { config } from '../../../config/env.js'
import { logger } from '../../logger.js'

function getStripeSecret() {
  return (
    process.env.STRIPE_SECRET_KEY ||
    config.PAYMENTS_SECRET_KEY ||
    process.env.PAYMENTS_SECRET_KEY ||
    ''
  ).trim()
}

export function isStripeConfigured() {
  const key = getStripeSecret()
  return Boolean(key && (key.startsWith('sk_') || key.startsWith('rk_')))
}

async function stripeRequest(path, { method = 'POST', body = null, idempotencyKey = null } = {}) {
  const secret = getStripeSecret()
  if (!secret) {
    throw Object.assign(new Error('Stripe secret key is not configured'), {
      code: 'stripe_not_configured',
    })
  }

  const headers = {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey)

  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers,
    body: body ? new URLSearchParams(body).toString() : undefined,
  })
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Stripe request failed')
    err.code = data?.error?.code || 'stripe_error'
    err.status = res.status
    err.raw = data
    throw err
  }
  return data
}

function dollarsToCents(amount) {
  return Math.round(Number(amount) * 100)
}

export const stripeGateway = {
  id: 'stripe',

  async tokenizePaymentMethod({ type, card }) {
    if (type !== 'CARD') {
      throw Object.assign(new Error('Stripe gateway currently supports CARD only'), {
        code: 'unsupported_type',
      })
    }
    const digits = String(card?.number || '').replace(/\D/g, '')
    if (digits.length < 13) {
      throw Object.assign(new Error('Invalid card number'), { code: 'invalid_card' })
    }

    // Prefer Stripe.js / Elements tokens from the client (pci-safe). Server-side
    // card create is for controlled backends / test; never log PAN.
    const pm = await stripeRequest('/payment_methods', {
      body: {
        type: 'card',
        'card[number]': digits,
        'card[exp_month]': String(card.expMonth),
        'card[exp_year]': String(card.expYear),
        'card[cvc]': String(card.cvc || ''),
      },
    })

    let customerId = null
    try {
      const customer = await stripeRequest('/customers', {
        body: {
          'metadata[source]': 'supplify_billing',
        },
      })
      customerId = customer.id
      await stripeRequest(`/payment_methods/${pm.id}/attach`, {
        body: { customer: customerId },
      })
    } catch (err) {
      logger.warn('Stripe customer attach failed; returning PM only', { message: err.message })
    }

    return {
      providerCustomerId: customerId,
      providerPaymentMethodId: pm.id,
      type: 'CARD',
      brand: pm.card?.brand || (digits.startsWith('4') ? 'visa' : 'card'),
      last4: pm.card?.last4 || digits.slice(-4),
      expMonth: pm.card?.exp_month || parseInt(card?.expMonth, 10) || null,
      expYear: pm.card?.exp_year || parseInt(card?.expYear, 10) || null,
    }
  },

  async charge({ amount, currency, providerPaymentMethodId, idempotencyKey, metadata }) {
    try {
      const intent = await stripeRequest('/payment_intents', {
        method: 'POST',
        idempotencyKey: idempotencyKey || `pi_${crypto.randomUUID()}`,
        body: {
          amount: String(dollarsToCents(amount)),
          currency: String(currency || 'usd').toLowerCase(),
          payment_method: providerPaymentMethodId,
          confirm: 'true',
          off_session: 'true',
          'automatic_payment_methods[enabled]': 'false',
          ...(metadata
            ? Object.fromEntries(
                Object.entries(metadata).map(([k, v]) => [`metadata[${k}]`, String(v)])
              )
            : {}),
        },
      })

      if (intent.status === 'succeeded') {
        return {
          status: 'succeeded',
          providerPaymentId: intent.id,
        }
      }
      return {
        status: 'failed',
        providerPaymentId: intent.id,
        failureCode: intent.status,
        failureMessage: `PaymentIntent status ${intent.status}`,
      }
    } catch (err) {
      logger.warn('Stripe charge failed', { code: err.code, message: err.message })
      return {
        status: 'failed',
        providerPaymentId: err.raw?.error?.payment_intent?.id || null,
        failureCode: err.code || 'card_declined',
        failureMessage: err.message || 'Card charge failed',
      }
    }
  },

  async chargeOffSession(args) {
    return this.charge(args)
  },

  async refund({ providerPaymentId, amount, currency, reason, idempotencyKey }) {
    const body = {
      payment_intent: providerPaymentId,
      reason: reason === 'fraudulent' ? 'fraudulent' : 'requested_by_customer',
    }
    if (amount != null) body.amount = String(dollarsToCents(amount))
    if (currency) body.currency = String(currency).toLowerCase()

    const refund = await stripeRequest('/refunds', {
      method: 'POST',
      idempotencyKey: idempotencyKey || `re_${crypto.randomUUID()}`,
      body,
    })
    return {
      status: refund.status === 'succeeded' || refund.status === 'pending' ? 'succeeded' : 'failed',
      providerRefundId: refund.id,
    }
  },
}
