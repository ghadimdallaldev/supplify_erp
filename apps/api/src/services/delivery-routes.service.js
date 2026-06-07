import { query, withTransaction } from '../lib/db.js'
import { NotFoundError, ValidationError, ForbiddenError } from '../middlewares/errorHandler.js'
import { assertSupplierOwnsOrder, updateDeliveryStatus } from './driver-fulfillment.service.js'
import { getLatestLocationsForDrivers } from './driver-location.service.js'
import { buildTrackingPayload } from '../lib/delivery-tracking-payload.js'
import {
  isPlannedRouteEligibleStatus,
  isDispatchEligibleStatus,
  plannedRouteIneligibleReason,
} from '../lib/delivery-route-order-statuses.js'

const RESERVATION_ROUTE_STATUSES = ['PLANNED', 'IN_PROGRESS']
const DRIVER_ACTIVE_ROUTE_STATUSES = ['IN_PROGRESS']

const ROUTABLE_ASSIGNMENT_STATUSES = ['assigned', 'rescheduled', 'failed']

export async function assertDriverBelongsToSupplier(driverId, supplierId) {
  const { rows } = await query(
    `SELECT id, full_name, phone, vehicle_type, vehicle_plate
     FROM drivers WHERE id = $1 AND supplier_id = $2 AND is_active = TRUE`,
    [driverId, supplierId]
  )
  if (!rows.length) throw new ValidationError('Driver not found or inactive')
  return rows[0]
}

export async function getActiveRouteForOrder(orderId, supplierId) {
  const { rows } = await query(
    `
    SELECT dr.id, dr.route_number, dr.status
    FROM route_stop rs
    JOIN delivery_route dr ON dr.id = rs.route_id
    WHERE rs.order_id = $1
      AND dr.supplier_id = $2
      AND dr.status = ANY($3::text[])
    LIMIT 1
    `,
    [orderId, supplierId, RESERVATION_ROUTE_STATUSES]
  )
  return rows[0] ?? null
}

async function nextRouteNumber(supplierId, client) {
  const db = client ? (sql, p) => client.query(sql, p) : query
  const { rows } = await db(
    `
    SELECT COUNT(*)::int AS n
    FROM delivery_route
    WHERE supplier_id = $1
      AND created_at >= date_trunc('day', now())
    `,
    [supplierId]
  )
  const seq = (rows[0]?.n ?? 0) + 1
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `R-${datePart}-${String(seq).padStart(3, '0')}`
}

function mapStopRow(row) {
  const addr = row.address_json && typeof row.address_json === 'object' ? row.address_json : {}
  const area = row.delivery_area || [addr.city, addr.region].filter(Boolean).join(', ') || null
  return {
    id: row.id,
    routeId: row.route_id,
    orderId: row.order_id,
    sequenceNumber: row.sequence_number,
    status: mapStopStatusOut(row.status),
    restaurantName: row.restaurant_name,
    deliveryArea: area,
    addressLine: formatAddress(addr),
    totalAmount: parseFloat(row.total_amount) || 0,
    itemCount: row.item_count ?? 0,
    notes: row.notes,
    completedAt: row.completed_at,
    assignmentStatus: row.assignment_status ?? null,
  }
}

function mapStopStatusOut(dbStatus) {
  switch (dbStatus) {
    case 'IN_TRANSIT':
      return 'OUT_FOR_DELIVERY'
    case 'COMPLETED':
      return 'DELIVERED'
    default:
      return dbStatus
  }
}

function mapStopStatusIn(uiStatus) {
  switch (uiStatus) {
    case 'OUT_FOR_DELIVERY':
      return 'IN_TRANSIT'
    case 'DELIVERED':
      return 'COMPLETED'
    default:
      return uiStatus
  }
}

