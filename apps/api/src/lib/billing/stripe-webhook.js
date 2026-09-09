/**
 * Stripe webhook signature verify + event parse (no SDK required).
 * Uses PAYMENTS_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET (whsec_…).
 */
import crypto from 'node:crypto'
import { config } from '../../config/env.js'

export function getStripeWebhookSecret() {
  return (
    process.env.STRIPE_WEBHOOK_SECRET ||
    config.PAYMENTS_WEBHOOK_SECRET ||
    process.env.PAYMENTS_WEBHOOK_SECRET ||
    ''
  ).trim()
}

/**
 * Verify Stripe-Signature header against raw body.
 * @returns {{ ok: true, event: object } | { ok: false, error: string }}
 */
export function verifyAndParseStripeEvent(
  rawBody,
  signatureHeader,
  secret = getStripeWebhookSecret()
) {
  if (!secret) {
    return { ok: false, error: 'webhook_secret_missing' }
  }
  if (!rawBody || !signatureHeader) {
    return { ok: false, error: 'missing_signature_or_body' }
  }

  const parts = String(signatureHeader)
    .split(',')
    .map((p) => p.trim())
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2)
  const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3))
  if (!timestamp || signatures.length === 0) {
    return { ok: false, error: 'malformed_signature' }
  }

  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))
  if (!Number.isFinite(ageSec) || ageSec > 300) {
    return { ok: false, error: 'timestamp_out_of_tolerance' }
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)
  const signedPayload = `${timestamp}.${payload}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')

  const valid = signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))
    } catch {
      return false
    }
  })
  if (!valid) {
    return { ok: false, error: 'signature_mismatch' }
  }

  try {
    const event = JSON.parse(payload)
    return { ok: true, event }
  } catch {
    return { ok: false, error: 'invalid_json' }
  }
}

/**
 * Extract PaymentIntent / Charge id from dispute or charge.refunded payloads.
 */
export function extractProviderPaymentIdFromStripeEvent(event) {
  const obj = event?.data?.object
  if (!obj) return null
  if (event.type?.startsWith('charge.dispute')) {
    return obj.payment_intent || obj.charge || null
  }
  if (event.type === 'charge.refunded' || event.type === 'charge.refund.updated') {
    return obj.payment_intent || obj.id || null
  }
  if (event.type?.startsWith('payment_intent.')) {
    return obj.id || null
  }
  return null
}
