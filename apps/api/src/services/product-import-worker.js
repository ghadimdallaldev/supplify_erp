import { pool } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { processProductImportJob } from './product-import.service.js'

const runningJobs = new Set()

function advisoryLockKey(jobId) {
  return `supplify:product_import:${jobId}`
}

export function isProductImportJobRunning(jobId) {
  return runningJobs.has(String(jobId))
}

async function runProductImportJobWithLock(jobId) {
  const key = String(jobId)

  if (runningJobs.has(key)) {
    logger.debug({
      event: 'product_import.skipped',
      jobId: key,
      reason: 'already_running_in_process',
    })
    return { ran: false, skipped: 'already_running_in_process' }
  }

  runningJobs.add(key)
  const client = await pool.connect()
  let acquired = false

  try {
    const { rows } = await client.query(
      `SELECT pg_try_advisory_lock(hashtext($1::text)) AS acquired`,
      [advisoryLockKey(key)]
    )
    acquired = rows[0]?.acquired === true
    if (!acquired) {
      logger.debug({
        event: 'product_import.skipped',
        jobId: key,
        reason: 'advisory_lock_held',
      })
      return { ran: false, skipped: 'advisory_lock_held' }
    }

    logger.info({ event: 'product_import.started', jobId: key })
    const result = await processProductImportJob(key)
    logger.info({ event: 'product_import.completed', jobId: key, status: result?.status })
    return { ran: true, result }
  } catch (error) {
    logger.error({
      event: 'product_import.failed',
      jobId: key,
      error: error.message,
    })
    throw error
  } finally {
    runningJobs.delete(key)
    if (acquired) {
      await client
        .query(`SELECT pg_advisory_unlock(hashtext($1::text))`, [advisoryLockKey(key)])
        .catch((unlockErr) => {
          logger.warn({
            event: 'product_import.unlock_failed',
            jobId: key,
            error: unlockErr.message,
          })
        })
    }
    client.release()
  }
}

export function startProductImportJob(jobId) {
  setImmediate(() => {
    runProductImportJobWithLock(jobId).catch((err) => {
      logger.error({
        event: 'product_import.background_failed',
        jobId: String(jobId),
        error: err.message,
      })
    })
  })
}

/** @internal — test helper */
export function _clearRunningProductImportJobsForTests() {
  runningJobs.clear()
}
