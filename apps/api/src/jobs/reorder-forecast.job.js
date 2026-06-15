import { logger } from '../lib/logger.js'
import { refreshAllDirtyForecasts } from '../services/reorder-forecast-cache.service.js'

export async function runReorderForecastJob() {
  const result = await refreshAllDirtyForecasts()
  logger.info('Reorder forecast cron finished', result)
  return result
}
