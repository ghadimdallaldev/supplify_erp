import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import {
  extractProviderPaymentIdFromStripeEvent,
  verifyAndParseStripeEvent,
} from './stripe-webhook.js'

function sign(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${payload}`
  const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return { header: `t=${timestamp},v1=${sig}`, timestamp }
}

describe('stripe-webhook', () => {
  it('verifies a valid Stripe signature', () => {
    const secret = 'whsec_test_secret'
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_1', payment_intent: 'pi_abc', reason: 'fraudulent' } },
    })
    const { header } = sign(payload, secret)
    const result = verifyAndParseStripeEvent(payload, header, secret)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.event.type).toBe('charge.dispute.created')
      expect(extractProviderPaymentIdFromStripeEvent(result.event)).toBe('pi_abc')
    }
  })

  it('rejects bad signatures', () => {
    const result = verifyAndParseStripeEvent('{}', 't=1,v1=deadbeef', 'whsec_test_secret')
    expect(result.ok).toBe(false)
  })
})
