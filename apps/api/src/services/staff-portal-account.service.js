import { randomBytes } from 'crypto'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  createKeycloakUserWithPassword,
  ensureKeycloakRealmRole,
  findKeycloakUserByEmail,
  getKeycloakAdminToken,
  setKeycloakUserEnabled,
  resetKeycloakUserPassword,
} from '../lib/keycloak-admin.js'
import { STAFF_PORTAL_APP_ROLE, STAFF_PORTAL_KEYCLOAK_ROLE } from '../lib/staff-portal-auth.js'
import {
  buildStaffPortalLoginPageUrl,
  sendStaffPortalAccountInvite,
} from './staff-portal-mail.service.js'

function generateTemporaryPassword() {
  return `${randomBytes(9).toString('base64url')}Aa1!`
}

export async function getStaffPortalAccessRow(staffId, restaurantId) {
  const { rows } = await query(
    `
      SELECT
        sm.id,
        sm.email,
        sm.display_name,
        sm.user_id,
        sm.portal_access_enabled,
        sm.portal_invited_at,
        sm.portal_last_login_at,
        sm.portal_access_disabled_at,
        u.keycloak_sub,
        u.email AS user_email
      FROM staff_member sm
      LEFT JOIN app_user u ON u.id = sm.user_id
      WHERE sm.id = $1 AND sm.restaurant_id = $2
    `,
    [staffId, restaurantId]
  )
  return rows[0] || null
}

export function mapPortalAccessInfo(row) {
  if (!row) return null
  const hasAccount = Boolean(row.user_id)
  let status = 'none'
  if (hasAccount) {
    status = row.portal_access_enabled ? 'active' : 'disabled'
  } else if (row.portal_invited_at) {
    status = 'invited'
  }
  return {
    staffId: row.id,
    email: row.email,
    hasAccount,
    portalAccessEnabled: row.portal_access_enabled,
    status,
    invitedAt: row.portal_invited_at,
    lastLoginAt: row.portal_last_login_at,
    disabledAt: row.portal_access_disabled_at,
    loginUrl: buildStaffPortalLoginPageUrl(),
  }
}

async function assertStaffEmail(staff) {
  const email = (staff.email || '').trim()
  if (!email) {
    const err = new Error('Staff member must have an email before creating a portal account')
    err.name = 'STAFF_EMAIL_REQUIRED'
    err.status = 400
    throw err
  }
  return email
}

