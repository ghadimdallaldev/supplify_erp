/**
 * Link supplier driver records (drivers table) to app_user accounts for the Driver role.
 */
import { query, withTransaction } from './db.js'
import { ValidationError } from '../middlewares/errorHandler.js'

export async function getDriverLinkForUser(userId, supplierId) {
  const { rows } = await query(
    `
    SELECT d.id, d.full_name, d.phone, d.is_active, u.email, u.display_name
    FROM drivers d
    LEFT JOIN app_user u ON u.id = d.user_id
    WHERE d.user_id = $1 AND d.supplier_id = $2
    LIMIT 1
    `,
    [userId, supplierId]
  )
  return rows[0] ?? null
}

export async function listUnlinkedDrivers(supplierId) {
  const { rows } = await query(
    `
    SELECT d.id, d.full_name, d.phone, d.vehicle_type, d.is_active
    FROM drivers d
    WHERE d.supplier_id = $1 AND d.is_active = TRUE AND d.user_id IS NULL
    ORDER BY d.full_name
    `,
    [supplierId]
  )
  return rows
}

export async function assertUserNotLinkedToOtherDriver(userId, supplierId, exceptDriverId = null) {
  const { rows } = await query(
    `
    SELECT id FROM drivers
    WHERE user_id = $1 AND supplier_id = $2 AND is_active = TRUE
      AND ($3::uuid IS NULL OR id != $3)
    LIMIT 1
    `,
    [userId, supplierId, exceptDriverId]
  )
  if (rows.length) {
    throw new ValidationError('This user is already linked to another driver profile')
  }
}

export async function linkDriverToUser({ driverId, userId, supplierId }, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query

  const { rows: driverRows } = await db(
    `SELECT id, user_id FROM drivers WHERE id = $1 AND supplier_id = $2`,
    [driverId, supplierId]
  )
  if (!driverRows.length) throw new ValidationError('Driver not found')

  const { rows: userRows } = await db(
    `SELECT id, email, display_name FROM app_user WHERE id = $1`,
    [userId]
  )
  if (!userRows.length) throw new ValidationError('User not found')

  await assertUserNotLinkedToOtherDriver(userId, supplierId, driverId)

  if (driverRows[0].user_id && driverRows[0].user_id !== userId) {
    throw new ValidationError('This driver profile is already linked to another user')
  }

  const { rows: updated } = await db(
    `UPDATE drivers SET user_id = $1, updated_at = now()
     WHERE id = $2 AND supplier_id = $3
     RETURNING *`,
    [userId, driverId, supplierId]
  )
  return updated[0]
}

export async function unlinkDriverUser({ driverId, supplierId }, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rows } = await db(
    `UPDATE drivers SET user_id = NULL, updated_at = now()
     WHERE id = $1 AND supplier_id = $2
     RETURNING *`,
    [driverId, supplierId]
  )
  if (!rows.length) throw new ValidationError('Driver not found')
  return rows[0]
}

export async function ensureDriverProfileForUser(
  { userId, supplierId, fullName, phone, vehicleType },
  client = null
) {
  const existing = await getDriverLinkForUser(userId, supplierId)
  if (existing) return existing

  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rows: userRows } = await db(`SELECT display_name, email FROM app_user WHERE id = $1`, [
    userId,
  ])
  if (!userRows.length) throw new ValidationError('User not found')

  await assertUserNotLinkedToOtherDriver(userId, supplierId)

  const name =
    (fullName || userRows[0].display_name || userRows[0].email || 'Driver').trim() || 'Driver'

  const { rows: inserted } = await db(
    `INSERT INTO drivers (supplier_id, full_name, phone, vehicle_type, user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [supplierId, name, phone ?? null, vehicleType ?? null, userId]
  )
  return inserted[0]
}

export async function syncDriverLinkForRoleAssignment(
  { userId, supplierId, roleName, driverId, createDriverProfile },
  client = null
) {
  if (roleName !== 'Driver') {
    return null
  }
  if (driverId) {
    return linkDriverToUser({ driverId, userId, supplierId }, client)
  }
  if (createDriverProfile !== false) {
    return ensureDriverProfileForUser({ userId, supplierId }, client)
  }
  return getDriverLinkForUser(userId, supplierId)
}
