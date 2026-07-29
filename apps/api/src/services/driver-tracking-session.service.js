import { query } from '../lib/db.js'
import { config } from '../config/env.js'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../middlewares/errorHandler.js'
import {
  validateTrackingPoint,
  validateMovement,
  normalizeHeading,
} from '../lib/driver-location-validation.js'
import { setLatestDriverLocation } from '../lib/driver-location-redis.js'

const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'picked_up', 'out_for_delivery']
const TRACKABLE_ROUTE_STATUSES = ['PLANNED', 'IN_PROGRESS']

function mapSession(row) {
  if (!row) return null
  return {
    id: row.id,
    supplierId: row.supplier_id,
    driverId: row.driver_id,
    routeId: row.route_id,
    status: row.status,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    stoppedAt: row.stopped_at,
    stopReason: row.stop_reason,
    currentStopId: row.current_stop_id,
    gpsState: row.gps_state,
    networkState: row.network_state,
    batteryPercent: row.battery_percent == null ? null : Number(row.battery_percent),
    lastLocation:
      row.last_valid_latitude == null
        ? null
        : {
            latitude: Number(row.last_valid_latitude),
            longitude: Number(row.last_valid_longitude),
            accuracyMeters:
              row.last_accuracy_meters == null ? null : Number(row.last_accuracy_meters),
            recordedAt: row.last_recorded_at,
          },
  }
}

function assertSessionsEnabled() {
  if (!config.GPS_TRACKING_ENABLED) return false
  return config.GPS_TRACKING_SESSIONS_ENABLED === true
}

async function loadDriverRunContext({ supplierId, driverId, routeId = null }) {
  const driver = await query(
    `SELECT id, supplier_id FROM drivers WHERE id = $1 AND supplier_id = $2 AND is_active = TRUE`,
    [driverId, supplierId]
  )
  if (!driver.rows.length) throw new ForbiddenError('Driver is not active in this supplier')

  let route = null
  if (routeId) {
    const result = await query(
      `SELECT id, driver_id, supplier_id, status
       FROM delivery_route
       WHERE id = $1 AND supplier_id = $2 AND driver_id = $3`,
      [routeId, supplierId, driverId]
    )
    route = result.rows[0]
    if (!route) throw new ForbiddenError('Driver is not assigned to this route')
    if (!TRACKABLE_ROUTE_STATUSES.includes(route.status)) {
      throw new ValidationError('Route is not in a trackable status')
    }
  }

  const assignments = await query(
    `SELECT da.id, da.order_id, da.status
     FROM driver_assignments da
     ${routeId ? 'JOIN route_stop rs ON rs.order_id = da.order_id AND rs.route_id = $3' : ''}
     WHERE da.supplier_id = $1 AND da.driver_id = $2
       AND da.status = ANY($${routeId ? 4 : 3}::text[])`,
    routeId
      ? [supplierId, driverId, routeId, ACTIVE_ASSIGNMENT_STATUSES]
      : [supplierId, driverId, ACTIVE_ASSIGNMENT_STATUSES]
  )
  if (!assignments.rows.length)
    throw new ValidationError('No active delivery assignment for this driver')
  return { route, assignments: assignments.rows }
}

export async function getActiveTrackingSession({ supplierId, driverId }) {
  const { rows } = await query(
    `SELECT * FROM driver_tracking_session
     WHERE supplier_id = $1 AND driver_id = $2 AND status = 'ACTIVE'
     ORDER BY started_at DESC LIMIT 1`,
    [supplierId, driverId]
  )
  return mapSession(rows[0])
}

export async function startTrackingSession({
  supplierId,
  driverId,
  routeId = null,
  userId = null,
}) {
  if (!assertSessionsEnabled())
    return { enabled: false, session: null, reason: 'sessions_disabled' }
  const existing = await getActiveTrackingSession({ supplierId, driverId })
  if (existing) throw new ConflictError('Driver already has an active tracking session')
  const context = await loadDriverRunContext({ supplierId, driverId, routeId })
  const currentStop = context.route
    ? await query(
        `SELECT id FROM route_stop WHERE route_id = $1 AND status NOT IN ('COMPLETED', 'FAILED') ORDER BY sequence_number LIMIT 1`,
        [context.route.id]
      )
    : { rows: [] }
  try {
    const { rows } = await query(
      `INSERT INTO driver_tracking_session (
        supplier_id, driver_id, route_id, started_by, current_stop_id,
        status, gps_state, network_state
      ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'TRACKING_ACTIVE', 'online')
      RETURNING *`,
      [supplierId, driverId, context.route?.id ?? null, userId, currentStop.rows[0]?.id ?? null]
    )
    return { enabled: true, session: mapSession(rows[0]) }
  } catch (error) {
    if (error.code === '23505')
      throw new ConflictError('Driver already has an active tracking session')
    throw error
  }
}

