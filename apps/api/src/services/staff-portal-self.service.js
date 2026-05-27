import { query } from '../lib/db.js'
import { notifyStaffPtoRequest, notifyStaffSwapRequest } from './notification.service.js'
import { logger } from '../lib/logger.js'

export async function ensureStaffSession(token) {
  const { rows } = await query(
    `
      SELECT sps.*, sm.display_name, sm.restaurant_id, sm.portal_access_enabled, sm.user_id
      FROM staff_portal_session sps
      JOIN staff_member sm ON sm.id = sps.staff_id
      WHERE sps.session_token = $1
        AND sps.expires_at > now()
        AND sm.status = 'ACTIVE'
        AND sm.portal_access_enabled = true
    `,
    [token]
  )
  if (!rows.length) {
    return null
  }
  return rows[0]
}

export function mapTimeEntryRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    staffId: row.staff_id,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    clockInMethod: row.clock_in_method,
    clockOutMethod: row.clock_out_method,
    breakMinutes: row.break_minutes != null ? Number(row.break_minutes) : null,
    note: row.note,
    status: row.status,
    staff: row.staff_id
      ? {
          id: row.staff_id,
          name: row.staff_name,
          role: row.staff_role,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchStaffPortalDashboard(staffId, restaurantId) {
  const [
    staffInfoResult,
    shiftsResult,
    ptoResult,
    swapsResult,
    announcementsResult,
    documentsResult,
  ] = await Promise.all([
    query(
      `
        SELECT id, display_name, role, email, phone
        FROM staff_member
        WHERE id = $1
      `,
      [staffId]
    ),
    query(
      `
        SELECT id, role, shift_date, starts_at, ends_at, status
        FROM staff_shift
        WHERE restaurant_id = $1
          AND staff_id = $2
          AND shift_date >= CURRENT_DATE
        ORDER BY shift_date, starts_at
        LIMIT 10
      `,
      [restaurantId, staffId]
    ),
    query(
      `
        SELECT id, type, status, start_date, end_date, hours_requested, created_at
        FROM staff_pto_request
        WHERE staff_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `,
      [staffId]
    ),
    query(
      `
        SELECT id, status, reason, created_at
        FROM staff_shift_swap
        WHERE requested_by = $1
        ORDER BY created_at DESC
        LIMIT 10
      `,
      [staffId]
    ),
    query(
      `
        SELECT a.id, a.title, a.body, a.require_ack, a.published_at,
               EXISTS (
                 SELECT 1 FROM staff_announcement_ack ack
                 WHERE ack.announcement_id = a.id AND ack.staff_id = $1
               ) AS acknowledged
        FROM staff_announcement a
        WHERE a.restaurant_id = $2
        ORDER BY a.published_at DESC
        LIMIT 5
      `,
      [staffId, restaurantId]
    ),
    query(
      `
        SELECT id, doc_type, title, file_url, status, uploaded_at, expires_at
        FROM staff_document
        WHERE restaurant_id = $1 AND staff_id = $2
        ORDER BY uploaded_at DESC
        LIMIT 10
      `,
      [restaurantId, staffId]
    ),
  ])

  return {
    staff: staffInfoResult.rows[0],
    upcomingShifts: shiftsResult.rows,
    ptoRequests: ptoResult.rows,
    swapRequests: swapsResult.rows,
    announcements: announcementsResult.rows,
    documents: documentsResult.rows,
  }
}

export async function fetchStaffPortalTimeEntries(staffId, restaurantId) {
  const start = new Date()
  start.setDate(start.getDate() - 30)
  const { rows } = await query(
    `
      SELECT te.*, sm.display_name AS staff_name, sm.role AS staff_role
      FROM staff_time_entry te
      JOIN staff_member sm ON sm.id = te.staff_id
      WHERE te.restaurant_id = $1 AND te.staff_id = $2 AND te.clock_in_at >= $3
      ORDER BY te.clock_in_at DESC
      LIMIT 50
    `,
    [restaurantId, staffId, start.toISOString()]
  )
  return rows.map(mapTimeEntryRow)
}

export async function staffPortalCheckIn(staffId, restaurantId, note) {
  const { rows: openRows } = await query(
    `
      SELECT id FROM staff_time_entry
      WHERE restaurant_id = $1 AND staff_id = $2 AND clock_out_at IS NULL
      LIMIT 1
    `,
    [restaurantId, staffId]
  )
  if (openRows.length) {
    const err = new Error('You already have an open time entry. Clock out first.')
    err.name = 'TIME_ENTRY_OPEN_EXISTS'
    err.status = 409
    throw err
  }

  const clockInAt = new Date().toISOString()
  const { rows } = await query(
    `
      INSERT INTO staff_time_entry (
        restaurant_id, staff_id, clock_in_at, clock_in_method, note, created_by, updated_by
      )
      VALUES ($1, $2, $3, 'portal', $4, NULL, NULL)
      RETURNING *
    `,
    [restaurantId, staffId, clockInAt, note ?? null]
  )
  const entry = rows[0]
  const { rows: staffRows } = await query(
    `SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`,
    [entry.staff_id]
  )
  if (staffRows.length) {
    entry.staff_name = staffRows[0].staff_name
    entry.staff_role = staffRows[0].staff_role
  }
  return mapTimeEntryRow(entry)
}

export async function staffPortalCheckOut(staffId, restaurantId, entryId) {
  const { rows } = await query(
    `
      UPDATE staff_time_entry
      SET clock_out_at = now(), clock_out_method = 'portal', updated_at = now()
      WHERE id = $1 AND restaurant_id = $2 AND staff_id = $3 AND clock_out_at IS NULL
      RETURNING *
    `,
    [entryId, restaurantId, staffId]
  )
  if (!rows.length) {
    const err = new Error('Time entry not found or already closed')
    err.name = 'TIME_ENTRY_NOT_FOUND'
    err.status = 404
    throw err
  }
  const entry = rows[0]
  const { rows: staffRows } = await query(
    `SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`,
    [entry.staff_id]
  )
  if (staffRows.length) {
    entry.staff_name = staffRows[0].staff_name
    entry.staff_role = staffRows[0].staff_role
  }
  return mapTimeEntryRow(entry)
}

export async function submitStaffPortalPto(staffId, restaurantId, payload) {
  const { rows } = await query(
    `
      INSERT INTO staff_pto_request (
        restaurant_id, staff_id, type, status, start_date, end_date, hours_requested, reason, created_by
      )
      VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7, NULL)
      RETURNING *
    `,
    [
      restaurantId,
      staffId,
      payload.type,
      payload.startDate,
      payload.endDate,
      payload.hoursRequested ?? null,
      payload.reason ?? null,
    ]
  )
  try {
    await notifyStaffPtoRequest(rows[0])
  } catch (notifyError) {
    logger.warn('Staff PTO notification failed', { error: notifyError.message })
  }
  return rows[0]
}

export async function submitStaffPortalSwap(staffId, restaurantId, payload) {
  const { rows: shiftRows } = await query(
    `
      SELECT id FROM staff_shift
      WHERE id = $1 AND restaurant_id = $2 AND staff_id = $3
    `,
    [payload.shiftId, restaurantId, staffId]
  )
  if (!shiftRows.length) {
    const err = new Error('Shift not found')
    err.name = 'SHIFT_NOT_FOUND'
    err.status = 404
    throw err
  }

  const { rows } = await query(
    `
      INSERT INTO staff_shift_swap (
        restaurant_id, shift_id, requested_by, proposed_cover_id, reason, status
      )
      VALUES ($1, $2, $3, $4, $5, 'REQUESTED')
      RETURNING *
    `,
    [
      restaurantId,
      payload.shiftId,
      staffId,
      payload.proposedCoverId ?? null,
      payload.reason ?? null,
    ]
  )
  try {
    await notifyStaffSwapRequest(rows[0])
  } catch (notifyError) {
    logger.warn('Staff swap notification failed', { error: notifyError.message })
  }
  return rows[0]
}

export async function acknowledgeStaffAnnouncement(staffId, restaurantId, announcementId) {
  const { rows: annRows } = await query(
    `
      SELECT id FROM staff_announcement
      WHERE id = $1 AND restaurant_id = $2
    `,
    [announcementId, restaurantId]
  )
  if (!annRows.length) {
    const err = new Error('Announcement not found')
    err.name = 'ANNOUNCEMENT_NOT_FOUND'
    err.status = 404
    throw err
  }

  await query(
    `
      INSERT INTO staff_announcement_ack (announcement_id, staff_id)
      VALUES ($1, $2)
      ON CONFLICT (announcement_id, staff_id) DO NOTHING
    `,
    [announcementId, staffId]
  )
  return { announcementId, staffId, acknowledged: true }
}

export async function setStaffAvailability(staffId, restaurantId, payload) {
  const { rows } = await query(
    `
      INSERT INTO staff_availability (restaurant_id, staff_id, weekday, availability, notes)
      VALUES ($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT (staff_id, weekday)
      DO UPDATE SET availability = EXCLUDED.availability, notes = EXCLUDED.notes, updated_at = now()
      RETURNING *
    `,
    [
      restaurantId,
      staffId,
      payload.weekday,
      JSON.stringify(payload.availability),
      payload.notes ?? null,
    ]
  )
  return rows[0]
}

export async function getStaffAvailability(staffId, restaurantId) {
  const { rows } = await query(
    `
      SELECT *
      FROM staff_availability
      WHERE restaurant_id = $1 AND staff_id = $2
      ORDER BY weekday
    `,
    [restaurantId, staffId]
  )
  return rows
}
