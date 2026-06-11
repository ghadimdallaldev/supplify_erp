import { runExpiryReminderCheck } from '../services/inventory-expiry.service.js'
import {
  recomputeCadencePatterns,
  runCadenceReminderCheck,
} from '../services/reorder-cadence.service.js'
import { logger } from '../lib/logger.js'

/**
 * Daily operational reminders: inventory expiry + missed reorder cadence.
 */
export async function runOperationalRemindersJob({ dryRun = false } = {}) {
  const expiry = await runExpiryReminderCheck({ dryRun })
  const cadenceRecompute = await recomputeCadencePatterns()
  const cadence = await runCadenceReminderCheck({ notify: true })

  logger.info({
    event: 'operational_reminders.completed',
    expiry,
    cadenceRecompute,
    cadence,
  })

  return { expiry, cadenceRecompute, cadence }
}
