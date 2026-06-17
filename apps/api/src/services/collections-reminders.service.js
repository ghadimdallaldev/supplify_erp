import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'
import { notifyTenantUsers } from './notification.service.js'

const OPEN_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']

const AUTOMATED_KINDS = [
  { kind: 'pre_due_3d', dueDateSql: 'CURRENT_DATE + 3' },
  { kind: 'due_today', dueDateSql: 'CURRENT_DATE' },
  { kind: 'overdue_7d', dueDateSql: 'CURRENT_DATE - 7' },
  { kind: 'overdue_30d', dueDateSql: 'CURRENT_DATE - 30' },
]

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function formatMoney(amount) {
  const n = parseFloat(amount) || 0
  return `$${n.toFixed(2)}`
}

function buildReminderContent(kind, invoice) {
  const num = invoice.invoice_number
  const balance = formatMoney(invoice.balance_due)
  const due = invoice.due_date

  switch (kind) {
    case 'pre_due_3d':
      return {
        title: 'Invoice due soon',
        message: `Invoice ${num} (${balance}) is due in 3 days on ${due}. Please arrange payment.`,
      }
    case 'due_today':
      return {
        title: 'Invoice due today',
        message: `Invoice ${num} (${balance}) is due today (${due}). Please arrange payment.`,
      }
    case 'overdue_7d':
      return {
        title: 'Payment overdue',
        message: `Invoice ${num} (${balance}) is 7 days overdue (due ${due}). Please submit payment.`,
      }
    case 'overdue_30d':
      return {
        title: 'Payment seriously overdue',
        message: `Invoice ${num} (${balance}) is 30 days overdue (due ${due}). Please contact your supplier about payment.`,
      }
    case 'manual':
      return {
        title: 'Payment reminder',
        message: `Reminder: Invoice ${num} has an outstanding balance of ${balance} (due ${due}).`,
      }
    default:
      return {
        title: 'Payment reminder',
        message: `Invoice ${num} (${balance}) requires payment.`,
      }
  }
}

async function claimReminderDedup({
  invoiceId,
  restaurantId,
  supplierId,
  reminderKind,
  dedupKey,
  sentBy = null,
}) {
  const { rows } = await query(
    `
    INSERT INTO invoice_reminder_log (
      invoice_id, restaurant_id, supplier_id, reminder_kind, channel, dedup_key, sent_by
    ) VALUES ($1, $2, $3, $4, 'in_app', $5, $6)
    ON CONFLICT (invoice_id, dedup_key, reminder_kind) DO NOTHING
    RETURNING id
    `,
    [invoiceId, restaurantId, supplierId, reminderKind, dedupKey, sentBy]
  )
  return rows[0]?.id || null
}

async function attachNotificationToReminderLog(logId, notificationLogId) {
  if (!logId || !notificationLogId) return
  await query(`UPDATE invoice_reminder_log SET notification_log_id = $2 WHERE id = $1`, [
    logId,
    notificationLogId,
  ])
}

async function loadOpenInvoice(invoiceId, supplierId) {
  const { rows } = await query(
    `
    SELECT
      id,
      invoice_number,
      restaurant_id,
      supplier_id,
      due_date,
      balance_due,
      total_amount,
      status
    FROM invoice
    WHERE id = $1
    `,
    [invoiceId]
  )
  if (!rows.length) throw new NotFoundError('Invoice not found')
  const invoice = rows[0]
  if (invoice.supplier_id !== supplierId) {
    throw new ForbiddenError('Invoice does not belong to this supplier')
  }
  if (!OPEN_STATUSES.includes(invoice.status)) {
    throw new ForbiddenError('Invoice is not open for reminders')
  }
  if (parseFloat(invoice.balance_due) <= 0) {
    throw new ForbiddenError('Invoice has no outstanding balance')
  }
  return invoice
}

/**
 * Send a collections reminder to the restaurant tenant for one invoice.
 */
