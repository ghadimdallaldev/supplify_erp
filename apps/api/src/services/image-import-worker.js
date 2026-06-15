import { pool } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { processImageImportJob } from './product-image-import.service.js'

const runningJobs = new Set()

function advisoryLockKey(jobId) {
  return `supplify:image_import:${jobId}`
}

export function isImageImportJobRunning(jobId) {
  return runningJobs.has(String(jobId))
}

async function runImageImportJobWithLock(jobId) {
  const key = String(jobId)

  if (runningJobs.has(key)) {
    logger.debug({
      event: 'image_import.skipped',
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
        event: 'image_import.skipped',
        jobId: key,
        reason: 'advisory_lock_held',
      })
      return { ran: false, skipped: 'advisory_lock_held' }
    }

    logger.info({ event: 'image_import.started', jobId: key })
    const result = await processImageImportJob(key)
    logger.info({ event: 'image_import.completed', jobId: key, status: result?.status })
    return { ran: true, result }
  } catch (error) {
    logger.error({
      event: 'image_import.failed',
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
            event: 'image_import.unlock_failed',
            jobId: key,
            error: unlockErr.message,
          })
        })
    }
    client.release()
  }
}

export function startImageImportJob(jobId) {
  setImmediate(() => {
    runImageImportJobWithLock(jobId).catch((err) => {
      logger.error({
        event: 'image_import.background_failed',
        jobId: String(jobId),
        error: err.message,
      })
    })
  })
}

/** @internal — test helper */
export function _clearRunningImageImportJobsForTests() {
  runningJobs.clear()
}
