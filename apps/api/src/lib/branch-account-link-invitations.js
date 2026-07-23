/**
 * Productized invitations to link an existing standalone tenant as an org Branch Account.
 * Separate from staff invites (branch-invitations / restaurant-invitations).
 */
import { query, withTransaction } from './db.js'
import {
  buildInviteUrl,
  evaluateInvitationState,
  generateInviteToken,
  inviteExpiresAt,
} from '../services/invitationTokens.js'
import { checkLinkedAccountLimit, createAuditLog } from './plan-enforcement.js'
import { linkRestaurantToOrganization } from './restaurant-org.js'
import { linkSupplierToOrganization } from './supplier-org.js'
import { applyOrgBillingOnLink, recordBranchAccountLinkHistory } from './branch-account-billing.js'
import { logger } from './logger.js'

const INVITE_TYPE = 'branch_account_link'

export function buildBranchAccountLinkInviteUrl(token) {
  return buildInviteUrl(token, INVITE_TYPE)
}

export async function expireOldBranchAccountLinkInvitations(client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rowCount } = await db(
    `UPDATE branch_account_link_invitations
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'pending' AND expires_at < NOW()`
  )
  return rowCount ?? 0
}

export async function getBranchAccountLinkInvitationByToken(token) {
  await expireOldBranchAccountLinkInvitations()
  const { rows } = await query(
    `SELECT i.*,
            CASE
              WHEN i.org_type = 'SUPPLIER' THEN (
                SELECT s.name FROM supplier s
                WHERE s.organization_id = i.organization_id AND s.is_main_branch = true
                LIMIT 1
              )
              ELSE (
                SELECT r.name FROM restaurant r
                WHERE r.organization_id = i.organization_id AND r.is_main_branch = true
                LIMIT 1
              )
            END AS org_name
     FROM branch_account_link_invitations i
     WHERE i.token = $1`,
    [token]
  )
  return rows[0] || null
}

export function evaluateBranchAccountLinkInvitationPublicState(invitation) {
  const state = evaluateInvitationState(invitation)
  if (!state.valid) return state
  return {
    valid: true,
    org_type: invitation.org_type,
    organization_id: invitation.organization_id,
    org_name: invitation.org_name || null,
    target_tenant_type: invitation.target_tenant_type,
    target_tenant_id: invitation.target_tenant_id,
    target_owner_email: invitation.target_owner_email,
    intended_org_role: invitation.intended_org_role,
    expires_at: invitation.expires_at,
    billing_impact_snapshot: invitation.billing_impact_snapshot,
  }
}

export async function listBranchAccountLinkInvitations(orgType, organizationId) {
  await expireOldBranchAccountLinkInvitations()
  const { rows } = await query(
    `SELECT *
     FROM branch_account_link_invitations
     WHERE org_type = $1 AND organization_id = $2
     ORDER BY created_at DESC`,
    [orgType, organizationId]
  )
  return rows
}

