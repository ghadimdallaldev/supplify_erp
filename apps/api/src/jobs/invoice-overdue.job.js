import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { notifyInvoiceOverdue } from '../services/notification.service.js'

export async function checkOverdueInvoices() {
  const { rows: candidates } = await query(
    `SELECT id
     FROM invoice
     WHERE status IN ('ISSUED', 'PARTIALLY_PAID')
       AND due_date < CURRENT_DATE
       AND overdue_notified_at IS NULL`,
    []
  )

  logger.info('Invoice overdue job running', { count: candidates.length })
  if (candidates.length === 0) return { processed: 0, notified: 0 }

  let notified = 0
  for (const { id } of candidates) {
    try {
      const { rows } = await query(
        `UPDATE invoice
         SET status = 'OVERDUE', overdue_notified_at = NOW()
         WHERE id = $1
           AND overdue_notified_at IS NULL
           AND status IN ('ISSUED', 'PARTIALLY_PAID')
         RETURNING id, invoice_number, total_amount, due_date, restaurant_id, supplier_id`,
        [id]
      )
      if (rows.length === 0) continue

      await notifyInvoiceOverdue(rows[0])
      notified++
    } catch (err) {
      logger.error('Failed to process overdue invoice', { invoiceId: id, error: err.message })
    }
  }

  return { processed: candidates.length, notified }
}
