import { query } from '../lib/db.js'
import { getLatestLocationsForDrivers, isGpsTrackingEnabled } from './driver-location.service.js'
import { buildTrackingPayload, buildDriverLastSeenAlias } from '../lib/delivery-tracking-payload.js'
import { getDeliveryZoneJoinSql } from '../lib/delivery-zone-join.js'

/**
 * Daily delivery board with filters and area grouping.
 */
export async function getSupplierDeliveryBoard(supplierId, filters = {}) {
  const { date, status, driverId, area } = filters
  const params = [supplierId]
  let paramIdx = 2

  const conditions = [
    `oi.supplier_id = $1`,
    `o.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')`,
  ]

  if (date) {
    conditions.push(`COALESCE(o.placed_at, o.created_at)::date = $${paramIdx}::date`)
    params.push(date)
    paramIdx += 1
  } else {
    // Default window when no date filter — avoids loading full order history.
    conditions.push(`COALESCE(o.placed_at, o.created_at) >= NOW() - interval '14 days'`)
  }

  if (driverId) {
    conditions.push(`da.driver_id = $${paramIdx}`)
    params.push(driverId)
    paramIdx += 1
  }

  if (area) {
    conditions.push(`COALESCE(dz.name, 'Unassigned area') ILIKE $${paramIdx}`)
    params.push(`%${area}%`)
    paramIdx += 1
  }

  let statusFilter = null
  if (status) {
    statusFilter = String(status).toLowerCase()
    if (statusFilter === 'pending') {
      conditions.push(`(da.id IS NULL OR da.status IN ('assigned', 'failed', 'rescheduled'))`)
    } else if (statusFilter === 'active_delivery') {
      conditions.push(`da.status IN ('assigned', 'picked_up', 'out_for_delivery')`)
    } else if (statusFilter === 'out_for_delivery') {
      conditions.push(`da.status IN ('picked_up', 'out_for_delivery')`)
    } else if (statusFilter === 'delivered') {
      conditions.push(`da.status = 'delivered'`)
    } else if (statusFilter === 'failed') {
      conditions.push(`da.status = 'failed'`)
    } else if (statusFilter === 'rescheduled') {
      conditions.push(`da.status = 'rescheduled'`)
    }
  }

  const deliveryZoneJoin = await getDeliveryZoneJoinSql({ supplierParam: '$1' })

  const { rows } = await query(
    `
    SELECT DISTINCT ON (o.id)
      o.id AS order_id,
      o.status AS order_status,
      r.name AS restaurant_name,
      COALESCE(dz.name, r.address_json->>'city', 'Unassigned area') AS delivery_area,
      da.id AS assignment_id,
      COALESCE(da.status, 'pending') AS delivery_status,
      d.id AS driver_id,
      d.full_name AS driver_name,
      EXISTS (SELECT 1 FROM proof_of_delivery pod WHERE pod.order_id = o.id) AS has_pod,
      COALESCE(o.placed_at, o.created_at) AS scheduled_at,
      COALESCE(b.delivery_latitude, r.delivery_latitude) AS destination_latitude,
      COALESCE(b.delivery_longitude, r.delivery_longitude) AS destination_longitude,
      COALESCE(b.delivery_location_label, r.delivery_location_label, r.name) AS destination_label
    FROM customer_order o
    JOIN order_item oi ON oi.order_id = o.id
    JOIN restaurant r ON r.id = o.restaurant_id
    LEFT JOIN branch b ON b.id = o.branch_id
    LEFT JOIN LATERAL (
      SELECT da2.* FROM driver_assignments da2
      WHERE da2.order_id = o.id AND da2.status NOT IN ('reassigned')
      ORDER BY da2.created_at DESC LIMIT 1
    ) da ON true
    LEFT JOIN drivers d ON d.id = da.driver_id
    LEFT JOIN order_warehouse_assignment owa ON owa.order_id = o.id
    ${deliveryZoneJoin}
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.id, scheduled_at DESC
    LIMIT 500
  `,
    params
  )

  const driverIds = [...new Set(rows.map((r) => r.driver_id).filter(Boolean))]
  const locationMap = isGpsTrackingEnabled()
    ? await getLatestLocationsForDrivers(driverIds)
    : new Map()

  const orders = rows.map((r) => {
    const locRow = r.driver_id ? locationMap.get(r.driver_id) : null
    const tracking = buildTrackingPayload({
      orderId: r.order_id,
      locationRow: locRow
        ? {
            latitude: locRow.latitude,
            longitude: locRow.longitude,
            accuracyMeters: locRow.accuracyMeters,
            speedMps: locRow.speedMps,
            headingDegrees: locRow.headingDegrees,
            recordedAt: locRow.recordedAt,
            orderId: locRow.orderId,
          }
        : null,
      allowDriverFallback: true,
    })
    const destLat = r.destination_latitude != null ? Number(r.destination_latitude) : null
    const destLng = r.destination_longitude != null ? Number(r.destination_longitude) : null
    const destinationCoordinatesAvailable =
      destLat != null && destLng != null && Number.isFinite(destLat) && Number.isFinite(destLng)
    const deliveryStatus = normalizeDeliveryStatus(r.delivery_status)
    const etaAvailable =
      destinationCoordinatesAvailable &&
      Boolean(tracking?.hasLocation) &&
      ['assigned', 'out_for_delivery'].includes(deliveryStatus)

    return {
      orderId: r.order_id,
      orderStatus: r.order_status,
      restaurantName: r.restaurant_name,
      deliveryArea: r.delivery_area,
      deliveryStatus,
      driverId: r.driver_id,
      driverName: r.driver_name,
      hasPod: r.has_pod,
      scheduledAt: r.scheduled_at,
      tracking,
      driverLastSeen: buildDriverLastSeenAlias(tracking),
      destinationCoordinatesAvailable,
      destinationLatitude: destinationCoordinatesAvailable ? destLat : null,
      destinationLongitude: destinationCoordinatesAvailable ? destLng : null,
      destinationLabel: destinationCoordinatesAvailable ? r.destination_label : null,
      etaAvailable,
    }
  })

  const byArea = {}
  for (const order of orders) {
    const key = order.deliveryArea || 'Unassigned area'
    if (!byArea[key]) byArea[key] = []
    byArea[key].push(order)
  }

  const routeSummary = Object.entries(byArea).map(([areaName, areaOrders]) => ({
    area: areaName,
    orderCount: areaOrders.length,
    pending: areaOrders.filter((o) => o.deliveryStatus === 'pending').length,
    outForDelivery: areaOrders.filter((o) => o.deliveryStatus === 'out_for_delivery').length,
    delivered: areaOrders.filter((o) => o.deliveryStatus === 'delivered').length,
  }))

  return {
    filters: {
      date: date || null,
      status: statusFilter,
      driverId: driverId || null,
      area: area || null,
    },
    orders,
    byArea,
    routeSummary,
    stats: {
      total: orders.length,
      pending: orders.filter((o) => o.deliveryStatus === 'pending').length,
      assigned: orders.filter((o) => o.deliveryStatus === 'assigned').length,
      outForDelivery: orders.filter((o) => o.deliveryStatus === 'out_for_delivery').length,
      delivered: orders.filter((o) => o.deliveryStatus === 'delivered').length,
      failed: orders.filter((o) => o.deliveryStatus === 'failed').length,
      rescheduled: orders.filter((o) => o.deliveryStatus === 'rescheduled').length,
    },
  }
}

function normalizeDeliveryStatus(raw) {
  const s = String(raw || 'pending').toLowerCase()
  if (s === 'failed') return 'failed'
  if (s === 'rescheduled') return 'rescheduled'
  if (s === 'assigned') return 'assigned'
  if (['picked_up', 'out_for_delivery'].includes(s)) return 'out_for_delivery'
  if (s === 'delivered') return 'delivered'
  return 'pending'
}
