import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { config } from '../config/env.js'
import { sendEmail, sendTemplateEmail } from '../services/email/email.service.js'
import { isTenantIdUnlockedForBackgroundWrites } from '../lib/background-write-locks.js'

const DEFAULT_MAX_RETRIES = 3
const BATCH_LIMIT = 50
const LOCK_EXEMPT_EVENT_PREFIXES = ['billing', 'payment.', 'subscription.']

function isLockExemptEmailEvent(eventType) {
  const normalized = String(eventType || '').toLowerCase()
  return LOCK_EXEMPT_EVENT_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

/**
 * Retry failed transactional emails that have a stored retry_payload.
 */
export async function runEmailRetryJob({
  maxRetries = config.EMAIL_RETRY_MAX_ATTEMPTS,
  batchLimit = BATCH_LIMIT,
  dryRun = false,
} = {}) {
  let scanned = 0
  let retried = 0
  let succeeded = 0
  let skipped = 0

  try {
    const { rows } = await query(
      `
      SELECT id, event_key, event_type, recipient, tenant_id, subject,
             retry_payload, retry_count, error_message
      FROM email_delivery_log
      WHERE status = 'failed'
        AND retry_payload IS NOT NULL
        AND retry_count < $1
        AND created_at >= NOW() - ($2::int || ' days')::interval
        AND (last_retry_at IS NULL OR last_retry_at < NOW() - INTERVAL '1 hour')
        AND (
          tenant_id IS NULL
          OR event_type LIKE 'billing%'
          OR event_type LIKE 'payment.%'
          OR event_type LIKE 'subscription.%'
          OR EXISTS (
            SELECT 1
            FROM subscription sub
            WHERE sub.tenant_id = email_delivery_log.tenant_id
              AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
              AND sub.account_locked_at IS NULL
          )
        )
      ORDER BY created_at ASC
      LIMIT $3
      `,
      [maxRetries, config.EMAIL_RETRY_LOOKBACK_DAYS, batchLimit]
    )

    scanned = rows.length

    for (const row of rows) {
      const payload = row.retry_payload || {}
      const tenantId = payload.tenantId ?? row.tenant_id
      if (tenantId && !isLockExemptEmailEvent(row.event_type)) {
        const unlocked = await isTenantIdUnlockedForBackgroundWrites({ tenantId })
        if (!unlocked) {
          skipped++
          continue
        }
      }

      if (dryRun || process.env.JOB_DRY_RUN === 'true') {
        retried++
        continue
      }

      const nextRetry = (row.retry_count || 0) + 1
      const retryEventKey = `${row.event_key}:retry:${nextRetry}`

      try {
        let result
        if (payload.template) {
          result = await sendTemplateEmail({
            to: payload.to || row.recipient,
            template: payload.template,
            subject: payload.subject || row.subject,
            data: payload.data || {},
            tenantId: payload.tenantId ?? row.tenant_id,
            eventType: row.event_type,
            eventKey: retryEventKey,
            entityId: payload.entityId ?? null,
            skipDedup: false,
          })
        } else {
          result = await sendEmail({
            to: payload.to || row.recipient,
            subject: payload.subject || row.subject,
            html: payload.html,
            text: payload.text,
            tenantId: payload.tenantId ?? row.tenant_id,
            eventType: row.event_type,
            eventKey: retryEventKey,
            entityId: payload.entityId ?? null,
            skipDedup: false,
          })
        }

        await query(
          `
          UPDATE email_delivery_log
          SET retry_count = $2, last_retry_at = now(),
              status = CASE WHEN $3 THEN 'sent' ELSE status END,
              error_message = CASE WHEN $3 THEN NULL ELSE error_message END,
              sent_at = CASE WHEN $3 THEN now() ELSE sent_at END
          WHERE id = $1
          `,
          [row.id, nextRetry, Boolean(result?.sent)]
        )

        retried++
        if (result?.sent) succeeded++
      } catch (err) {
        await query(
          `UPDATE email_delivery_log SET retry_count = $2, last_retry_at = now(), error_message = $3 WHERE id = $1`,
          [row.id, nextRetry, err.message]
        )
        retried++
        logger.error('Email retry attempt failed', { logId: row.id, error: err.message })
      }
    }

    if (retried > 0 || dryRun) {
      logger.info('Email retry job complete', { scanned, retried, succeeded, skipped, dryRun })
    }

    return {
      scanned,
      retried,
      succeeded,
      skipped,
      dryRun: dryRun || process.env.JOB_DRY_RUN === 'true',
    }
  } catch (e) {
    if (e.code === '42P01') {
      logger.debug('email_delivery_log not migrated; skipping email retry job')
      return { scanned: 0, retried: 0, succeeded: 0, skipped: 0, skippedMigration: true }
    }
    throw e
  }
}
