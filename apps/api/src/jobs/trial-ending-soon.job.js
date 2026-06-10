import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { notifyBillingTrialEnding } from '../services/notification.service.js'

const REMINDER_WINDOWS_DAYS = [2, 1]

/**
 * Notify free-trial tenants before sandbox expiry (2-day and 1-day reminders).
 */
export async function runTrialEndingSoonJob({ dryRun = false } = {}) {
  let scanned = 0
  let notified = 0
  let skipped = 0

  try {
    for (const daysLeft of REMINDER_WINDOWS_DAYS) {
      const { rows } = await query(
        `
      SELECT s.tenant_id, s.tenant_type, s.free_sandbox_expires_at::date AS expiry_date
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      WHERE sp.code = 'free'
        AND s.status IN ('TRIALING', 'ACTIVE')
        AND s.free_sandbox_expires_at IS NOT NULL
        AND s.account_locked_at IS NULL
        AND s.free_sandbox_expires_at::date = (CURRENT_DATE + ($1::int || ' days')::interval)::date
      `,
        [daysLeft]
      )

      scanned += rows.length

      for (const row of rows) {
        const claim = await query(
          `
        INSERT INTO billing_trial_reminder_log (tenant_id, tenant_type, expiry_date, days_left)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, tenant_type, expiry_date, days_left) DO NOTHING
        RETURNING id
        `,
          [row.tenant_id, row.tenant_type, row.expiry_date, daysLeft]
        )

        if (claim.rows.length === 0) {
          skipped++
          continue
        }

        if (dryRun || process.env.JOB_DRY_RUN === 'true') {
          notified++
          continue
        }

        const sent = await notifyBillingTrialEnding({
          tenantId: row.tenant_id,
          tenantType: row.tenant_type,
          daysLeft,
          trialEndsAt: String(row.expiry_date),
        }).catch((err) => {
          logger.error('Trial ending-soon notification failed', {
            tenantId: row.tenant_id,
            error: err.message,
          })
          return null
        })

        if (sent) notified++
      }
    }

    if (notified > 0 || (dryRun && scanned > skipped)) {
      logger.info('Trial ending-soon job complete', { scanned, notified, skipped, dryRun })
    }

    return { scanned, notified, skipped, dryRun: dryRun || process.env.JOB_DRY_RUN === 'true' }
  } catch (e) {
    if (e.code === '42P01') {
      logger.debug('Trial reminder tables not migrated yet; skipping trial-ending-soon job')
      return { scanned: 0, notified: 0, skipped: 0, skippedMigration: true }
    }
    throw e
  }
}

/**
 * Dry-run preview: tenants that would receive reminders (no claim, no notify).
 */
export async function previewTrialEndingSoonJob() {
  const previews = []
  for (const daysLeft of REMINDER_WINDOWS_DAYS) {
    const { rows } = await query(
      `
      SELECT s.tenant_id, s.tenant_type, s.free_sandbox_expires_at::date AS expiry_date
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      WHERE sp.code = 'free'
        AND s.status IN ('TRIALING', 'ACTIVE')
        AND s.free_sandbox_expires_at IS NOT NULL
        AND s.account_locked_at IS NULL
        AND s.free_sandbox_expires_at::date = (CURRENT_DATE + ($1::int || ' days')::interval)::date
        AND NOT EXISTS (
          SELECT 1 FROM billing_trial_reminder_log l
          WHERE l.tenant_id = s.tenant_id
            AND l.tenant_type = s.tenant_type
            AND l.expiry_date = s.free_sandbox_expires_at::date
            AND l.days_left = $1
        )
      LIMIT 50
      `,
      [daysLeft]
    )
    previews.push(...rows.map((r) => ({ ...r, daysLeft })))
  }
  return { wouldNotify: previews.length, sample: previews.slice(0, 10) }
}
