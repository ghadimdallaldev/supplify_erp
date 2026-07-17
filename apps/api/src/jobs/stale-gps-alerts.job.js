import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { listStaleGpsDeliveries } from '../lib/active-gps-deliveries.js'
import { notifyTenantUsers } from '../services/notification.service.js'
import { isGpsTrackingEnabled } from '../lib/delivery-tracking-payload.js'
import { isTenantUnlockedForBackgroundWrites } from '../lib/background-write-locks.js'

/**
 * Proactively alert suppliers when active delivery GPS goes stale.
 */
export async function runStaleGpsAlertsJob({ dryRun = false } = {}) {
  if (!isGpsTrackingEnabled()) {
    return { scanned: 0, notified: 0, skipped: 0, disabled: true }
  }

  const stale = await listStaleGpsDeliveries()
  const today = new Date().toISOString().slice(0, 10)
  let notified = 0
  let skipped = 0

  for (const delivery of stale) {
    const unlocked = await isTenantUnlockedForBackgroundWrites({
      tenantId: delivery.supplierId,
      tenantType: 'SUPPLIER',
    })
    if (!unlocked) {
      skipped++
      continue
    }

    const claim = await query(
      `
      INSERT INTO gps_stale_alert_log (order_id, supplier_id, driver_assignment_id, alert_date)
      VALUES ($1, $2, $3, $4::date)
      ON CONFLICT (order_id, alert_date) DO NOTHING
      RETURNING id
      `,
      [delivery.orderId, delivery.supplierId, delivery.assignmentId, today]
    ).catch((e) => {
      if (e.code === '42P01') return { rows: [] }
      throw e
    })

    if (!claim.rows?.length) {
      skipped++
      continue
    }

    if (dryRun || process.env.JOB_DRY_RUN === 'true') {
      notified++
      continue
    }

    const orderLabel = delivery.orderNumber
      ? `Order #${delivery.orderNumber}`
      : 'An active delivery'
    await notifyTenantUsers({
      tenantId: delivery.supplierId,
      tenantType: 'SUPPLIER',
      notificationType: 'ORDER',
      notificationCategory: 'order_fulfillment_issue',
      title: 'GPS tracking stale',
      message: `${orderLabel} GPS has not updated recently. Check driver tracking.`,
      referenceType: 'ORDER',
      referenceId: delivery.orderId,
      metadata: { link: `/app/supplier/fulfillment?order=${delivery.orderId}` },
    }).catch((err) => {
      logger.error('Stale GPS notification failed', {
        orderId: delivery.orderId,
        error: err.message,
      })
    })

    notified++
  }

  if (notified > 0 || dryRun) {
    logger.info('Stale GPS alerts job complete', {
      scanned: stale.length,
      notified,
      skipped,
      dryRun,
    })
  }

  return {
    scanned: stale.length,
    notified,
    skipped,
    dryRun: dryRun || process.env.JOB_DRY_RUN === 'true',
  }
}
