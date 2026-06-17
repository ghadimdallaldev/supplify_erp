import { query } from '../lib/db.js'

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

export async function getRestaurantPayables(restaurantId) {
  const [{ rows: summaryRows }, { rows: invoices }, { rows: topCreditorRows }] = await Promise.all([
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
          SUM(i.balance_due) FILTER (
            WHERE i.due_date >= CURRENT_DATE AND i.due_date <= CURRENT_DATE + 7
          ),
          0
        )::numeric AS due_this_week_total,
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
      WHERE i.restaurant_id = $1
        AND i.status = ANY($2::text[])
      `,
      [restaurantId, OPEN_STATUSES]
    ),
    query(
      `
      SELECT
        i.id,
        i.invoice_number,
        i.supplier_id,
        s.name AS supplier_name,
        i.status,
        i.invoice_date,
        i.due_date,
        i.total_amount,
        i.paid_amount,
        i.balance_due,
        CASE WHEN i.due_date < CURRENT_DATE AND i.status NOT IN ('PAID', 'VOID') THEN true ELSE false END AS is_overdue,
        CASE WHEN i.due_date < CURRENT_DATE THEN CURRENT_DATE - i.due_date ELSE 0 END AS days_overdue
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      WHERE i.restaurant_id = $1
        AND i.status = ANY($2::text[])
      ORDER BY i.due_date ASC, i.balance_due DESC
      LIMIT 100
      `,
      [restaurantId, OPEN_STATUSES]
    ),
    query(
      `
      SELECT
        i.supplier_id,
        s.name AS supplier_name,
        SUM(i.balance_due)::numeric AS balance_due,
        COUNT(*)::int AS invoice_count,
        MIN(i.due_date) AS oldest_due_date
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      WHERE i.restaurant_id = $1
        AND i.status = ANY($2::text[])
      GROUP BY i.supplier_id, s.name
      ORDER BY balance_due DESC
      LIMIT 100
      `,
      [restaurantId, OPEN_STATUSES]
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
  const dueThisWeekTotal = parseFloat(summaryRow.due_this_week_total) || 0

  const oldestInvoiceBySupplier = {}
  for (const row of invoices) {
    if (!oldestInvoiceBySupplier[row.supplier_id]) {
      oldestInvoiceBySupplier[row.supplier_id] = row.id
    }
  }

  const topCreditors = topCreditorRows.map((row) => ({
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    balanceDue: parseFloat(row.balance_due) || 0,
    invoiceCount: parseInt(row.invoice_count, 10) || 0,
    oldestDueDate: row.oldest_due_date,
    oldestInvoiceId: oldestInvoiceBySupplier[row.supplier_id] || null,
  }))

  return {
    summary: {
      unpaidCount: parseInt(summaryRow.unpaid_count, 10) || 0,
      unpaidTotal: totalUnpaid,
      overdueTotal: totalOverdue,
      partialCount,
      dueThisWeekTotal,
      whoIOweTotal: totalUnpaid,
    },
    aging,
    invoices: invoices.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
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
    topCreditors,
  }
}

/**
 * Opening balance for a supplier statement before startDate (unpaid balance carried forward).
 */
export async function getRestaurantStatementOpeningBalance(restaurantId, supplierId, startDate) {
  if (!startDate) return 0

  const { rows } = await query(
    `
    SELECT COALESCE(SUM(i.balance_due), 0)::numeric AS opening_balance
    FROM invoice i
    WHERE i.restaurant_id = $1
      AND i.supplier_id = $2
      AND i.status NOT IN ('VOID', 'DRAFT')
      AND i.invoice_date < $3::date
    `,
    [restaurantId, supplierId, startDate]
  )

  return parseFloat(rows[0]?.opening_balance) || 0
}
