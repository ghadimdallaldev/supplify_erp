/**
 * Registry of manual job runners for apps/api/scripts/run-job.mjs
 */
import { CRON_JOBS } from '../src/lib/cron-runner.js'
import { executeScheduledOrders } from '../src/services/scheduled-orders.service.js'
import { checkOverdueInvoices } from '../src/jobs/invoice-overdue.job.js'
import { runSubscriptionBillingJob } from '../src/jobs/subscription-billing.job.js'
import { checkExpiredWaitlistOffers } from '../src/services/waitlistPromotion.js'
import { runDeactivateExpiredPromotionsJob } from '../src/jobs/promotions-expiry.job.js'
import { runFreeSandboxExpiryJob } from '../src/jobs/free-sandbox-expiry.job.js'
import { runTrialEndingSoonJob, previewTrialEndingSoonJob } from '../src/jobs/trial-ending-soon.job.js'
import { runFulfillmentExceptionChecks } from '../src/jobs/fulfillment-exceptions.job.js'
import { runDeliveryRolloverJob } from '../src/services/delivery-rollover.service.js'
import { runOperationalRemindersJob } from '../src/jobs/operational-reminders.job.js'
import { runDriverLocationRetentionJob } from '../src/jobs/driver-location-retention.job.js'
import { expireOldBranchInvitations } from '../src/lib/branch-invitations.js'
import { expireOldRestaurantInvitations } from '../src/lib/restaurant-invitations.js'
import { runExpiryReminderCheck } from '../src/services/inventory-expiry.service.js'
import {
  recomputeCadencePatterns,
  runCadenceReminderCheck,
} from '../src/services/reorder-cadence.service.js'
import { query } from '../src/lib/db.js'
import { runEmailRetryJob } from '../src/jobs/email-retry.job.js'
import { runEmailDigestJob } from '../src/jobs/email-digest.job.js'
import { runStaleGpsAlertsJob } from '../src/jobs/stale-gps-alerts.job.js'
import { runLogRetentionJob } from '../src/jobs/log-retention.job.js'
import { listStaleGpsDeliveries } from '../src/lib/active-gps-deliveries.js'

export const JOB_ALIASES = {
  'scheduled-orders': CRON_JOBS.SCHEDULED_ORDERS,
  'invoice-overdue': CRON_JOBS.INVOICE_OVERDUE,
  'subscription-billing': CRON_JOBS.SUBSCRIPTION_BILLING,
  'waitlist-offers': CRON_JOBS.WAITLIST_OFFERS,
  'promotions-expiry': CRON_JOBS.PROMOTIONS_EXPIRY,
  'invitation-expiry': CRON_JOBS.INVITATION_EXPIRY,
  'free-sandbox-expiry': CRON_JOBS.FREE_SANDBOX_EXPIRY,
  'trial-ending-soon': CRON_JOBS.TRIAL_ENDING_SOON,
  'fulfillment-exceptions': CRON_JOBS.FULFILLMENT_EXCEPTIONS,
  'delivery-rollover': CRON_JOBS.DELIVERY_ROLLOVER,
  'operational-reminders': CRON_JOBS.OPERATIONAL_REMINDERS,
  'inventory-expiry': 'inventory_expiry',
  'reorder-cadence': 'reorder_cadence',
  'driver-location-retention': CRON_JOBS.DRIVER_LOCATION_RETENTION,
  'email-retry': CRON_JOBS.EMAIL_RETRY,
  'email-digest': CRON_JOBS.EMAIL_DIGEST,
  'stale-gps-alerts': CRON_JOBS.STALE_GPS_ALERTS,
  'log-retention': CRON_JOBS.LOG_RETENTION,
}

export function listJobs() {
  return Object.keys(JOB_ALIASES).sort()
}

async function previewInvoiceOverdue() {
  const { rows } = await query(
    `SELECT id, invoice_number, restaurant_id, supplier_id, due_date
     FROM invoice
     WHERE status IN ('ISSUED', 'PARTIALLY_PAID')
       AND due_date < CURRENT_DATE
       AND overdue_notified_at IS NULL
     LIMIT 50`
  )
  return { wouldProcess: rows.length, sample: rows.slice(0, 10) }
}

async function previewFreeSandboxExpiry() {
  const { rows } = await query(
    `
    SELECT s.tenant_id, s.tenant_type, s.free_sandbox_expires_at
    FROM subscription s
    JOIN subscription_plan sp ON sp.id = s.plan_id
    WHERE sp.code = 'free'
      AND s.status IN ('TRIALING', 'ACTIVE')
      AND s.free_sandbox_expires_at IS NOT NULL
      AND s.free_sandbox_expires_at < now()
      AND (s.lock_reason IS DISTINCT FROM 'free_sandbox_expired' OR s.account_locked_at IS NULL)
    LIMIT 50
    `
  )
  return { wouldLock: rows.length, sample: rows.slice(0, 10) }
}