function formatAddress(addr) {
  if (!addr || typeof addr !== 'object') return null
  const parts = [
    addr.street,
    [addr.city, addr.region, addr.postalCode || addr.zip].filter(Boolean).join(', '),
    addr.country,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

async function loadRouteStopsForRoutes(routeIds, client = null) {
  const map = new Map()
  if (!routeIds.length) return map

  const db = client ? (sql, p) => client.query(sql, p) : query
  const { rows } = await db(
    `
    SELECT
      rs.*,
      r.name AS restaurant_name,
      r.address_json,
      o.total_amount,
      COALESCE(dz.name, r.address_json->>'city', 'Unassigned area') AS delivery_area,
      (SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id = o.id) AS item_count,
      da.status AS assignment_status
    FROM route_stop rs
    JOIN customer_order o ON o.id = rs.order_id
    JOIN restaurant r ON r.id = o.restaurant_id
    LEFT JOIN LATERAL (
      SELECT da2.status FROM driver_assignments da2
      WHERE da2.order_id = rs.order_id AND da2.status NOT IN ('reassigned')
      ORDER BY da2.created_at DESC LIMIT 1
    ) da ON true
    LEFT JOIN order_warehouse_assignment owa ON owa.order_id = o.id
    LEFT JOIN delivery_zone dz ON dz.warehouse_id = owa.warehouse_id
    WHERE rs.route_id = ANY($1::uuid[])
    ORDER BY rs.route_id, rs.sequence_number ASC
    `,
    [routeIds]
  )

  for (const row of rows) {
    const list = map.get(row.route_id) ?? []
    list.push(mapStopRow(row))
    map.set(row.route_id, list)
  }
  return map
}

async function loadRouteStops(routeId, client = null) {
  const batch = await loadRouteStopsForRoutes([routeId], client)
  return batch.get(routeId) ?? []
}

function mapRouteSummary(row, stops = []) {
  const completed = stops.filter((s) => s.status === 'DELIVERED').length
  const failed = stops.filter((s) => s.status === 'FAILED').length
  const rescheduled = stops.filter((s) => s.assignmentStatus === 'rescheduled').length
  return {
    id: row.id,
    routeNumber: row.route_number,
    routeLabel: row.route_label || row.route_number,
    area: row.area || null,
    driverId: row.driver_id,
    driverName: row.driver_name || row.driver_name_legacy || 'Unassigned',
    vehicle: row.vehicle_info || null,
    status: row.status,
    scheduledDate: row.scheduled_date,
    stops: stops.length,
    completedStops: completed,
    failedStops: failed,
    rescheduledStops: rescheduled,
  }
}

export async function listDeliveryRoutes(
  supplierId,
  { includeCancelled = false, driverId = null } = {}
) {
  const params = [supplierId]
  let extra = ''
  if (!includeCancelled) {
    extra += ` AND dr.status != 'CANCELLED'`
  }
  if (driverId) {
    params.push(driverId)
    extra += ` AND dr.driver_id = $${params.length}`
  }

  const { rows } = await query(
    `
    SELECT
      dr.id,
      dr.route_number,
      dr.route_label,
      dr.area,
      dr.driver_id,
      dr.driver_name AS driver_name_legacy,
      dr.vehicle_info,
      dr.status,
      dr.scheduled_date,
      d.full_name AS driver_name
    FROM delivery_route dr
    LEFT JOIN drivers d ON d.id = dr.driver_id
    WHERE dr.supplier_id = $1${extra}
    ORDER BY dr.scheduled_date DESC, dr.route_number DESC
    LIMIT 200
  `,
    params
  )

  const routeIds = rows.map((row) => row.id)
  const stopsByRoute = await loadRouteStopsForRoutes(routeIds)

  return rows.map((row) => {
    const stops = stopsByRoute.get(row.id) ?? []
    return { ...mapRouteSummary(row, stops), stops }
  })
}

export async function getDeliveryRoute(supplierId, routeId, { driverIdScope = null } = {}) {
  const { rows } = await query(
    `
    SELECT dr.*, d.full_name AS driver_name
    FROM delivery_route dr
    LEFT JOIN drivers d ON d.id = dr.driver_id
    WHERE dr.id = $1 AND dr.supplier_id = $2
    `,
    [routeId, supplierId]
  )
  if (!rows.length) throw new NotFoundError('Route not found')
  const route = rows[0]
  if (driverIdScope && route.driver_id !== driverIdScope) {
    throw new ForbiddenError('You can only view your own routes')
  }
  const stops = await loadRouteStops(routeId)
  const locationMap = route.driver_id
    ? await getLatestLocationsForDrivers([route.driver_id])
    : new Map()
  const locRow = route.driver_id ? locationMap.get(route.driver_id) : null

  const enrichedStops = stops.map((stop) => ({
    ...stop,
    tracking: buildTrackingPayload({
      orderId: stop.orderId,
      locationRow: locRow,
      allowDriverFallback: true,
    }),
  }))

  return {
    ...mapRouteSummary(route, enrichedStops),
    stops: enrichedStops,
    tracking: buildTrackingPayload({
      locationRow: locRow,
      allowDriverFallback: true,
    }),
    startedAt: route.started_at,
    completedAt: route.completed_at,
  }
}

export async function getDriverActiveRoute(supplierId, driverId) {
  const { rows } = await query(
    `
    SELECT dr.id
    FROM delivery_route dr
    WHERE dr.supplier_id = $1
      AND dr.driver_id = $2
      AND dr.status = ANY($3::text[])
    ORDER BY dr.scheduled_date DESC, dr.created_at DESC
    LIMIT 1
    `,
    [supplierId, driverId, DRIVER_ACTIVE_ROUTE_STATUSES]
  )
  if (!rows.length) return null
  return getDeliveryRoute(supplierId, rows[0].id, { driverIdScope: driverId })
}

async function syncDriverAssignment(client, { supplierId, orderId, driverId, userId }) {
  const { rows: existing } = await client.query(
    `
    SELECT da.id, da.driver_id, da.status
    FROM driver_assignments da
    WHERE da.order_id = $1 AND da.supplier_id = $2
      AND da.status NOT IN ('reassigned', 'delivered')
    ORDER BY da.created_at DESC
    LIMIT 1
    `,
    [orderId, supplierId]
  )

  if (existing.length) {
    const row = existing[0]
    if (row.driver_id === driverId && ROUTABLE_ASSIGNMENT_STATUSES.includes(row.status)) {
      return row
    }
    await client.query(
      `UPDATE driver_assignments SET status = 'reassigned', updated_at = now() WHERE id = $1`,
      [row.id]
    )
  }

  const { rows: whRows } = await client.query(
    `SELECT id FROM order_warehouse_assignment WHERE order_id = $1 ORDER BY assigned_at DESC NULLS LAST LIMIT 1`,
    [orderId]
  )

  const { rows: inserted } = await client.query(
    `INSERT INTO driver_assignments (
       order_id, warehouse_assignment_id, driver_id, supplier_id, assigned_by, status
     ) VALUES ($1, $2, $3, $4, $5, 'assigned')
     RETURNING *`,
    [orderId, whRows[0]?.id ?? null, driverId, supplierId, userId ?? null]
  )
  return inserted[0]
}

export async function createDeliveryRoute({
  supplierId,
  orderIds,
  driverId,
  scheduledDate,
  routeLabel,
  area,
  userId,
}) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new ValidationError('Select at least one order')
  }
  if (!driverId) throw new ValidationError('Driver is required')
  if (!scheduledDate) throw new ValidationError('Route date is required')

  const driver = await assertDriverBelongsToSupplier(driverId, supplierId)
  const uniqueOrderIds = [...new Set(orderIds)]

  for (const orderId of uniqueOrderIds) {
    const order = await assertSupplierOwnsOrder(supplierId, orderId)
    const ineligible = plannedRouteIneligibleReason(order.status)
    if (ineligible) {
      throw new ValidationError(`Order ${orderId.slice(0, 8)}: ${ineligible}`)
    }
    const onRoute = await getActiveRouteForOrder(orderId, supplierId)
    if (onRoute) {
      throw new ValidationError(
        `Order ${orderId.slice(0, 8)} is already on route ${onRoute.route_number}`
      )
    }
  }

  return withTransaction(async (client) => {
    const routeNumber = await nextRouteNumber(supplierId, client)
    const vehicleInfo =
      [driver.vehicle_type, driver.vehicle_plate].filter(Boolean).join(' · ') || null

    const { rows: routeRows } = await client.query(
      `INSERT INTO delivery_route (
         supplier_id, route_number, route_label, area, driver_id, driver_name,
         vehicle_info, scheduled_date, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, 'PLANNED')
       RETURNING *`,
      [
        supplierId,
        routeNumber,
        routeLabel?.trim() || null,
        area?.trim() || null,
        driverId,
        driver.full_name,
        vehicleInfo,
        scheduledDate,
      ]
    )
    const route = routeRows[0]

    let seq = 1
    for (const orderId of uniqueOrderIds) {
      const { rows: orderRows } = await client.query(
        `SELECT r.address_json FROM customer_order o
         JOIN restaurant r ON r.id = o.restaurant_id
         WHERE o.id = $1`,
        [orderId]
      )
      await client.query(
        `INSERT INTO route_stop (route_id, order_id, sequence_number, status, address_json)
         VALUES ($1, $2, $3, 'PLANNED', $4)`,
        [route.id, orderId, seq++, orderRows[0]?.address_json ?? null]
      )
    }

    const stops = await loadRouteStops(route.id, client)
    return { ...mapRouteSummary(route, stops), stops }
  })
}

