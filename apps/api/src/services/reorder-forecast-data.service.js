import { query } from '../lib/db.js'
import { normalizeQuantityToProductUnit } from '../lib/reorder-unit-normalize.js'

const CONSUMPTION_TYPES = new Set(['SUBTRACT', 'WASTAGE', 'SPOILAGE'])
const RECEIVING_ADD = 'ADD'

/**
 * Load per-day consumption events for a restaurant scope.
 * Primary: inventory movements (subtract + waste).
 * Fallback: order quantities when movement consumption is sparse.
 *
 * @param {string} restaurantId
 * @param {{ branchId?: string | null, productId?: string | null, lookbackDays?: number }} opts
 */
export async function loadConsumptionHistory(restaurantId, opts = {}) {
  const lookbackDays = opts.lookbackDays ?? 90
  const branchId = opts.branchId ?? null
  const productId = opts.productId ?? null

  const branchFilter = branchId ? `AND COALESCE(iml.branch_id, co_mov.branch_id) = $3` : ''
  const productFilter = productId ? `AND iml.product_id = $${branchId ? 4 : 3}` : ''
  const params = [restaurantId, lookbackDays]
  if (branchId) params.push(branchId)
  if (productId) params.push(productId)

  const { rows: movementRows } = await query(
    `
    SELECT
      iml.product_id,
      COALESCE(iml.branch_id, co_mov.branch_id) AS branch_id,
      DATE(iml.created_at AT TIME ZONE 'UTC') AS usage_date,
      EXTRACT(DOW FROM iml.created_at AT TIME ZONE 'UTC')::int AS day_of_week,
      iml.type,
      iml.quantity,
      p.unit AS product_unit,
      'movement' AS source
    FROM inventory_movement_log iml
    JOIN product p ON p.id = iml.product_id
    LEFT JOIN customer_order co_mov ON co_mov.id = iml.reference_id
      AND iml.reference_type IN ('ORDER', 'CUSTOMER_ORDER')
    WHERE iml.restaurant_id = $1
      AND iml.created_at >= NOW() - ($2::int || ' days')::interval
      AND iml.type IN ('SUBTRACT', 'WASTAGE', 'SPOILAGE')
      ${branchFilter}
      ${productFilter}
    `,
    params
  )

  const branchFilterRecv = branchId ? `AND COALESCE(co.branch_id, iml.branch_id) = $3` : ''
  const productFilterRecv = productId ? `AND rli.product_id = $${branchId ? 4 : 3}` : ''

  const { rows: receivedRows } = await query(
    `
    SELECT
      rli.product_id,
      COALESCE(co.branch_id, iml.branch_id) AS branch_id,
      DATE(rr.received_at AT TIME ZONE 'UTC') AS usage_date,
      EXTRACT(DOW FROM rr.received_at AT TIME ZONE 'UTC')::int AS day_of_week,
      rli.received_quantity AS quantity,
      rli.unit AS line_unit,
      p.unit AS product_unit,
      'receiving' AS source
    FROM receiving_line_item rli
    JOIN receiving_report rr ON rr.id = rli.receiving_report_id
    JOIN customer_order co ON co.id = rr.order_id
    JOIN product p ON p.id = rli.product_id
    LEFT JOIN inventory_movement_log iml ON iml.reference_id = rr.id
      AND iml.reference_type = 'RECEIVING_REPORT'
      AND iml.product_id = rli.product_id
      AND iml.type = 'ADD'
    WHERE rr.restaurant_id = $1
      AND rr.received_at >= NOW() - ($2::int || ' days')::interval
      AND rli.received_quantity > 0
      ${branchFilterRecv}
      ${productFilterRecv}
    `,
    params
  )

  const branchFilterOrd = branchId ? `AND co.branch_id = $3` : ''
  const productFilterOrd = productId ? `AND oi.product_id = $${branchId ? 4 : 3}` : ''

  const { rows: orderRows } = await query(
    `
    SELECT
      oi.product_id,
      co.branch_id,
      DATE(COALESCE(co.placed_at, co.created_at) AT TIME ZONE 'UTC') AS usage_date,
      EXTRACT(DOW FROM COALESCE(co.placed_at, co.created_at) AT TIME ZONE 'UTC')::int AS day_of_week,
      oi.quantity,
      p.unit AS product_unit,
      'order_fallback' AS source
    FROM order_item oi
    JOIN customer_order co ON co.id = oi.order_id
    JOIN product p ON p.id = oi.product_id
    WHERE co.restaurant_id = $1
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      AND COALESCE(co.placed_at, co.created_at) >= NOW() - ($2::int || ' days')::interval
      ${branchFilterOrd}
      ${productFilterOrd}
    `,
    params
  )

  /** @type {Map<string, { productId: string, branchId: string | null, days: Map<string, number>, sources: Set<string>, unitPenalties: number[] }>} */
  const buckets = new Map()

  const bucketKey = (productId, branchId) => `${productId}:${branchId ?? 'tenant'}`

  const addUsage = (productId, branchId, dateKey, qty, source, penalty = 0) => {
    const key = bucketKey(productId, branchId)
    if (!buckets.has(key)) {
      buckets.set(key, {
        productId,
        branchId: branchId ?? null,
        days: new Map(),
        sources: new Set(),
        unitPenalties: [],
      })
    }
    const b = buckets.get(key)
    b.days.set(dateKey, (b.days.get(dateKey) || 0) + qty)
    b.sources.add(source)
    if (penalty > 0) b.unitPenalties.push(penalty)
  }

  for (const row of movementRows) {
    if (!CONSUMPTION_TYPES.has(row.type)) continue
    const qty = Math.abs(Number(row.quantity) || 0)
    addUsage(row.product_id, row.branch_id, row.usage_date, qty, 'movement')
  }

  for (const row of receivedRows) {
    const norm = normalizeQuantityToProductUnit(row.quantity, row.line_unit, row.product_unit)
    addUsage(
      row.product_id,
      row.branch_id,
      row.usage_date,
      norm.quantity,
      'receiving_inbound',
      norm.confidencePenalty
    )
  }

  // Order fallback only for product/branch keys with sparse movement consumption
  const movementTotals = new Map()
  for (const row of movementRows) {
    const k = bucketKey(row.product_id, row.branch_id)
    movementTotals.set(k, (movementTotals.get(k) || 0) + Math.abs(Number(row.quantity) || 0))
  }

  for (const row of orderRows) {
    const k = bucketKey(row.product_id, row.branch_id)
    const movTotal = movementTotals.get(k) || 0
    if (movTotal >= 3) continue
    const norm = normalizeQuantityToProductUnit(row.quantity, row.product_unit, row.product_unit)
    addUsage(row.product_id, row.branch_id, row.usage_date, norm.quantity, 'order_fallback')
  }

  return [...buckets.values()].map((b) => ({
    productId: b.productId,
    branchId: b.branchId,
    dailyUsage: [...b.days.entries()].map(([date, quantity]) => ({ date, quantity })),
    sources: [...b.sources],
    avgUnitPenalty:
      b.unitPenalties.length > 0
        ? b.unitPenalties.reduce((a, c) => a + c, 0) / b.unitPenalties.length
        : 0,
  }))
}

