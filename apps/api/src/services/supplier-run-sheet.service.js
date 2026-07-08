import { query } from '../lib/db.js'
import { getDeliveryBoardSqlFragments } from '../lib/delivery-board-schema.js'
import { logger } from '../lib/logger.js'
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

function toDateOnly(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function filterReceivablesDueToday(receivables, runDate) {
  const targetDate = toDateOnly(`${runDate}T00:00:00`)
  const invoicesSource = Array.isArray(receivables?.invoices) ? receivables.invoices : []
  if (!targetDate) {
    return {
      summary: {
        count: 0,
        totalBalanceDue: 0,
        dueTodayCount: 0,
        overdueCount: 0,
      },
      invoices: [],
    }
  }

  const invoices = invoicesSource
    .map((inv) => {
      const due = toDateOnly(inv.dueDate)
      const isOverdue = due ? due < targetDate : false
      return { ...inv, isOverdue, daysOverdue: isOverdue ? inv.daysOverdue : 0, _dueDate: due }
    })
    .filter((inv) => inv._dueDate && inv._dueDate <= targetDate)

  let dueTodayCount = 0
  let overdueCount = 0
  let totalBalanceDue = 0

  for (const inv of invoices) {
    totalBalanceDue += Number(inv.balanceDue) || 0
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
    invoices: invoices.map(({ _dueDate, ...inv }) => inv),
  }
}

function emptyRunSheetCommandCenter() {
  return {
    kpis: {
      ordersToPrepareToday: 0,
      deliveriesPendingToday: 0,
      ordersWaitingAction: 0,
      unpaidBalance: 0,
      overdueBalance: 0,
      customersDueReorder: 0,
      lowStockCount: 0,
      openDisputes: 0,
      fulfillmentAlerts: 0,
    },
    todaysPriorities: [],
  }
}

function emptyDeliveryBoard(date) {
  return {
    filters: {
      date,
      status: null,
      driverId: null,
      area: null,
    },
    orders: [],
    byArea: {},
    routeSummary: [],
    stats: {
      total: 0,
      pending: 0,
      assigned: 0,
      outForDelivery: 0,
      delivered: 0,
      failed: 0,
      rescheduled: 0,
    },
  }
}

const emptyReceivables = {
  summary: {
    unpaidCount: 0,
    unpaidTotal: 0,
    overdueTotal: 0,
    partialCount: 0,
    whoOwesMeTotal: 0,
  },
  aging: {},
  invoices: [],
  topDebtors: [],
}

const emptyReorderIntelligence = {
  dueCount: 0,
  graceDays: 7,
  customersAtRisk: [],
}

async function safeRunSheetSection(name, supplierId, fallback, loader) {
  try {
    return await loader()
  } catch (error) {
    logger.warn({
      event: 'supplier.run_sheet.section_failed',
      section: name,
      supplierId,
      error: error.message,
      code: error.code,
    })
    return fallback
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
    WHERE o.status = ANY($3::order_status[])
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
    WHERE o.status = ANY($3::order_status[])
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
      safeRunSheetSection('command_center', supplierId, emptyRunSheetCommandCenter(), () =>
        getSupplierCommandCenter(supplierId)
      ),
      safeRunSheetSection('deliveries', supplierId, emptyDeliveryBoard(runDate), () =>
        getSupplierDeliveryBoard(supplierId, { date: runDate })
      ),
      safeRunSheetSection('receivables', supplierId, emptyReceivables, () =>
        getSupplierReceivables(supplierId)
      ),
      safeRunSheetSection('reorder_intelligence', supplierId, emptyReorderIntelligence, () =>
        getReorderIntelligence(supplierId)
      ),
      safeRunSheetSection('orders_to_pick', supplierId, { count: 0, orders: [] }, () =>
        getOrdersToPick(supplierId, runDate)
      ),
      safeRunSheetSection('shortages', supplierId, { count: 0, preview: [] }, () =>
        getShortages(supplierId)
      ),
    ])

  const receivablesDueToday = filterReceivablesDueToday(receivables, runDate)

  return {
    date: runDate,
    summary: {
      kpis: commandCenter.kpis ?? emptyRunSheetCommandCenter().kpis,
      todaysPriorities: commandCenter.todaysPriorities ?? [],
    },
    ordersToPick,
    deliveries,
    receivablesDueToday,
    reorderLeads: (reorderIntel.customersAtRisk ?? []).slice(0, 5),
    shortages,
  }
}
