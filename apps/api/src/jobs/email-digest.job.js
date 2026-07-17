import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { config } from '../config/env.js'
import { sendTemplateEmail } from '../services/email/email.service.js'
import { isTenantUnlockedForBackgroundWrites } from '../lib/background-write-locks.js'

const BATCH_USERS = 100

/**
 * Send daily notification digest to users who opted in (notify_email_digest).
 */
export async function runEmailDigestJob({ dryRun = false } = {}) {
  const digestDate = new Date().toISOString().slice(0, 10)
  let scanned = 0
  let sent = 0
  let skipped = 0

  try {
    const { rows: subscribers } = await query(
      `
      SELECT np.user_id, np.user_type, u.email, tenant.tenant_id
      FROM notification_preferences np
      JOIN app_user u ON u.id = np.user_id
      LEFT JOIN LATERAL (
        SELECT candidate.tenant_id
        FROM (
          SELECT r.id AS tenant_id
          FROM restaurant r
          WHERE np.user_type = 'RESTAURANT'
            AND LOWER(r.contact_email) = LOWER(u.email)
          UNION
          SELECT s.id AS tenant_id
          FROM supplier s
          WHERE np.user_type = 'SUPPLIER'
            AND LOWER(s.contact_email) = LOWER(u.email)
          UNION
          SELECT tur.tenant_id
          FROM tenant_user_roles tur
          WHERE tur.user_id = np.user_id
            AND tur.tenant_type = np.user_type
        ) candidate
        JOIN subscription sub ON sub.tenant_id = candidate.tenant_id
          AND sub.tenant_type = np.user_type
          AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
          AND sub.account_locked_at IS NULL
        LIMIT 1
      ) tenant ON true
      WHERE np.notify_email_digest = true
        AND np.email_enabled = true
        AND u.email IS NOT NULL
        AND TRIM(u.email) <> ''
        AND (np.user_type = 'ADMIN' OR tenant.tenant_id IS NOT NULL)
      LIMIT $1
      `,
      [BATCH_USERS]
    )

    scanned = subscribers.length

    for (const sub of subscribers) {
      if (sub.user_type !== 'ADMIN') {
        const unlocked = await isTenantUnlockedForBackgroundWrites({
          tenantId: sub.tenant_id,
          tenantType: sub.user_type,
        })
        if (!unlocked) {
          skipped++
          continue
        }
      }

      const claim = await query(
        `
        INSERT INTO email_digest_log (user_id, user_type, digest_date, notification_count)
        VALUES ($1, $2, $3::date, 0)
        ON CONFLICT (user_id, user_type, digest_date) DO NOTHING
        RETURNING id
        `,
        [sub.user_id, sub.user_type, digestDate]
      )

      if (claim.rows.length === 0) {
        skipped++
        continue
      }

      const { rows: notifications } = await query(
        `
        SELECT title, message, notification_category, created_at
        FROM notification_log
        WHERE user_id = $1
          AND user_type = $2
          AND in_app_sent = true
          AND created_at >= NOW() - ($3::int || ' hours')::interval
        ORDER BY created_at DESC
        LIMIT 50
        `,
        [sub.user_id, sub.user_type, config.EMAIL_DIGEST_LOOKBACK_HOURS]
      )

      if (notifications.length === 0) {
        await query(
          `DELETE FROM email_digest_log WHERE user_id = $1 AND user_type = $2 AND digest_date = $3::date`,
          [sub.user_id, sub.user_type, digestDate]
        )
        skipped++
        continue
      }

      const lines = notifications.map((n) => `• ${n.title}: ${n.message}`.slice(0, 200))
      const summary = `${notifications.length} notification(s) in the last ${config.EMAIL_DIGEST_LOOKBACK_HOURS} hours.`

      if (dryRun || process.env.JOB_DRY_RUN === 'true') {
        sent++
        continue
      }

      const eventKey = `digest:${sub.user_id}:${sub.user_type}:${digestDate}`
      const result = await sendTemplateEmail({
        to: sub.email,
        template: 'notification.digest',
        subject: `Your Supplify digest (${notifications.length} updates)`,
        data: {
          title: 'Your notification digest',
          message: summary,
          items: lines.join('\n'),
          count: notifications.length,
        },
        eventType: 'email_digest',
        eventKey,
        skipDedup: false,
      })

      if (result?.sent || result?.logOnly) {
        await query(
          `UPDATE email_digest_log SET notification_count = $1 WHERE user_id = $2 AND user_type = $3 AND digest_date = $4::date`,
          [notifications.length, sub.user_id, sub.user_type, digestDate]
        )
        sent++
      }
    }

    if (sent > 0 || dryRun) {
      logger.info('Email digest job complete', { scanned, sent, skipped, digestDate, dryRun })
    }

    return {
      scanned,
      sent,
      skipped,
      digestDate,
      dryRun: dryRun || process.env.JOB_DRY_RUN === 'true',
    }
  } catch (e) {
    if (e.code === '42P01') {
      logger.debug('Digest tables not migrated; skipping email digest job')
      return { scanned: 0, sent: 0, skipped: 0, skippedMigration: true }
    }
    throw e
  }
}
