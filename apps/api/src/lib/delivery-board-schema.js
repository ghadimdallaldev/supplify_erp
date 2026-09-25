import { query } from './db.js'
import { buildZoneAddressExprs, warehouseZoneLateralSql } from './delivery-zone-join.js'
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
        (table_name = 'customer_order' AND column_name IN ('placed_at', 'branch_id', 'requested_delivery_date', 'delivery_location_snapshot'))
        OR (table_name = 'delivery_zone' AND column_name IN ('warehouse_id', 'branch_id', 'supplier_id', 'name', 'is_active'))
        OR (table_name = 'restaurant' AND column_name IN ('delivery_latitude', 'delivery_longitude', 'delivery_location_label', 'address_json'))
        OR (table_name = 'branch' AND column_name IN ('name', 'address', 'delivery_latitude', 'delivery_longitude', 'delivery_location_label', 'tenant_id'))
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
        'drivers',
        'route_stop',
        'delivery_route'
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
      // Tie zone to the warehouse leg on each driver assignment row (multi-WH board).
      const activeClause = colKey('delivery_zone', 'is_active')
        ? ' AND COALESCE(dz.is_active, TRUE) = TRUE'
        : ''
      const canJoinBranch =
        hasTable('branch') && colKey('customer_order', 'branch_id') && colKey('branch', 'tenant_id')
      const zoneAddress = buildZoneAddressExprs({
        hasSnapshot: colKey('customer_order', 'delivery_location_snapshot'),
        hasBranchAddress: canJoinBranch && colKey('branch', 'address'),
        hasBranchCoords:
          canJoinBranch &&
          colKey('branch', 'delivery_latitude') &&
          colKey('branch', 'delivery_longitude'),
        hasRestaurantAddress: colKey('restaurant', 'address_json'),
        hasRestaurantCoords:
          colKey('restaurant', 'delivery_latitude') && colKey('restaurant', 'delivery_longitude'),
      })
      zoneJoinSql = `LEFT JOIN order_warehouse_assignment owa ON owa.id = da.warehouse_assignment_id AND owa.status NOT IN ('failed', 'superseded')
    ${warehouseZoneLateralSql({ supplierClause, activeClause, ...zoneAddress })}`
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
    hasTable('branch') && colKey('customer_order', 'branch_id') && colKey('branch', 'tenant_id')
      ? 'LEFT JOIN branch b ON b.id = o.branch_id AND b.tenant_id = o.restaurant_id'
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

  const branchDestinationLatitudeExpr =
    branchJoinSql && colKey('branch', 'delivery_latitude') ? 'b.delivery_latitude' : 'NULL::numeric'
  const branchDestinationLongitudeExpr =
    branchJoinSql && colKey('branch', 'delivery_longitude')
      ? 'b.delivery_longitude'
      : 'NULL::numeric'
  const branchDestinationLabelExpr =
    branchJoinSql && colKey('branch', 'delivery_location_label')
      ? 'b.delivery_location_label'
      : 'NULL::text'
  const branchNameExpr = branchJoinSql && colKey('branch', 'name') ? 'b.name' : 'NULL::text'
  const branchAddressExpr =
    branchJoinSql && colKey('branch', 'address') ? 'b.address' : 'NULL::text'
  const restaurantDestinationLatitudeExpr = colKey('restaurant', 'delivery_latitude')
    ? 'r.delivery_latitude'
    : 'NULL::numeric'
  const restaurantDestinationLongitudeExpr = colKey('restaurant', 'delivery_longitude')
    ? 'r.delivery_longitude'
    : 'NULL::numeric'
  const restaurantDestinationLabelExpr = colKey('restaurant', 'delivery_location_label')
    ? 'r.delivery_location_label'
    : 'NULL::text'
  const hasDriverAssignments = hasTable('driver_assignments')
  const routeDateExpr =
    hasDriverAssignments && hasTable('route_stop') && hasTable('delivery_route')
      ? `(SELECT dr.scheduled_date FROM route_stop rs2 JOIN delivery_route dr ON dr.id = rs2.route_id WHERE rs2.order_id = o.id AND dr.status <> 'CANCELLED' ORDER BY dr.scheduled_date DESC LIMIT 1)`
      : 'NULL::date'
  const assignmentDateExpr = hasDriverAssignments ? 'da.scheduled_delivery_date' : 'NULL::date'
  const requestedDateExpr = colKey('customer_order', 'requested_delivery_date')
    ? 'o.requested_delivery_date'
    : 'NULL::date'
  const scheduledAtExpr = `COALESCE(${assignmentDateExpr}, ${routeDateExpr}, ${requestedDateExpr}, ${hasDriverAssignments ? 'da.assigned_at::date' : 'NULL::date'}, o.created_at::date)`

  const hasPodExpr =
    hasTable('proof_of_delivery') && hasTable('driver_assignments')
      ? `EXISTS (
          SELECT 1 FROM proof_of_delivery pod
          WHERE pod.order_id = o.id
            AND (
              pod.driver_assignment_id = da.id
              OR (
                pod.driver_assignment_id IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM driver_assignments sibling
                  WHERE sibling.order_id = o.id
                    AND sibling.id IS DISTINCT FROM da.id
                    AND sibling.status NOT IN ('reassigned', 'superseded')
                )
              )
            )
        )`
      : hasTable('proof_of_delivery')
        ? `EXISTS (SELECT 1 FROM proof_of_delivery pod WHERE pod.order_id = o.id)`
        : 'FALSE'

  const driverAssignmentJoinSql =
    hasTable('driver_assignments') && hasTable('drivers')
      ? `LEFT JOIN driver_assignments da ON da.order_id = o.id AND da.status NOT IN ('reassigned', 'superseded')
    LEFT JOIN drivers d ON d.id = da.driver_id`
      : `LEFT JOIN (SELECT NULL::uuid AS id, NULL::uuid AS warehouse_assignment_id, NULL::text AS status, NULL::uuid AS driver_id) da ON true
    LEFT JOIN drivers d ON FALSE`

  const driverNameExpr =
    hasTable('drivers') && colKey('drivers', 'full_name') ? 'd.full_name' : 'NULL::text'

  return {
    zoneJoinSql,
    branchJoinSql,
    driverAssignmentJoinSql,
    deliveryAreaExpr,
    destinationLatitudeExpr,
    destinationLongitudeExpr,
    destinationLabelExpr,
    branchDestinationLatitudeExpr,
    branchDestinationLongitudeExpr,
    branchDestinationLabelExpr,
    branchNameExpr,
    branchAddressExpr,
    restaurantDestinationLatitudeExpr,
    restaurantDestinationLongitudeExpr,
    restaurantDestinationLabelExpr,
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
