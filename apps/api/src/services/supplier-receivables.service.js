import { query } from '../lib/db.js'
import { escapeCsvField } from '../lib/sanitize-upload.js'
import { foldInvoiceCurrencyTotals } from '../lib/money.js'
import { formatInvoiceCalendarDate } from './invoice.service.js'
import { getSupplierTimezone } from '../lib/tenant-timezone.js'

const OPEN_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']

function agingBucket(daysOverdue) {
  const days = Number(daysOverdue) || 0
  if (days <= 0) return 'current'
  if (days <= 7) return '0_7'
  if (days <= 30) return '8_30'
  if (days <= 60) return '31_60'
  return '60_plus'
}

export async function getSupplierReceivables(supplierId) {
  const timeZone = await getSupplierTimezone(supplierId)
  const [{ rows: summaryRows }, { rows: invoices }, { rows: topDebtorRows }] = await Promise.all([
    query(
      `
      SELECT
        i.currency,
        COUNT(*)::int AS unpaid_count,
        COALESCE(SUM(i.balance_due), 0)::numeric AS unpaid_total,
        COALESCE(
          SUM(i.balance_due) FILTER (
            WHERE i.due_date < (now() AT TIME ZONE $3)::date AND i.status NOT IN ('PAID', 'VOID')
          ),
          0
        )::numeric AS overdue_total,
        COUNT(*) FILTER (WHERE i.status = 'PARTIALLY_PAID')::int AS partial_count,
        COALESCE(
          SUM(i.balance_due) FILTER (WHERE i.due_date >= (now() AT TIME ZONE $3)::date),
          0
        )::numeric AS aging_current,
        COALESCE(
          SUM(i.balance_due) FILTER (
            WHERE i.due_date < (now() AT TIME ZONE $3)::date
              AND (now() AT TIME ZONE $3)::date - i.due_date BETWEEN 1 AND 7
              AND i.status NOT IN ('PAID', 'VOID')
          ),
          0
        )::numeric AS aging_0_7,
        COALESCE(
          SUM(i.balance_due) FILTER (
            WHERE i.due_date < (now() AT TIME ZONE $3)::date
              AND (now() AT TIME ZONE $3)::date - i.due_date BETWEEN 8 AND 30
              AND i.status NOT IN ('PAID', 'VOID')
          ),
          0
        )::numeric AS aging_8_30,
        COALESCE(
          SUM(i.balance_due) FILTER (
            WHERE i.due_date < (now() AT TIME ZONE $3)::date
              AND (now() AT TIME ZONE $3)::date - i.due_date BETWEEN 31 AND 60
              AND i.status NOT IN ('PAID', 'VOID')
          ),
          0
        )::numeric AS aging_31_60,
        COALESCE(
          SUM(i.balance_due) FILTER (
            WHERE i.due_date < (now() AT TIME ZONE $3)::date
              AND (now() AT TIME ZONE $3)::date - i.due_date > 60
              AND i.status NOT IN ('PAID', 'VOID')
          ),
          0
        )::numeric AS aging_60_plus
      FROM invoice i
      WHERE i.supplier_id = $1
        AND i.status = ANY($2::text[])
      GROUP BY i.currency
      `,
      [supplierId, OPEN_STATUSES, timeZone]
    ),
    query(
      `
      SELECT
        i.id,
        i.invoice_number,
        i.restaurant_id,
        r.name AS restaurant_name,
        i.status,
        i.invoice_date,
        i.due_date,
        i.total_amount,
        i.paid_amount,
        i.balance_due,
        i.currency,
        CASE WHEN i.due_date < (now() AT TIME ZONE $3)::date AND i.status NOT IN ('PAID', 'VOID') THEN true ELSE false END AS is_overdue,
        CASE WHEN i.due_date < (now() AT TIME ZONE $3)::date THEN (now() AT TIME ZONE $3)::date - i.due_date ELSE 0 END AS days_overdue
      FROM invoice i
      JOIN restaurant r ON r.id = i.restaurant_id
      WHERE i.supplier_id = $1
        AND i.status = ANY($2::text[])
      ORDER BY i.due_date ASC, i.balance_due DESC
      LIMIT 100
      `,
      [supplierId, OPEN_STATUSES, timeZone]
    ),
    query(
      `
      SELECT
        i.restaurant_id,
        r.name AS restaurant_name,
        i.currency,
        SUM(i.balance_due)::numeric AS balance_due,
        COUNT(*)::int AS invoice_count,
        MIN(i.due_date) AS oldest_due_date
      FROM invoice i
      JOIN restaurant r ON r.id = i.restaurant_id
      WHERE i.supplier_id = $1
        AND i.status = ANY($2::text[])
      GROUP BY i.restaurant_id, r.name, i.currency
      ORDER BY balance_due DESC
      LIMIT 100
      `,
      [supplierId, OPEN_STATUSES]
    ),
  ])

  const folded = foldInvoiceCurrencyTotals(
    summaryRows,
    [
      'unpaid_total',
      'overdue_total',
      'aging_current',
      'aging_0_7',
      'aging_8_30',
      'aging_31_60',
      'aging_60_plus',
    ],
    ['unpaid_count', 'partial_count']
  )
  const aging = {
    current: folded.money.aging_current,
    '0_7': folded.money.aging_0_7,
    '8_30': folded.money.aging_8_30,
    '31_60': folded.money.aging_31_60,
    '60_plus': folded.money.aging_60_plus,
  }
  const totalUnpaid = folded.money.unpaid_total
  const totalOverdue = folded.money.overdue_total
  const partialCount = folded.counts.partial_count || 0

  const oldestInvoiceByRestaurant = {}
  for (const row of invoices) {
    if (!oldestInvoiceByRestaurant[row.restaurant_id]) {
      oldestInvoiceByRestaurant[row.restaurant_id] = row.id
    }
  }

  const topDebtors = topDebtorRows.map((row) => ({
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    currency: row.currency || null,
    balanceDue: parseFloat(row.balance_due) || 0,
    invoiceCount: parseInt(row.invoice_count, 10) || 0,
    oldestDueDate: formatInvoiceCalendarDate(row.oldest_due_date),
    oldestInvoiceId: oldestInvoiceByRestaurant[row.restaurant_id] || null,
  }))

  return {
    summary: {
      unpaidCount: folded.counts.unpaid_count || 0,
      unpaidTotal: totalUnpaid,
      overdueTotal: totalOverdue,
      partialCount,
      whoOwesMeTotal: totalUnpaid,
      byCurrency: folded.byCurrency.map((row) => ({
        currency: row.currency,
        unpaidTotal: row.unpaid_total,
        overdueTotal: row.overdue_total,
      })),
    },
    aging,
    invoices: invoices.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      status: row.status,
      invoiceDate: formatInvoiceCalendarDate(row.invoice_date),
      dueDate: formatInvoiceCalendarDate(row.due_date),
      totalAmount: parseFloat(row.total_amount) || 0,
      paidAmount: parseFloat(row.paid_amount) || 0,
      balanceDue: parseFloat(row.balance_due) || 0,
      currency: row.currency || null,
      isOverdue: row.is_overdue,
      daysOverdue: parseInt(row.days_overdue, 10) || 0,
      agingBucket: agingBucket(row.days_overdue),
    })),
    topDebtors,
  }
}

export async function exportSupplierStatementCsv(supplierId, restaurantId) {
  const { rows } = await query(
    `
    SELECT
      i.invoice_number,
      i.invoice_date,
      i.due_date,
      i.status,
      i.total_amount,
      i.paid_amount,
      i.balance_due
    FROM invoice i
    WHERE i.supplier_id = $1 AND i.restaurant_id = $2
      AND i.status NOT IN ('VOID', 'DRAFT')
    ORDER BY i.invoice_date ASC
    `,
    [supplierId, restaurantId]
  )

  const header = 'Invoice Number,Invoice Date,Due Date,Status,Total,Paid,Balance\n'
  const lines = rows.map((r) =>
    [
      escapeCsvField(r.invoice_number),
      escapeCsvField(formatInvoiceCalendarDate(r.invoice_date) || ''),
      escapeCsvField(formatInvoiceCalendarDate(r.due_date) || ''),
      escapeCsvField(r.status),
      escapeCsvField(r.total_amount),
      escapeCsvField(r.paid_amount),
      escapeCsvField(r.balance_due),
    ].join(',')
  )
  return header + lines.join('\n')
}
