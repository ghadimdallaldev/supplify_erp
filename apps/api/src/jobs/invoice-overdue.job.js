import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { notifyInvoiceOverdue } from '../services/notification.service.js'
import { isTenantUnlockedForBackgroundWrites } from '../lib/background-write-locks.js'
import { getDefaultTenantTimezone } from '../lib/tenant-timezone.js'

export async function checkOverdueInvoices() {
  // M7: fetch candidates without subscription check in SQL; resolve org billing tenant in JS.
  const { rows: candidates } = await query(
    `SELECT invoice.id, invoice.restaurant_id, invoice.supplier_id
     FROM invoice
     JOIN restaurant r ON r.id = invoice.restaurant_id
     WHERE invoice.status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')
       AND invoice.due_date < (now() AT TIME ZONE COALESCE(NULLIF(TRIM(r.timezone), ''), $1))::date
       AND invoice.balance_due > 0
       AND invoice.overdue_notified_at IS NULL`,
    [getDefaultTenantTimezone()]
  )

  logger.info('Invoice overdue job running', { count: candidates.length })
  if (candidates.length === 0) return { processed: 0, notified: 0, skippedLocked: 0 }

  const { resolveOrgBillingTenantId } = await import('../lib/org-billing-tenant.js')

  let notified = 0
  let skippedLocked = 0
  for (const { id, restaurant_id: restaurantId, supplier_id: supplierId } of candidates) {
    try {
      // M7: Resolve the billing tenant (org main branch) for accurate subscription checks.
      const [billingRestaurantId, billingSupplierId] = await Promise.all([
        resolveOrgBillingTenantId(restaurantId, 'RESTAURANT'),
        resolveOrgBillingTenantId(supplierId, 'SUPPLIER'),
      ])

      // Check that both billing tenants have an active subscription (not locked).
      const { rows: subCheck } = await query(
        `SELECT
           bool_or(sub.tenant_id = $1 AND sub.tenant_type = 'RESTAURANT' AND sub.account_locked_at IS NULL AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')) AS restaurant_ok,
           bool_or(sub.tenant_id = $2 AND sub.tenant_type = 'SUPPLIER'    AND sub.account_locked_at IS NULL AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')) AS supplier_ok
         FROM subscription sub
         WHERE (sub.tenant_id = $1 AND sub.tenant_type = 'RESTAURANT')
            OR (sub.tenant_id = $2 AND sub.tenant_type = 'SUPPLIER')`,
        [billingRestaurantId, billingSupplierId]
      )
      if (!subCheck[0]?.restaurant_ok || !subCheck[0]?.supplier_ok) {
        skippedLocked++
        continue
      }

      const [restaurantUnlocked, supplierUnlocked] = await Promise.all([
        isTenantUnlockedForBackgroundWrites({
          tenantId: restaurantId,
          tenantType: 'RESTAURANT',
        }),
        isTenantUnlockedForBackgroundWrites({
          tenantId: supplierId,
          tenantType: 'SUPPLIER',
        }),
      ])
      if (!restaurantUnlocked || !supplierUnlocked) {
        skippedLocked++
        continue
      }

      const { rows } = await query(
        `UPDATE invoice
         SET status = 'OVERDUE', overdue_notified_at = NOW()
         WHERE id = $1
           AND overdue_notified_at IS NULL
           AND balance_due > 0
           AND status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')
         RETURNING id, invoice_number, total_amount, balance_due, currency, due_date, restaurant_id, supplier_id`,
        [id]
      )
      if (rows.length === 0) continue

      await notifyInvoiceOverdue(rows[0])
      notified++
    } catch (err) {
      logger.error('Failed to process overdue invoice', { invoiceId: id, error: err.message })
    }
  }

  return { processed: candidates.length, notified, skippedLocked }
}
