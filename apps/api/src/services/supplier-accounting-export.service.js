import { query } from '../lib/db.js'
import { escapeCsvField } from '../lib/sanitize-upload.js'
import { ValidationError } from '../middlewares/errorHandler.js'

const OPEN_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']
const MAX_EXPORT_RANGE_DAYS = 366

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d
}

export function parseExportDateRange(query = {}) {
  const from = query.from ? startOfDay(new Date(query.from)) : startOfDay(defaultFrom())
  const to = query.to ? endOfDay(new Date(query.to)) : endOfDay(new Date())
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ValidationError('Invalid from or to date')
  }
  if (from > to) {
    throw new ValidationError('from must be before to')
  }
  const spanMs = to.getTime() - from.getTime()
  const maxSpanMs = MAX_EXPORT_RANGE_DAYS * 24 * 60 * 60 * 1000
  if (spanMs > maxSpanMs) {
    throw new ValidationError(`Date range cannot exceed ${MAX_EXPORT_RANGE_DAYS} days`)
  }
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

function buildCsv(header, rows) {
  return header + rows.join('\n')
}

export async function exportInvoicesCsv(supplierId, { from, to, status }) {
  const params = [supplierId, from, to]
  let sql = `
    SELECT
      i.invoice_number,
      i.invoice_date,
      i.due_date,
      i.status,
      i.total_amount,
      i.paid_amount,
      i.balance_due,
      r.name AS restaurant_name
    FROM invoice i
    JOIN restaurant r ON r.id = i.restaurant_id
    WHERE i.supplier_id = $1
      AND i.invoice_date >= $2::date
      AND i.invoice_date <= $3::date
      AND i.status NOT IN ('VOID', 'DRAFT')
  `
  if (status) {
    params.push(status)
    sql += ` AND i.status = $${params.length}`
  }
  sql += ` ORDER BY i.invoice_date ASC, i.invoice_number ASC`

  const { rows } = await query(sql, params)
  const header = 'Invoice Number,Invoice Date,Due Date,Status,Total,Paid,Balance,Restaurant\n'
  const lines = rows.map((r) =>
    [
      escapeCsvField(r.invoice_number),
      escapeCsvField(r.invoice_date),
      escapeCsvField(r.due_date),
      escapeCsvField(r.status),
      escapeCsvField(r.total_amount),
      escapeCsvField(r.paid_amount),
      escapeCsvField(r.balance_due),
      escapeCsvField(r.restaurant_name),
    ].join(',')
  )
  return buildCsv(header, lines)
}

export async function exportInvoicesQuickBooksCsv(supplierId, { from, to }) {
  const { rows } = await query(
    `
    SELECT
      i.invoice_number,
      r.name AS restaurant_name,
      i.invoice_date,
      i.due_date,
      i.payment_terms,
      i.notes,
      ili.description,
      ili.quantity,
      ili.unit_price,
      ili.line_total
    FROM invoice i
    JOIN restaurant r ON r.id = i.restaurant_id
    LEFT JOIN invoice_line_item ili ON ili.invoice_id = i.id
    WHERE i.supplier_id = $1
      AND i.invoice_date >= $2::date
      AND i.invoice_date <= $3::date
      AND i.status NOT IN ('VOID', 'DRAFT')
    ORDER BY i.invoice_date ASC, i.invoice_number ASC, ili.created_at ASC NULLS LAST
    `,
    [supplierId, from, to]
  )

  const header =
    '*InvoiceNo,*Customer,*InvoiceDate,*DueDate,Terms,Memo,Item(Product/Service),ItemDescription,ItemQuantity,ItemRate,*ItemAmount\n'
  const lines = rows.map((r) => {
    const description = r.description || `Invoice ${r.invoice_number}`
    const quantity = r.quantity != null ? r.quantity : 1
    const rate = r.unit_price != null ? r.unit_price : (r.line_total ?? 0)
    const amount = r.line_total != null ? r.line_total : rate
    return [
      escapeCsvField(r.invoice_number),
      escapeCsvField(r.restaurant_name),
      escapeCsvField(r.invoice_date),
      escapeCsvField(r.due_date),
      escapeCsvField(r.payment_terms || ''),
      escapeCsvField(r.notes || ''),
      escapeCsvField('Services'),
      escapeCsvField(description),
      escapeCsvField(quantity),
      escapeCsvField(rate),
      escapeCsvField(amount),
    ].join(',')
  })
  return buildCsv(header, lines)
}

export async function exportPaymentsCsv(supplierId, { from, to }) {
  const { rows } = await query(
    `
    SELECT
      p.payment_number,
      p.payment_date,
      p.payment_amount,
      p.payment_method,
      p.payment_reference,
      p.status,
      p.bank_name,
      p.notes,
      i.invoice_number,
      r.name AS restaurant_name
    FROM payment p
    JOIN invoice i ON i.id = p.invoice_id
    JOIN restaurant r ON r.id = i.restaurant_id
    WHERE i.supplier_id = $1
      AND p.payment_date >= $2::date
      AND p.payment_date <= $3::date
    ORDER BY p.payment_date ASC, p.payment_number ASC
    `,
    [supplierId, from, to]
  )

  const header =
    'Payment Number,Payment Date,Amount,Method,Reference,Status,Bank,Notes,Invoice Number,Restaurant\n'
  const lines = rows.map((r) =>
    [
      escapeCsvField(r.payment_number),
      escapeCsvField(r.payment_date),
      escapeCsvField(r.payment_amount),
      escapeCsvField(r.payment_method),
      escapeCsvField(r.payment_reference),
      escapeCsvField(r.status),
      escapeCsvField(r.bank_name),
      escapeCsvField(r.notes),
      escapeCsvField(r.invoice_number),
      escapeCsvField(r.restaurant_name),
    ].join(',')
  )
  return buildCsv(header, lines)
}

export async function exportArSummaryCsv(supplierId) {
  const { rows } = await query(
    `
    SELECT
      r.name AS restaurant_name,
      COUNT(*)::int AS invoice_count,
      COALESCE(SUM(i.balance_due), 0)::numeric AS total_balance,
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
    JOIN restaurant r ON r.id = i.restaurant_id
    WHERE i.supplier_id = $1
      AND i.status = ANY($2::text[])
    GROUP BY i.restaurant_id, r.name
    ORDER BY total_balance DESC, restaurant_name ASC
    `,
    [supplierId, OPEN_STATUSES]
  )

  const header =
    'Restaurant,Open Invoices,Total Balance,Current,1-7 Days,8-30 Days,31-60 Days,60+ Days\n'
  const lines = rows.map((r) =>
    [
      escapeCsvField(r.restaurant_name),
      escapeCsvField(r.invoice_count),
      escapeCsvField(r.total_balance),
      escapeCsvField(r.aging_current),
      escapeCsvField(r.aging_0_7),
      escapeCsvField(r.aging_8_30),
      escapeCsvField(r.aging_31_60),
      escapeCsvField(r.aging_60_plus),
    ].join(',')
  )
  return buildCsv(header, lines)
}
