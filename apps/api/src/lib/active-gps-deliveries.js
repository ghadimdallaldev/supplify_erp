import { query } from './db.js'
import { buildTrackingPayload, isGpsTrackingEnabled } from './delivery-tracking-payload.js'

function classifyGpsState(tracking) {
  if (!tracking?.enabled) return 'off'
  if (!tracking.hasLocation) return 'noGps'
  if (tracking.isStale) return 'stale'
  return 'live'
}

/**
 * Active deliveries with latest driver location for GPS monitoring.
 */
export async function fetchActiveGpsDeliveryRows({ limit = 500 } = {}) {
  if (!isGpsTrackingEnabled()) return []

  const { rows } = await query(
    `
    SELECT
      da.id AS assignment_id,
      da.order_id,
      da.supplier_id,
      da.driver_id,
      'ORD-' || UPPER(SUBSTRING(o.id::text FROM 1 FOR 8)) AS order_number,
      dll.latitude,
      dll.longitude,
      dll.recorded_at,
      dll.order_id AS loc_order_id
    FROM driver_assignments da
    JOIN customer_order o ON o.id = da.order_id
    LEFT JOIN driver_latest_location dll ON dll.driver_id = da.driver_id
    WHERE da.status IN ('assigned', 'picked_up', 'out_for_delivery')
      AND o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
      AND COALESCE(o.placed_at, o.created_at) >= date_trunc('day', now())
      AND EXISTS (
        SELECT 1
        FROM subscription sub
        WHERE sub.tenant_id = da.supplier_id
          AND sub.tenant_type = 'SUPPLIER'
          AND sub.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
          AND sub.account_locked_at IS NULL
      )
    LIMIT $1
    `,
    [limit]
  )
  return rows
}

/**
 * @returns {Array<{ assignmentId, orderId, supplierId, orderNumber, gpsState }>}
 */
export function classifyActiveGpsRows(rows) {
  return rows.map((row) => {
    const tracking = buildTrackingPayload({
      orderId: row.order_id,
      locationRow:
        row.latitude != null
          ? {
              latitude: row.latitude,
              longitude: row.longitude,
              recordedAt: row.recorded_at,
              orderId: row.loc_order_id,
            }
          : null,
      allowDriverFallback: true,
    })
    return {
      assignmentId: row.assignment_id,
      orderId: row.order_id,
      supplierId: row.supplier_id,
      orderNumber: row.order_number,
      gpsState: classifyGpsState(tracking),
    }
  })
}

export async function listStaleGpsDeliveries({ limit = 200 } = {}) {
  const rows = await fetchActiveGpsDeliveryRows({ limit })
  return classifyActiveGpsRows(rows).filter((r) => r.gpsState === 'stale')
}
