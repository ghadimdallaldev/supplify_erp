import { logger } from '../lib/logger.js'

/**
 * Send a WhatsApp message server-side.
 * Returns NOT_CONFIGURED until Meta Cloud API is wired (Phase 2).
 */
export async function sendWhatsAppMessage({ to, message }) {
  if (!to) return { sent: false, reason: 'NO_PHONE' }
  if (!message || !String(message).trim()) {
    return { sent: false, reason: 'NO_MESSAGE' }
  }

  logger.debug('WhatsApp server send not configured — skipping')
  return { sent: false, reason: 'NOT_CONFIGURED' }
}
