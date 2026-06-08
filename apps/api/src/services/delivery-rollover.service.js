import { query, withTransaction } from '../lib/db.js'
import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { writeSystemAuditLog } from '../lib/audit.js'
import {
  addCalendarDays,
  getZonedParts,
  isDeliveryDateEligibleForRollover,
} from '../lib/delivery-rollover-time.js'
import { notifyDeliveryRolloverBatch } from './notification.service.js'

export const ROLLOVER_ELIGIBLE_ASSIGNMENT_STATUSES = [
  'assigned',
  'picked_up',
  'out_for_delivery',
  'rescheduled',
]

export const TERMINAL_ORDER_STATUSES_FOR_ROLLOVER = [
  'DELIVERED',
  'RECEIVED_FULL',
  'RECEIVED_PARTIAL',
  'RECEIVED_WITH_DISPUTE',
  'CANCELLED',
  'INVOICED',
  'COMPLETED',
]

const ROLLOVER_AUDIT_MESSAGE =
  'Delivery rolled over to next day because it was not delivered before cutoff.'

function rolloverConfig() {
  return {
    enabled: config.DELIVERY_ROLLOVER_ENABLED,
    cutoffHour: config.DELIVERY_ROLLOVER_CUTOFF_HOUR,
    timeZone: config.DELIVERY_ROLLOVER_TIMEZONE,
    keepDriver: config.DELIVERY_ROLLOVER_KEEP_DRIVER,
  }
}

function effectiveDeliveryDateSql(alias = 'da') {
  return `COALESCE(
    ${alias}.scheduled_delivery_date,
    (
      SELECT dr.scheduled_date
      FROM route_stop rs
      JOIN delivery_route dr ON dr.id = rs.route_id
      WHERE rs.order_id = ${alias}.order_id
        AND dr.supplier_id = ${alias}.supplier_id
        AND dr.status IN ('PLANNED', 'IN_PROGRESS')
      ORDER BY dr.scheduled_date DESC
      LIMIT 1
    ),
    ${alias}.assigned_at::date,
    ${alias}.created_at::date
  )`
}

/**
 * @param {{ now?: Date, cutoff?: number, timeZone?: string, tenantId?: string, force?: boolean }} opts
 */
