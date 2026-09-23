/**
 * Advanced, deterministic waste intelligence for restaurants.
 *
 * This deliberately builds on the inventory_adjustment records used by the
 * existing Waste & spoilage report. It does not estimate a cost for movements
 * logged without one, and it never calls a one-off amount "high" without a
 * restaurant-specific baseline. Signals therefore require repeat incidents or
 * an observed increase against the preceding, equal-length period.
 */
import { query } from '../lib/db.js'

const DEFAULT_DAYS = 30
const MAX_DAYS = 365
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

function clampInt(value, { min, max, fallback }) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function integer(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0
}

/**
 * Compare logged waste with the immediately preceding, equal-length window.
 *
 * @param {string} restaurantId
 * @param {{ days?: number, limit?: number }} [opts]
 * @param {Function} [dbQuery]
 */
export async function getWasteIntelligence(restaurantId, opts = {}, dbQuery = query) {
  if (!restaurantId) throw new Error('restaurantId is required')

  const days = clampInt(opts.days, { min: 7, max: MAX_DAYS, fallback: DEFAULT_DAYS })
  const limit = clampInt(opts.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT })

  const { rows } = await dbQuery(
    `
    WITH movement AS (
      SELECT
        ia.product_id,
        ia.quantity,
        COALESCE(ia.total_cost, ia.unit_cost * ia.quantity) AS waste_cost,
        ia.created_at,
        p.name AS product_name,
        p.unit AS product_unit,
        s.name AS supplier_name,
        CASE
          WHEN ia.created_at >= now() - ($2::int * INTERVAL '1 day') THEN 'current'
          ELSE 'previous'
        END AS window
      FROM inventory_adjustment ia
      JOIN product p ON p.id = ia.product_id
      LEFT JOIN supplier s ON s.id = p.supplier_id
      WHERE ia.restaurant_id = $1
        AND ia.adjustment_type IN ('WASTAGE', 'SPOILAGE')
        AND ia.created_at >= now() - ($2::int * INTERVAL '2 days')
    ),
    summary AS (
      SELECT
        window,
        COUNT(*)::int AS incidents,
        COUNT(*) FILTER (WHERE waste_cost IS NOT NULL)::int AS costed_incidents,
        COUNT(*) FILTER (WHERE waste_cost IS NULL)::int AS uncosted_incidents,
        COUNT(DISTINCT product_id)::int AS affected_products,
        SUM(waste_cost) AS waste_cost
      FROM movement
      GROUP BY window
    ),
    product_windows AS (
      SELECT
        product_id,
        MAX(product_name) AS product_name,
        MAX(product_unit) AS product_unit,
        MAX(supplier_name) AS supplier_name,
        COUNT(*) FILTER (WHERE window = 'current')::int AS current_incidents,
        COUNT(*) FILTER (WHERE window = 'previous')::int AS previous_incidents,
        COUNT(*) FILTER (WHERE window = 'current' AND waste_cost IS NOT NULL)::int AS costed_incidents,
        COUNT(*) FILTER (WHERE window = 'current' AND waste_cost IS NULL)::int AS uncosted_incidents,
        SUM(waste_cost) FILTER (WHERE window = 'current') AS current_waste_cost,
        SUM(waste_cost) FILTER (WHERE window = 'previous') AS previous_waste_cost,
        SUM(quantity) FILTER (WHERE window = 'current') AS current_waste_qty
      FROM movement
      GROUP BY product_id
    ),
    hotspots AS (
      SELECT *
      FROM product_windows
      WHERE current_incidents >= 2
         OR (
           current_waste_cost IS NOT NULL
           AND previous_waste_cost IS NOT NULL
           AND previous_waste_cost > 0
           AND current_waste_cost > previous_waste_cost
         )
      ORDER BY current_waste_cost DESC NULLS LAST, current_incidents DESC, product_name ASC
      LIMIT $3
    )
    SELECT
      (SELECT row_to_json(current_summary) FROM summary current_summary WHERE window = 'current')
        AS current_summary,
      (SELECT row_to_json(previous_summary) FROM summary previous_summary WHERE window = 'previous')
        AS previous_summary,
      COALESCE((SELECT json_agg(hotspots) FROM hotspots), '[]'::json) AS hotspots
    `,
    [restaurantId, days, limit]
  )

  const row = rows[0] ?? {}
  const current = row.current_summary ?? {}
  const previous = row.previous_summary ?? {}
  const currentWasteCost = numberOrNull(current.waste_cost)
  const previousWasteCost = numberOrNull(previous.waste_cost)

  const hotspots = (row.hotspots ?? []).map((hotspot) => {
    const currentCost = numberOrNull(hotspot.current_waste_cost)
    const previousCost = numberOrNull(hotspot.previous_waste_cost)
    const repeated = integer(hotspot.current_incidents) >= 2
    const risingCost =
      currentCost !== null &&
      previousCost !== null &&
      previousCost > 0 &&
      currentCost > previousCost

    return {
      productId: hotspot.product_id,
      productName: hotspot.product_name,
      productUnit: hotspot.product_unit ?? null,
      supplierName: hotspot.supplier_name ?? null,
      currentIncidents: integer(hotspot.current_incidents),
      previousIncidents: integer(hotspot.previous_incidents),
      currentWasteQuantity: numberOrNull(hotspot.current_waste_qty),
      currentWasteCost: currentCost,
      previousWasteCost: previousCost,
      costChangePct:
        currentCost !== null && previousCost !== null && previousCost > 0
          ? ((currentCost - previousCost) / previousCost) * 100
          : null,
      costCoverage: {
        costedIncidents: integer(hotspot.costed_incidents),
        uncostedIncidents: integer(hotspot.uncosted_incidents),
      },
      signals: [repeated && 'repeated_waste', risingCost && 'rising_waste_cost'].filter(Boolean),
    }
  })

  return {
    windowDays: days,
    summary: {
      current: {
        incidents: integer(current.incidents),
        affectedProducts: integer(current.affected_products),
        wasteCost: currentWasteCost,
        costCoverage: {
          costedIncidents: integer(current.costed_incidents),
          uncostedIncidents: integer(current.uncosted_incidents),
        },
      },
      previous: {
        incidents: integer(previous.incidents),
        affectedProducts: integer(previous.affected_products),
        wasteCost: previousWasteCost,
      },
      costChangePct:
        currentWasteCost !== null && previousWasteCost !== null && previousWasteCost > 0
          ? ((currentWasteCost - previousWasteCost) / previousWasteCost) * 100
          : null,
    },
    hotspots,
  }
}
