import { query } from '../lib/db.js'
import { escapeCsvField } from '../lib/sanitize-upload.js'

const OPEN_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']

function agingBucket(dueDate) {
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const daysOverdue = Math.floor((today - due) / (24 * 60 * 60 * 1000))
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 7) return '0_7'
  if (daysOverdue <= 30) return '8_30'
  if (daysOverdue <= 60) return '31_60'
  return '60_plus'
}

export async function getSupplierReceivables(supplierId) {
  const [{ rows: summaryRows }, { rows: invoices }, { rows: topDebtorRows }] = await Promise.all([
    query(
      `
      SELECT
        COUNT(*)::int AS unpaid_count,
        COALESCE(SUM(i.balance_due), 0)::numeric AS unpaid_total,
        COALESCE(
          SUM(i.balance_due) FILTER (
            WHERE i.due_date < CURRENT_DATE AND i.status NOT IN ('PAID', 'VOID')
          ),
          0
        )::numeric AS overdue_total,
        COUNT(*) FILTER (WHERE i.status = 'PARTIALLY_PAID')::int AS partial_count,
        COALESCE(
          SUM(i.balance_due) FILTER (WHERE i.due_date >= CURRENT_DATE),
          0
        )::numeric AS aging_current,
        COALESCE(
          SUM(i.balance_due) FILTER (
            WHERE i.due_date < CURRENT_DATE
              AND CURRENT_DATE - i.due_date BETWEEN 1 AND 7
              AND i.status NOT IN ('PAID', 'VOID')
          ),
          0
        )::numeric AS aging_0_7,
        COALESCE(
          SUM(i.balance_due) FILTER (
            WHERE i.due_date < CURRENT_DATE
              AND CURRENT_DATE - i.due_date BETWEEN 8 AND 30
              AND i.status NOT IN ('PAID', 'VOID')
          ),
          0
        )::numeric AS aging_8_30,
        COALESCE(
          SUM(i.balance_due) FILTER (
            WHERE i.due_date < CURRENT_DATE
              AND CURRENT_DATE - i.due_date BETWEEN 31 AND 60
              AND i.status NOT IN ('PAID', 'VOID')
          ),
          0
        )::numeric AS aging_31_60,
        COALESCE(
          SUM(i.balance_due) FILTER (
            WHERE i.due_date < CURRENT_DATE
              AND CURRENT_DATE - i.due_date > 60
              AND i.status NOT IN ('PAID', 'VOID')
          ),
          0
        )::numeric AS aging_60_plus
      FROM invoice i
      WHERE i.supplier_id = $1
        AND i.status = ANY($2::text[])
      `,
      [supplierId, OPEN_STATUSES]
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
        CASE WHEN i.due_date < CURRENT_DATE AND i.status NOT IN ('PAID', 'VOID') THEN true ELSE false END AS is_overdue,
        CASE WHEN i.due_date < CURRENT_DATE THEN CURRENT_DATE - i.due_date ELSE 0 END AS days_overdue
      FROM invoice i
      JOIN restaurant r ON r.id = i.restaurant_id
      WHERE i.supplier_id = $1
        AND i.status = ANY($2::text[])
      ORDER BY i.due_date ASC, i.balance_due DESC
      LIMIT 100
      `,
      [supplierId, OPEN_STATUSES]
    ),
    query(
      `
      SELECT
        i.restaurant_id,
        r.name AS restaurant_name,
        SUM(i.balance_due)::numeric AS balance_due,
        COUNT(*)::int AS invoice_count,
        MIN(i.due_date) AS oldest_due_date
      FROM invoice i
      JOIN restaurant r ON r.id = i.restaurant_id
      WHERE i.supplier_id = $1
        AND i.status = ANY($2::text[])
      GROUP BY i.restaurant_id, r.name
      ORDER BY balance_due DESC
      LIMIT 100
      `,
      [supplierId, OPEN_STATUSES]
    ),
  ])

  const summaryRow = summaryRows[0] || {}
  const aging = {
    current: parseFloat(summaryRow.aging_current) || 0,
    '0_7': parseFloat(summaryRow.aging_0_7) || 0,
    '8_30': parseFloat(summaryRow.aging_8_30) || 0,
    '31_60': parseFloat(summaryRow.aging_31_60) || 0,
    '60_plus': parseFloat(summaryRow.aging_60_plus) || 0,
  }
  const totalUnpaid = parseFloat(summaryRow.unpaid_total) || 0
  const totalOverdue = parseFloat(summaryRow.overdue_total) || 0
  const partialCount = parseInt(summaryRow.partial_count, 10) || 0

  const oldestInvoiceByRestaurant = {}
  for (const row of invoices) {
    if (!oldestInvoiceByRestaurant[row.restaurant_id]) {
      oldestInvoiceByRestaurant[row.restaurant_id] = row.id
    }
  }

  const topDebtors = topDebtorRows.map((row) => ({
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    balanceDue: parseFloat(row.balance_due) || 0,
    invoiceCount: parseInt(row.invoice_count, 10) || 0,
    oldestDueDate: row.oldest_due_date,
    oldestInvoiceId: oldestInvoiceByRestaurant[row.restaurant_id] || null,
  }))

  return {
    summary: {
      unpaidCount: parseInt(summaryRow.unpaid_count, 10) || 0,
      unpaidTotal: totalUnpaid,
      overdueTotal: totalOverdue,
      partialCount,
      whoOwesMeTotal: totalUnpaid,
    },
    aging,
    invoices: invoices.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      status: row.status,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      totalAmount: parseFloat(row.total_amount) || 0,
      paidAmount: parseFloat(row.paid_amount) || 0,
      balanceDue: parseFloat(row.balance_due) || 0,
      isOverdue: row.is_overdue,
      daysOverdue: parseInt(row.days_overdue, 10) || 0,
      agingBucket: agingBucket(row.due_date),
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
      escapeCsvField(r.invoice_date),
      escapeCsvField(r.due_date),
      escapeCsvField(r.status),
      escapeCsvField(r.total_amount),
      escapeCsvField(r.paid_amount),
      escapeCsvField(r.balance_due),
    ].join(',')
  )
  return header + lines.join('\n')
}
