import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'

export async function claimEmailDelivery({
  eventKey,
  eventType,
  recipient,
  tenantId = null,
  subject = null,
}) {
  if (!eventKey) return { allowed: true, duplicate: false }

  try {
    const {
      rows: [row],
    } = await query(
      `
      INSERT INTO email_delivery_log (
        tenant_id, recipient, event_type, event_key, subject, status, sent_at
      ) VALUES ($1, $2, $3, $4, $5, 'skipped', NULL)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
      `,
      [tenantId, recipient, eventType, eventKey, subject]
    )
    if (!row) {
      logger.info('Email skipped (duplicate event_key)', {
        eventType,
        eventKey,
        recipient: redactEmail(recipient),
        tenantId,
      })
      return { allowed: false, duplicate: true }
    }
    return { allowed: true, duplicate: false, logId: row.id }
  } catch (error) {
    logger.warn('email_delivery_log claim failed — allowing send', {
      error: error.message,
      eventKey,
    })
    return { allowed: true, duplicate: false }
  }
}

export async function finalizeEmailDelivery({
  eventKey,
  status,
  errorMessage = null,
  logId = null,
}) {
  if (!eventKey && !logId) return

  try {
    if (logId) {
      await query(
        `
        UPDATE email_delivery_log
        SET status = $1, error_message = $2,
            sent_at = CASE WHEN $1 IN ('sent', 'log_only') THEN now() ELSE sent_at END
        WHERE id = $3
        `,
        [status, errorMessage, logId]
      )
      return
    }
    await query(
      `
      UPDATE email_delivery_log
      SET status = $1, error_message = $2,
          sent_at = CASE WHEN $1 IN ('sent', 'log_only') THEN now() ELSE sent_at END
      WHERE event_key = $3
      `,
      [status, errorMessage, eventKey]
    )
  } catch (error) {
    logger.warn('email_delivery_log finalize failed', { error: error.message, eventKey, status })
  }
}

function redactEmail(email) {
  if (!email || typeof email !== 'string') return '[none]'
  const [local, domain] = email.split('@')
  if (!domain) return '[redacted]'
  return `${local.slice(0, 2)}***@${domain}`
}
