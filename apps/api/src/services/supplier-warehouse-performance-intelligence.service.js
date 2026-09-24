import { query } from '../lib/db.js'
import { getWarehouseSupplierColumn } from '../lib/warehouse-helpers.js'

const DEFAULT_DAYS = 30
const DEFAULT_LIMIT = 20
const MAX_DAYS = 365
const MAX_LIMIT = 100

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10)
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback))
}

/**
 * Read-only factual warehouse performance for one supplier.
 *
 * This intentionally reports only recorded inventory thresholds and warehouse
 * assignment states. It does not assign work, choose a warehouse, infer a
 * target, reserve stock, or change fulfillment.
 */
export async function listSupplierWarehousePerformance(
  supplierId,
  { days = DEFAULT_DAYS, limit = DEFAULT_LIMIT } = {},
  dbQuery = query
) {
  if (!supplierId) throw new Error('supplierId is required')

  const windowDays = boundedInt(days, DEFAULT_DAYS, 1, MAX_DAYS)
  const resultLimit = boundedInt(limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
  const supplierColumn = await getWarehouseSupplierColumn((sql, params) => dbQuery(sql, params))

  const { rows } = await dbQuery(
    `
      SELECT
        w.id AS warehouse_id,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
        COALESCE(stock.stocked_products, 0)::int AS stocked_products,
        COALESCE(stock.low_stock_products, 0)::int AS low_stock_products,
        COALESCE(stock.available_quantity, 0)::numeric AS available_quantity,
        COALESCE(assignments.assignment_count, 0)::int AS assignment_count,
        COALESCE(assignments.delivered_count, 0)::int AS delivered_count,
        COALESCE(assignments.failed_count, 0)::int AS failed_count,
        COALESCE(assignments.active_count, 0)::int AS active_count
      FROM warehouse w
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS stocked_products,
          COUNT(*) FILTER (
            WHERE wi.reorder_point IS NOT NULL
              AND wi.quantity_available <= wi.reorder_point
          )::int AS low_stock_products,
          COALESCE(SUM(wi.quantity_available), 0)::numeric AS available_quantity
        FROM warehouse_inventory wi
        WHERE wi.warehouse_id = w.id
      ) stock ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS assignment_count,
          COUNT(*) FILTER (WHERE owa.status = 'delivered')::int AS delivered_count,
          COUNT(*) FILTER (WHERE owa.status = 'failed')::int AS failed_count,
          COUNT(*) FILTER (WHERE owa.status NOT IN ('delivered', 'failed'))::int AS active_count
        FROM order_warehouse_assignment owa
        WHERE owa.warehouse_id = w.id
          AND owa.assigned_at >= now() - ($2::int * INTERVAL '1 day')
      ) assignments ON TRUE
      WHERE w.${supplierColumn} = $1
        AND w.is_active = TRUE
      ORDER BY assignment_count DESC, low_stock_products DESC, w.name ASC
      LIMIT $3
    `,
    [supplierId, windowDays, resultLimit]
  )

  const warehouses = rows.map((row) => ({
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
    warehouseCode: row.warehouse_code || null,
    stockedProducts: Number(row.stocked_products) || 0,
    lowStockProducts: Number(row.low_stock_products) || 0,
    availableQuantity: Number(row.available_quantity) || 0,
    assignmentCount: Number(row.assignment_count) || 0,
    deliveredCount: Number(row.delivered_count) || 0,
    failedCount: Number(row.failed_count) || 0,
    activeCount: Number(row.active_count) || 0,
  }))

  return {
    windowDays,
    coverage: {
      activeWarehouses: warehouses.length,
      warehousesWithAssignments: warehouses.filter((warehouse) => warehouse.assignmentCount > 0)
        .length,
      warehousesWithLowStock: warehouses.filter((warehouse) => warehouse.lowStockProducts > 0)
        .length,
    },
    warehouses,
  }
}
