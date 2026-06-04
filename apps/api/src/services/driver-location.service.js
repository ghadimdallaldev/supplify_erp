import { query } from '../lib/db.js'
import { config } from '../config/env.js'
import { ValidationError, ForbiddenError, NotFoundError } from '../middlewares/errorHandler.js'
import { getActiveDriverAssignment, assertSupplierOwnsOrder } from './driver-fulfillment.service.js'
import {
  buildTrackingPayload,
  getGpsStaleAfterSeconds,
  isGpsTrackingEnabled as isGpsEnabledFromConfig,
  formatLastUpdatedLabel as formatLastUpdatedLabelFromPayload,
} from '../lib/delivery-tracking-payload.js'
import {
  buildRestaurantTrackingResponse,
  buildRestaurantTrackingDisabledResponse,
} from '../lib/restaurant-tracking-payload.js'

const LOCATION_TRACKING_STATUSES = ['assigned', 'picked_up', 'out_for_delivery']

export function isGpsTrackingEnabled() {
  return isGpsEnabledFromConfig()
}

export function formatLastUpdatedLabel(recordedAt) {
  return formatLastUpdatedLabelFromPayload(recordedAt)
}

export function validateCoordinates(latitude, longitude) {
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ValidationError('latitude and longitude must be valid numbers')
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ValidationError('latitude or longitude out of range')
  }
  if (lat === 0 && lng === 0) {
    throw new ValidationError('invalid coordinates')
  }
  return { lat, lng }
}

const RECORDED_AT_FUTURE_SKEW_MS = 2 * 60 * 1000
const RECORDED_AT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function parseRecordedAt(value, now = new Date()) {
  const recorded = value ? new Date(value) : now
  if (Number.isNaN(recorded.getTime())) throw new ValidationError('recordedAt is invalid')
  const nowMs = now.getTime()
  const recordedMs = recorded.getTime()
  if (recordedMs > nowMs + RECORDED_AT_FUTURE_SKEW_MS) {
    throw new ValidationError('recordedAt cannot be in the future')
  }
  if (recordedMs < nowMs - RECORDED_AT_MAX_AGE_MS) {
    throw new ValidationError('recordedAt is too old')
  }
  return recorded
}

async function assertRouteContextForOrder({ routeId, routeStopId, orderId, supplierId }) {
  if (!routeId && !routeStopId) return { routeId: null, routeStopId: null }
  if (routeStopId) {
    const { rows } = await query(
      `SELECT rs.id, rs.route_id, rs.order_id
       FROM route_stop rs
       JOIN delivery_route dr ON dr.id = rs.route_id
       WHERE rs.id = $1 AND dr.supplier_id = $2`,
      [routeStopId, supplierId]
    )
    if (!rows.length || rows[0].order_id !== orderId) {
      throw new ValidationError('route_stop_id does not match this order')
    }
    const resolvedRouteId = rows[0].route_id
    if (routeId && routeId !== resolvedRouteId) {
      throw new ValidationError('route_id does not match route_stop_id')
    }
    return { routeId: resolvedRouteId, routeStopId }
  }
  const { rows } = await query(
    `SELECT dr.id
     FROM delivery_route dr
     JOIN route_stop rs ON rs.route_id = dr.id AND rs.order_id = $2
     WHERE dr.id = $1 AND dr.supplier_id = $3
     LIMIT 1`,
    [routeId, orderId, supplierId]
  )
  if (!rows.length) {
    throw new ValidationError('route_id does not match this order')
  }
  return { routeId, routeStopId: null }
}

async function assertLocationRateLimit({ driverId, orderId }) {
  const minIntervalMs = (config.GPS_UPDATE_INTERVAL_SECONDS ?? 15) * 1000
  const { rows } = await query(
    `SELECT recorded_at FROM driver_latest_location
     WHERE driver_id = $1 AND order_id = $2`,
    [driverId, orderId]
  )
  const prev = rows[0]?.recorded_at
  if (!prev) return null
  const elapsed = Date.now() - new Date(prev).getTime()
  if (elapsed < minIntervalMs) {
    const { rows: latestRows } = await query(
      `SELECT * FROM driver_latest_location WHERE driver_id = $1`,
      [driverId]
    )
    return {
      trackingEnabled: true,
      stored: false,
      reason: 'rate_limited',
      latestLocation: latestRows[0] ? mapLatestLocation(latestRows[0]) : null,
    }
  }
  return null
}