async function activateRouteDispatch(client, { supplierId, route, userId }) {
  const stops = await loadRouteStops(route.id, client)
  const activated = []
  const waiting = []
  const driverId = route.driver_id

  for (const stop of stops) {
    const { rows: orderRows } = await client.query(
      `SELECT status FROM customer_order WHERE id = $1`,
      [stop.orderId]
    )
    const orderStatus = orderRows[0]?.status
    if (orderStatus === 'CANCELLED') {
      await client.query(`DELETE FROM route_stop WHERE id = $1`, [stop.id])
      continue
    }
    if (!isDispatchEligibleStatus(orderStatus)) {
      waiting.push({ orderId: stop.orderId, orderStatus })
      continue
    }
    await syncDriverAssignment(client, { supplierId, orderId: stop.orderId, driverId, userId })
    activated.push(stop.orderId)
  }

  if (activated.length === 0) {
    throw new ValidationError(
      'No orders on this route are ready for dispatch. Wait until orders are ready for delivery, or remove stops that are still being prepared.'
    )
  }

  return { activated, waiting }
}

export async function addOrdersToPlannedRoute({ supplierId, routeId, orderIds, userId }) {
  const route = await getDeliveryRoute(supplierId, routeId)
  if (route.status !== 'PLANNED') {
    throw new ValidationError('Can only add orders to a planned route')
  }
  if (!Array.isArray(orderIds) || !orderIds.length) {
    throw new ValidationError('Select at least one order')
  }

  const uniqueOrderIds = [...new Set(orderIds)]
  for (const orderId of uniqueOrderIds) {
    const order = await assertSupplierOwnsOrder(supplierId, orderId)
    const ineligible = plannedRouteIneligibleReason(order.status)
    if (ineligible) {
      throw new ValidationError(`Order ${orderId.slice(0, 8)}: ${ineligible}`)
    }
    const onRoute = await getActiveRouteForOrder(orderId, supplierId)
    if (onRoute && onRoute.id !== routeId) {
      throw new ValidationError(
        `Order ${orderId.slice(0, 8)} is already on route ${onRoute.route_number}`
      )
    }
  }

  return withTransaction(async (client) => {
    const { rows: maxSeq } = await client.query(
      `SELECT COALESCE(MAX(sequence_number), 0)::int AS n FROM route_stop WHERE route_id = $1`,
      [routeId]
    )
    let seq = (maxSeq[0]?.n ?? 0) + 1

    for (const orderId of uniqueOrderIds) {
      const { rows: existing } = await client.query(
        `SELECT id FROM route_stop WHERE route_id = $1 AND order_id = $2`,
        [routeId, orderId]
      )
      if (existing.length) continue

      const { rows: orderRows } = await client.query(
        `SELECT r.address_json FROM customer_order o
         JOIN restaurant r ON r.id = o.restaurant_id
         WHERE o.id = $1`,
        [orderId]
      )
      await client.query(
        `INSERT INTO route_stop (route_id, order_id, sequence_number, status, address_json)
         VALUES ($1, $2, $3, 'PLANNED', $4)`,
        [routeId, orderId, seq++, orderRows[0]?.address_json ?? null]
      )
    }

    return getDeliveryRoute(supplierId, routeId)
  })
}

