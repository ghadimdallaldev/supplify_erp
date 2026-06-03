import { query, withTransaction } from './db.js'
import { createKeycloakUserWithPassword } from './keycloak-admin.js'
import {
  buildInviteUrl,
  evaluateInvitationState,
  generateInviteToken,
  inviteExpiresAt,
} from '../services/invitationTokens.js'
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
import { syncDriverLinkForRoleAssignment } from './driver-user-link.js'
import { sendTeamInvitationEmail } from '../services/invitation-mail.service.js'

export function generateBranchInviteToken() {
  return generateInviteToken()
}

export function buildBranchInviteUrl(token) {
  return buildInviteUrl(token, 'supplier_branch')
}

export { inviteExpiresAt }

export async function expireOldBranchInvitations() {
  const { rowCount } = await query(
    `UPDATE branch_invitations
     SET status = 'expired'
     WHERE status = 'pending' AND expires_at < NOW()`
  )
  return rowCount ?? 0
}

export async function getInvitationByToken(token) {
  const { rows } = await query(
    `
    SELECT bi.*,
           s.name AS branch_name,
           so.name AS organization_name,
           tr.name AS role_name
    FROM branch_invitations bi
    JOIN supplier s ON s.id = bi.supplier_id
    JOIN supplier_organizations so ON so.id = bi.organization_id
    JOIN tenant_roles tr ON tr.id = bi.role_id
    WHERE bi.token = $1
    `,
    [token]
  )
  return rows[0] || null
}

export function evaluateInvitationPublicState(invitation) {
  const state = evaluateInvitationState(invitation)
  if (!state.valid) return state
  return {
    valid: true,
    branch_name: invitation.branch_name,
    org_name: invitation.organization_name,
    invited_name: invitation.invited_name,
    role_name: invitation.role_name,
    invited_email: invitation.invited_email,
    expires_at: invitation.expires_at,
  }
}

export async function listBranchInvitations(organizationId, { supplierId = null } = {}) {
  const params = [organizationId]
  let supplierClause = ''
  if (supplierId) {
    supplierClause = ' AND bi.supplier_id = $2'
    params.push(supplierId)
  }
  const { rows } = await query(
    `
    SELECT bi.id, bi.supplier_id, bi.invited_name, bi.invited_email, bi.status,
           bi.expires_at, bi.created_at, bi.accepted_at,
           s.name AS branch_name,
           tr.name AS role_name,
           u.display_name AS accepted_by_name
    FROM branch_invitations bi
    JOIN supplier s ON s.id = bi.supplier_id
    JOIN tenant_roles tr ON tr.id = bi.role_id
    LEFT JOIN app_user u ON u.id = bi.accepted_by
    WHERE bi.organization_id = $1${supplierClause}
    ORDER BY bi.created_at DESC
    `,
    params
  )
  return rows
}

export async function validateBranchRoleForSupplier(roleId, supplierId) {
  const { rows } = await query(
    `
    SELECT id FROM tenant_roles
    WHERE id = $1 AND tenant_id = $2 AND tenant_type = 'SUPPLIER' AND is_active = true
      AND name != 'Owner'
    `,
    [roleId, supplierId]
  )
  return rows.length > 0
}

