import { query } from '../lib/db.js'
import { getWarehouseSupplierColumn } from '../lib/warehouse-helpers.js'

const OBSERVATION_DAYS = 90
const RECENT_DAYS = 30
const MIN_SALE_DAYS = 7
const DEFAULT_HORIZON_DAYS = 14
const MAX_HORIZON_DAYS = 90
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10)
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback))
}

/**
 * Per-warehouse demand forecast from delivered, item-specific assignments only.
 *
 * A warehouse assignment is only included when it identifies one order item and
 * reached delivered status. This prevents a multi-warehouse order from being
 * attributed wholesale to every warehouse and excludes failed/superseded retries.
 */
export async function listSupplierWarehouseDemandForecast(
  supplierId,
  { horizonDays = DEFAULT_HORIZON_DAYS, limit = DEFAULT_LIMIT } = {},
  dbQuery = query
) {
  if (!supplierId) throw new Error('supplierId is required')

  const effectiveHorizonDays = boundedInt(horizonDays, DEFAULT_HORIZON_DAYS, 1, MAX_HORIZON_DAYS)
  const effectiveLimit = boundedInt(limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
  const supplierColumn = await getWarehouseSupplierColumn((sql, params) => dbQuery(sql, params))

  const { rows } = await dbQuery(
    `
      SELECT
        w.id AS warehouse_id,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
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
      FROM order_warehouse_assignment owa
      JOIN warehouse w ON w.id = owa.warehouse_id
      JOIN customer_order co ON co.id = owa.order_id
      JOIN order_item oi ON oi.id = owa.order_item_id AND oi.order_id = co.id AND oi.supplier_id = $1
      JOIN product p ON p.id = oi.product_id AND p.supplier_id = $1
      WHERE w.${supplierColumn} = $1
        AND w.is_active = TRUE
        AND owa.order_item_id IS NOT NULL
        AND owa.status = 'delivered'
        AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
        AND COALESCE(co.placed_at, co.created_at) >= now() - ($3::int * INTERVAL '1 day')
      GROUP BY w.id, w.name, w.code, p.id, p.name, p.sku
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
        warehouseId: row.warehouse_id,
        warehouseName: row.warehouse_name,
        warehouseCode: row.warehouse_code || null,
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
      warehouseProductRowsWithDeliveredHistory: rows.length,
      warehouseProductRowsWithSufficientHistory: forecastable.length,
      warehousesWithSufficientHistory: new Set(forecasts.map((forecast) => forecast.warehouseId))
        .size,
    },
    forecasts: forecasts.slice(0, effectiveLimit),
  }
}