async function shouldAcceptPing({ driverId, accuracyMeters, recordedAt }) {
  const minAccuracy = config.GPS_MIN_ACCURACY_METERS
  if (accuracyMeters == null || accuracyMeters <= minAccuracy) {
    return { accept: true, lowAccuracy: false }
  }
  const { rows } = await query(
    `SELECT accuracy_meters, recorded_at
     FROM driver_latest_location
     WHERE driver_id = $1`,
    [driverId]
  )
  const prev = rows[0]
  if (!prev) return { accept: true, lowAccuracy: true }
  const prevAcc = prev.accuracy_meters != null ? Number(prev.accuracy_meters) : Infinity
  const prevTime = new Date(prev.recorded_at).getTime()
  if (prevAcc <= minAccuracy && prevTime >= recordedAt.getTime() - 60_000) {
    return { accept: false, lowAccuracy: true, reason: 'recent_better_ping_exists' }
  }
  return { accept: true, lowAccuracy: true }
}

export async function recordDriverLocation({
  supplierId,
  orderId,
  driverId,
  driverAssignmentId,
  routeId = null,
  routeStopId = null,
  latitude,
  longitude,
  accuracyMeters = null,
  speedMps = null,
  headingDegrees = null,
  source = 'browser',
  recordedAt,
}) {
  if (!isGpsTrackingEnabled()) {
    return { trackingEnabled: false, stored: false, reason: 'gps_disabled' }
  }

  const { lat, lng } = validateCoordinates(latitude, longitude)
  const recorded = parseRecordedAt(recordedAt)

  await assertSupplierOwnsOrder(supplierId, orderId)

  const assignment = await getActiveDriverAssignment(orderId)
  if (!assignment || assignment.supplier_id !== supplierId) {
    throw new ValidationError('No active driver assignment for this order')
  }
  if (assignment.driver_id !== driverId) {
    throw new ForbiddenError('Driver is not assigned to this order')
  }
  if (!LOCATION_TRACKING_STATUSES.includes(assignment.status)) {
    throw new ValidationError('Location updates are not allowed for this delivery status')
  }

  const resolvedRoute = await assertRouteContextForOrder({
    routeId,
    routeStopId,
    orderId,
    supplierId,
  })

  const rateLimited = await assertLocationRateLimit({ driverId, orderId })
  if (rateLimited) return rateLimited

  const acceptCheck = await shouldAcceptPing({
    driverId,
    accuracyMeters: accuracyMeters != null ? Number(accuracyMeters) : null,
    recordedAt: recorded,
  })
  if (!acceptCheck.accept) {
    const { rows } = await query(`SELECT * FROM driver_latest_location WHERE driver_id = $1`, [
      driverId,
    ])
    return {
      trackingEnabled: true,
      stored: false,
      reason: acceptCheck.reason,
      lowAccuracy: true,
      latestLocation: rows[0] ? mapLatestLocation(rows[0]) : null,
    }
  }

  const { rows: inserted } = await query(
    `INSERT INTO driver_location_ping (
       supplier_id, driver_id, order_id, driver_assignment_id,
       route_id, route_stop_id, latitude, longitude,
       accuracy_meters, speed_mps, heading_degrees, source, recorded_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      supplierId,
      driverId,
      orderId,
      driverAssignmentId ?? assignment.id,
      resolvedRoute.routeId,
      resolvedRoute.routeStopId,
      lat,
      lng,
      accuracyMeters != null ? Number(accuracyMeters) : null,
      speedMps != null ? Number(speedMps) : null,
      headingDegrees != null ? Number(headingDegrees) : null,
      source,
      recorded,
    ]
  )

  await query(
    `INSERT INTO driver_latest_location (
       driver_id, supplier_id, order_id, driver_assignment_id, route_id,
       latitude, longitude, accuracy_meters, speed_mps, heading_degrees, recorded_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (driver_id) DO UPDATE SET
       supplier_id = EXCLUDED.supplier_id,
       order_id = EXCLUDED.order_id,
       driver_assignment_id = EXCLUDED.driver_assignment_id,
       route_id = EXCLUDED.route_id,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       accuracy_meters = EXCLUDED.accuracy_meters,
       speed_mps = EXCLUDED.speed_mps,
       heading_degrees = EXCLUDED.heading_degrees,
       recorded_at = EXCLUDED.recorded_at,
       updated_at = now()
     WHERE driver_latest_location.recorded_at <= EXCLUDED.recorded_at`,
    [
      driverId,
      supplierId,
      orderId,
      driverAssignmentId ?? assignment.id,
      resolvedRoute.routeId,
      lat,
      lng,
      accuracyMeters != null ? Number(accuracyMeters) : null,
      speedMps != null ? Number(speedMps) : null,
      headingDegrees != null ? Number(headingDegrees) : null,
      recorded,
    ]
  )

  return {
    trackingEnabled: true,
    stored: true,
    lowAccuracy: acceptCheck.lowAccuracy,
    latestLocation: mapLatestLocation(inserted[0]),
  }
}

function mapLatestLocation(row) {
  if (!row) return null
  return {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: row.accuracy_meters != null ? Number(row.accuracy_meters) : null,
    speedMps: row.speed_mps != null ? Number(row.speed_mps) : null,
    headingDegrees: row.heading_degrees != null ? Number(row.heading_degrees) : null,
    recordedAt: row.recorded_at,
  }
}

export async function getLatestLocationForDriver(driverId) {
  const { rows } = await query(`SELECT * FROM driver_latest_location WHERE driver_id = $1`, [
    driverId,
  ])
  return rows[0] ? mapLatestLocation(rows[0]) : null
}

export async function getLatestLocationRowForOrder(
  orderId,
  driverId,
  { orderScopedOnly = false } = {}
) {
  if (!driverId) return null
  const sql = orderScopedOnly
    ? `SELECT * FROM driver_latest_location
       WHERE driver_id = $1 AND order_id = $2
       LIMIT 1`
    : `SELECT * FROM driver_latest_location
       WHERE driver_id = $1 AND (order_id = $2 OR order_id IS NULL)
       ORDER BY CASE WHEN order_id = $2 THEN 0 ELSE 1 END, recorded_at DESC
       LIMIT 1`
  const { rows } = await query(sql, [driverId, orderId])
  return rows[0] ?? null
}

async function loadActiveRouteForOrder(orderId, supplierId) {
  const { rows } = await query(
    `SELECT dr.id AS route_id, rs.id AS route_stop_id, dr.route_number
     FROM route_stop rs
     JOIN delivery_route dr ON dr.id = rs.route_id
     WHERE rs.order_id = $1 AND dr.supplier_id = $2
       AND dr.status IN ('PLANNED', 'IN_PROGRESS')
     ORDER BY rs.sequence_number
     LIMIT 1`,
    [orderId, supplierId]
  )
  return rows[0] ?? null
}

/** Batch read for dispatch board, delivery board, and route detail — avoid per-card queries. */
export async function getLatestLocationsForDrivers(driverIds) {
  if (!driverIds?.length) return new Map()
  const { rows } = await query(
    `SELECT * FROM driver_latest_location WHERE driver_id = ANY($1::uuid[])`,
    [driverIds]
  )
  const map = new Map()
  for (const row of rows) {
    map.set(row.driver_id, {
      ...mapLatestLocation(row),
      driverId: row.driver_id,
      orderId: row.order_id,
    })
  }
  return map
}

async function loadAssignmentForTracking(orderId) {
  const { rows } = await query(
    `SELECT da.*, d.full_name AS driver_name, d.phone AS driver_phone
     FROM driver_assignments da
     JOIN drivers d ON d.id = da.driver_id
     WHERE da.order_id = $1 AND da.status NOT IN ('reassigned')
     ORDER BY da.created_at DESC
     LIMIT 1`,
    [orderId]
  )
  return rows[0] ?? null
}

export async function getOrderTracking({
  orderId,
  supplierId = null,
  restaurantId = null,
  exposeDriverPhone = false,
}) {
  const gpsEnabled = isGpsTrackingEnabled()

  if (restaurantId) {
    const { rows } = await query(
      `SELECT id, status, restaurant_id FROM customer_order WHERE id = $1 AND restaurant_id = $2`,
      [orderId, restaurantId]
    )
    if (!rows.length) throw new NotFoundError('Order not found')
    const orderRow = rows[0]

    if (!config.GPS_ALLOW_RESTAURANT_LIVE_TRACKING) {
      return buildRestaurantTrackingDisabledResponse(orderId)
    }

    const assignment = await loadAssignmentForTracking(orderId)
    let locationRow = null
    if (assignment?.driver_id && gpsEnabled) {
      // Restaurants only see pings tied to this order_id (no driver-level fallback).
      locationRow = await getLatestLocationRowForOrder(orderId, assignment.driver_id, {
        orderScopedOnly: true,
      })
    }

    const tracking = buildTrackingPayload({
      orderId,
      locationRow: locationRow
        ? {
            ...locationRow,
            orderId: locationRow.order_id,
            order_id: locationRow.order_id,
          }
        : null,
      allowDriverFallback: false,
      staleAfterSeconds: getGpsStaleAfterSeconds(),
    })

    return buildRestaurantTrackingResponse({
      orderId,
      orderStatus: orderRow.status,
      assignment,
      tracking,
    })
  }

  if (!supplierId) {
    throw new ForbiddenError('Not allowed to view tracking')
  }

  const owned = await assertSupplierOwnsOrder(supplierId, orderId)
  const { rows: restRows } = await query(
    `SELECT r.name AS restaurant_name FROM customer_order o
     JOIN restaurant r ON r.id = o.restaurant_id WHERE o.id = $1`,
    [orderId]
  )
  const orderRow = { ...owned, restaurant_name: restRows[0]?.restaurant_name }

  const assignment = await loadAssignmentForTracking(orderId)
  const routeCtx = assignment ? await loadActiveRouteForOrder(orderId, supplierId) : null

  let locationRow = null
  if (assignment?.driver_id && gpsEnabled) {
    locationRow = await getLatestLocationRowForOrder(orderId, assignment.driver_id)
  }

  const tracking = buildTrackingPayload({
    orderId,
    locationRow: locationRow
      ? {
          ...locationRow,
          orderId: locationRow.order_id,
          order_id: locationRow.order_id,
        }
      : null,
    allowDriverFallback: true,
    staleAfterSeconds: getGpsStaleAfterSeconds(),
  })

  return {
    orderId,
    orderRef: orderId.slice(0, 8),
    orderStatus: orderRow.status,
    restaurantName: orderRow.restaurant_name ?? null,
    trackingEnabled: tracking.enabled,
    etaAvailable: false,
    routeId: routeCtx?.route_id ?? null,
    routeStopId: routeCtx?.route_stop_id ?? null,
    routeNumber: routeCtx?.route_number ?? null,
    assignment: assignment
      ? {
          id: assignment.id,
          status: assignment.status,
          driverId: assignment.driver_id,
          driverName: assignment.driver_name,
          driverPhoneVisible: Boolean(exposeDriverPhone && assignment.driver_phone),
          driverPhone: exposeDriverPhone ? assignment.driver_phone : undefined,
        }
      : null,
    tracking,
    latestLocation: tracking.latestLocation,
    lastUpdatedLabel: tracking.lastUpdatedLabel,
  }
}
