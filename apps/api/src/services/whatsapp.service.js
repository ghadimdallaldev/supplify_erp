import { logger } from '../lib/logger.js'

/**
 * Send a WhatsApp message server-side.
 * Currently a no-op skeleton. When ready to integrate, replace the body
 * with a Meta Cloud API or Twilio WhatsApp call.
 *
 * TODO: integrate Meta Cloud API (or Twilio) here
 *   Meta: POST https://graph.facebook.com/v18.0/{phone_number_id}/messages
 *   Twilio: client.messages.create({ from: 'whatsapp:+14155238886', to: `whatsapp:${to}`, body: message })
 */
export async function sendWhatsAppMessage({ to, message }) {
  if (!to) return { sent: false, reason: 'NO_PHONE' }

  logger.info('[WhatsApp skeleton] Would send message — provider not configured', {
    to: to.slice(0, 6) + '***',
    messageLength: message?.length ?? 0,
  })

  return { sent: false, reason: 'NOT_CONFIGURED' }
}
