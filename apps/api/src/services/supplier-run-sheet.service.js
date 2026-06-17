import { query } from '../lib/db.js'
import { getDeliveryBoardSqlFragments } from '../lib/delivery-board-schema.js'
import { getSupplierCommandCenter } from './supplier-command-center.service.js'
import { getSupplierDeliveryBoard } from './supplier-deliveries.service.js'
import { getSupplierReceivables } from './supplier-receivables.service.js'
import { getReorderIntelligence } from './supplier-reorder-intelligence.service.js'

const OPEN_ISSUE_STATUSES = [
  'shortage_reported',
  'substitution_suggested',
  'waiting_restaurant_approval',
]

const PICK_ORDER_STATUSES = ['ACKNOWLEDGED', 'PROCESSING']

function normalizeRunSheetDate(date) {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return String(date)
  }
  return new Date().toISOString().slice(0, 10)
}

function filterReceivablesDueToday(receivables) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const invoices = receivables.invoices.filter((inv) => {
    const due = new Date(inv.dueDate)
    due.setHours(0, 0, 0, 0)
    return due <= today
  })

  let dueTodayCount = 0
  let overdueCount = 0
  let totalBalanceDue = 0

  for (const inv of invoices) {
    totalBalanceDue += inv.balanceDue
    if (inv.isOverdue) overdueCount += 1
    else dueTodayCount += 1
  }

  return {
    summary: {
      count: invoices.length,
      totalBalanceDue,
      dueTodayCount,
      overdueCount,
    },
    invoices,
  }
}

async function getOrdersToPick(supplierId, date) {
  const sql = await getDeliveryBoardSqlFragments()

  let rows
  try {
    rows = await queryOrdersToPickWithPickLists(sql, supplierId, date)
  } catch {
    rows = await queryOrdersToPickWithoutPickLists(sql, supplierId, date)
  }

  return {
    count: rows.length,
    orders: rows.map((row) => ({
      orderId: row.order_id,
      orderStatus: row.order_status,
      restaurantName: row.restaurant_name,
      scheduledAt: row.scheduled_at,
      pickListId: row.pick_list_id ?? null,
      pickListStatus: row.pick_list_status ?? null,
    })),
  }
}

async function queryOrdersToPickWithPickLists(sql, supplierId, date) {
  const { rows } = await query(
    `
    SELECT DISTINCT ON (o.id)
      o.id AS order_id,
      o.status AS order_status,
      r.name AS restaurant_name,
      ${sql.scheduledAtExpr} AS scheduled_at,
      pl.id AS pick_list_id,
      pl.status AS pick_list_status
    FROM customer_order o
    JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
    JOIN restaurant r ON r.id = o.restaurant_id
    LEFT JOIN LATERAL (
      SELECT pl2.id, pl2.status
      FROM pick_list pl2
      WHERE pl2.order_id = o.id
        AND pl2.status NOT IN ('COMPLETED', 'CANCELLED', 'EXCEPTION')
      ORDER BY pl2.created_at DESC
      LIMIT 1
    ) pl ON true
    WHERE o.status = ANY($3::text[])
      AND ${sql.scheduledAtExpr}::date = $2::date
    ORDER BY o.id, o.created_at DESC
    LIMIT 100
    `,
    [supplierId, date, PICK_ORDER_STATUSES]
  )
  return rows
}

async function queryOrdersToPickWithoutPickLists(sql, supplierId, date) {
  const { rows } = await query(
    `
    SELECT DISTINCT ON (o.id)
      o.id AS order_id,
      o.status AS order_status,
      r.name AS restaurant_name,
      ${sql.scheduledAtExpr} AS scheduled_at,
      NULL::uuid AS pick_list_id,
      NULL::text AS pick_list_status
    FROM customer_order o
    JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
    JOIN restaurant r ON r.id = o.restaurant_id
    WHERE o.status = ANY($3::text[])
      AND ${sql.scheduledAtExpr}::date = $2::date
    ORDER BY o.id, o.created_at DESC
    LIMIT 100
    `,
    [supplierId, date, PICK_ORDER_STATUSES]
  )
  return rows
}

async function getShortages(supplierId) {
  const [{ rows: countRows }, { rows: previewRows }] = await Promise.all([
    query(
      `
      SELECT COUNT(*)::int AS count
      FROM order_fulfillment_issue fi
      WHERE fi.supplier_id = $1
        AND fi.status = ANY($2::text[])
      `,
      [supplierId, OPEN_ISSUE_STATUSES]
    ),
    query(
      `
      SELECT
        fi.id,
        fi.order_id,
        fi.issue_type,
        fi.status,
        fi.created_at,
        r.name AS restaurant_name,
        p.name AS product_name
      FROM order_fulfillment_issue fi
      JOIN restaurant r ON r.id = fi.restaurant_id
      JOIN order_item oi ON oi.id = fi.order_item_id
      JOIN product p ON p.id = oi.product_id
      WHERE fi.supplier_id = $1
        AND fi.status = ANY($2::text[])
      ORDER BY fi.created_at DESC
      LIMIT 5
      `,
      [supplierId, OPEN_ISSUE_STATUSES]
    ),
  ])

  return {
    count: countRows[0]?.count ?? 0,
    preview: previewRows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      issueType: row.issue_type,
      status: row.status,
      createdAt: row.created_at,
      restaurantName: row.restaurant_name,
      productName: row.product_name,
    })),
  }
}

/**
 * Morning run sheet for a supplier — aggregates KPIs, pick queue, deliveries, collections, and risks.
 */
export async function getSupplierRunSheet(supplierId, { date } = {}) {
  const runDate = normalizeRunSheetDate(date)

  const [commandCenter, deliveries, receivables, reorderIntel, ordersToPick, shortages] =
    await Promise.all([
      getSupplierCommandCenter(supplierId),
      getSupplierDeliveryBoard(supplierId, { date: runDate }),
      getSupplierReceivables(supplierId),
      getReorderIntelligence(supplierId),
      getOrdersToPick(supplierId, runDate),
      getShortages(supplierId),
    ])

  const receivablesDueToday = filterReceivablesDueToday(receivables)

  return {
    date: runDate,
    summary: {
      kpis: commandCenter.kpis,
      todaysPriorities: commandCenter.todaysPriorities,
    },
    ordersToPick,
    deliveries,
    receivablesDueToday,
    reorderLeads: reorderIntel.customersAtRisk.slice(0, 5),
    shortages,
  }
}
