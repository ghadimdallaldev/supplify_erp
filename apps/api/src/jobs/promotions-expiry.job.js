import { logger } from '../lib/logger.js'
import { deactivateExpiredPromotions } from '../services/promotions.service.js'
import { notifyDealExpired } from '../services/notification.service.js'
import { query } from '../lib/db.js'
import { isTenantUnlockedForBackgroundWrites } from '../lib/background-write-locks.js'

export async function runDeactivateExpiredPromotionsJob() {
  const result = await deactivateExpiredPromotions()
  let notificationsSkippedLocked = 0
  if (result.expiredCount > 0) {
    logger.info('Deactivated expired promotions', result)
    if (result.ids?.length) {
      const { rows: deals } = await query(`SELECT * FROM promotions WHERE id = ANY($1::uuid[])`, [
        result.ids,
      ])
      for (const deal of deals) {
        const supplierId = deal.supplier_id || deal.supplierId
        const unlocked = await isTenantUnlockedForBackgroundWrites({
          tenantId: supplierId,
          tenantType: 'SUPPLIER',
        })
        if (!unlocked) {
          notificationsSkippedLocked++
          continue
        }
        notifyDealExpired(deal).catch(() => {})
      }
    }
  }
  return { ...result, notificationsSkippedLocked }
}
