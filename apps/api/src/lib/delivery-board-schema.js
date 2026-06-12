import { query } from './db.js'
import { ensureDeliverySchema } from './ensure-delivery-schema.js'

/** @type {null | Awaited<ReturnType<typeof loadBoardSqlFragments>>} */
let cachedBoardSql = null

async function loadBoardSqlFragments() {
  const { rows: colRows } = await query(
    `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'customer_order' AND column_name IN ('placed_at', 'branch_id'))
        OR (table_name = 'delivery_zone' AND column_name IN ('warehouse_id', 'branch_id', 'supplier_id', 'name', 'is_active'))
        OR (table_name = 'restaurant' AND column_name IN ('delivery_latitude', 'delivery_longitude', 'delivery_location_label', 'address_json'))
        OR (table_name = 'branch' AND column_name IN ('delivery_latitude', 'delivery_longitude', 'delivery_location_label'))
        OR (table_name = 'drivers' AND column_name IN ('full_name'))
      )
    `
  )
  const { rows: tableRows } = await query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'proof_of_delivery',
        'order_warehouse_assignment',
        'delivery_zone',
        'branch',
        'driver_assignments',
        'drivers'
      )
    `
  )

  const colKey = (table, column) =>
    colRows.some((r) => r.table_name === table && r.column_name === column)
  const hasTable = (table) => tableRows.some((r) => r.table_name === table)

  const cityArea = colKey('restaurant', 'address_json')
    ? `COALESCE(r.address_json->>'city', 'Unassigned area')`
    : `'Unassigned area'`

  let zoneJoinSql = ''
  let deliveryAreaExpr = cityArea

  if (hasTable('delivery_zone')) {
    if (colKey('delivery_zone', 'warehouse_id') && hasTable('order_warehouse_assignment')) {
      const supplierClause = colKey('delivery_zone', 'supplier_id')
        ? ' AND dz.supplier_id = $1'
        : ''
      zoneJoinSql = `LEFT JOIN order_warehouse_assignment owa ON owa.order_id = o.id
    LEFT JOIN delivery_zone dz ON dz.warehouse_id = owa.warehouse_id${supplierClause}`
      deliveryAreaExpr = colKey('delivery_zone', 'name')
        ? `COALESCE(dz.name, ${cityArea})`
        : cityArea
    } else if (colKey('delivery_zone', 'branch_id') && colKey('customer_order', 'branch_id')) {
      const activeClause = colKey('delivery_zone', 'is_active')
        ? ' AND COALESCE(dz.is_active, TRUE) = TRUE'
        : ''
      zoneJoinSql = `LEFT JOIN delivery_zone dz ON dz.branch_id = o.branch_id${activeClause}`
      deliveryAreaExpr = colKey('delivery_zone', 'name')
        ? `COALESCE(dz.name, ${cityArea})`
        : cityArea
    }
  }

  const branchJoinSql =
    hasTable('branch') && colKey('customer_order', 'branch_id')
      ? 'LEFT JOIN branch b ON b.id = o.branch_id'
      : ''

  const hasCoords =
    colKey('restaurant', 'delivery_latitude') && colKey('restaurant', 'delivery_longitude')
  const destinationLatitudeExpr = hasCoords
    ? branchJoinSql && colKey('branch', 'delivery_latitude')
      ? 'COALESCE(b.delivery_latitude, r.delivery_latitude)'
      : 'r.delivery_latitude'
    : 'NULL::numeric'
  const destinationLongitudeExpr = hasCoords
    ? branchJoinSql && colKey('branch', 'delivery_longitude')
      ? 'COALESCE(b.delivery_longitude, r.delivery_longitude)'
      : 'r.delivery_longitude'
    : 'NULL::numeric'
  const destinationLabelExpr = hasCoords
    ? colKey('restaurant', 'delivery_location_label')
      ? branchJoinSql && colKey('branch', 'delivery_location_label')
        ? `COALESCE(b.delivery_location_label, r.delivery_location_label, r.name)`
        : `COALESCE(r.delivery_location_label, r.name)`
      : 'r.name'
    : 'r.name'

  const scheduledAtExpr = colKey('customer_order', 'placed_at')
    ? 'COALESCE(o.placed_at, o.created_at)'
    : 'o.created_at'

  const hasPodExpr = hasTable('proof_of_delivery')
    ? `EXISTS (SELECT 1 FROM proof_of_delivery pod WHERE pod.order_id = o.id)`
    : 'FALSE'

  const driverLateralSql =
    hasTable('driver_assignments') && hasTable('drivers')
      ? `LEFT JOIN LATERAL (
      SELECT da2.* FROM driver_assignments da2
      WHERE da2.order_id = o.id AND da2.status NOT IN ('reassigned')
      ORDER BY da2.created_at DESC LIMIT 1
    ) da ON true
    LEFT JOIN drivers d ON d.id = da.driver_id`
      : `LEFT JOIN LATERAL (SELECT NULL::uuid AS id, NULL::text AS status, NULL::uuid AS driver_id) da ON true
    LEFT JOIN drivers d ON FALSE`

  const driverNameExpr =
    hasTable('drivers') && colKey('drivers', 'full_name') ? 'd.full_name' : 'NULL::text'

  return {
    zoneJoinSql,
    branchJoinSql,
    driverLateralSql,
    deliveryAreaExpr,
    destinationLatitudeExpr,
    destinationLongitudeExpr,
    destinationLabelExpr,
    scheduledAtExpr,
    hasPodExpr,
    driverNameExpr,
  }
}

/** Fresh schema probe; runs delivery DDL repair first on Railway drift. */
export async function getDeliveryBoardSqlFragments({ repair = true } = {}) {
  if (repair) {
    try {
      await ensureDeliverySchema()
    } catch {
      // Board query still runs with minimal fragments if DDL is blocked (e.g. pooler).
    }
  }
  cachedBoardSql = await loadBoardSqlFragments()
  return cachedBoardSql
}

export function resetDeliveryBoardSqlCacheForTests() {
  cachedBoardSql = null
}
