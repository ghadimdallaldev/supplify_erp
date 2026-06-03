import { logger } from '../lib/logger.js'
import { deactivateExpiredPromotions } from '../services/promotions.service.js'
import { notifyDealExpired } from '../services/notification.service.js'
import { query } from '../lib/db.js'

export async function runDeactivateExpiredPromotionsJob() {
  const result = await deactivateExpiredPromotions()
  if (result.expiredCount > 0) {
    logger.info('Deactivated expired promotions', result)
    if (result.ids?.length) {
      const { rows: deals } = await query(`SELECT * FROM promotions WHERE id = ANY($1::uuid[])`, [
        result.ids,
      ])
      for (const deal of deals) {
        notifyDealExpired(deal).catch(() => {})
      }
    }
  }
  return result
}
