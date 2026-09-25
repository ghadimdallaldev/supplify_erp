import { query } from '../lib/db.js'
import { formatInvoiceCalendarDate } from './invoice.service.js'
import { foldInvoiceCurrencyTotals } from '../lib/money.js'
import { getRestaurantTimezone } from '../lib/tenant-timezone.js'

const OPEN_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']

function agingBucket(daysOverdue) {
  const days = Number(daysOverdue) || 0
  if (days <= 0) return 'current'
  if (days <= 7) return '0_7'
  if (days <= 30) return '8_30'
  if (days <= 60) return '31_60'
  return '60_plus'
}

export async function getRestaurantPayables(restaurantId) {
  const timeZone = await getRestaurantTimezone(restaurantId)
  const [{ rows: summaryRows }, { rows: invoices }, { rows: topCreditorRows }] = await Promise.all([
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
          SUM(i.balance_due) FILTER (
            WHERE i.due_date >= (now() AT TIME ZONE $3)::date AND i.due_date <= (now() AT TIME ZONE $3)::date + 7
          ),
          0
        )::numeric AS due_this_week_total,
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
      WHERE i.restaurant_id = $1
        AND i.status = ANY($2::text[])
      GROUP BY i.currency
      `,
      [restaurantId, OPEN_STATUSES, timeZone]
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
        i.currency,
        CASE WHEN i.due_date < (now() AT TIME ZONE $3)::date AND i.status NOT IN ('PAID', 'VOID') THEN true ELSE false END AS is_overdue,
        CASE WHEN i.due_date < (now() AT TIME ZONE $3)::date THEN (now() AT TIME ZONE $3)::date - i.due_date ELSE 0 END AS days_overdue
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      WHERE i.restaurant_id = $1
        AND i.status = ANY($2::text[])
      ORDER BY i.due_date ASC, i.balance_due DESC
      LIMIT 100
      `,
      [restaurantId, OPEN_STATUSES, timeZone]
    ),
    query(
      `
      SELECT
        i.supplier_id,
        s.name AS supplier_name,
        i.currency,
        SUM(i.balance_due)::numeric AS balance_due,
        COUNT(*)::int AS invoice_count,
        MIN(i.due_date) AS oldest_due_date
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      WHERE i.restaurant_id = $1
        AND i.status = ANY($2::text[])
      GROUP BY i.supplier_id, s.name, i.currency
      ORDER BY balance_due DESC
      LIMIT 100
      `,
      [restaurantId, OPEN_STATUSES]
    ),
  ])

  const folded = foldInvoiceCurrencyTotals(
    summaryRows,
    [
      'unpaid_total',
      'overdue_total',
      'due_this_week_total',
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
  const dueThisWeekTotal = folded.money.due_this_week_total

  const oldestInvoiceBySupplier = {}
  for (const row of invoices) {
    if (!oldestInvoiceBySupplier[row.supplier_id]) {
      oldestInvoiceBySupplier[row.supplier_id] = row.id
    }
  }

  const topCreditors = topCreditorRows.map((row) => ({
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    currency: row.currency || null,
    balanceDue: parseFloat(row.balance_due) || 0,
    invoiceCount: parseInt(row.invoice_count, 10) || 0,
    oldestDueDate: formatInvoiceCalendarDate(row.oldest_due_date),
    oldestInvoiceId: oldestInvoiceBySupplier[row.supplier_id] || null,
  }))

  return {
    summary: {
      unpaidCount: folded.counts.unpaid_count || 0,
      unpaidTotal: totalUnpaid,
      overdueTotal: totalOverdue,
      partialCount,
      dueThisWeekTotal,
      whoIOweTotal: totalUnpaid,
      byCurrency: folded.byCurrency.map((row) => ({
        currency: row.currency,
        unpaidTotal: row.unpaid_total,
        overdueTotal: row.overdue_total,
        dueThisWeekTotal: row.due_this_week_total,
      })),
    },
    aging,
    invoices: invoices.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
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
    topCreditors,
  }
}

/**
 * Opening balance for a supplier statement before startDate (unpaid balance carried forward).
 */
export async function getRestaurantStatementOpeningBalance(restaurantId, supplierId, startDate) {
  if (!startDate) return { total: 0, byCurrency: [] }

  const { rows } = await query(
    `
    SELECT
      i.currency,
      (
        COALESCE(SUM(i.total_amount), 0)
        - COALESCE(SUM(paid.before_paid), 0)
      )::numeric AS opening_balance
    FROM invoice i
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(p.payment_amount), 0) AS before_paid
      FROM payment p
      WHERE p.invoice_id = i.id
        AND p.status = 'COMPLETED'
        AND p.payment_date < $3::date
    ) paid ON true
    WHERE i.restaurant_id = $1
      AND i.supplier_id = $2
      AND i.status NOT IN ('VOID', 'DRAFT')
      AND i.invoice_date < $3::date
    GROUP BY i.currency
    `,
    [restaurantId, supplierId, startDate]
  )

  const folded = foldInvoiceCurrencyTotals(rows, ['opening_balance'])
  return {
    total: folded.mixed ? null : (folded.money.opening_balance ?? 0),
    byCurrency: folded.byCurrency.map((row) => ({
      currency: row.currency,
      amount: row.opening_balance,
    })),
  }
}

/**
 * Credit notes issued in the statement period (reduce amount owed).
 */
export async function getRestaurantStatementAdjustments(
  restaurantId,
  supplierId,
  startDate,
  endDate
) {
  const params = [restaurantId, supplierId]
  let dateFilters = ''

  if (startDate) {
    params.push(startDate)
    dateFilters += ` AND cn.issue_date >= $${params.length}::date`
  }
  if (endDate) {
    params.push(endDate)
    dateFilters += ` AND cn.issue_date <= $${params.length}::date`
  }

  const { rows } = await query(
    `
    SELECT
      cn.currency,
      COALESCE(SUM(cn.remaining_amount), 0)::numeric AS total_adjustments
    FROM credit_note cn
    WHERE cn.restaurant_id = $1
      AND cn.supplier_id = $2
      AND cn.status != 'VOID'
      AND cn.status != 'EXPIRED'
      ${dateFilters}
    GROUP BY cn.currency
    `,
    params
  )

  const folded = foldInvoiceCurrencyTotals(rows, ['total_adjustments'])
  return {
    total: folded.mixed ? null : (folded.money.total_adjustments ?? 0),
    byCurrency: folded.byCurrency.map((row) => ({
      currency: row.currency,
      amount: row.total_adjustments,
    })),
  }
}

/**
 * closingBalance = opening + charges - payments - adjustments
 * (adjustments are positive credit note amounts that reduce balance owed)
 */
function statementCurrency(currency) {
  const code = String(currency || '')
    .trim()
    .toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : ''
}

export function buildSupplierStatementSummary({
  invoices = [],
  opening,
  adjustments,
  payments = [],
}) {
  const currencies = new Set()
  const remember = (currency) => currencies.add(statementCurrency(currency))
  for (const invoice of invoices) remember(invoice.currency)
  for (const row of opening?.byCurrency || []) remember(row.currency)
  for (const row of adjustments?.byCurrency || []) remember(row.currency)
  for (const row of payments) remember(row.currency)

  const byCurrency = [...currencies].map((currency) => {
    const openingBalance =
      (opening?.byCurrency || []).find((row) => statementCurrency(row.currency) === currency)
        ?.amount || 0
    const totalCharges = invoices
      .filter((invoice) => statementCurrency(invoice.currency) === currency)
      .reduce((sum, invoice) => sum + (Number(invoice.total_amount) || 0), 0)
    const totalPayments = payments
      .filter((row) => statementCurrency(row.currency) === currency)
      .reduce((sum, row) => sum + (Number(row.total_payments ?? row.amount) || 0), 0)
    const totalAdjustments =
      (adjustments?.byCurrency || []).find((row) => statementCurrency(row.currency) === currency)
        ?.amount || 0
    return {
      currency: currency || null,
      openingBalance,
      totalCharges,
      totalPayments,
      totalAdjustments,
      closingBalance: computeRestaurantStatementClosingBalance({
        openingBalance,
        totalCharges,
        totalPayments,
        totalAdjustments,
      }),
    }
  })

  const single = byCurrency.length <= 1
  const only = byCurrency[0]
  return {
    openingBalance: single ? (only?.openingBalance ?? 0) : null,
    totalCharges: single ? (only?.totalCharges ?? 0) : null,
    totalPayments: single ? (only?.totalPayments ?? 0) : null,
    totalAdjustments: single ? (only?.totalAdjustments ?? 0) : null,
    closingBalance: single ? (only?.closingBalance ?? 0) : null,
    invoiceCount: invoices.length,
    byCurrency,
  }
}

export function computeRestaurantStatementClosingBalance({
  openingBalance,
  totalCharges,
  totalPayments,
  totalAdjustments,
}) {
  return openingBalance + totalCharges - totalPayments - totalAdjustments
}
