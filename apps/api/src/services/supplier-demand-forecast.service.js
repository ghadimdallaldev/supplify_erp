import { query } from '../lib/db.js'

const OBSERVATION_DAYS = 90
const RECENT_DAYS = 30
const MIN_SALE_DAYS = 7
const DEFAULT_HORIZON_DAYS = 14
const MAX_HORIZON_DAYS = 90
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function listSupplierDemandForecast(
  supplierId,
  { horizonDays = DEFAULT_HORIZON_DAYS, limit = DEFAULT_LIMIT, includeAll = false } = {}
) {
  const parsedHorizon = Number.parseInt(horizonDays, 10)
  const effectiveHorizonDays = Math.min(
    MAX_HORIZON_DAYS,
    Math.max(1, parsedHorizon || DEFAULT_HORIZON_DAYS)
  )
  const parsedLimit = Number.parseInt(limit, 10)
  const effectiveLimit = Math.min(MAX_LIMIT, Math.max(1, parsedLimit || DEFAULT_LIMIT))

  const { rows } = await query(
    `
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.sku,
        COALESCE(SUM(oi.quantity), 0)::numeric AS sold_quantity_90,
        COALESCE(
          SUM(oi.quantity) FILTER (
            WHERE COALESCE(co.placed_at, co.created_at) >= now() - ($2::int * INTERVAL '1 day')
          ),
          0
        )::numeric AS sold_quantity_30,
        COUNT(DISTINCT DATE(COALESCE(co.placed_at, co.created_at)))::int AS sale_days_90,
        COUNT(DISTINCT co.id)::int AS order_count_90
      FROM customer_order co
      JOIN order_item oi ON oi.order_id = co.id AND oi.supplier_id = $1
      JOIN product p ON p.id = oi.product_id AND p.supplier_id = $1
      WHERE co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
        AND COALESCE(co.placed_at, co.created_at) >= now() - ($3::int * INTERVAL '1 day')
      GROUP BY p.id, p.name, p.sku
    `,
    [supplierId, RECENT_DAYS, OBSERVATION_DAYS]
  )

  const forecastable = rows.filter(
    (row) => Number(row.sale_days_90) >= MIN_SALE_DAYS && Number(row.sold_quantity_90) > 0
  )
  const forecasts = forecastable
    .map((row) => {
      const soldQuantity30 = Number(row.sold_quantity_30) || 0
      const soldQuantity90 = Number(row.sold_quantity_90) || 0
      const dailyDemand30 = soldQuantity30 / RECENT_DAYS
      const dailyDemand90 = soldQuantity90 / OBSERVATION_DAYS
      const forecastDailyDemand =
        soldQuantity30 > 0 ? dailyDemand30 * 0.6 + dailyDemand90 * 0.4 : dailyDemand90

      return {
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku || null,
        soldQuantity30,
        soldQuantity90,
        saleDays90: Number(row.sale_days_90),
        orderCount90: Number(row.order_count_90),
        forecastDailyDemand: Number(forecastDailyDemand.toFixed(6)),
        projectedDemandQty: Number((forecastDailyDemand * effectiveHorizonDays).toFixed(3)),
      }
    })
    .sort((a, b) => b.projectedDemandQty - a.projectedDemandQty)

  return {
    observationDays: OBSERVATION_DAYS,
    recentDays: RECENT_DAYS,
    horizonDays: effectiveHorizonDays,
    coverage: {
      productsWithCompletedSales: rows.length,
      productsWithSufficientHistory: forecastable.length,
    },
    forecasts: includeAll ? forecasts : forecasts.slice(0, effectiveLimit),
  }
}