async function previewPromotionsExpiry() {
  const scheduled = await query(
    `SELECT id FROM promotions WHERE status = 'scheduled' AND starts_at <= NOW()
     AND COALESCE(payment_status, 'not_required') IN ('not_required', 'paid') LIMIT 50`
  )
  const expired = await query(
    `SELECT id FROM promotions WHERE status IN ('active', 'scheduled')
     AND ((boost_end_at IS NOT NULL AND boost_end_at < NOW())
       OR (ends_at IS NOT NULL AND ends_at < NOW()))
     LIMIT 50`
  )
  return {
    wouldActivateScheduled: scheduled.rows.length,
    wouldExpire: expired.rows.length,
    sampleActivateIds: scheduled.rows.slice(0, 5).map((r) => r.id),
    sampleExpireIds: expired.rows.slice(0, 5).map((r) => r.id),
  }
}

/**
 * @param {string} alias
 * @param {{ dryRun?: boolean, tenantId?: string, force?: boolean }} options
 */
export async function runJobByAlias(alias, { dryRun = false, tenantId = null, force = false } = {}) {
  const key = JOB_ALIASES[alias]
  if (!key) {
    throw new Error(`Unknown job: ${alias}. Use --list to see available jobs.`)
  }

  if (dryRun) {
    process.env.JOB_DRY_RUN = 'true'
  }

  switch (key) {
    case CRON_JOBS.SCHEDULED_ORDERS:
      if (dryRun) {
        const { rows } = await query(
          `SELECT id, restaurant_id, name FROM quick_list WHERE is_scheduled = true AND is_active = true LIMIT 50`
        )
        return { wouldScan: rows.length, sample: rows.slice(0, 10) }
      }
      return executeScheduledOrders()

    case CRON_JOBS.INVOICE_OVERDUE:
      if (dryRun) return previewInvoiceOverdue()
      return checkOverdueInvoices()

    case CRON_JOBS.SUBSCRIPTION_BILLING:
      if (dryRun) {
        return {
          note: 'Dry-run skips payment charges. Run without --dry-run in dev only.',
          skipped: true,
        }
      }
      return runSubscriptionBillingJob()

    case CRON_JOBS.WAITLIST_OFFERS:
      if (dryRun) {
        return {
          note: 'Waitlist dry-run not implemented; use staging with CRONS_ENABLED=false on other replicas',
          skipped: true,
        }
      }
      return checkExpiredWaitlistOffers()

    case CRON_JOBS.PROMOTIONS_EXPIRY:
      if (dryRun) return previewPromotionsExpiry()
      return runDeactivateExpiredPromotionsJob()

    case CRON_JOBS.INVITATION_EXPIRY:
      if (dryRun) {
        const branch = await query(
          `SELECT COUNT(*)::int AS count FROM branch_invitations WHERE status = 'pending' AND expires_at < NOW()`
        )
        const restaurant = await query(
          `SELECT COUNT(*)::int AS count FROM restaurant_invitations WHERE status = 'pending' AND expires_at < NOW()`
        )
        return {
          wouldExpireBranch: branch.rows[0]?.count ?? 0,
          wouldExpireRestaurant: restaurant.rows[0]?.count ?? 0,
        }
      }
      return Promise.all([expireOldBranchInvitations(), expireOldRestaurantInvitations()])

    case CRON_JOBS.FREE_SANDBOX_EXPIRY:
      if (dryRun) return previewFreeSandboxExpiry()
      return runFreeSandboxExpiryJob()

    case CRON_JOBS.TRIAL_ENDING_SOON:
      if (dryRun) return previewTrialEndingSoonJob()
      return runTrialEndingSoonJob({ dryRun: false })

    case CRON_JOBS.FULFILLMENT_EXCEPTIONS:
      return runFulfillmentExceptionChecks()

    case CRON_JOBS.DELIVERY_ROLLOVER:
      return runDeliveryRolloverJob({ force: force || dryRun, tenantId })

    case CRON_JOBS.OPERATIONAL_REMINDERS:
      if (dryRun) {
        const expiry = await runExpiryReminderCheck({ dryRun: true, restaurantId: tenantId })
        const cadence = await runCadenceReminderCheck({ notify: false })
        return { expiry, cadence, dryRun: true }
      }
      return runOperationalRemindersJob()

    case 'inventory_expiry':
      return runExpiryReminderCheck({ dryRun, restaurantId: tenantId })

    case 'reorder_cadence':
      if (dryRun) {
        const missed = await runCadenceReminderCheck({ notify: false })
        return { ...missed, dryRun: true }
      }
      const recompute = await recomputeCadencePatterns({ restaurantId: tenantId })
      const cadence = await runCadenceReminderCheck({ notify: true })
      return { recompute, cadence }

    case CRON_JOBS.DRIVER_LOCATION_RETENTION:
      if (dryRun) {
        return { note: 'Retention dry-run not implemented; job deletes old GPS pings', skipped: true }
      }
      return runDriverLocationRetentionJob()

    case CRON_JOBS.EMAIL_RETRY:
      return runEmailRetryJob({ dryRun })

    case CRON_JOBS.EMAIL_DIGEST:
      return runEmailDigestJob({ dryRun })

    case CRON_JOBS.STALE_GPS_ALERTS:
      if (dryRun) {
        const stale = await listStaleGpsDeliveries()
        return { wouldNotify: stale.length, sample: stale.slice(0, 10), dryRun: true }
      }
      return runStaleGpsAlertsJob()

    case CRON_JOBS.LOG_RETENTION:
      return runLogRetentionJob({ dryRun })

    default:
      throw new Error(`Job handler not implemented for ${alias}`)
  }
}
