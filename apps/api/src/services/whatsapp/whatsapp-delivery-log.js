import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'

/**
 * Best-effort audit of a WhatsApp delivery attempt. Never throws — delivery
 * logging must not break the notification path. Silently ignores a missing
 * table (42P01) so the service works before the migration is applied in tests.
 *
 * @param {object} entry
 * @param {string|null} [entry.tenantId]
 * @param {string} entry.recipient - E.164 formatted recipient (or raw digits).
 * @param {string} [entry.eventType]
 * @param {string|null} [entry.eventKey]
 * @param {'sent'|'log_only'|'skipped'|'failed'} entry.status
 * @param {string|null} [entry.provider]
 * @param {string|null} [entry.messageId]
 * @param {string|null} [entry.errorMessage]
 */
export async function logWhatsAppDelivery({
  tenantId = null,
  recipient,
  eventType = 'notification',
  eventKey = null,
  status,
  provider = null,
  messageId = null,
  errorMessage = null,
}) {
  try {
    await query(
      `
      INSERT INTO whatsapp_delivery_log (
        tenant_id, recipient, event_type, event_key, status, provider, message_id, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        tenantId,
        String(recipient || ''),
        eventType,
        eventKey,
        status,
        provider,
        messageId,
        errorMessage ? String(errorMessage).slice(0, 500) : null,
      ]
    )
  } catch (error) {
    if (error.code === '42P01') return
    logger.warn('Failed to record WhatsApp delivery log', { error: error.message })
  }
}