export async function createStaffPortalAccount(staffId, restaurantId, { invitedByUserId } = {}) {
  const staff = await getStaffPortalAccessRow(staffId, restaurantId)
  if (!staff) {
    const err = new Error('Staff member not found')
    err.name = 'STAFF_NOT_FOUND'
    err.status = 404
    throw err
  }

  const email = await assertStaffEmail(staff)
  if (staff.user_id && staff.portal_access_enabled) {
    return { ...mapPortalAccessInfo(staff), alreadyExists: true }
  }

  const tempPassword = generateTemporaryPassword()
  const firstName = staff.display_name?.split(' ')[0] || 'Staff'
  const lastName = staff.display_name?.split(' ').slice(1).join(' ') || 'Member'

  const { userId: keycloakSub, created } = await createKeycloakUserWithPassword({
    email,
    firstName,
    lastName,
    password: tempPassword,
    realmRoleName: STAFF_PORTAL_KEYCLOAK_ROLE,
  })

  if (!created) {
    await ensureKeycloakRealmRole(email, STAFF_PORTAL_KEYCLOAK_ROLE)
  }

  const displayName = staff.display_name || `${firstName} ${lastName}`.trim()

  const { rows: existingUsers } = await query(
    `SELECT * FROM app_user WHERE keycloak_sub = $1 OR LOWER(email) = LOWER($2) LIMIT 1`,
    [keycloakSub, email]
  )
  const existingUser = existingUsers[0]
  const platformRoles = new Set(['ADMIN', 'SUPPLIER', 'RESTAURANT', 'PENDING'])
  const preservePlatformRole = existingUser && platformRoles.has(existingUser.role)

  let appUser
  if (existingUser) {
    const { rows } = await query(
      `
        UPDATE app_user
        SET
          keycloak_sub = $1,
          email = $2,
          display_name = $3,
          role = CASE WHEN $4 THEN role ELSE $5 END,
          updated_at = now()
        WHERE id = $6
        RETURNING *
      `,
      [
        keycloakSub,
        email,
        displayName,
        preservePlatformRole,
        STAFF_PORTAL_APP_ROLE,
        existingUser.id,
      ]
    )
    appUser = rows[0]
    if (!preservePlatformRole) {
      await ensureKeycloakRealmRole(email, STAFF_PORTAL_KEYCLOAK_ROLE)
    }
  } else {
    const { rows } = await query(
      `
        INSERT INTO app_user (keycloak_sub, email, display_name, role)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [keycloakSub, email, displayName, STAFF_PORTAL_APP_ROLE]
    )
    appUser = rows[0]
  }

  await query(
    `
      UPDATE staff_member
      SET
        user_id = $1,
        portal_access_enabled = true,
        portal_invited_at = COALESCE(portal_invited_at, now()),
        portal_access_disabled_at = NULL,
        updated_at = now()
      WHERE id = $2 AND restaurant_id = $3
    `,
    [appUser.id, staffId, restaurantId]
  )

  logger.info('Staff portal account created', {
    staffId,
    appUserId: appUser.id,
    invitedByUserId,
  })

  return {
    ...mapPortalAccessInfo(await getStaffPortalAccessRow(staffId, restaurantId)),
    temporaryPassword: tempPassword,
    keycloakUserCreated: created,
  }
}

export async function sendStaffPortalInviteEmail(staffId, restaurantId) {
  const staff = await getStaffPortalAccessRow(staffId, restaurantId)
  if (!staff) {
    const err = new Error('Staff member not found')
    err.name = 'STAFF_NOT_FOUND'
    err.status = 404
    throw err
  }
  const email = await assertStaffEmail(staff)
  if (!staff.user_id || !staff.portal_access_enabled) {
    const err = new Error('Create a portal account before sending an invite')
    err.name = 'PORTAL_ACCOUNT_REQUIRED'
    err.status = 400
    throw err
  }

  await query(
    `
      UPDATE staff_member
      SET portal_invited_at = now(), updated_at = now()
      WHERE id = $1
    `,
    [staffId]
  )

  await sendStaffPortalAccountInvite({
    to: email,
    displayName: staff.display_name,
    loginUrl: buildStaffPortalLoginPageUrl(),
  })

  return mapPortalAccessInfo(await getStaffPortalAccessRow(staffId, restaurantId))
}

export async function disableStaffPortalAccess(staffId, restaurantId) {
  const staff = await getStaffPortalAccessRow(staffId, restaurantId)
  if (!staff) {
    const err = new Error('Staff member not found')
    err.name = 'STAFF_NOT_FOUND'
    err.status = 404
    throw err
  }

  if (staff.user_email || staff.email) {
    try {
      const token = await getKeycloakAdminToken()
      const kcUser = await findKeycloakUserByEmail(token, staff.user_email || staff.email)
      if (kcUser?.id) {
        await setKeycloakUserEnabled(token, kcUser.id, false)
      }
    } catch (error) {
      logger.warn('Keycloak disable failed for staff portal user', { error: error.message })
    }
  }

  await query(
    `
      UPDATE staff_member
      SET
        portal_access_enabled = false,
        portal_access_disabled_at = now(),
        updated_at = now()
      WHERE id = $1 AND restaurant_id = $2
    `,
    [staffId, restaurantId]
  )

  await query(`DELETE FROM staff_portal_session WHERE staff_id = $1`, [staffId])

  return mapPortalAccessInfo(await getStaffPortalAccessRow(staffId, restaurantId))
}

export async function resetStaffPortalAccess(staffId, restaurantId) {
  const staff = await getStaffPortalAccessRow(staffId, restaurantId)
  if (!staff?.user_id) {
    const err = new Error('No portal account exists for this staff member')
    err.name = 'PORTAL_ACCOUNT_REQUIRED'
    err.status = 400
    throw err
  }

  const email = await assertStaffEmail(staff)
  const tempPassword = generateTemporaryPassword()

  try {
    const token = await getKeycloakAdminToken()
    const kcUser = await findKeycloakUserByEmail(token, email)
    if (kcUser?.id) {
      await resetKeycloakUserPassword(token, kcUser.id, tempPassword, true)
      await setKeycloakUserEnabled(token, kcUser.id, true)
    }
  } catch (error) {
    logger.error('Staff portal password reset failed', { error: error.message })
    throw error
  }

  await query(
    `
      UPDATE staff_member
      SET
        portal_access_enabled = true,
        portal_access_disabled_at = NULL,
        updated_at = now()
      WHERE id = $1 AND restaurant_id = $2
    `,
    [staffId, restaurantId]
  )

  await query(`DELETE FROM staff_portal_session WHERE staff_id = $1`, [staffId])

  return {
    ...mapPortalAccessInfo(await getStaffPortalAccessRow(staffId, restaurantId)),
    temporaryPassword: tempPassword,
  }
}
