import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { extractWhatsAppWebhookEvents } from '../../lib/whatsapp-webhook.js'

function redactPhone(phone) {
  const s = String(phone || '')
  if (s.length <= 4) return '***'
  return `${s.slice(0, 4)}***`
}

async function logWebhookEvent({
  eventType,
  phoneNumberId,
  waMessageId,
  fromPhone,
  toPhone,
  payload,
}) {
  try {
    await query(
      `
      INSERT INTO whatsapp_webhook_log (
        event_type, phone_number_id, wa_message_id, from_phone, to_phone, payload
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [eventType, phoneNumberId, waMessageId, fromPhone, toPhone, JSON.stringify(payload ?? {})]
    )
  } catch (error) {
    if (error.code === '42P01') return
    logger.warn('Failed to record WhatsApp webhook log', { error: error.message })
  }
}

async function updateDeliveryStatus({ waMessageId, metaStatus, errorMessage }) {
  if (!waMessageId || !metaStatus) return

  try {
    await query(
      `
      UPDATE whatsapp_delivery_log
      SET meta_status = $2,
          meta_status_at = now(),
          meta_error = COALESCE($3, meta_error)
      WHERE message_id = $1
      `,
      [waMessageId, metaStatus, errorMessage ? String(errorMessage).slice(0, 500) : null]
    )
  } catch (error) {
    if (error.code === '42P01') return
    logger.warn('Failed to update WhatsApp delivery status from webhook', {
      error: error.message,
      waMessageId,
    })
  }
}

/**
 * Process a verified Meta WhatsApp webhook payload.
 * Never throws — Meta should always receive 200 after signature verification.
 */
export async function processWhatsAppWebhook(payload) {
  const events = extractWhatsAppWebhookEvents(payload)

  for (const event of events) {
    await logWebhookEvent({
      eventType: event.kind,
      phoneNumberId: event.phoneNumberId,
      waMessageId: event.waMessageId,
      fromPhone: event.fromPhone,
      toPhone: event.toPhone,
      payload: event.raw,
    })

    if (event.kind === 'message') {
      logger.info('WhatsApp inbound message received', {
        from: redactPhone(event.fromPhone),
        phoneNumberId: event.phoneNumberId,
        messageType: event.messageType,
      })
      continue
    }

    if (event.kind === 'status') {
      logger.info('WhatsApp delivery status update', {
        waMessageId: event.waMessageId,
        status: event.deliveryStatus,
        to: redactPhone(event.toPhone),
      })
      await updateDeliveryStatus({
        waMessageId: event.waMessageId,
        metaStatus: event.deliveryStatus,
        errorMessage: event.errorMessage,
      })
    }
  }

  return { processed: events.length }
}