async function resolveTargetTenant({ orgType, targetTenantId, targetOwnerEmail }) {
  const table = orgType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  if (targetTenantId) {
    const { rows } = await query(
      `SELECT id, name, contact_email, organization_id, is_branch_active
       FROM ${table} WHERE id = $1`,
      [targetTenantId]
    )
    return rows[0] || null
  }
  const email = (targetOwnerEmail || '').trim().toLowerCase()
  if (!email) return null
  const { rows } = await query(
    `SELECT id, name, contact_email, organization_id, is_branch_active
     FROM ${table}
     WHERE LOWER(TRIM(contact_email)) = $1 AND organization_id IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
    [email]
  )
  return rows[0] || null
}

async function buildBillingImpactSnapshot(primaryBillingTenantId, orgType, targetTenant) {
  const limitCheck = await checkLinkedAccountLimit(primaryBillingTenantId, orgType)
  return {
    at: new Date().toISOString(),
    target_tenant_id: targetTenant?.id || null,
    target_name: targetTenant?.name || null,
    limit_check: {
      allowed: limitCheck.allowed,
      current: limitCheck.current,
      effectiveLimit: limitCheck.effectiveLimit ?? limitCheck.limit,
      reason: limitCheck.reason || null,
    },
  }
}

export async function createBranchAccountLinkInvitation({
  orgType,
  organizationId,
  primaryBillingTenantId,
  inviterUserId,
  targetTenantId = null,
  targetOwnerEmail = null,
  intendedOrgRole = 'Branch Manager',
}) {
  if (!['RESTAURANT', 'SUPPLIER'].includes(orgType)) {
    throw new Error('Invalid org type')
  }
  if (!targetTenantId && !targetOwnerEmail) {
    throw new Error('targetTenantId or targetOwnerEmail is required')
  }

  const target = await resolveTargetTenant({
    orgType,
    targetTenantId,
    targetOwnerEmail,
  })
  if (targetTenantId && !target) {
    const err = new Error('Target Branch Account not found')
    err.code = 'NOT_FOUND'
    throw err
  }
  if (target?.organization_id) {
    const err = new Error('Target tenant is already linked to an organization')
    err.code = 'ALREADY_LINKED'
    throw err
  }

  const limitCheck = await checkLinkedAccountLimit(primaryBillingTenantId, orgType)
  if (!limitCheck.allowed) {
    const err = new Error(limitCheck.reason || 'Branch Account limit reached')
    err.code = 'LIMIT_EXCEEDED'
    err.details = limitCheck
    throw err
  }

  const billingImpact = await buildBillingImpactSnapshot(primaryBillingTenantId, orgType, target)
  const token = generateInviteToken()
  const expiresAt = inviteExpiresAt()

  const { rows } = await query(
    `INSERT INTO branch_account_link_invitations (
       org_type, organization_id, target_tenant_type, target_tenant_id,
       target_owner_email, inviter_user_id, intended_org_role, status, token,
       expires_at, billing_impact_snapshot
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10::jsonb)
     RETURNING *`,
    [
      orgType,
      organizationId,
      orgType,
      target?.id || targetTenantId || null,
      (targetOwnerEmail || target?.contact_email || '').trim().toLowerCase() || null,
      inviterUserId,
      intendedOrgRole,
      token,
      expiresAt,
      JSON.stringify(billingImpact),
    ]
  )

  const invitation = rows[0]
  return {
    invitation,
    invite_url: buildBranchAccountLinkInviteUrl(token),
  }
}

export async function cancelBranchAccountLinkInvitation(invitationId, orgType, organizationId) {
  const { rows } = await query(
    `UPDATE branch_account_link_invitations
     SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND org_type = $2 AND organization_id = $3 AND status = 'pending'
     RETURNING *`,
    [invitationId, orgType, organizationId]
  )
  return rows[0] || null
}

export async function rejectBranchAccountLinkInvitation(token, userId) {
  const invitation = await getBranchAccountLinkInvitationByToken(token)
  if (!invitation) return { ok: false, reason: 'NOT_FOUND' }
  const state = evaluateInvitationState(invitation)
  if (!state.valid) return { ok: false, reason: state.reason || 'INVALID' }

  const { rows } = await query(
    `UPDATE branch_account_link_invitations
     SET status = 'rejected', rejected_at = NOW(), updated_at = NOW(),
         metadata = metadata || jsonb_build_object('rejected_by', $2::text)
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [invitation.id, userId]
  )
  if (!rows.length) return { ok: false, reason: 'INVALID' }
  return { ok: true, invitation: rows[0] }
}

export async function resendBranchAccountLinkInvitation(invitationId, orgType, organizationId) {
  const token = generateInviteToken()
  const expiresAt = inviteExpiresAt()
  const { rows } = await query(
    `UPDATE branch_account_link_invitations
     SET token = $4, expires_at = $5, status = 'pending',
         cancelled_at = NULL, rejected_at = NULL, updated_at = NOW()
     WHERE id = $1 AND org_type = $2 AND organization_id = $3
       AND status IN ('pending', 'expired', 'cancelled')
     RETURNING *`,
    [invitationId, orgType, organizationId, token, expiresAt]
  )
  if (!rows.length) return null
  return {
    invitation: rows[0],
    invite_url: buildBranchAccountLinkInviteUrl(token),
  }
}

/**
 * Accept path: validate same type, not already in another org, capacity, owner authority,
 * then link + suspend child renewal inside a transaction.
 */
