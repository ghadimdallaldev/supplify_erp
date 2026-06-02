import { query, withTransaction } from './db.js'
import { createKeycloakUserWithPassword } from './keycloak-admin.js'
import {
  buildInviteUrl,
  evaluateInvitationState,
  generateInviteToken,
  inviteExpiresAt,
} from '../services/invitationTokens.js'
import { slugifyName, uniqueSlug } from './register-account.js'
import { ensureRestaurantOrgSystemRoles, assignRestaurantOrgUserRole } from './restaurant-org.js'
import { ensureTenantSystemRoles } from './tenant-roles.js'
import { assertUserCanJoinWorkspace, bindUserToWorkspace } from './workspace-membership.js'
import {
  assertAcceptingEmailMatchesInvitation,
  keycloakRealmRoleForWorkspace,
  normalizeInvitationEmail,
} from './invitation-accept.js'
import { createPendingActivationSubscription } from './billing/subscription-activation.js'
import { isSupplifyV2 } from '../config/supplifyModel.js'
import { WORKSPACE_MODE_BUYER_ONLY } from './restaurant-workspace.js'

export { evaluateInvitationState as evaluateSupplierRestaurantInvitationState }

export function buildSupplierRestaurantInviteUrl(token) {
  return buildInviteUrl(token, 'supplier_restaurant')
}

export async function expireOldSupplierRestaurantInvitations() {
  const { rowCount } = await query(
    `UPDATE supplier_restaurant_invitations
     SET status = 'expired'
     WHERE status = 'pending' AND expires_at < NOW()`
  )
  return rowCount ?? 0
}

export async function getSupplierRestaurantInvitationByToken(token) {
  const { rows } = await query(
    `
    SELECT sri.*,
           s.name AS supplier_name,
           s.slug AS supplier_slug
    FROM supplier_restaurant_invitations sri
    JOIN supplier s ON s.id = sri.supplier_id
    WHERE sri.token = $1
    `,
    [token]
  )
  const row = rows[0] || null
  if (row) {
    row.invitation_type = 'supplier_restaurant'
    row.org_name = row.supplier_name
    row.restaurant_name = row.restaurant_name || row.invited_name
  }
  return row
}

export async function listSupplierRestaurantInvitations(supplierId) {
  const { rows } = await query(
    `
    SELECT sri.id, sri.invited_name, sri.invited_email, sri.restaurant_name,
           sri.status, sri.expires_at, sri.created_at, sri.accepted_at,
           r.name AS linked_restaurant_name
    FROM supplier_restaurant_invitations sri
    LEFT JOIN restaurant r ON r.id = sri.restaurant_id
    WHERE sri.supplier_id = $1
    ORDER BY sri.created_at DESC
    `,
    [supplierId]
  )
  return rows
}