/**
 * Inventory + supplier pack context for forecast targets.
 * @param {string} restaurantId
 * @param {{ branchId?: string | null, productIds?: string[] }} opts
 */
export async function loadForecastInventoryContext(restaurantId, opts = {}) {
  const branchId = opts.branchId ?? null
  const productIds = opts.productIds ?? null

  let productClause = ''
  const params = [restaurantId]
  if (productIds?.length) {
    params.push(productIds)
    productClause = `AND ri.product_id = ANY($${params.length}::uuid[])`
  }

  const { rows } = await query(
    `
    SELECT
      ri.product_id,
      ri.branch_id,
      ri.quantity AS current_qty,
      ri.low_stock_threshold,
      p.name AS product_name,
      p.unit AS product_unit,
      p.supplier_id,
      COALESCE(pis.lead_time_days, 7) AS lead_time_days,
      COALESCE(pis.moq, 1) AS moq,
      COALESCE(pis.order_multiple, 1) AS order_multiple
    FROM restaurant_inventory ri
    JOIN product p ON p.id = ri.product_id
    LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
    WHERE ri.restaurant_id = $1
      ${productClause}
    `,
    params
  )

  if (branchId) {
    return rows.filter((r) => r.branch_id === branchId || r.branch_id == null)
  }
  return rows
}

/**
 * Active branches for a restaurant (for per-branch forecast passes).
 * @param {string} restaurantId
 */
export async function listRestaurantBranches(restaurantId) {
  const { rows } = await query(
    `
    SELECT id, name
    FROM branch
    WHERE tenant_id = $1 AND COALESCE(is_active, true) = true
    ORDER BY name
    `,
    [restaurantId]
  )
  return rows
}
