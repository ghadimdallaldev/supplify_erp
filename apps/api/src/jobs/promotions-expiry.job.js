import { logger } from '../lib/logger.js'
import { deactivateExpiredPromotions } from '../services/promotions.service.js'

export async function runDeactivateExpiredPromotionsJob() {
  const result = await deactivateExpiredPromotions()
  if (result.expiredCount > 0) {
    logger.info('Deactivated expired promotions', result)
  }
  return result
}
