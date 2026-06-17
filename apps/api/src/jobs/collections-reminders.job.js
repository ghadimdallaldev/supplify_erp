import { logger } from '../lib/logger.js'
import { runCollectionsReminderCheck } from '../services/collections-reminders.service.js'

/**
 * Daily collections reminder cron: pre-due, due-today, and overdue milestones.
 */
export async function runCollectionsRemindersJob({ dryRun = false } = {}) {
  const result = await runCollectionsReminderCheck({ dryRun })
  logger.info({ event: 'collections_reminders.completed', result })
  return result
}
