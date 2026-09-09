/**
 * Stripe billing webhooks — promotion ad disputes / chargebacks.
 * Mounted with express.raw before JSON parser: POST /webhooks/stripe
 */
import express from 'express'
import { logger } from '../lib/logger.js'
import {
  extractProviderPaymentIdFromStripeEvent,
  verifyAndParseStripeEvent,
} from '../lib/billing/stripe-webhook.js'
import { handlePromotionAdDisputeByProviderPaymentId } from '../lib/billing/promotion-ad-billing.js'

const router = express.Router()

router.post('/', async (req, res) => {
  const signature = req.headers['stripe-signature']
  const rawBody = req.body
  const verified = verifyAndParseStripeEvent(rawBody, signature)

  if (!verified.ok) {
    logger.warn('Stripe webhook rejected', { error: verified.error })
    return res.status(400).json({ ok: false, error: verified.error })
  }

  const event = verified.event
  logger.info('Stripe webhook received', { type: event.type, id: event.id })

  try {
    if (
      event.type === 'charge.dispute.created' ||
      event.type === 'charge.dispute.funds_withdrawn'
    ) {
      const providerPaymentId = extractProviderPaymentIdFromStripeEvent(event)
      const disputeId = event.data?.object?.id || null
      const result = await handlePromotionAdDisputeByProviderPaymentId({
        providerPaymentId,
        reason: event.data?.object?.reason || event.type,
        disputeId,
      })
      return res.json({ ok: true, handled: result.handled, result })
    }

    // Acknowledge other events so Stripe does not retry forever.
    return res.json({ ok: true, handled: false, type: event.type })
  } catch (err) {
    logger.error('Stripe webhook handler failed', { type: event.type, message: err.message })
    return res.status(500).json({ ok: false, error: 'handler_failed' })
  }
})

export { router as stripeWebhookRoutes }
