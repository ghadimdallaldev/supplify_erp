import { processRecipeRecalcQueue } from '../services/recipe-recalc-queue.service.js'
import { logger } from '../lib/logger.js'

export async function runRecipeRecalcJob() {
  const result = await processRecipeRecalcQueue()
  if (result.processed > 0 || result.errors > 0) {
    logger.info({
      event: 'recipe_recalc.job_complete',
      processed: result.processed,
      errors: result.errors,
    })
  }
  return result
}
