import { query, withTransaction } from './db.js'
import { createKeycloakUserWithPassword } from './keycloak-admin.js'
import {
  buildInviteUrl,
  evaluateInvitationState,
  generateInviteToken,
  inviteExpiresAt,
} from '../services/invitationTokens.js'

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
    WHERE id = $1 AND tenant_id = $2 AND tenant_type = 'SUPPLIER' AND is_system = true
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
  return {
    invitation,
    invite_url: buildBranchInviteUrl(token),
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
  return {
    invitation: rows[0],
    invite_url: buildBranchInviteUrl(token),
    expires_at: expiresAt,
  }
}

export async function assertSupplierInOrg(supplierId, organizationId) {
  const { rows } = await query(
    `SELECT id FROM supplier WHERE id = $1 AND organization_id = $2`,
    [supplierId, organizationId]
  )
  return rows.length > 0
}

export async function acceptBranchInvitation({
  token,
  fullName,
  email,
  password,
  existingUserId = null,
}) {
  const invitation = await getInvitationByToken(token)
  const state = evaluateInvitationPublicState(invitation)
  if (!state.valid) {
    const err = new Error(state.reason === 'expired' ? 'Invitation expired' : 'Invitation invalid')
    err.code = state.reason
    throw err
  }

  const resolvedEmail = (email || invitation.invited_email || '').trim().toLowerCase()
  if (!resolvedEmail) {
    throw new Error('Email is required')
  }

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
      realmRoleName: 'SUPPLIER',
    })
    keycloakSub = kcUserId
  }

  return withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      `SELECT * FROM branch_invitations WHERE token = $1 FOR UPDATE`,
      [token]
    )
    const row = locked[0]
    if (!row || row.status !== 'pending' || new Date(row.expires_at) < new Date()) {
      const err = new Error('Invitation is no longer valid')
      err.code = 'invalid'
      throw err
    }

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

    await client.query(
      `INSERT INTO tenant_user_roles (user_id, role_id, tenant_type, tenant_id, assigned_by)
       VALUES ($1, $2, 'SUPPLIER', $3, $4)
       ON CONFLICT (user_id, tenant_id, tenant_type)
       DO UPDATE SET role_id = EXCLUDED.role_id, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()`,
      [userId, row.role_id, row.supplier_id, row.invited_by]
    )

    await client.query(
      `
      UPDATE branch_invitations
      SET status = 'accepted', accepted_at = NOW(), accepted_by = $1
      WHERE id = $2
      `,
      [userId, row.id]
    )

    return {
      userId,
      supplierId: row.supplier_id,
      email: resolvedEmail,
      needsLogin: !existingUserId,
      password: existingUserId ? null : password,
    }
  })
}
