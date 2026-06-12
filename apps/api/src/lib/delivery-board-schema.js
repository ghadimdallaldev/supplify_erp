import { query } from './db.js'

/** @type {null | {
 *   zoneJoinSql: string
 *   deliveryAreaExpr: string
 *   destinationLatitudeExpr: string
 *   destinationLongitudeExpr: string
 *   destinationLabelExpr: string
 *   hasPodExpr: string
 *   useWarehouseAssignmentJoin: boolean
 * }} */
let cachedBoardSql = null

async function loadBoardSqlFragments() {
  const { rows: colRows } = await query(
    `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'delivery_zone' AND column_name IN ('warehouse_id', 'branch_id', 'supplier_id', 'name', 'is_active'))
        OR (table_name = 'restaurant' AND column_name IN ('delivery_latitude', 'delivery_longitude', 'delivery_location_label'))
        OR (table_name = 'branch' AND column_name IN ('delivery_latitude', 'delivery_longitude', 'delivery_location_label'))
      )
    `
  )
  const { rows: tableRows } = await query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('proof_of_delivery', 'order_warehouse_assignment', 'delivery_zone')
    `
  )

  const colKey = (table, column) =>
    colRows.some((r) => r.table_name === table && r.column_name === column)
  const hasTable = (table) => tableRows.some((r) => r.table_name === table)

  const cityArea = `COALESCE(r.address_json->>'city', 'Unassigned area')`
  let zoneJoinSql = ''
  let deliveryAreaExpr = cityArea
  let useWarehouseAssignmentJoin = false

  if (hasTable('delivery_zone')) {
    if (colKey('delivery_zone', 'warehouse_id')) {
      const supplierClause = colKey('delivery_zone', 'supplier_id')
        ? ' AND dz.supplier_id = $1'
        : ''
      if (hasTable('order_warehouse_assignment') && colKey('delivery_zone', 'warehouse_id')) {
        zoneJoinSql = `LEFT JOIN order_warehouse_assignment owa ON owa.order_id = o.id
    LEFT JOIN delivery_zone dz ON dz.warehouse_id = owa.warehouse_id${supplierClause}`
        useWarehouseAssignmentJoin = true
        deliveryAreaExpr = colKey('delivery_zone', 'name')
          ? `COALESCE(dz.name, ${cityArea})`
          : cityArea
      }
    } else if (colKey('delivery_zone', 'branch_id')) {
      const activeClause = colKey('delivery_zone', 'is_active')
        ? ' AND COALESCE(dz.is_active, TRUE) = TRUE'
        : ''
      zoneJoinSql = `LEFT JOIN delivery_zone dz ON dz.branch_id = o.branch_id${activeClause}`
      deliveryAreaExpr = colKey('delivery_zone', 'name')
        ? `COALESCE(dz.name, ${cityArea})`
        : cityArea
    }
  }

  const hasCoords =
    colKey('restaurant', 'delivery_latitude') && colKey('restaurant', 'delivery_longitude')
  const destinationLatitudeExpr = hasCoords
    ? colKey('branch', 'delivery_latitude')
      ? 'COALESCE(b.delivery_latitude, r.delivery_latitude)'
      : 'r.delivery_latitude'
    : 'NULL::numeric'
  const destinationLongitudeExpr = hasCoords
    ? colKey('branch', 'delivery_longitude')
      ? 'COALESCE(b.delivery_longitude, r.delivery_longitude)'
      : 'r.delivery_longitude'
    : 'NULL::numeric'
  const destinationLabelExpr = hasCoords
    ? colKey('restaurant', 'delivery_location_label')
      ? colKey('branch', 'delivery_location_label')
        ? `COALESCE(b.delivery_location_label, r.delivery_location_label, r.name)`
        : `COALESCE(r.delivery_location_label, r.name)`
      : 'r.name'
    : 'r.name'

  const hasPodExpr = hasTable('proof_of_delivery')
    ? `EXISTS (SELECT 1 FROM proof_of_delivery pod WHERE pod.order_id = o.id)`
    : 'FALSE'

  return {
    zoneJoinSql,
    deliveryAreaExpr,
    destinationLatitudeExpr,
    destinationLongitudeExpr,
    destinationLabelExpr,
    hasPodExpr,
    useWarehouseAssignmentJoin,
  }
}

export async function getDeliveryBoardSqlFragments() {
  if (!cachedBoardSql) {
    cachedBoardSql = await loadBoardSqlFragments()
  }
  return cachedBoardSql
}

export function resetDeliveryBoardSqlCacheForTests() {
  cachedBoardSql = null
}