async function loadOwnedActiveSession(sessionId, supplierId, driverId) {
  const { rows } = await query(
    `SELECT s.*, rs.order_id AS current_order_id
     FROM driver_tracking_session s
     LEFT JOIN route_stop rs ON rs.id = s.current_stop_id
     WHERE s.id = $1 AND s.supplier_id = $2 AND s.driver_id = $3 AND s.status = 'ACTIVE'`,
    [sessionId, supplierId, driverId]
  )
  if (!rows.length) throw new NotFoundError('Active tracking session not found')
  return rows[0]
}

async function emitLocationEvent(session, location) {
  try {
    const { emitDriverLocationUpdated } = await import('../lib/socket.js')
    await emitDriverLocationUpdated({
      supplierId: session.supplier_id,
      routeId: session.route_id,
      orderId: session.current_order_id,
      payload: {
        sessionId: session.id,
        driverId: session.driver_id,
        routeId: session.route_id,
        currentStopId: session.current_stop_id,
        location,
      },
    })
  } catch {
    // Realtime delivery is best effort; the durable point was already accepted.
  }
}

async function acceptPoint(session, point, previous) {
  const normalized = validateTrackingPoint(point, {
    maxAccuracyMeters: config.GPS_MAX_ACCURACY_METERS ?? config.GPS_MIN_ACCURACY_METERS ?? 100,
    maxSpeedKph: config.GPS_MAX_SPEED_KPH ?? 160,
  })
  const movement = validateMovement(normalized, previous, {
    maxSpeedKph: config.GPS_MAX_SPEED_KPH ?? 160,
  })
  if (!movement.accepted) return { accepted: false, reason: movement.rejectionReason }

  const duplicate = await query(
    `SELECT id FROM driver_location_ping WHERE session_id = $1 AND client_point_id = $2 LIMIT 1`,
    [session.id, point.id]
  )
  if (duplicate.rows.length) return { accepted: false, duplicate: true, reason: 'duplicate' }

  const location = {
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    accuracyMeters: normalized.accuracyMeters,
    speedMps: normalized.speedMps,
    headingDegrees: normalizeHeading(normalized.headingDegrees),
    recordedAt: normalized.recordedAt.toISOString(),
    receivedAt: new Date().toISOString(),
    networkState: point.networkState || 'online',
    batteryPercent: point.batteryPercent ?? null,
  }
  const { rows } = await query(
    `INSERT INTO driver_location_ping (
      supplier_id, driver_id, order_id, route_id, route_stop_id, session_id,
      client_point_id, sequence_number, latitude, longitude, raw_latitude, raw_longitude,
      display_latitude, display_longitude, accuracy_meters, speed_mps, heading_degrees,
      source, recorded_at, received_at, battery_percent, is_mocked, network_state, validation_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $9, $10, $9, $10, $11, $12, $13,
      $14, $15, now(), $16, $17, $18, 'accepted')
    RETURNING id, recorded_at`,
    [
      session.supplier_id,
      session.driver_id,
      session.current_order_id,
      session.route_id,
      session.current_stop_id,
      session.id,
      point.id,
      point.sequence,
      normalized.latitude,
      normalized.longitude,
      normalized.accuracyMeters,
      normalized.speedMps,
      location.headingDegrees,
      point.source || 'native',
      normalized.recordedAt,
      point.batteryPercent ?? null,
      point.isMocked ?? false,
      point.networkState || 'online',
    ]
  )
  await query(
    `INSERT INTO driver_latest_location (
      driver_id, supplier_id, order_id, driver_assignment_id, route_id, session_id,
      latitude, longitude, accuracy_meters, speed_mps, heading_degrees, recorded_at,
      received_at, gps_state, network_state, battery_percent, updated_at
    ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, now(), $12, $13, $14, now())
    ON CONFLICT (driver_id) DO UPDATE SET
      supplier_id = EXCLUDED.supplier_id, order_id = EXCLUDED.order_id, route_id = EXCLUDED.route_id,
      session_id = EXCLUDED.session_id, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
      accuracy_meters = EXCLUDED.accuracy_meters, speed_mps = EXCLUDED.speed_mps,
      heading_degrees = EXCLUDED.heading_degrees, recorded_at = EXCLUDED.recorded_at,
      received_at = EXCLUDED.received_at, gps_state = EXCLUDED.gps_state,
      network_state = EXCLUDED.network_state, battery_percent = EXCLUDED.battery_percent, updated_at = now()
    WHERE driver_latest_location.recorded_at <= EXCLUDED.recorded_at`,
    [
      session.driver_id,
      session.supplier_id,
      session.current_order_id,
      session.route_id,
      session.id,
      normalized.latitude,
      normalized.longitude,
      normalized.accuracyMeters,
      normalized.speedMps,
      location.headingDegrees,
      normalized.recordedAt,
      normalized.lowAccuracy ? 'LOW_ACCURACY' : 'TRACKING_ACTIVE',
      point.networkState || 'online',
      point.batteryPercent ?? null,
    ]
  )
  await query(
    `UPDATE driver_tracking_session
     SET last_heartbeat_at = now(), updated_at = now(), last_valid_latitude = $2,
         last_valid_longitude = $3, last_accuracy_meters = $4, last_recorded_at = $5,
         gps_state = $6, network_state = $7, battery_percent = $8
     WHERE id = $1`,
    [
      session.id,
      normalized.latitude,
      normalized.longitude,
      normalized.accuracyMeters,
      normalized.recordedAt,
      normalized.lowAccuracy ? 'LOW_ACCURACY' : 'TRACKING_ACTIVE',
      point.networkState || 'online',
      point.batteryPercent ?? null,
    ]
  )
  await setLatestDriverLocation({
    sessionId: session.id,
    driverId: session.driver_id,
    location,
    status: { gpsState: normalized.lowAccuracy ? 'LOW_ACCURACY' : 'TRACKING_ACTIVE' },
  })
  await emitLocationEvent(session, location)
  return { accepted: true, pointId: point.id, serverPointId: rows[0]?.id, location }
}

