import { logger } from '../lib/logger.js'
import {
  formatWhatsAppAddress,
  getTwilioClient,
  getTwilioWhatsAppFrom,
  isTwilioWhatsAppConfigured,
} from '../lib/twilio-client.js'

/**
 * Send a WhatsApp message server-side via Twilio Programmable Messaging.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM.
 */
export async function sendWhatsAppMessage({ to, message }) {
  if (!to) return { sent: false, reason: 'NO_PHONE' }
  if (!message || !String(message).trim()) {
    return { sent: false, reason: 'NO_MESSAGE' }
  }

  if (!isTwilioWhatsAppConfigured()) {
    logger.debug('WhatsApp not configured — skipping Twilio send')
    return { sent: false, reason: 'NOT_CONFIGURED' }
  }

  const toAddress = formatWhatsAppAddress(to)
  const fromAddress = getTwilioWhatsAppFrom()
  if (!toAddress || !fromAddress) {
    return { sent: false, reason: 'INVALID_PHONE' }
  }

  try {
    const client = getTwilioClient()
    const result = await client.messages.create({
      from: fromAddress,
      to: toAddress,
      body: String(message).trim(),
    })

    logger.info('WhatsApp message sent via Twilio', {
      sid: result.sid,
      status: result.status,
    })

    return { sent: true, sid: result.sid, status: result.status }
  } catch (error) {
    logger.error('Twilio WhatsApp send failed', {
      code: error.code,
      message: error.message,
    })
    return { sent: false, reason: 'SEND_FAILED', error: error.message }
  }
}