export async function createSupplierRestaurantInvitation({
  supplierId,
  invitedBy,
  invitedEmail,
  invitedName,
  restaurantName,
}) {
  if (!isSupplifyV2()) {
    const err = new Error('Supplier restaurant invites are only available in Supplify V2')
    err.code = 'v2_required'
    throw err
  }

  const email = normalizeInvitationEmail(invitedEmail)
  if (!email) {
    const err = new Error('invited_email is required')
    err.code = 'validation'
    throw err
  }

  const token = generateInviteToken()
  const expiresAt = inviteExpiresAt()

  const { rows } = await query(
    `
    INSERT INTO supplier_restaurant_invitations (
      supplier_id, token, invited_name, invited_email, restaurant_name,
      invited_by, expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [
      supplierId,
      token,
      invitedName?.trim() || null,
      email,
      restaurantName?.trim() || invitedName?.trim() || null,
      invitedBy,
      expiresAt,
    ]
  )

  const invitation = rows[0]
  return {
    invitation,
    invite_url: buildSupplierRestaurantInviteUrl(token),
    expires_at: expiresAt,
  }
}

export async function revokeSupplierRestaurantInvitation({ invitationId, supplierId }) {
  const { rows } = await query(
    `
    UPDATE supplier_restaurant_invitations
    SET status = 'revoked'
    WHERE id = $1 AND supplier_id = $2 AND status = 'pending'
    RETURNING *
    `,
    [invitationId, supplierId]
  )
  return rows[0] || null
}

async function createBuyerOnlyRestaurant(client, { name, email, phone, supplierId, invitationId }) {
  const baseSlug = slugifyName(name)
  const slug = await uniqueSlug(client, 'restaurant', baseSlug)

  const { rows: restaurantRows } = await client.query(
    `
    INSERT INTO restaurant (name, slug, contact_email, phone, address_json, workspace_mode)
    VALUES ($1, $2, $3, $4, '{}'::jsonb, $5)
    RETURNING *
    `,
    [name, slug, email, phone || null, WORKSPACE_MODE_BUYER_ONLY]
  )
  const tenant = restaurantRows[0]

  const orgSlug = `${slug}-org`
  const { rows: orgRows } = await client.query(
    `INSERT INTO restaurant_organizations (name, slug) VALUES ($1, $2) RETURNING *`,
    [name, orgSlug]
  )
  const organization = orgRows[0]

  await client.query(
    `UPDATE restaurant
     SET organization_id = $1, is_main_branch = true, updated_at = now()
     WHERE id = $2`,
    [organization.id, tenant.id]
  )

  await ensureRestaurantOrgSystemRoles(organization.id, client)
  await ensureTenantSystemRoles(tenant.id, 'RESTAURANT', client)

  await client.query(
    `
    INSERT INTO supplier_restaurant_links (supplier_id, restaurant_id, status, invitation_id)
    VALUES ($1, $2, 'active', $3)
    ON CONFLICT (supplier_id, restaurant_id)
    DO UPDATE SET status = 'active', invitation_id = EXCLUDED.invitation_id, updated_at = NOW()
    `,
    [supplierId, tenant.id, invitationId]
  )

  await createPendingActivationSubscription(client, tenant.id, 'RESTAURANT', 'buyer_free')

  return { tenant, organizationId: organization.id }
}

export async function acceptSupplierRestaurantInvitation({
  token,
  fullName,
  email,
  password,
  phone,
  existingUserId = null,
  existingUserEmail = null,
}) {
  if (!isSupplifyV2()) {
    const err = new Error('Supplier restaurant invites are only available in Supplify V2')
    err.code = 'v2_required'
    throw err
  }

  const invitation = await getSupplierRestaurantInvitationByToken(token)
  const state = evaluateInvitationState(invitation)
  if (!state.valid) {
    const err = new Error(state.reason === 'expired' ? 'Invitation expired' : 'Invitation invalid')
    err.code = state.reason
    throw err
  }

  const resolvedEmail = normalizeInvitationEmail(email || invitation.invited_email)
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
    const { userId: kcUserId } = await createKeycloakUserWithPassword({
      email: resolvedEmail,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      password,
      realmRoleName: keycloakRealmRoleForWorkspace('RESTAURANT'),
    })
    keycloakSub = kcUserId
  }

  const businessName =
    invitation.restaurant_name || invitation.invited_name || fullName || 'Restaurant'

  return withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      `SELECT * FROM supplier_restaurant_invitations WHERE token = $1 FOR UPDATE`,
      [token]
    )
    const row = locked[0]
    if (!row || row.status !== 'pending' || new Date(row.expires_at) < new Date()) {
      const err = new Error('Invitation is no longer valid')
      err.code = row?.status === 'accepted' ? 'already_used' : 'invalid'
      throw err
    }

    let restaurantId = row.restaurant_id
    let tenant

    if (!restaurantId) {
      const created = await createBuyerOnlyRestaurant(client, {
        name: businessName,
        email: resolvedEmail,
        phone,
        supplierId: row.supplier_id,
        invitationId: row.id,
      })
      tenant = created.tenant
      restaurantId = tenant.id
    } else {
      await client.query(`UPDATE restaurant SET workspace_mode = $1 WHERE id = $2`, [
        WORKSPACE_MODE_BUYER_ONLY,
        restaurantId,
      ])
      await client.query(
        `
        INSERT INTO supplier_restaurant_links (supplier_id, restaurant_id, status, invitation_id)
        VALUES ($1, $2, 'active', $3)
        ON CONFLICT (supplier_id, restaurant_id)
        DO UPDATE SET status = 'active', invitation_id = EXCLUDED.invitation_id, updated_at = NOW()
        `,
        [row.supplier_id, restaurantId, row.id]
      )
      const { rows: rRows } = await client.query(`SELECT * FROM restaurant WHERE id = $1`, [
        restaurantId,
      ])
      tenant = rRows[0]
    }

    await assertUserCanJoinWorkspace(
      {
        userId: existingUserId,
        email: resolvedEmail,
        workspaceType: 'RESTAURANT',
        organizationId: tenant.organization_id,
        homeTenantId: restaurantId,
      },
      client
    )

    let userId = existingUserId
    if (!userId) {
      const displayName = (fullName || invitation.invited_name || resolvedEmail).trim()
      const { rows: userRows } = await client.query(
        `
        INSERT INTO app_user (email, display_name, role, keycloak_sub)
        VALUES ($1, $2, 'RESTAURANT', $3)
        ON CONFLICT (email) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            role = 'RESTAURANT',
            keycloak_sub = COALESCE(app_user.keycloak_sub, EXCLUDED.keycloak_sub),
            updated_at = NOW()
        RETURNING id
        `,
        [resolvedEmail, displayName, keycloakSub]
      )
      userId = userRows[0].id
    } else {
      await client.query(
        `UPDATE app_user SET role = 'RESTAURANT', updated_at = NOW() WHERE id = $1`,
        [userId]
      )
    }

    await ensureTenantSystemRoles(restaurantId, 'RESTAURANT', client)
    const { rows: roleRows } = await client.query(
      `SELECT id FROM tenant_roles
       WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND name = 'Restaurant Buyer'`,
      [restaurantId]
    )
    const buyerRoleId = roleRows[0]?.id
    if (buyerRoleId) {
      await client.query(
        `
        INSERT INTO tenant_user_roles (user_id, role_id, tenant_type, tenant_id, assigned_by)
        VALUES ($1, $2, 'RESTAURANT', $3, NULL)
        ON CONFLICT (user_id, tenant_id, tenant_type)
        DO UPDATE SET role_id = EXCLUDED.role_id, assigned_at = NOW()
        `,
        [userId, buyerRoleId, restaurantId]
      )
    }

    const { rows: orgRows } = await client.query(
      `SELECT organization_id FROM restaurant WHERE id = $1`,
      [restaurantId]
    )
    const organizationId = orgRows[0]?.organization_id
    if (organizationId) {
      await assignRestaurantOrgUserRole({
        userId,
        organizationId,
        roleName: 'Org Owner',
        client,
      })
    }

    await bindUserToWorkspace(
      {
        userId,
        workspaceType: 'RESTAURANT',
        organizationId,
        homeTenantId: restaurantId,
        isMainAdmin: true,
      },
      client
    )

    await client.query(
      `
      UPDATE supplier_restaurant_invitations
      SET status = 'accepted',
          accepted_at = NOW(),
          accepted_by = $1,
          restaurant_id = $2
      WHERE id = $3
      `,
      [userId, restaurantId, row.id]
    )

    return {
      userId,
      restaurantId,
      supplierId: row.supplier_id,
      workspaceMode: WORKSPACE_MODE_BUYER_ONLY,
      email: resolvedEmail,
      needsLogin: !existingUserId,
      password: existingUserId ? null : password,
    }
  })
}