export async function createBranchInvitation({
  supplierId,
  organizationId,
  invitedBy,
  invitedName,
  invitedEmail,
  roleId,
}) {
  if (invitedEmail) {
    const scope = await resolveWorkspaceScope(supplierId, 'SUPPLIER')
    await assertEmailCanJoinWorkspace(invitedEmail, scope)
  }

  const token = generateInviteToken()
  const expiresAt = inviteExpiresAt()
  const { rows } = await query(
    `
    INSERT INTO branch_invitations (
      supplier_id, organization_id, token, invited_name, invited_email,
      role_id, invited_by, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
      supplierId,
      organizationId,
      token,
      invitedName || null,
      invitedEmail || null,
      roleId,
      invitedBy,
      expiresAt,
    ]
  )
  const invitation = rows[0]
  const invite_url = buildBranchInviteUrl(token)
  if (invitedEmail) {
    const { rows: supplierRows } = await query(`SELECT name FROM supplier WHERE id = $1`, [
      supplierId,
    ])
    sendTeamInvitationEmail({
      to: invitedEmail,
      inviteUrl: invite_url,
      invitedName: invitedName,
      tenantName: supplierRows[0]?.name,
      tenantType: 'SUPPLIER',
      invitationId: invitation.id,
      tenantId: supplierId,
    }).catch(() => {})
  }
  return {
    invitation,
    invite_url,
    expires_at: expiresAt,
  }
}

export async function revokeBranchInvitation(invitationId, organizationId) {
  const { rows } = await query(
    `
    UPDATE branch_invitations
    SET status = 'revoked'
    WHERE id = $1 AND organization_id = $2 AND status = 'pending'
    RETURNING id
    `,
    [invitationId, organizationId]
  )
  return rows[0] || null
}

export async function regenerateBranchInvitation(invitationId, organizationId) {
  const token = generateInviteToken()
  const expiresAt = inviteExpiresAt()
  const { rows } = await query(
    `
    UPDATE branch_invitations
    SET token = $1,
        expires_at = $2,
        status = 'pending',
        accepted_at = NULL,
        accepted_by = NULL
    WHERE id = $3
      AND organization_id = $4
      AND status IN ('pending', 'expired', 'revoked')
    RETURNING *
    `,
    [token, expiresAt, invitationId, organizationId]
  )
  if (!rows.length) return null
  const invitation = rows[0]
  const invite_url = buildBranchInviteUrl(token)
  if (invitation.invited_email) {
    const { rows: supplierRows } = await query(`SELECT name FROM supplier WHERE id = $1`, [
      invitation.supplier_id,
    ])
    sendTeamInvitationEmail({
      to: invitation.invited_email,
      inviteUrl: invite_url,
      invitedName: invitation.invited_name,
      tenantName: supplierRows[0]?.name,
      tenantType: 'SUPPLIER',
      invitationId: invitation.id,
      tenantId: invitation.supplier_id,
    }).catch(() => {})
  }
  return {
    invitation,
    invite_url,
    expires_at: expiresAt,
  }
}

export async function assertSupplierInOrg(supplierId, organizationId) {
  const { rows } = await query(`SELECT id FROM supplier WHERE id = $1 AND organization_id = $2`, [
    supplierId,
    organizationId,
  ])
  return rows.length > 0
}

export async function acceptBranchInvitation({
  token,
  fullName,
  email,
  password,
  existingUserId = null,
  existingUserEmail = null,
}) {
  const invitation = await getInvitationByToken(token)
  const state = evaluateInvitationPublicState(invitation)
  if (!state.valid) {
    const err = new Error(state.reason === 'expired' ? 'Invitation expired' : 'Invitation invalid')
    err.code = state.reason
    throw err
  }

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
      realmRoleName: keycloakRealmRoleForWorkspace('SUPPLIER'),
    })
    keycloakSub = kcUserId
  }

  const scope = await resolveWorkspaceScope(invitation.supplier_id, 'SUPPLIER')

  return withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      `SELECT * FROM branch_invitations WHERE token = $1 FOR UPDATE`,
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
      tenantId: row.supplier_id,
      tenantType: 'SUPPLIER',
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
        VALUES ($1, $2, $3, 'SUPPLIER')
        ON CONFLICT (email) DO UPDATE SET
          keycloak_sub = COALESCE(app_user.keycloak_sub, EXCLUDED.keycloak_sub),
          display_name = EXCLUDED.display_name,
          role = 'SUPPLIER',
          updated_at = NOW()
        RETURNING id, email, keycloak_sub
        `,
        [keycloakSub, resolvedEmail, displayName]
      )
      userId = userRows[0].id
    } else {
      await client.query(
        `UPDATE app_user SET role = 'SUPPLIER', updated_at = NOW() WHERE id = $1`,
        [userId]
      )
    }

    await assignInvitationTenantRole(client, {
      userId,
      roleId: row.role_id,
      tenantType: 'SUPPLIER',
      tenantId: row.supplier_id,
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
      UPDATE branch_invitations
      SET status = 'accepted', accepted_at = NOW(), accepted_by = $1
      WHERE id = $2
      `,
      [userId, row.id]
    )

    const { rows: roleRows } = await client.query(`SELECT name FROM tenant_roles WHERE id = $1`, [
      row.role_id,
    ])
    const roleName = roleRows[0]?.name || null

    let driverLink = null
    if (roleName === 'Driver') {
      driverLink = await syncDriverLinkForRoleAssignment(
        {
          userId,
          supplierId: row.supplier_id,
          roleName,
          createDriverProfile: true,
        },
        client
      )
    }

    return {
      userId,
      supplierId: row.supplier_id,
      email: resolvedEmail,
      roleId: row.role_id,
      roleName,
      driverId: driverLink?.id ?? null,
      needsLogin: !existingUserId,
      password: existingUserId ? null : password,
    }
  })
}
