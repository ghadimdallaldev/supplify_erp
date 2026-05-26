import { query, withTransaction } from './db.js'
import { createKeycloakUserWithPassword } from './keycloak-admin.js'
import {
  buildInviteUrl,
  evaluateInvitationState,
  generateInviteToken,
  inviteExpiresAt,
} from '../services/invitationTokens.js'
import { assignRestaurantOrgUserRole } from './restaurant-org.js'
import {
  assertEmailCanJoinWorkspace,
  assertUserCanJoinWorkspace,
  bindUserToWorkspace,
  resolveWorkspaceScope,
} from './workspace-membership.js'
import {
  assertAcceptingEmailMatchesInvitation,
  assertInvitationRoleForTenant,
  assignInvitationTenantRole,
  keycloakRealmRoleForWorkspace,
  normalizeInvitationEmail,
} from './invitation-accept.js'

export {
  generateInviteToken,
  inviteExpiresAt,
  evaluateInvitationState as evaluateRestaurantInvitationPublicState,
}

export function buildRestaurantMemberInviteUrl(token) {
  return buildInviteUrl(token, 'restaurant_member')
}

export function buildRestaurantBranchInviteUrl(token) {
  return buildInviteUrl(token, 'restaurant_branch')
}

export async function expireOldRestaurantInvitations() {
  const { rowCount } = await query(
    `UPDATE restaurant_invitations
     SET status = 'expired'
     WHERE status = 'pending' AND expires_at < NOW()`
  )
  return rowCount ?? 0
}

export async function getRestaurantInvitationByToken(token) {
  const { rows } = await query(
    `
    SELECT ri.*,
           r.name AS restaurant_name,
           ro.name AS organization_name,
           tr.name AS role_name
    FROM restaurant_invitations ri
    JOIN restaurant r ON r.id = ri.restaurant_id
    JOIN restaurant_organizations ro ON ro.id = ri.organization_id
    JOIN tenant_roles tr ON tr.id = ri.role_id
    WHERE ri.token = $1
    `,
    [token]
  )
  const row = rows[0] || null
  if (row) {
    row.branch_name = row.restaurant_name
  }
  return row
}

export async function listRestaurantMemberInvitations(restaurantId) {
  const { rows } = await query(
    `
    SELECT ri.id, ri.invited_name, ri.invited_email, ri.status, ri.invitation_type,
           ri.expires_at, ri.created_at, ri.accepted_at,
           tr.name AS role_name,
           u.display_name AS accepted_by_name
    FROM restaurant_invitations ri
    JOIN tenant_roles tr ON tr.id = ri.role_id
    LEFT JOIN app_user u ON u.id = ri.accepted_by
    WHERE ri.restaurant_id = $1 AND ri.invitation_type = 'member'
    ORDER BY ri.created_at DESC
    `,
    [restaurantId]
  )
  return rows
}

export async function listRestaurantBranchInvitations(organizationId) {
  const { rows } = await query(
    `
    SELECT ri.id, ri.restaurant_id, ri.invited_name, ri.invited_email, ri.status,
           ri.expires_at, ri.created_at, ri.accepted_at,
           r.name AS branch_name,
           tr.name AS role_name,
           u.display_name AS accepted_by_name
    FROM restaurant_invitations ri
    JOIN restaurant r ON r.id = ri.restaurant_id
    JOIN tenant_roles tr ON tr.id = ri.role_id
    LEFT JOIN app_user u ON u.id = ri.accepted_by
    WHERE ri.organization_id = $1 AND ri.invitation_type = 'branch_manager'
    ORDER BY ri.created_at DESC
    `,
    [organizationId]
  )
  return rows
}

export async function validateRestaurantRoleForBranch(roleId, restaurantId) {
  const { rows } = await query(
    `
    SELECT id FROM tenant_roles
    WHERE id = $1 AND tenant_id = $2 AND tenant_type = 'RESTAURANT' AND is_active = true
      AND name != 'Owner'
    `,
    [roleId, restaurantId]
  )
  return rows.length > 0
}

export async function assertRestaurantInOrg(restaurantId, organizationId) {
  const { rows } = await query(`SELECT id FROM restaurant WHERE id = $1 AND organization_id = $2`, [
    restaurantId,
    organizationId,
  ])
  return rows.length > 0
}