export async function ingestTrackingLocations({ supplierId, driverId, sessionId, points }) {
  if (!assertSessionsEnabled())
    return { enabled: false, accepted: 0, rejected: 0, points: [], reason: 'sessions_disabled' }
  if (!Array.isArray(points) || points.length === 0)
    throw new ValidationError('points must be a non-empty array')
  const maxBatch = config.GPS_BATCH_MAX_SIZE ?? 100
  if (points.length > maxBatch)
    throw new ValidationError(`Batch cannot contain more than ${maxBatch} points`)
  const session = await loadOwnedActiveSession(sessionId, supplierId, driverId)
  let previous = null
  const previousResult = await query(
    `SELECT latitude, longitude, recorded_at FROM driver_location_ping WHERE session_id = $1 ORDER BY sequence_number DESC NULLS LAST, recorded_at DESC LIMIT 1`,
    [sessionId]
  )
  previous = previousResult.rows[0] ?? null
  const results = []
  for (const point of points) {
    try {
      if (!point?.id || !point?.sequence)
        throw new ValidationError('Each point needs id and sequence')
      const result = await acceptPoint(session, point, previous)
      results.push(result)
      if (result.accepted)
        previous = {
          latitude: result.location.latitude,
          longitude: result.location.longitude,
          recorded_at: result.location.recordedAt,
        }
    } catch (error) {
      results.push({
        accepted: false,
        pointId: point?.id ?? null,
        reason: error.message || 'server_rejected_point',
      })
    }
  }
  return {
    enabled: true,
    accepted: results.filter((result) => result.accepted).length,
    rejected: results.filter((result) => !result.accepted).length,
    points: results,
  }
}

export async function heartbeatTrackingSession({ supplierId, driverId, sessionId, state = {} }) {
  const session = await loadOwnedActiveSession(sessionId, supplierId, driverId)
  const gpsState = state.gpsState || 'TRACKING_ACTIVE'
  const networkState = state.networkState || 'online'
  const { rows } = await query(
    `UPDATE driver_tracking_session
     SET last_heartbeat_at = now(), updated_at = now(), gps_state = $2,
         network_state = $3, battery_percent = $4
     WHERE id = $1 RETURNING *`,
    [session.id, gpsState, networkState, state.batteryPercent ?? null]
  )
  return mapSession(rows[0])
}

export async function stopTrackingSession({
  supplierId,
  driverId,
  sessionId,
  reason = 'driver_action',
}) {
  const session = await loadOwnedActiveSession(sessionId, supplierId, driverId)
  const { rows } = await query(
    `UPDATE driver_tracking_session
     SET status = 'STOPPED', stopped_at = now(), stop_reason = $2, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [session.id, String(reason).slice(0, 40)]
  )
  try {
    const { emitDriverTrackingStatus } = await import('../lib/socket.js')
    await emitDriverTrackingStatus({
      supplierId,
      routeId: session.route_id,
      driverId,
      status: 'STOPPED',
      reason,
    })
  } catch {
    // Best effort realtime notification.
  }
  return mapSession(rows[0])
}
