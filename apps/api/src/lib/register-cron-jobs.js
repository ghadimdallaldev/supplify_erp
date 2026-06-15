import { config } from '../config/env.js'
import { logger } from './logger.js'
import { runCronJob, CRON_JOBS } from './cron-runner.js'
import { executeScheduledOrders } from '../services/scheduled-orders.service.js'
import { checkOverdueInvoices } from '../jobs/invoice-overdue.job.js'
import { runSubscriptionBillingJob } from '../jobs/subscription-billing.job.js'
import { checkExpiredWaitlistOffers } from '../services/waitlistPromotion.js'
import { runDeactivateExpiredPromotionsJob } from '../jobs/promotions-expiry.job.js'
import { runFreeSandboxExpiryJob } from '../jobs/free-sandbox-expiry.job.js'
import { runTrialEndingSoonJob } from '../jobs/trial-ending-soon.job.js'
import { runFulfillmentExceptionChecks } from '../jobs/fulfillment-exceptions.job.js'
import { runDeliveryRolloverCron } from '../jobs/delivery-rollover.job.js'
import { runOperationalRemindersJob } from '../jobs/operational-reminders.job.js'
import { runDriverLocationRetentionJob } from '../jobs/driver-location-retention.job.js'
import { expireOldBranchInvitations } from './branch-invitations.js'
import { expireOldRestaurantInvitations } from './restaurant-invitations.js'
import { runEmailRetryJob } from '../jobs/email-retry.job.js'
import { runEmailDigestJob } from '../jobs/email-digest.job.js'
import { runStaleGpsAlertsJob } from '../jobs/stale-gps-alerts.job.js'
import { runLogRetentionJob } from '../jobs/log-retention.job.js'
import { runReorderForecastJob } from '../jobs/reorder-forecast.job.js'
import { runGrowthProgramMaintenanceJob } from '../jobs/sponsorship-expiry.job.js'

/** @returns {boolean} Whether cron timers should be registered on API boot */
export function shouldRegisterCrons(nodeEnv = config.NODE_ENV) {
  return nodeEnv !== 'test'
}

/**
 * Register all in-process cron jobs. Skipped when NODE_ENV=test or CRONS_ENABLED=false
 * (individual ticks still respect CRONS_ENABLED via runCronJob).
 *
 * @param {{ trackInterval: (fn: () => void, ms: number) => unknown }} deps
 * @returns {{ registered: number, skipped: boolean, reason?: string }}
 */
