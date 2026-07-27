import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  extractWhatsAppWebhookEvents,
  verifyWhatsAppChallenge,
  verifyWhatsAppSignature,
} from './whatsapp-webhook.js'

describe('whatsapp-webhook helpers', () => {
  describe('verifyWhatsAppChallenge', () => {
    it('returns challenge when mode and token match', () => {
      const result = verifyWhatsAppChallenge(
        {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'my-secret',
          'hub.challenge': '12345',
        },
        'my-secret'
      )
      expect(result).toEqual({ ok: true, challenge: '12345' })
    })

    it('rejects invalid verify token', () => {
      const result = verifyWhatsAppChallenge(
        {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong',
          'hub.challenge': '12345',
        },
        'my-secret'
      )
      expect(result.ok).toBe(false)
    })
  })

  describe('verifyWhatsAppSignature', () => {
    it('accepts a valid signature', () => {
      const body = Buffer.from('{"object":"whatsapp_business_account"}')
      const secret = 'app-secret'
      const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
      expect(verifyWhatsAppSignature(body, signature, secret)).toBe(true)
    })

    it('rejects an invalid signature', () => {
      const body = Buffer.from('{"object":"whatsapp_business_account"}')
      expect(verifyWhatsAppSignature(body, 'sha256=deadbeef', 'app-secret')).toBe(false)
    })
  })

  describe('extractWhatsAppWebhookEvents', () => {
    it('extracts inbound messages and delivery statuses', () => {
      const events = extractWhatsAppWebhookEvents({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: '100', display_phone_number: '15550001111' },
                  messages: [
                    {
                      id: 'wamid.in',
                      from: '96170123456',
                      type: 'text',
                      text: { body: 'Hello' },
                    },
                  ],
                  statuses: [
                    {
                      id: 'wamid.out',
                      status: 'delivered',
                      recipient_id: '96170987654',
                    },
                  ],
                },
              },
            ],
          },
        ],
      })

      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({
        kind: 'message',
        waMessageId: 'wamid.in',
        fromPhone: '96170123456',
        textBody: 'Hello',
      })
      expect(events[1]).toMatchObject({
        kind: 'status',
        waMessageId: 'wamid.out',
        deliveryStatus: 'delivered',
        toPhone: '96170987654',
      })
    })
  })
})
