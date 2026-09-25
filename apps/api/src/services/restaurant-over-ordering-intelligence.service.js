/**
 * Deterministic review signals for stock that appears excessive against the
 * restaurant's own observed purchasing, receiving, usage, and waste history.
 *
 * This is deliberately not a reorder recommendation and does not infer a
 * restaurant-specific maximum-stock policy. A product is only flagged after
 * repeated orders, comparable receipt units, observed usage, a long current
 * stock cover, and receipts materially above observed depletion.
 */
import { query } from '../lib/db.js'
import { normalizeProductUnit } from '../lib/quantity-unit.js'

const DEFAULT_DAYS = 90
const MAX_DAYS = 365
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const MIN_ORDERS = 2
const MIN_STOCK_COVERAGE_DAYS = 45
const MIN_RECEIPT_TO_DEPLETION_RATIO = 1.5
const HIGH_WASTE_SHARE = 0.25

function clampInt(value, { min, max, fallback }) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function numberOrZero(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function integer(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function comparableReceiving(receivingByUnit, productUnit) {
  const normalizedProductUnit = normalizeProductUnit(productUnit || 'unit')
  const coverage = { matchingLines: 0, mismatchedLines: 0 }
  let quantity = 0

  for (const entry of asArray(receivingByUnit)) {
    const lines = integer(entry.line_count)
    if (normalizeProductUnit(entry.unit || productUnit || 'unit') !== normalizedProductUnit) {
      coverage.mismatchedLines += lines
      continue
    }
    coverage.matchingLines += lines
    quantity += numberOrZero(entry.quantity)
  }

  return { quantity, coverage }
}

/**
 * @param {string} restaurantId
 * @param {{ days?: number, limit?: number }} [opts]
 * @param {Function} [dbQuery]
 */
export async function listOverOrderingIntelligence(restaurantId, opts = {}, dbQuery = query) {
  if (!restaurantId) throw new Error('restaurantId is required')

  const days = clampInt(opts.days, { min: 30, max: MAX_DAYS, fallback: DEFAULT_DAYS })
  const limit = clampInt(opts.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT })

  const { rows } = await dbQuery(
    `
    WITH ordered AS (
      SELECT
        oi.product_id,
        COUNT(DISTINCT co.id)::int AS order_count,
        SUM(oi.quantity) AS ordered_quantity
      FROM customer_order co
      JOIN order_item oi ON oi.order_id = co.id
      WHERE co.restaurant_id = $1
        AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
        AND COALESCE(co.placed_at, co.created_at) >= now() - ($2::int * INTERVAL '1 day')
      GROUP BY oi.product_id
    ),
    received_by_unit AS (
      SELECT
        rli.product_id,
        rli.unit,
        COUNT(*)::int AS line_count,
        SUM(rli.received_quantity) AS received_quantity
      FROM receiving_report rr
      JOIN receiving_line_item rli ON rli.receiving_report_id = rr.id
      WHERE rr.restaurant_id = $1
        AND rr.received_at >= now() - ($2::int * INTERVAL '1 day')
        AND rli.product_id IS NOT NULL
      GROUP BY rli.product_id, rli.unit
    ),
    received AS (
      SELECT
        product_id,
        json_agg(
          json_build_object(
            'unit', unit,
            'line_count', line_count,
            'quantity', received_quantity
          )
          ORDER BY unit
        ) AS receiving_by_unit
      FROM received_by_unit
      GROUP BY product_id
    ),
    used AS (
      SELECT product_id, SUM(ABS(quantity)) AS usage_quantity
      FROM inventory_movement_log
      WHERE restaurant_id = $1
        AND type = 'SUBTRACT'
        AND created_at >= now() - ($2::int * INTERVAL '1 day')
      GROUP BY product_id
    ),
    wasted AS (
      SELECT product_id, SUM(ABS(quantity)) AS waste_quantity
      FROM inventory_adjustment
      WHERE restaurant_id = $1
        AND adjustment_type IN ('WASTAGE', 'SPOILAGE')
        AND created_at >= now() - ($2::int * INTERVAL '1 day')
      GROUP BY product_id
    ),
    stock AS (
      SELECT product_id, SUM(quantity) AS current_quantity
      FROM restaurant_inventory
      WHERE restaurant_id = $1
      GROUP BY product_id
    ),
    observed_products AS (
      SELECT product_id FROM ordered
      UNION SELECT product_id FROM received
      UNION SELECT product_id FROM used
      UNION SELECT product_id FROM wasted
      UNION SELECT product_id FROM stock
    )
    SELECT
      observed_products.product_id,
      p.name AS product_name,
      p.unit AS product_unit,
      s.name AS supplier_name,
      COALESCE(ordered.order_count, 0)::int AS order_count,
      COALESCE(ordered.ordered_quantity, 0) AS ordered_quantity,
      received.receiving_by_unit,
      COALESCE(used.usage_quantity, 0) AS usage_quantity,
      COALESCE(wasted.waste_quantity, 0) AS waste_quantity,
      COALESCE(stock.current_quantity, 0) AS current_quantity
    FROM observed_products
    JOIN product p ON p.id = observed_products.product_id
    LEFT JOIN supplier s ON s.id = p.supplier_id
    LEFT JOIN ordered ON ordered.product_id = observed_products.product_id
    LEFT JOIN received ON received.product_id = observed_products.product_id
    LEFT JOIN used ON used.product_id = observed_products.product_id
    LEFT JOIN wasted ON wasted.product_id = observed_products.product_id
    LEFT JOIN stock ON stock.product_id = observed_products.product_id
    ORDER BY p.name ASC
    `,
    [restaurantId, days]
  )

  const products = rows.map((row) => {
    const orderedQuantity = numberOrZero(row.ordered_quantity)
    const usageQuantity = numberOrZero(row.usage_quantity)
    const wasteQuantity = numberOrZero(row.waste_quantity)
    const currentQuantity = numberOrZero(row.current_quantity)
    const receiving = comparableReceiving(row.receiving_by_unit, row.product_unit)
    const receivedQuantity = receiving.quantity
    const depletionQuantity = usageQuantity + wasteQuantity
    const stockCoverageDays = usageQuantity > 0 ? currentQuantity / (usageQuantity / days) : null
    const receiptToDepletionRatio =
      depletionQuantity > 0 ? receivedQuantity / depletionQuantity : null
    const wasteShare = depletionQuantity > 0 ? wasteQuantity / depletionQuantity : null
    const hasCompleteComparableData =
      integer(row.order_count) >= MIN_ORDERS &&
      orderedQuantity > 0 &&
      receivedQuantity > 0 &&
      usageQuantity > 0 &&
      receiving.coverage.mismatchedLines === 0
    const excessStockCoverage =
      hasCompleteComparableData &&
      stockCoverageDays !== null &&
      stockCoverageDays >= MIN_STOCK_COVERAGE_DAYS &&
      receiptToDepletionRatio !== null &&
      receiptToDepletionRatio >= MIN_RECEIPT_TO_DEPLETION_RATIO
    const wasteWithExcessStock =
      excessStockCoverage && wasteShare !== null && wasteShare >= HIGH_WASTE_SHARE

    return {
      productId: row.product_id,
      productName: row.product_name,
      productUnit: row.product_unit ?? null,
      supplierName: row.supplier_name ?? null,
      orders: {
        count: integer(row.order_count),
        quantity: orderedQuantity,
      },
      receiving: {
        quantity: receivedQuantity,
        matchingLines: receiving.coverage.matchingLines,
        mismatchedLines: receiving.coverage.mismatchedLines,
      },
      usage: { quantity: usageQuantity },
      waste: { quantity: wasteQuantity, sharePct: wasteShare === null ? null : wasteShare * 100 },
      stock: { currentQuantity, coverageDays: stockCoverageDays },
      comparisons: {
        receiptToDepletionRatio,
        completeComparableData: hasCompleteComparableData,
      },
      signals: [
        excessStockCoverage && 'excess_stock_coverage',
        wasteWithExcessStock && 'waste_with_excess_stock',
      ].filter(Boolean),
    }
  })

  const flaggedCandidates = products.filter((product) => product.signals.length > 0)
  const flaggedProducts = flaggedCandidates
    .sort(
      (a, b) =>
        (b.stock.coverageDays ?? 0) - (a.stock.coverageDays ?? 0) ||
        b.waste.sharePct - a.waste.sharePct ||
        a.productName.localeCompare(b.productName)
    )
    .slice(0, limit)

  return {
    windowDays: days,
    summary: {
      productsObserved: products.length,
      productsWithCompleteComparableData: products.filter(
        (product) => product.comparisons.completeComparableData
      ).length,
      flaggedProducts: flaggedCandidates.length,
      productsWithReceiptUnitMismatch: products.filter(
        (product) => product.receiving.mismatchedLines > 0
      ).length,
    },
    products: flaggedProducts,
  }
}