export function registerCronJobs({ trackInterval }) {
  if (!shouldRegisterCrons()) {
    logger.debug({ event: 'cron.registration_skipped', reason: 'test_env' })
    return { registered: 0, skipped: true, reason: 'test_env' }
  }

  const wrap = (jobName, fn, errorLabel) => () =>
    runCronJob(jobName, fn).catch((err) => logger.error(errorLabel, err))

  const jobs = [
    {
      name: CRON_JOBS.SCHEDULED_ORDERS,
      intervalMs: config.CRON_SCHEDULED_ORDERS_INTERVAL_MS,
      run: wrap(
        CRON_JOBS.SCHEDULED_ORDERS,
        () => executeScheduledOrders(),
        'Error in scheduled orders execution:'
      ),
      label: 'Scheduled orders cron job started',
    },
    {
      name: CRON_JOBS.INVOICE_OVERDUE,
      intervalMs: 24 * 60 * 60 * 1000,
      run: wrap(
        CRON_JOBS.INVOICE_OVERDUE,
        () => checkOverdueInvoices(),
        'Invoice overdue job failed:'
      ),
      label: 'Invoice overdue job started',
    },
    {
      name: CRON_JOBS.SUBSCRIPTION_BILLING,
      intervalMs: 60 * 60 * 1000,
      run: wrap(
        CRON_JOBS.SUBSCRIPTION_BILLING,
        () => runSubscriptionBillingJob(),
        'Subscription billing job failed:'
      ),
      label: 'Subscription billing job started',
    },
    {
      name: CRON_JOBS.WAITLIST_OFFERS,
      intervalMs: 15 * 60 * 1000,
      run: wrap(
        CRON_JOBS.WAITLIST_OFFERS,
        () => checkExpiredWaitlistOffers(),
        'Waitlist expired-offers job failed:'
      ),
      label: 'Waitlist expired-offers job started',
    },
    {
      name: CRON_JOBS.PROMOTIONS_EXPIRY,
      intervalMs: 30 * 60 * 1000,
      run: wrap(
        CRON_JOBS.PROMOTIONS_EXPIRY,
        () => runDeactivateExpiredPromotionsJob(),
        'Promotions expiry job failed:'
      ),
      label: 'Promotions expiry job started',
    },
    {
      name: CRON_JOBS.INVITATION_EXPIRY,
      intervalMs: 60 * 60 * 1000,
      run: wrap(
        CRON_JOBS.INVITATION_EXPIRY,
        () => Promise.all([expireOldBranchInvitations(), expireOldRestaurantInvitations()]),
        'Invitation expiry job failed:'
      ),
      label: 'Invitation expiry job started',
    },
    {
      name: CRON_JOBS.FREE_SANDBOX_EXPIRY,
      intervalMs: 60 * 60 * 1000,
      run: wrap(
        CRON_JOBS.FREE_SANDBOX_EXPIRY,
        () => runFreeSandboxExpiryJob(),
        'Free sandbox expiry job failed:'
      ),
      label: 'Free sandbox expiry job started',
    },
    {
      name: CRON_JOBS.TRIAL_ENDING_SOON,
      intervalMs: 60 * 60 * 1000,
      run: wrap(
        CRON_JOBS.TRIAL_ENDING_SOON,
        () => runTrialEndingSoonJob(),
        'Trial ending-soon job failed:'
      ),
      label: 'Trial ending-soon job started',
    },
    {
      name: CRON_JOBS.FULFILLMENT_EXCEPTIONS,
      intervalMs: 30 * 60 * 1000,
      run: wrap(
        CRON_JOBS.FULFILLMENT_EXCEPTIONS,
        () => runFulfillmentExceptionChecks(),
        'Fulfillment exceptions job failed:'
      ),
      label: 'Fulfillment exceptions job started',
    },
    {
      name: CRON_JOBS.DELIVERY_ROLLOVER,
      intervalMs: config.CRON_DELIVERY_ROLLOVER_INTERVAL_MS,
      run: wrap(
        CRON_JOBS.DELIVERY_ROLLOVER,
        () => runDeliveryRolloverCron(),
        'Delivery rollover job failed:'
      ),
      label: 'Delivery rollover job started',
      extraLog: { enabled: config.DELIVERY_ROLLOVER_ENABLED },
    },
    {
      name: CRON_JOBS.OPERATIONAL_REMINDERS,
      intervalMs: config.CRON_OPERATIONAL_REMINDERS_INTERVAL_MS,
      run: wrap(
        CRON_JOBS.OPERATIONAL_REMINDERS,
        () => runOperationalRemindersJob(),
        'Operational reminders job failed:'
      ),
      label: 'Operational reminders job started',
    },
    {
      name: CRON_JOBS.DRIVER_LOCATION_RETENTION,
      intervalMs: 24 * 60 * 60 * 1000,
      run: wrap(
        CRON_JOBS.DRIVER_LOCATION_RETENTION,
        () => runDriverLocationRetentionJob(),
        'Driver location retention job failed:'
      ),
      label: 'Driver location retention job started',
    },
    {
      name: CRON_JOBS.EMAIL_RETRY,
      intervalMs: config.CRON_EMAIL_RETRY_INTERVAL_MS,
      run: wrap(CRON_JOBS.EMAIL_RETRY, () => runEmailRetryJob(), 'Email retry job failed:'),
      label: 'Email retry job started',
    },
    {
      name: CRON_JOBS.EMAIL_DIGEST,
      intervalMs: config.CRON_EMAIL_DIGEST_INTERVAL_MS,
      run: wrap(CRON_JOBS.EMAIL_DIGEST, () => runEmailDigestJob(), 'Email digest job failed:'),
      label: 'Email digest job started',
    },
    {
      name: CRON_JOBS.STALE_GPS_ALERTS,
      intervalMs: config.CRON_STALE_GPS_INTERVAL_MS,
      run: wrap(
        CRON_JOBS.STALE_GPS_ALERTS,
        () => runStaleGpsAlertsJob(),
        'Stale GPS alerts job failed:'
      ),
      label: 'Stale GPS alerts job started',
    },
    {
      name: CRON_JOBS.LOG_RETENTION,
      intervalMs: config.CRON_LOG_RETENTION_INTERVAL_MS,
      run: wrap(CRON_JOBS.LOG_RETENTION, () => runLogRetentionJob(), 'Log retention job failed:'),
      label: 'Log retention job started',
    },
    {
      name: CRON_JOBS.REORDER_FORECAST,
      intervalMs: 24 * 60 * 60 * 1000,
      run: wrap(
        CRON_JOBS.REORDER_FORECAST,
        () => runReorderForecastJob(),
        'Reorder forecast job failed:'
      ),
      label: 'Reorder forecast job started',
    },
    {
      name: CRON_JOBS.GROWTH_PROGRAM_MAINTENANCE,
      intervalMs: 60 * 60 * 1000,
      run: wrap(
        CRON_JOBS.GROWTH_PROGRAM_MAINTENANCE,
        () => runGrowthProgramMaintenanceJob(),
        'Growth program maintenance job failed:'
      ),
      label: 'Growth program maintenance job started',
    },
  ]

  for (const job of jobs) {
    job.run()
    trackInterval(job.run, job.intervalMs)
    logger.info(job.label, { intervalMs: job.intervalMs, job: job.name, ...job.extraLog })
  }

  logger.info({
    event: 'cron.registration_complete',
    jobCount: jobs.length,
    cronsEnabled: config.CRONS_ENABLED,
  })
  return { registered: jobs.length, skipped: false }
}
