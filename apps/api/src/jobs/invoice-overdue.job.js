import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { notifyInvoiceOverdue } from '../services/notification.service.js'

export async function checkOverdueInvoices() {
  const { rows } = await query(
    `SELECT id, invoice_number, total_amount, due_date, restaurant_id, supplier_id
     FROM invoice
     WHERE status IN ('ISSUED', 'PARTIALLY_PAID')
       AND due_date < CURRENT_DATE
       AND overdue_notified_at IS NULL`,
    [],
  )
  logger.info('Invoice overdue job running', { count: rows.length })
  if (rows.length === 0) return { processed: 0, notified: 0 }
  let notified = 0
  for (const invoice of rows) {
    try {
      await query(`UPDATE invoice SET status = 'OVERDUE', overdue_notified_at = NOW() WHERE id = $1`, [invoice.id])
      await notifyInvoiceOverdue(invoice)
      notified++
    } catch (err) {
      logger.error('Failed to process overdue invoice', { invoiceId: invoice.id, error: err.message })
    }
  }
  return { processed: rows.length, notified }
}