export async function findUndeliveredAssignmentsForRollover({
  now = new Date(),
  cutoff = config.DELIVERY_ROLLOVER_CUTOFF_HOUR,
  timeZone = config.DELIVERY_ROLLOVER_TIMEZONE,
  tenantId = null,
  force = false,
} = {}) {
  const effDate = effectiveDeliveryDateSql('da')
  const params = [ROLLOVER_ELIGIBLE_ASSIGNMENT_STATUSES, TERMINAL_ORDER_STATUSES_FOR_ROLLOVER]
  let tenantClause = ''
  if (tenantId) {
    params.push(tenantId)
    tenantClause = `AND da.supplier_id = $${params.length}`
  }

  const { rows } = await query(
    `
    SELECT
      da.*,
      o.status AS order_status,
      d.full_name AS driver_name,
      (${effDate}) AS effective_delivery_date
    FROM driver_assignments da
    JOIN customer_order o ON o.id = da.order_id
    LEFT JOIN drivers d ON d.id = da.driver_id
    WHERE da.status = ANY($1::text[])
      AND o.status <> ALL($2::text[])
      ${tenantClause}
    ORDER BY da.supplier_id, (${effDate}), da.created_at
    `,
    params
  )

  if (force) {
    return rows.map((row) => ({
      ...row,
      effective_delivery_date: row.effective_delivery_date,
    }))
  }

  const { calendarDate: today } = getZonedParts(now, timeZone)

  return rows.filter((row) => {
    if (row.rolled_over_at) {
      const rolledDay = getZonedParts(new Date(row.rolled_over_at), timeZone).calendarDate
      if (rolledDay === today) return false
    }
    return isDeliveryDateEligibleForRollover({
      effectiveDeliveryDate: row.effective_delivery_date,
      now,
      timeZone,
      cutoffHour: cutoff,
    })
  })
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

async function findOrCreateRolloverRoute(
  client,
  { supplierId, driverId, driverName, vehicleInfo, scheduledDate }
) {
  const label = `Rollover ${scheduledDate}`
  const { rows: existing } = await client.query(
    `
    SELECT id FROM delivery_route
    WHERE supplier_id = $1
      AND scheduled_date = $2::date
      AND status = 'PLANNED'
      AND route_label = $3
      AND ($4::uuid IS NULL OR driver_id = $4)
    LIMIT 1
    `,
    [supplierId, scheduledDate, label, driverId ?? null]
  )
  if (existing.length) return existing[0].id

  const routeNumber = await nextRouteNumber(supplierId, client)
  const { rows: created } = await client.query(
    `
    INSERT INTO delivery_route (
      supplier_id, route_number, route_label, driver_id, driver_name,
      vehicle_info, scheduled_date, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, 'PLANNED')
    RETURNING id
    `,
    [
      supplierId,
      routeNumber,
      label,
      driverId ?? null,
      driverName ?? null,
      vehicleInfo ?? null,
      scheduledDate,
    ]
  )
  return created[0].id
}

async function detachOrderFromPriorRoutes(client, { orderId, supplierId, beforeDate }) {
  await client.query(
    `
    DELETE FROM route_stop rs
    USING delivery_route dr
    WHERE rs.route_id = dr.id
      AND rs.order_id = $1
      AND dr.supplier_id = $2
      AND dr.scheduled_date <= $3::date
      AND dr.status IN ('PLANNED', 'IN_PROGRESS')
      AND rs.status NOT IN ('COMPLETED', 'FAILED')
    `,
    [orderId, supplierId, beforeDate]
  )
}

async function appendStopToRolloverRoute(client, { routeId, orderId, addressJson }) {
  const { rows: existing } = await client.query(
    `SELECT id FROM route_stop WHERE route_id = $1 AND order_id = $2`,
    [routeId, orderId]
  )
  if (existing.length) return

  const { rows: seqRows } = await client.query(
    `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq FROM route_stop WHERE route_id = $1`,
    [routeId]
  )
  const seq = seqRows[0]?.next_seq ?? 1
  await client.query(
    `
    INSERT INTO route_stop (route_id, order_id, sequence_number, status, address_json)
    VALUES ($1, $2, $3, 'PLANNED', $4)
    `,
    [routeId, orderId, seq, addressJson ?? null]
  )
}

/**
 * @param {{ assignmentId: string, actorUserId?: string|null, force?: boolean, notifyRestaurant?: boolean }} opts
 */
export async function rolloverAssignmentToNextDay({
  assignmentId,
  actorUserId = null,
  force = false,
  notifyRestaurant = false,
}) {
  const effDate = effectiveDeliveryDateSql('da')
  const { rows } = await query(
    `
    SELECT da.*, o.status AS order_status, r.address_json,
      d.full_name AS driver_name, d.vehicle_type, d.vehicle_plate,
      (${effDate}) AS effective_delivery_date
    FROM driver_assignments da
    JOIN customer_order o ON o.id = da.order_id
    JOIN restaurant r ON r.id = o.restaurant_id
    LEFT JOIN drivers d ON d.id = da.driver_id
    WHERE da.id = $1
    `,
    [assignmentId]
  )
  if (!rows.length) {
    return { ok: false, reason: 'not_found' }
  }

  const row = rows[0]
  if (!ROLLOVER_ELIGIBLE_ASSIGNMENT_STATUSES.includes(row.status)) {
    return { ok: false, reason: 'ineligible_status', status: row.status }
  }
  if (TERMINAL_ORDER_STATUSES_FOR_ROLLOVER.includes(row.order_status)) {
    return { ok: false, reason: 'terminal_order', orderStatus: row.order_status }
  }

  const cfg = rolloverConfig()
  const now = new Date()
  if (
    !force &&
    !isDeliveryDateEligibleForRollover({
      effectiveDeliveryDate: row.effective_delivery_date,
      now,
      timeZone: cfg.timeZone,
      cutoffHour: cfg.cutoffHour,
    })
  ) {
    return { ok: false, reason: 'before_cutoff', deliveryDate: row.effective_delivery_date }
  }

  const { calendarDate: today } = getZonedParts(now, cfg.timeZone)
  const nextDate = addCalendarDays(row.effective_delivery_date || today, 1)

  if (row.rolled_over_at) {
    const rolledDay = getZonedParts(new Date(row.rolled_over_at), cfg.timeZone).calendarDate
    if (rolledDay === today && !force) {
      return { ok: false, reason: 'already_rolled_today' }
    }
  }

  const result = await withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      `SELECT * FROM driver_assignments WHERE id = $1 FOR UPDATE`,
      [assignmentId]
    )
    if (!locked.length) return { ok: false, reason: 'not_found' }
    const current = locked[0]
    if (!ROLLOVER_ELIGIBLE_ASSIGNMENT_STATUSES.includes(current.status)) {
      return { ok: false, reason: 'ineligible_status', status: current.status }
    }

    const rolloverNote = ROLLOVER_AUDIT_MESSAGE
    const notes = current.notes ? `${current.notes}\n${rolloverNote}` : rolloverNote

    await client.query(
      `
      UPDATE driver_assignments
      SET status = 'rescheduled',
          scheduled_delivery_date = $2::date,
          rolled_over_at = now(),
          rollover_count = rollover_count + 1,
          notes = $3,
          updated_at = now()
      WHERE id = $1
      `,
      [assignmentId, nextDate, notes]
    )

    await detachOrderFromPriorRoutes(client, {
      orderId: current.order_id,
      supplierId: current.supplier_id,
      beforeDate: nextDate,
    })

    let routeId = null
    if (cfg.keepDriver && current.driver_id) {
      const vehicleInfo = [row.vehicle_type, row.vehicle_plate].filter(Boolean).join(' · ') || null
      routeId = await findOrCreateRolloverRoute(client, {
        supplierId: current.supplier_id,
        driverId: current.driver_id,
        driverName: row.driver_name,
        vehicleInfo,
        scheduledDate: nextDate,
      })
      await appendStopToRolloverRoute(client, {
        routeId,
        orderId: current.order_id,
        addressJson: row.address_json,
      })
    }

    return {
      ok: true,
      assignmentId,
      orderId: current.order_id,
      supplierId: current.supplier_id,
      previousDate: row.effective_delivery_date,
      scheduledDeliveryDate: nextDate,
      routeId,
      driverId: current.driver_id,
    }
  })

  if (!result.ok) return result

  await writeSystemAuditLog({
    action_type: 'delivery.rollover',
    tenant_type: 'SUPPLIER',
    tenant_id: result.supplierId,
    target_id: result.orderId,
    actor_user_id: actorUserId,
    payload_json: {
      resource_type: 'DRIVER_ASSIGNMENT',
      assignment_id: assignmentId,
      previous_delivery_date: result.previousDate,
      scheduled_delivery_date: result.scheduledDeliveryDate,
      route_id: result.routeId,
      message: ROLLOVER_AUDIT_MESSAGE,
      manual: Boolean(actorUserId),
    },
  })

  if (notifyRestaurant) {
    try {
      await notifyDeliveryRolloverBatch({
        supplierId: result.supplierId,
        items: [{ orderId: result.orderId, scheduledDate: result.scheduledDeliveryDate }],
        notifyRestaurant: true,
      })
    } catch {
      /* non-blocking */
    }
  }

  return result
}

