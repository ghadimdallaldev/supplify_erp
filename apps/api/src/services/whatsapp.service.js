import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { formatE164 } from '../lib/whatsapp.js'
import { logWhatsAppDelivery } from './whatsapp/whatsapp-delivery-log.js'

/**
 * WhatsApp delivery via the Meta (WhatsApp) Cloud API.
 *
 * Modes (mirrors the email service):
 *  - WHATSAPP_ENABLED=false            → skipped ('DISABLED')
 *  - WHATSAPP_LOG_ONLY=true            → logged, counted as sent ('log_only')
 *  - access token + phone number id    → real Cloud API send
 *  - otherwise                         → 'NOT_CONFIGURED'
 */

export function isWhatsAppConfigured() {
  return Boolean(config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID)
}

export function resolveWhatsAppProvider() {
  if (!config.WHATSAPP_ENABLED) return 'disabled'
  if (config.WHATSAPP_LOG_ONLY) return 'log_only'
  if (isWhatsAppConfigured()) return 'meta_cloud'
  return 'none'
}

function redact(recipient) {
  const s = String(recipient || '')
  if (s.length <= 4) return '***'
  return `${s.slice(0, 4)}***${s.slice(-2)}`
}

/**
 * Send a WhatsApp message server-side.
 *
 * @param {object} params
 * @param {string} params.to - Recipient phone (any format; normalized to E.164).
 * @param {string} params.message - Plain text body.
 * @param {string|null} [params.tenantId] - For delivery-log attribution.
 * @param {string} [params.eventType] - For delivery-log attribution.
 * @param {string|null} [params.eventKey] - For delivery-log attribution.
 * @returns {Promise<{ sent: boolean, reason?: string, messageId?: string, provider?: string, logOnly?: boolean, skipped?: boolean, error?: string }>}
 */
export async function sendWhatsAppMessage({
  to,
  message,
  tenantId = null,
  eventType = 'notification',
  eventKey = null,
}) {
  if (!to) return { sent: false, reason: 'NO_PHONE' }
  if (!message || !String(message).trim()) {
    return { sent: false, reason: 'NO_MESSAGE' }
  }

  const recipient = formatE164(to)
  if (!recipient) return { sent: false, reason: 'NO_PHONE' }

  if (!config.WHATSAPP_ENABLED) {
    logger.info('WhatsApp skipped (WHATSAPP_ENABLED=false)', { to: redact(recipient) })
    await logWhatsAppDelivery({
      tenantId,
      recipient,
      eventType,
      eventKey,
      status: 'skipped',
      provider: 'disabled',
    })
    return { sent: false, skipped: true, reason: 'DISABLED' }
  }

  if (config.WHATSAPP_LOG_ONLY) {
    logger.info('WhatsApp (log only)', {
      to: redact(recipient),
      eventType,
      preview: String(message).slice(0, 200),
    })
    await logWhatsAppDelivery({
      tenantId,
      recipient,
      eventType,
      eventKey,
      status: 'log_only',
      provider: 'log_only',
    })
    return { sent: true, logOnly: true, provider: 'log_only' }
  }

  if (!isWhatsAppConfigured()) {
    logger.debug('WhatsApp server send not configured — skipping', { to: redact(recipient) })
    await logWhatsAppDelivery({
      tenantId,
      recipient,
      eventType,
      eventKey,
      status: 'skipped',
      provider: 'none',
      errorMessage: 'NOT_CONFIGURED',
    })
    return { sent: false, reason: 'NOT_CONFIGURED' }
  }

  const apiVersion = config.WHATSAPP_API_VERSION || 'v21.0'
  const url = `https://graph.facebook.com/${apiVersion}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        // Meta expects the number without the leading '+'.
        to: recipient.replace(/^\+/, ''),
        type: 'text',
        text: { preview_url: false, body: String(message) },
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const reason = data?.error?.message || `HTTP_${response.status}`
      logger.error('WhatsApp send failed', {
        status: response.status,
        reason,
        to: redact(recipient),
      })
      await logWhatsAppDelivery({
        tenantId,
        recipient,
        eventType,
        eventKey,
        status: 'failed',
        provider: 'meta_cloud',
        errorMessage: reason,
      })
      return { sent: false, reason: 'PROVIDER_ERROR', error: reason }
    }

    const messageId = data?.messages?.[0]?.id || null
    logger.info('WhatsApp sent', { to: redact(recipient), messageId })
    await logWhatsAppDelivery({
      tenantId,
      recipient,
      eventType,
      eventKey,
      status: 'sent',
      provider: 'meta_cloud',
      messageId,
    })
    return { sent: true, messageId, provider: 'meta_cloud' }
  } catch (error) {
    logger.error('WhatsApp send error', { error: error.message, to: redact(recipient) })
    await logWhatsAppDelivery({
      tenantId,
      recipient,
      eventType,
      eventKey,
      status: 'failed',
      provider: 'meta_cloud',
      errorMessage: error.message,
    })
    return { sent: false, reason: 'PROVIDER_ERROR', error: error.message }
  }
}
