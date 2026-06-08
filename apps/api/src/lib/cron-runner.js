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
  FULFILLMENT_EXCEPTIONS: 'fulfillment_exceptions',
  OPERATIONAL_REMINDERS: 'operational_reminders',
  DRIVER_LOCATION_RETENTION: 'driver_location_retention',
  DELIVERY_ROLLOVER: 'delivery_rollover',
}

const runningJobs = new Set()

function advisoryLockKey(jobName) {
  return `supplify:cron:${jobName}`
}

/**
 * Run a cron handler at most once per tick per cluster (Postgres advisory lock)
 * and at most once concurrently per process (in-memory guard).
 *
 * @returns {Promise<{ ran: boolean, skipped?: string, result?: unknown }>}
 */
export async function runCronJob(jobName, fn) {
  if (!config.CRONS_ENABLED) {
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
    logger.info({ event: 'cron.started', job: jobName })

    try {
      const result = await fn()
      logger.info({
        event: 'cron.completed',
        job: jobName,
        durationMs: Date.now() - startedAt,
      })
      return { ran: true, result }
    } catch (error) {
      logger.error({
        event: 'cron.failed',
        job: jobName,
        durationMs: Date.now() - startedAt,
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