export async function acceptBranchAccountLinkInvitation({
  token,
  acceptingUserId,
  acceptingUserEmail,
  primaryBillingTenantId,
}) {
  const invitation = await getBranchAccountLinkInvitationByToken(token)
  if (!invitation) return { ok: false, reason: 'NOT_FOUND' }
  const state = evaluateInvitationState(invitation)
  if (!state.valid) return { ok: false, reason: state.reason || 'INVALID' }

  const orgType = invitation.org_type
  const table = orgType === 'SUPPLIER' ? 'supplier' : 'restaurant'

  return withTransaction(async (client) => {
    // Lock org main branch for capacity race safety
    await client.query(
      `SELECT id FROM ${table}
       WHERE organization_id = $1 AND is_main_branch = true
       FOR UPDATE`,
      [invitation.organization_id]
    )

    const target = await resolveTargetTenant({
      orgType,
      targetTenantId: invitation.target_tenant_id,
      targetOwnerEmail: invitation.target_owner_email,
    })
    if (!target) {
      return { ok: false, reason: 'TARGET_NOT_FOUND' }
    }
    if (target.organization_id) {
      return { ok: false, reason: 'ALREADY_LINKED' }
    }

    // Owner authority: accepting user must own/manage the target tenant
    const email = (acceptingUserEmail || '').trim().toLowerCase()
    const contact = (target.contact_email || '').trim().toLowerCase()
    const { rows: ownerRoles } = await client.query(
      `SELECT 1 FROM tenant_user_roles tur
       JOIN tenant_roles tr ON tr.id = tur.role_id
       WHERE tur.user_id = $1 AND tur.tenant_id = $2 AND tur.tenant_type = $3
         AND tr.name = 'Owner'
       LIMIT 1`,
      [acceptingUserId, target.id, orgType]
    )
    const isContactOwner = email && contact && email === contact
    if (!ownerRoles.length && !isContactOwner) {
      return { ok: false, reason: 'NOT_OWNER' }
    }

    const billingTenantId =
      primaryBillingTenantId ||
      (
        await client.query(
          `SELECT id FROM ${table}
           WHERE organization_id = $1 AND is_main_branch = true LIMIT 1`,
          [invitation.organization_id]
        )
      ).rows[0]?.id

    if (billingTenantId) {
      const limitCheck = await checkLinkedAccountLimit(billingTenantId, orgType)
      if (!limitCheck.allowed) {
        return { ok: false, reason: 'LIMIT_EXCEEDED', details: limitCheck }
      }
    }

    const linkFn =
      orgType === 'SUPPLIER' ? linkSupplierToOrganization : linkRestaurantToOrganization
    const linked = await linkFn(target.id, invitation.organization_id, {
      isMain: false,
      client,
    })
    if (!linked.ok) {
      return { ok: false, reason: 'LINK_FAILED' }
    }

    const billing = await applyOrgBillingOnLink(target.id, orgType, {
      client,
      actorUserId: acceptingUserId,
    })

    await client.query(
      `UPDATE branch_account_link_invitations
       SET status = 'accepted', accepted_at = NOW(), accepted_by = $2,
           target_tenant_id = $3, updated_at = NOW()
       WHERE id = $1`,
      [invitation.id, acceptingUserId, target.id]
    )

    await recordBranchAccountLinkHistory({
      orgType,
      organizationId: invitation.organization_id,
      tenantType: orgType,
      tenantId: target.id,
      action: 'linked',
      actorUserId: acceptingUserId,
      invitationId: invitation.id,
      billingSnapshot: billing.snapshot || null,
      metadata: { billing_review_required: billing.billingReviewRequired },
      client,
    })

    if (billing.billingReviewRequired) {
      await recordBranchAccountLinkHistory({
        orgType,
        organizationId: invitation.organization_id,
        tenantType: orgType,
        tenantId: target.id,
        action: 'billing_review',
        actorUserId: acceptingUserId,
        invitationId: invitation.id,
        billingSnapshot: billing.snapshot || null,
        metadata: { reason: billing.reason },
        client,
      })
    }

    await createAuditLog('ACCEPT_BRANCH_ACCOUNT_LINK', {
      entityType: orgType,
      entityId: target.id,
      description: `Linked Branch Account to organization via invitation`,
      changes: {
        organizationId: invitation.organization_id,
        invitationId: invitation.id,
        billingReviewRequired: billing.billingReviewRequired,
      },
    })

    return {
      ok: true,
      tenantId: target.id,
      organizationId: invitation.organization_id,
      billingReviewRequired: billing.billingReviewRequired,
    }
  }).catch((err) => {
    logger.error('acceptBranchAccountLinkInvitation failed', { error: err.message })
    throw err
  })
}
