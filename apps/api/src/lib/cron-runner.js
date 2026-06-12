import { pool } from './db.js'
import { logger } from './logger.js'
import { config } from '../config/env.js'

/** Registry of in-process cron job names (also used for advisory lock keys). */
export const CRON_JOBS = {
  SCHEDULED_ORDERS: 'scheduled_orders',
  INVOICE_OVERDUE: 'invoice_overdue',
  SUBSCRIPTION_BILLING: 'subscription_billing',
  WAITLIST_OFFERS: 'waitlist_offers',
  PROMOTIONS_EXPIRY: 'promotions_expiry',
  INVITATION_EXPIRY: 'invitation_expiry',
  FREE_SANDBOX_EXPIRY: 'free_sandbox_expiry',
  TRIAL_ENDING_SOON: 'trial_ending_soon',
  FULFILLMENT_EXCEPTIONS: 'fulfillment_exceptions',
  OPERATIONAL_REMINDERS: 'operational_reminders',
  DRIVER_LOCATION_RETENTION: 'driver_location_retention',
  DELIVERY_ROLLOVER: 'delivery_rollover',
  EMAIL_RETRY: 'email_retry',
  EMAIL_DIGEST: 'email_digest',
  STALE_GPS_ALERTS: 'stale_gps_alerts',
  LOG_RETENTION: 'log_retention',
  REORDER_FORECAST: 'reorder_forecast',
}

/** Manual HTTP/CLI triggers — bypass CRONS_ENABLED but still use advisory lock. */
export async function runManualCronJob(jobName, fn) {
  return runCronJob(jobName, fn, { manual: true })
}

const runningJobs = new Set()
const MAX_RECENT_FAILURES = 20
const recentCronFailures = []

function advisoryLockKey(jobName) {
  return `supplify:cron:${jobName}`
}

function isPlainResultObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Recent cron failures for admin health (in-memory ring buffer).
 * @returns {Array<{ job: string, error: string, failedAt: string, durationMs?: number }>}
 */
export function getRecentCronFailures() {
  return [...recentCronFailures]
}

function recordCronFailure(jobName, error, durationMs) {
  recentCronFailures.unshift({
    job: jobName,
    error: error?.message || String(error),
    failedAt: new Date().toISOString(),
    durationMs,
  })
  if (recentCronFailures.length > MAX_RECENT_FAILURES) {
    recentCronFailures.length = MAX_RECENT_FAILURES
  }
}

/** @internal — test helper */
export function _clearRecentCronFailuresForTests() {
  recentCronFailures.length = 0
}

/**
 * Run a cron handler at most once per tick per cluster (Postgres advisory lock)
 * and at most once concurrently per process (in-memory guard).
 *
 * @returns {Promise<{ ran: boolean, skipped?: string, result?: unknown, dryRun?: boolean }>}
 */
export async function runCronJob(jobName, fn, { manual = false } = {}) {
  const dryRun = process.env.JOB_DRY_RUN === 'true'

  if (!config.CRONS_ENABLED && !manual) {
    logger.debug({ event: 'cron.disabled', job: jobName })
    return { ran: false, skipped: 'crons_disabled' }
  }

  if (runningJobs.has(jobName)) {
    logger.debug({ event: 'cron.skipped', job: jobName, reason: 'already_running_in_process' })
    return { ran: false, skipped: 'already_running_in_process' }
  }

  runningJobs.add(jobName)

  const client = await pool.connect()
  let acquired = false

  try {
    const { rows } = await client.query(
      `SELECT pg_try_advisory_lock(hashtext($1::text)) AS acquired`,
      [advisoryLockKey(jobName)]
    )
    acquired = rows[0]?.acquired === true
    if (!acquired) {
      logger.debug({ event: 'cron.skipped', job: jobName, reason: 'advisory_lock_held' })
      return { ran: false, skipped: 'advisory_lock_held' }
    }

    const startedAt = Date.now()
    logger.info({ event: 'cron.started', job: jobName, dryRun })

    try {
      const result = await fn()
      const durationMs = Date.now() - startedAt
      const logPayload = {
        event: 'cron.completed',
        job: jobName,
        durationMs,
        dryRun,
      }
      if (isPlainResultObject(result)) {
        Object.assign(logPayload, { result })
      }
      logger.info(logPayload)
      return { ran: true, result, dryRun }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      recordCronFailure(jobName, error, durationMs)
      logger.error({
        event: 'cron.failed',
        job: jobName,
        durationMs,
        dryRun,
        error: error.message,
      })
      throw error
    }
  } finally {
    runningJobs.delete(jobName)
    if (acquired) {
      await client
        .query(`SELECT pg_advisory_unlock(hashtext($1::text))`, [advisoryLockKey(jobName)])
        .catch((unlockErr) => {
          logger.warn({
            event: 'cron.unlock_failed',
            job: jobName,
            error: unlockErr.message,
          })
        })
    }
    client.release()
  }
}

/** @internal — test helper */
export function _clearRunningJobsForTests() {
  runningJobs.clear()
}
