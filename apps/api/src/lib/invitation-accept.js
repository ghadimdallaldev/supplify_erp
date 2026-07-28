/**
 * Shared validation and role assignment for invitation acceptance.
 * Role always comes from the invitation row (never from the client).
 */
import { ValidationError } from '../middlewares/errorHandler.js'
import { invalidateUserAuthCaches } from './access-cache.js'
import { normalizeIdentityEmail } from './identity-normalize.js'

export function normalizeInvitationEmail(email) {
  try {
    return normalizeIdentityEmail(email)
  } catch {
    return ''
  }
}

/**
 * When signup credentials target a different email than the session, use new-account flow.
 * Invite pages do not hydrate client auth state, so stale cookies are common.
 */
export function resolveInvitationAcceptIdentity(session, { email, password }) {
  const existingUserId = session?.id || null
  const existingUserEmail = session?.email || null
  if (!existingUserId || !password) {
    return { existingUserId, existingUserEmail }
  }
  const bodyEmail = normalizeInvitationEmail(email)
  const sessionEmail = normalizeInvitationEmail(existingUserEmail)
  if (bodyEmail && sessionEmail && bodyEmail !== sessionEmail) {
    return { existingUserId: null, existingUserEmail: null }
  }
  return { existingUserId, existingUserEmail }
}

/**
 * When the invitation specifies an email, the accepting user must use that exact email.
 */
export function assertAcceptingEmailMatchesInvitation(invitation, { email, existingUserEmail }) {
  const invitedEmail = normalizeInvitationEmail(invitation?.invited_email)
  if (!invitedEmail) return

  const acceptEmail = normalizeInvitationEmail(email)
  const sessionEmail = normalizeInvitationEmail(existingUserEmail)

  if (existingUserEmail && sessionEmail !== invitedEmail) {
    throw Object.assign(
      new ValidationError(
        'This invitation was sent to a different email address. Sign in with that account or ask for a new invite.'
      ),
      { code: 'email_mismatch' }
    )
  }

  if (!acceptEmail || acceptEmail !== invitedEmail) {
    throw Object.assign(
      new ValidationError('Email must match the address this invitation was created for.'),
      { code: 'email_mismatch' }
    )
  }
}

/**
 * Ensure role_id on the invitation belongs to the invited tenant and is assignable.
 */
export async function assertInvitationRoleForTenant(
  client,
  { roleId, tenantId, tenantType, allowOwner = false }
) {
  const db = client.query.bind(client)
  const ownerClause = allowOwner ? '' : `AND tr.name != 'Owner'`
  const { rows } = await db(
    `
    SELECT tr.id, tr.name
    FROM tenant_roles tr
    WHERE tr.id = $1
      AND tr.tenant_id = $2
      AND tr.tenant_type = $3
      AND tr.is_active = true
      ${ownerClause}
    `,
    [roleId, tenantId, tenantType]
  )
  if (!rows.length) {
    throw Object.assign(new ValidationError('Invitation role is invalid for this account.'), {
      code: 'invalid_role',
    })
  }
  return rows[0]
}

export async function assignInvitationTenantRole(
  client,
  { userId, roleId, tenantType, tenantId, assignedBy }
) {
  await client.query(
    `INSERT INTO tenant_user_roles (user_id, role_id, tenant_type, tenant_id, assigned_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, tenant_id, tenant_type)
     DO UPDATE SET role_id = EXCLUDED.role_id, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()`,
    [userId, roleId, tenantType, tenantId, assignedBy]
  )
  await invalidateUserAuthCaches({ userId, tenantId, tenantType })
}

export function keycloakRealmRoleForWorkspace(workspaceType) {
  if (workspaceType === 'RESTAURANT') return 'restaurant'
  if (workspaceType === 'SUPPLIER') return 'supplier'
  return null
}
