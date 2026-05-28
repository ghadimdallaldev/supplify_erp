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

export async function getSupplierReceivables(supplierId) {
  const { rows: invoices } = await query(
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
    `,
    [supplierId, OPEN_STATUSES]
  )

  const aging = { current: 0, '0_7': 0, '8_30': 0, '31_60': 0, '60_plus': 0 }
  let totalUnpaid = 0
  let totalOverdue = 0
  let partialCount = 0
  const byRestaurant = new Map()

  for (const inv of invoices) {
    const balance = parseFloat(inv.balance_due) || 0
    totalUnpaid += balance
    if (inv.is_overdue) totalOverdue += balance
    if (inv.status === 'PARTIALLY_PAID') partialCount += 1

    const bucket = agingBucket(inv.due_date)
    aging[bucket] = (aging[bucket] || 0) + balance

    const key = inv.restaurant_id
    if (!byRestaurant.has(key)) {
      byRestaurant.set(key, {
        restaurantId: inv.restaurant_id,
        restaurantName: inv.restaurant_name,
        balanceDue: 0,
        invoiceCount: 0,
        oldestDueDate: inv.due_date,
      })
    }
    const entry = byRestaurant.get(key)
    entry.balanceDue += balance
    entry.invoiceCount += 1
    if (inv.due_date < entry.oldestDueDate) entry.oldestDueDate = inv.due_date
  }

  const topDebtors = Array.from(byRestaurant.values())
    .sort((a, b) => b.balanceDue - a.balanceDue)
    .slice(0, 10)

  return {
    summary: {
      unpaidCount: invoices.length,
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
  const lines = rows.map(
    (r) =>
      `${r.invoice_number},${r.invoice_date},${r.due_date},${r.status},${r.total_amount},${r.paid_amount},${r.balance_due}`
  )
  return header + lines.join('\n')
}
