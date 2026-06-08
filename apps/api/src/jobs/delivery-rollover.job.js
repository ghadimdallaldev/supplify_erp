import { logger } from '../lib/logger.js'
import { runDeliveryRolloverJob } from '../services/delivery-rollover.service.js'

export async function runDeliveryRolloverCron() {
  const result = await runDeliveryRolloverJob()
  logger.info('Delivery rollover cron finished', result)
  return result
}