/**
 * @param {{ tenantId?: string, force?: boolean, notifyRestaurant?: boolean }} opts
 */
export async function runDeliveryRolloverJob(opts = {}) {
  const cfg = rolloverConfig()
  if (!cfg.enabled && !opts.force) {
    logger.debug({ event: 'delivery_rollover.disabled' })
    return { enabled: false, rolled: 0, skipped: 0, errors: 0 }
  }

  const candidates = await findUndeliveredAssignmentsForRollover({
    tenantId: opts.tenantId ?? null,
    force: opts.force ?? false,
  })

  const bySupplier = new Map()
  let rolled = 0
  let skipped = 0
  let errors = 0

  for (const row of candidates) {
    try {
      const outcome = await rolloverAssignmentToNextDay({
        assignmentId: row.id,
        force: opts.force ?? false,
        notifyRestaurant: false,
      })
      if (outcome.ok) {
        rolled += 1
        const list = bySupplier.get(outcome.supplierId) ?? []
        list.push(outcome)
        bySupplier.set(outcome.supplierId, list)
      } else if (outcome.reason === 'already_rolled_over') {
        skipped += 1
      } else {
        skipped += 1
      }
    } catch (err) {
      errors += 1
      logger.error('delivery_rollover.assignment_failed', {
        assignmentId: row.id,
        error: err.message,
      })
    }
  }

  for (const [supplierId, items] of bySupplier) {
    try {
      await notifyDeliveryRolloverBatch({
        supplierId,
        items: items.map((i) => ({
          orderId: i.orderId,
          scheduledDate: i.scheduledDeliveryDate,
        })),
        notifyRestaurant: opts.notifyRestaurant ?? false,
      })
    } catch {
      /* non-blocking */
    }
  }

  logger.info('delivery_rollover.complete', {
    rolled,
    skipped,
    errors,
    candidates: candidates.length,
  })
  return { enabled: true, rolled, skipped, errors, candidates: candidates.length }
}