export async function removeOrderFromPlannedRoute({ supplierId, routeId, orderId }) {
  const route = await getDeliveryRoute(supplierId, routeId)
  if (route.status !== 'PLANNED') {
    throw new ValidationError('Can only remove orders from a planned route')
  }
  await query(`DELETE FROM route_stop WHERE route_id = $1 AND order_id = $2`, [routeId, orderId])
  return getDeliveryRoute(supplierId, routeId)
}

export async function updateDeliveryRoute(supplierId, routeId, patch) {
  const existing = await getDeliveryRoute(supplierId, routeId)
  if (existing.status === 'CANCELLED') {
    throw new ValidationError('Cannot update a cancelled route')
  }
  if (existing.status === 'COMPLETED') {
    throw new ValidationError('Cannot update a completed route')
  }

  const fields = []
  const params = []
  let idx = 1

  if (patch.routeLabel !== undefined) {
    fields.push(`route_label = $${idx++}`)
    params.push(patch.routeLabel?.trim() || null)
  }
  if (patch.area !== undefined) {
    fields.push(`area = $${idx++}`)
    params.push(patch.area?.trim() || null)
  }
  if (patch.scheduledDate !== undefined) {
    fields.push(`scheduled_date = $${idx++}::date`)
    params.push(patch.scheduledDate)
  }
  if (patch.driverId !== undefined) {
    const driver = await assertDriverBelongsToSupplier(patch.driverId, supplierId)
    fields.push(`driver_id = $${idx++}`)
    params.push(patch.driverId)
    fields.push(`driver_name = $${idx++}`)
    params.push(driver.full_name)
    const vehicleInfo =
      [driver.vehicle_type, driver.vehicle_plate].filter(Boolean).join(' · ') || null
    fields.push(`vehicle_info = $${idx++}`)
    params.push(vehicleInfo)
  }
  if (patch.status !== undefined) {
    if (!['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(patch.status)) {
      throw new ValidationError('Invalid route status')
    }
    fields.push(`status = $${idx++}`)
    params.push(patch.status)
    if (patch.status === 'IN_PROGRESS') {
      fields.push(`started_at = COALESCE(started_at, now())`)
    }
    if (patch.status === 'COMPLETED') {
      fields.push(`completed_at = now()`)
    }
  }

  if (!fields.length) return existing

  const activating = patch.status === 'IN_PROGRESS' && existing.status === 'PLANNED'

  if (activating) {
    return withTransaction(async (client) => {
      params.push(routeId, supplierId)
      await client.query(
        `UPDATE delivery_route SET ${fields.join(', ')}, updated_at = now()
         WHERE id = $${idx++} AND supplier_id = $${idx}`,
        params
      )
      const { rows: routeRows } = await client.query(
        `SELECT * FROM delivery_route WHERE id = $1 AND supplier_id = $2`,
        [routeId, supplierId]
      )
      const activation = await activateRouteDispatch(client, {
        supplierId,
        route: routeRows[0],
        userId: patch.userId ?? null,
      })
      const detail = await getDeliveryRoute(supplierId, routeId)
      return { ...detail, activation }
    })
  }

  params.push(routeId, supplierId)
  await query(
    `UPDATE delivery_route SET ${fields.join(', ')}, updated_at = now()
     WHERE id = $${idx++} AND supplier_id = $${idx}`,
    params
  )

  return getDeliveryRoute(supplierId, routeId)
}

export async function reorderRouteStops(supplierId, routeId, stopIds) {
  const route = await getDeliveryRoute(supplierId, routeId)
  if (!RESERVATION_ROUTE_STATUSES.includes(route.status)) {
    throw new ValidationError('Cannot reorder stops on a finished route')
  }
  const existingIds = new Set(route.stops.map((s) => s.id))
  if (stopIds.length !== route.stops.length) {
    throw new ValidationError('Stop list must include all stops on the route')
  }
  for (const id of stopIds) {
    if (!existingIds.has(id)) throw new ValidationError('Invalid stop on route')
  }

  return withTransaction(async (client) => {
    let seq = 1
    for (const stopId of stopIds) {
      await client.query(
        `UPDATE route_stop SET sequence_number = $1 WHERE id = $2 AND route_id = $3`,
        [seq++, stopId, routeId]
      )
    }
    return getDeliveryRoute(supplierId, routeId)
  })
}

const STOP_TO_ASSIGNMENT = {
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  FAILED: 'failed',
}

export async function updateRouteStop(
  supplierId,
  routeId,
  stopId,
  { status, notes, failureReason, userId, permissions }
) {
  const route = await getDeliveryRoute(supplierId, routeId)
  const stop = route.stops.find((s) => s.id === stopId)
  if (!stop) throw new NotFoundError('Stop not found')

  const dbStatus = status ? mapStopStatusIn(status) : null
  if (dbStatus && !['PLANNED', 'IN_TRANSIT', 'COMPLETED', 'FAILED'].includes(dbStatus)) {
    throw new ValidationError('Invalid stop status')
  }

  if (dbStatus) {
    const assignmentStatus = STOP_TO_ASSIGNMENT[status]
    if (assignmentStatus) {
      if (assignmentStatus === 'out_for_delivery') {
        const { getActiveDriverAssignment } = await import('./driver-fulfillment.service.js')
        const current = await getActiveDriverAssignment(stop.orderId)
        if (current?.status === 'assigned') {
          await updateDeliveryStatus({
            supplierId,
            orderId: stop.orderId,
            status: 'picked_up',
            notes,
            userId,
          })
        }
      }
      await updateDeliveryStatus({
        supplierId,
        orderId: stop.orderId,
        status: assignmentStatus,
        notes,
        failureReason,
        userId,
      })
    }
  }

  if (notes !== undefined || dbStatus) {
    await query(
      `UPDATE route_stop SET
         status = COALESCE($1, status),
         notes = COALESCE($2, notes),
         completed_at = CASE WHEN $1 = 'COMPLETED' THEN now() ELSE completed_at END,
         actual_arrival = CASE WHEN $1 = 'IN_TRANSIT' THEN COALESCE(actual_arrival, now()) ELSE actual_arrival END
       WHERE id = $3 AND route_id = $4`,
      [dbStatus, notes ?? null, stopId, routeId]
    )
  }

  const updated = await getDeliveryRoute(supplierId, routeId)

  const allDone = updated.stops.every((s) => ['DELIVERED', 'FAILED'].includes(s.status))
  if (allDone && updated.status === 'IN_PROGRESS') {
    await updateDeliveryRoute(supplierId, routeId, { status: 'COMPLETED' })
    return getDeliveryRoute(supplierId, routeId)
  }

  return updated
}

export async function cancelDeliveryRoute(supplierId, routeId) {
  const route = await getDeliveryRoute(supplierId, routeId)
  if (route.status === 'COMPLETED') {
    throw new ValidationError('Cannot cancel a completed route')
  }
  if (route.status === 'CANCELLED') {
    return route
  }
  await query(
    `UPDATE delivery_route SET status = 'CANCELLED', updated_at = now() WHERE id = $1 AND supplier_id = $2`,
    [routeId, supplierId]
  )
  return getDeliveryRoute(supplierId, routeId)
}

export async function releaseOrderFromPlannedRoutes(orderId, supplierId) {
  if (!orderId || !supplierId) return
  await query(
    `DELETE FROM route_stop rs
     USING delivery_route dr
     WHERE rs.route_id = dr.id
       AND rs.order_id = $1
       AND dr.supplier_id = $2
       AND dr.status = 'PLANNED'`,
    [orderId, supplierId]
  )
}

export function orderEligibleForRoute(order) {
  if (order.active_route_id) {
    return { ok: false, reason: 'Already on a route' }
  }
  const ineligible = plannedRouteIneligibleReason(order.status)
  if (ineligible) {
    return { ok: false, reason: ineligible }
  }
  return { ok: true }
}