export async function sendInvoiceReminder(invoiceId, supplierId, { kind = 'manual', userId } = {}) {
  const invoice = await loadOpenInvoice(invoiceId, supplierId)
  const reminderKind = kind === 'manual' ? 'manual' : kind
  const dedupKey = reminderKind === 'manual' ? `manual:${todayKey()}` : String(invoice.due_date)

  const logId = await claimReminderDedup({
    invoiceId: invoice.id,
    restaurantId: invoice.restaurant_id,
    supplierId,
    reminderKind,
    dedupKey,
    sentBy: userId || null,
  })

  if (!logId) {
    return { sent: false, skipped: true, reason: 'dedup', invoiceId, reminderKind }
  }

  const { title, message } = buildReminderContent(reminderKind, invoice)
  const sent = await notifyTenantUsers({
    tenantId: invoice.restaurant_id,
    tenantType: 'RESTAURANT',
    notificationType: 'INVOICE',
    notificationCategory: `invoice_reminder_${reminderKind}`,
    title,
    message,
    referenceId: invoice.id,
    referenceType: 'INVOICE',
    metadata: {
      invoice_number: invoice.invoice_number,
      due_date: invoice.due_date,
      balance_due: invoice.balance_due,
      reminder_kind: reminderKind,
      supplier_id: supplierId,
    },
  })

  const notificationLogId = sent[0]?.id
  if (notificationLogId) {
    await attachNotificationToReminderLog(logId, notificationLogId)
  }

  logger.info('Invoice reminder sent', {
    invoiceId,
    supplierId,
    reminderKind,
    notificationCount: sent.length,
  })

  return {
    sent: true,
    skipped: false,
    invoiceId,
    reminderKind,
    notificationLogId,
    recipientCount: sent.recipientCount ?? sent.length,
  }
}

/**
 * Daily automated reminder check across all suppliers (cron).
 */
export async function runCollectionsReminderCheck({ dryRun = false } = {}) {
  const isDryRun = dryRun || process.env.JOB_DRY_RUN === 'true'
  const summary = {
    candidates: 0,
    sent: 0,
    skipped: 0,
    dryRun: isDryRun,
    byKind: {},
  }

  for (const { kind, dueDateSql } of AUTOMATED_KINDS) {
    const { rows: candidates } = await query(
      `
      SELECT
        i.id,
        i.invoice_number,
        i.restaurant_id,
        i.supplier_id,
        i.due_date,
        i.balance_due,
        i.total_amount,
        i.status
      FROM invoice i
      WHERE i.status = ANY($1::text[])
        AND i.balance_due > 0
        AND i.due_date = (${dueDateSql})
        AND NOT EXISTS (
          SELECT 1 FROM invoice_reminder_log l
          WHERE l.invoice_id = i.id
            AND l.reminder_kind = $2
            AND l.dedup_key = i.due_date::text
        )
      `,
      [OPEN_STATUSES, kind]
    )

    summary.byKind[kind] = { candidates: candidates.length, sent: 0, skipped: 0 }
    summary.candidates += candidates.length

    for (const invoice of candidates) {
      if (isDryRun) {
        summary.sent += 1
        summary.byKind[kind].sent += 1
        continue
      }

      try {
        const result = await sendInvoiceReminder(invoice.id, invoice.supplier_id, { kind })
        if (result.sent) {
          summary.sent += 1
          summary.byKind[kind].sent += 1
        } else {
          summary.skipped += 1
          summary.byKind[kind].skipped += 1
        }
      } catch (err) {
        logger.error('Collections reminder failed', {
          invoiceId: invoice.id,
          kind,
          error: err.message,
        })
        summary.skipped += 1
        summary.byKind[kind].skipped += 1
      }
    }
  }

  return summary
}

/**
 * Bulk manual reminders for all overdue invoices belonging to a supplier.
 */
export async function sendBulkOverdueReminders(supplierId, userId) {
  const { rows } = await query(
    `
    SELECT id
    FROM invoice
    WHERE supplier_id = $1
      AND status = ANY($2::text[])
      AND due_date < CURRENT_DATE
      AND balance_due > 0
    ORDER BY due_date ASC
    `,
    [supplierId, OPEN_STATUSES]
  )

  const result = { sent: 0, skipped: 0, errors: 0, invoiceIds: [] }
  for (const { id } of rows) {
    try {
      const r = await sendInvoiceReminder(id, supplierId, { kind: 'manual', userId })
      if (r.sent) {
        result.sent += 1
        result.invoiceIds.push(id)
      } else {
        result.skipped += 1
      }
    } catch (err) {
      logger.error('Bulk overdue reminder failed', { invoiceId: id, error: err.message })
      result.errors += 1
    }
  }
  return result
}