async function insertRestaurantInvitation({
  restaurantId,
  organizationId,
  invitationType,
  invitedBy,
  invitedName,
  invitedEmail,
  roleId,
}) {
  if (invitedEmail) {
    const scope = await resolveWorkspaceScope(restaurantId, 'RESTAURANT')
    await assertEmailCanJoinWorkspace(invitedEmail, scope)
  }

  const token = generateInviteToken()
  const expiresAt = inviteExpiresAt()
  const { rows } = await query(
    `
    INSERT INTO restaurant_invitations (
      restaurant_id, organization_id, token, invited_name, invited_email,
      invitation_type, role_id, invited_by, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      restaurantId,
      organizationId,
      token,
      invitedName || null,
      invitedEmail || null,
      invitationType,
      roleId,
      invitedBy,
      expiresAt,
    ]
  )
  const invitation = rows[0]
  const invite_url =
    invitationType === 'branch_manager'
      ? buildRestaurantBranchInviteUrl(token)
      : buildRestaurantMemberInviteUrl(token)
  return { invitation, invite_url, expires_at: expiresAt }
}

export async function createRestaurantMemberInvitation({
  restaurantId,
  organizationId,
  invitedBy,
  invitedName,
  invitedEmail,
  roleId,
}) {
  return insertRestaurantInvitation({
    restaurantId,
    organizationId,
    invitationType: 'member',
    invitedBy,
    invitedName,
    invitedEmail,
    roleId,
  })
}

export async function createRestaurantBranchInvitation({
  restaurantId,
  organizationId,
  invitedBy,
  invitedName,
  invitedEmail,
  roleId,
}) {
  return insertRestaurantInvitation({
    restaurantId,
    organizationId,
    invitationType: 'branch_manager',
    invitedBy,
    invitedName,
    invitedEmail,
    roleId,
  })
}

export async function revokeRestaurantInvitation(invitationId, scope) {
  const { organizationId, restaurantId } = scope
  let sql = `
    UPDATE restaurant_invitations
    SET status = 'revoked'
    WHERE id = $1 AND status = 'pending'
  `
  const params = [invitationId]
  if (organizationId) {
    sql += ` AND organization_id = $2`
    params.push(organizationId)
  } else if (restaurantId) {
    sql += ` AND restaurant_id = $2`
    params.push(restaurantId)
  }
  sql += ' RETURNING id'
  const { rows } = await query(sql, params)
  return rows[0] || null
}

export async function regenerateRestaurantInvitation(invitationId, scope) {
  const token = generateInviteToken()
  const expiresAt = inviteExpiresAt()
  const { organizationId, restaurantId } = scope
  let sql = `
    UPDATE restaurant_invitations
    SET token = $1,
        expires_at = $2,
        status = 'pending',
        accepted_at = NULL,
        accepted_by = NULL
    WHERE id = $3
      AND status IN ('pending', 'expired', 'revoked')
  `
  const params = [token, expiresAt, invitationId]
  if (organizationId) {
    sql += ` AND organization_id = $4`
    params.push(organizationId)
  } else if (restaurantId) {
    sql += ` AND restaurant_id = $4`
    params.push(restaurantId)
  }
  sql += ' RETURNING *'
  const { rows } = await query(sql, params)
  if (!rows.length) return null
  const invitation = rows[0]
  const invite_url =
    invitation.invitation_type === 'branch_manager'
      ? buildRestaurantBranchInviteUrl(token)
      : buildRestaurantMemberInviteUrl(token)
  return { invitation, invite_url, expires_at: expiresAt }
}

export async function acceptRestaurantMemberInvitation({
  token,
  fullName,
  email,
  password,
  existingUserId = null,
  existingUserEmail = null,
}) {
  const invitation = await getRestaurantInvitationByToken(token)
  const state = evaluateInvitationState(invitation)
  if (!state.valid) {
    const err = new Error(state.reason === 'expired' ? 'Invitation expired' : 'Invitation invalid')
    err.code = state.reason
    throw err
  }
  if (invitation.invitation_type !== 'member') {
    const err = new Error('Invitation invalid')
    err.code = 'invalid'
    throw err
  }

  return acceptRestaurantInvitationCore({
    token,
    invitation,
    fullName,
    email,
    password,
    existingUserId,
    existingUserEmail,
    assignBranchOwner: false,
  })
}

export async function acceptRestaurantBranchInvitation({
  token,
  fullName,
  email,
  password,
  existingUserId = null,
  existingUserEmail = null,
}) {
  const invitation = await getRestaurantInvitationByToken(token)
  const state = evaluateInvitationState(invitation)
  if (!state.valid) {
    const err = new Error(state.reason === 'expired' ? 'Invitation expired' : 'Invitation invalid')
    err.code = state.reason
    throw err
  }
  if (invitation.invitation_type !== 'branch_manager') {
    const err = new Error('Invitation invalid')
    err.code = 'invalid'
    throw err
  }

  return acceptRestaurantInvitationCore({
    token,
    invitation,
    fullName,
    email,
    password,
    existingUserId,
    existingUserEmail,
    assignBranchOwner: true,
  })
}

async function acceptRestaurantInvitationCore({
  token,
  invitation,
  fullName,
  email,
  password,
  existingUserId,
  existingUserEmail,
  assignBranchOwner,
}) {
  const resolvedEmail = normalizeInvitationEmail(email || invitation.invited_email)
  if (!resolvedEmail) {
    throw new Error('Email is required')
  }

  assertAcceptingEmailMatchesInvitation(invitation, {
    email: resolvedEmail,
    existingUserEmail,
  })

  let keycloakSub = null
  if (!existingUserId) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }
    const nameParts = (fullName || invitation.invited_name || resolvedEmail).trim().split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''
    const { userId: kcUserId } = await createKeycloakUserWithPassword({
      email: resolvedEmail,
      firstName,
      lastName,
      password,
      realmRoleName: keycloakRealmRoleForWorkspace('RESTAURANT'),
    })
    keycloakSub = kcUserId
  }

  const scope = await resolveWorkspaceScope(invitation.restaurant_id, 'RESTAURANT')

  return withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      `SELECT * FROM restaurant_invitations WHERE token = $1 FOR UPDATE`,
      [token]
    )
    const row = locked[0]
    if (!row || row.status !== 'pending' || new Date(row.expires_at) < new Date()) {
      const err = new Error('Invitation is no longer valid')
      err.code = row?.status === 'accepted' ? 'already_used' : 'invalid'
      throw err
    }

    await assertInvitationRoleForTenant(client, {
      roleId: row.role_id,
      tenantId: row.restaurant_id,
      tenantType: 'RESTAURANT',
    })

    await assertUserCanJoinWorkspace(
      {
        userId: existingUserId,
        email: resolvedEmail,
        workspaceType: scope.workspaceType,
        organizationId: scope.organizationId,
        homeTenantId: scope.homeTenantId,
      },
      client
    )

    let userId = existingUserId
    if (!userId) {
      const displayName = (fullName || invitation.invited_name || resolvedEmail).trim()
      const { rows: userRows } = await client.query(
        `
        INSERT INTO app_user (keycloak_sub, email, display_name, role)
        VALUES ($1, $2, $3, 'RESTAURANT')
        ON CONFLICT (email) DO UPDATE SET
          keycloak_sub = COALESCE(app_user.keycloak_sub, EXCLUDED.keycloak_sub),
          display_name = EXCLUDED.display_name,
          role = 'RESTAURANT',
          updated_at = NOW()
        RETURNING id, email, keycloak_sub
        `,
        [keycloakSub, resolvedEmail, displayName]
      )
      userId = userRows[0].id
    } else {
      await client.query(
        `UPDATE app_user SET role = 'RESTAURANT', updated_at = NOW() WHERE id = $1`,
        [userId]
      )
    }

    if (assignBranchOwner) {
      await assignRestaurantOrgUserRole({
        userId,
        organizationId: row.organization_id,
        roleName: 'Regional Manager',
        assignedBy: row.invited_by,
        client,
      })
      await client.query(
        `
        INSERT INTO restaurant_org_user_branch_access (user_id, restaurant_id, organization_id, granted_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, restaurant_id) DO NOTHING
        `,
        [userId, row.restaurant_id, row.organization_id, row.invited_by]
      )
    }

    await assignInvitationTenantRole(client, {
      userId,
      roleId: row.role_id,
      tenantType: 'RESTAURANT',
      tenantId: row.restaurant_id,
      assignedBy: row.invited_by,
    })

    await bindUserToWorkspace(
      {
        userId,
        workspaceType: scope.workspaceType,
        organizationId: scope.organizationId,
        homeTenantId: scope.homeTenantId,
        isMainAdmin: false,
      },
      client
    )

    await client.query(
      `
      UPDATE restaurant_invitations
      SET status = 'accepted', accepted_at = NOW(), accepted_by = $1
      WHERE id = $2
      `,
      [userId, row.id]
    )

    const { rows: roleRows } = await client.query(`SELECT name FROM tenant_roles WHERE id = $1`, [
      row.role_id,
    ])

    return {
      userId,
      restaurantId: row.restaurant_id,
      email: resolvedEmail,
      roleId: row.role_id,
      roleName: roleRows[0]?.name || null,
      needsLogin: !existingUserId,
      password: existingUserId ? null : password,
    }
  })
}
