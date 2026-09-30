/**
 * Self-service account deletion (store compliance).
 *
 * OWNER gate (1B): personal deletion never closes or deletes a business.
 * Org owners must transfer ownership or complete explicit org-close first.
 */
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../middlewares/errorHandler.js'
import { assignOwnerRoleForUser } from '../lib/tenant-roles.js'
import { MAIN_ADMIN_ROLE_NAME } from '../lib/workspace-membership.js'
import { assignOrgUserRole } from '../lib/supplier-org.js'
import { assignRestaurantOrgUserRole } from '../lib/restaurant-org.js'
import { getKeycloakAdminToken, setKeycloakUserEnabled } from '../lib/keycloak-admin.js'

export const OWNER_BLOCKER_CODE = 'ORG_OWNER_MUST_TRANSFER_OR_CLOSE'

export const RETENTION_SUMMARY = Object.freeze({
  deleted: [
    'Profile name, email, and phone',
    'Saved consumer delivery addresses',
    'Push notification device tokens',
    'Active login sessions for this account',
  ],
  anonymized: [
    'Display name on chat and activity records tied to this user',
    'Driver profile linkage to this login (driver ops records may remain for the supplier)',
  ],
  retained: [
    'Orders, invoices, payments, and tax/financial ledger rows',
    'Legal acceptance and security audit logs',
    'Guest/order contact snapshots already stored on orders (immutable)',
    'Closed organization and branch records after an explicit org close',
  ],
})

/** Avoid circular import of TENANT name if MAIN_ADMIN renamed — use workspace constant. */
const OWNER_ROLE = MAIN_ADMIN_ROLE_NAME || 'Owner'

export async function listOwnershipBlockers(userId) {
  const blockers = []

  const { rows: supplierOrgOwner } = await query(
    `
    SELECT o.id, o.name, 'SUPPLIER'::text AS workspace_type
    FROM org_user_roles our
    JOIN org_roles r ON r.id = our.role_id AND r.name = 'Org Owner'
    JOIN supplier_organizations o ON o.id = our.organization_id
    WHERE our.user_id = $1 AND o.closed_at IS NULL
    `,
    [userId]
  )
  for (const row of supplierOrgOwner) {
    blockers.push({
      code: OWNER_BLOCKER_CODE,
      workspaceType: 'SUPPLIER',
      organizationId: row.id,
      organizationName: row.name,
      message:
        'Transfer organization ownership or close the organization before deleting your personal account. Closing or transferring never happens automatically when you delete your account.',
    })
  }

  const { rows: restaurantOrgOwner } = await query(
    `
    SELECT o.id, o.name, 'RESTAURANT'::text AS workspace_type
    FROM restaurant_org_user_roles our
    JOIN restaurant_org_roles r ON r.id = our.role_id AND r.name = 'Org Owner'
    JOIN restaurant_organizations o ON o.id = our.organization_id
    WHERE our.user_id = $1 AND o.closed_at IS NULL
    `,
    [userId]
  )
  for (const row of restaurantOrgOwner) {
    blockers.push({
      code: OWNER_BLOCKER_CODE,
      workspaceType: 'RESTAURANT',
      organizationId: row.id,
      organizationName: row.name,
      message:
        'Transfer organization ownership or close the organization before deleting your personal account. Closing or transferring never happens automatically when you delete your account.',
    })
  }

  // Tenant Owner on a non-closed org branch without Org Owner row (edge / legacy)
  const { rows: tenantOwners } = await query(
    `
    SELECT DISTINCT o.id AS organization_id, o.name AS organization_name, 'SUPPLIER'::text AS workspace_type
    FROM tenant_user_roles tur
    JOIN tenant_roles tr ON tr.id = tur.role_id AND tr.name = $2
    JOIN supplier s ON s.id = tur.tenant_id AND tur.tenant_type = 'SUPPLIER'
    JOIN supplier_organizations o ON o.id = s.organization_id
    WHERE tur.user_id = $1 AND o.closed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM org_user_roles our
        JOIN org_roles r ON r.id = our.role_id AND r.name = 'Org Owner'
        WHERE our.user_id = $1 AND our.organization_id = o.id
      )
    UNION ALL
    SELECT DISTINCT o.id, o.name, 'RESTAURANT'::text
    FROM tenant_user_roles tur
    JOIN tenant_roles tr ON tr.id = tur.role_id AND tr.name = $2
    JOIN restaurant r ON r.id = tur.tenant_id AND tur.tenant_type = 'RESTAURANT'
    JOIN restaurant_organizations o ON o.id = r.organization_id
    WHERE tur.user_id = $1 AND o.closed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM restaurant_org_user_roles our
        JOIN restaurant_org_roles rr ON rr.id = our.role_id AND rr.name = 'Org Owner'
        WHERE our.user_id = $1 AND our.organization_id = o.id
      )
    `,
    [userId, OWNER_ROLE]
  )
  for (const row of tenantOwners) {
    blockers.push({
      code: OWNER_BLOCKER_CODE,
      workspaceType: row.workspace_type,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      message:
        'Transfer organization ownership or close the organization before deleting your personal account.',
    })
  }

  // Deduplicate by org id + workspace
  const seen = new Set()
  return blockers.filter((b) => {
    const key = `${b.workspaceType}:${b.organizationId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function getDeletionStatus(userId) {
  const { rows } = await query(
    `SELECT id, email, display_name, role, is_active, deleted_at
     FROM app_user WHERE id = $1`,
    [userId]
  )
  const user = rows[0]
  if (!user) throw new NotFoundError('User not found')
  if (user.deleted_at || user.is_active === false) {
    return {
      canDelete: false,
      alreadyDeleted: true,
      blockers: [],
      retention: RETENTION_SUMMARY,
      user: { id: user.id, role: user.role },
    }
  }

  const blockers = await listOwnershipBlockers(userId)
  return {
    canDelete: blockers.length === 0,
    alreadyDeleted: false,
    blockers,
    retention: RETENTION_SUMMARY,
    user: { id: user.id, email: user.email, role: user.role, displayName: user.display_name },
  }
}

async function assertRequesterIsOrgOwner(userId, organizationId, workspaceType) {
  if (workspaceType === 'SUPPLIER') {
    const { rows } = await query(
      `
      SELECT 1
      FROM org_user_roles our
      JOIN org_roles r ON r.id = our.role_id AND r.name = 'Org Owner'
      JOIN supplier_organizations o ON o.id = our.organization_id
      WHERE our.user_id = $1 AND our.organization_id = $2 AND o.closed_at IS NULL
      `,
      [userId, organizationId]
    )
    if (!rows.length) throw new ForbiddenError('Org Owner role required')
    return
  }
  const { rows } = await query(
    `
    SELECT 1
    FROM restaurant_org_user_roles our
    JOIN restaurant_org_roles r ON r.id = our.role_id AND r.name = 'Org Owner'
    JOIN restaurant_organizations o ON o.id = our.organization_id
    WHERE our.user_id = $1 AND our.organization_id = $2 AND o.closed_at IS NULL
    `,
    [userId, organizationId]
  )
  if (!rows.length) throw new ForbiddenError('Org Owner role required')
}

export async function transferOrganizationOwnership({
  requesterId,
  organizationId,
  workspaceType,
  newOwnerUserId,
}) {
  if (!organizationId || !newOwnerUserId) {
    throw new ValidationError('organizationId and newOwnerUserId are required')
  }
  if (requesterId === newOwnerUserId) {
    throw new ValidationError('Choose a different user as the new owner')
  }
  if (workspaceType !== 'SUPPLIER' && workspaceType !== 'RESTAURANT') {
    throw new ValidationError('workspaceType must be SUPPLIER or RESTAURANT')
  }

  await assertRequesterIsOrgOwner(requesterId, organizationId, workspaceType)

  const { rows: targetRows } = await query(
    `SELECT id, is_active, deleted_at, role FROM app_user WHERE id = $1`,
    [newOwnerUserId]
  )
  const target = targetRows[0]
  if (!target || target.is_active === false || target.deleted_at) {
    throw new NotFoundError('New owner user not found or inactive')
  }

  await withTransaction(async (client) => {
    if (workspaceType === 'SUPPLIER') {
      const { rows: branches } = await client.query(
        `SELECT id FROM supplier WHERE organization_id = $1`,
        [organizationId]
      )
      await assignOrgUserRole({
        userId: newOwnerUserId,
        organizationId,
        roleName: 'Org Owner',
        assignedBy: requesterId,
        client,
      })
      for (const branch of branches) {
        await assignOwnerRoleForUser(newOwnerUserId, branch.id, 'SUPPLIER', requesterId, client, {
          rolesAlreadyEnsured: false,
        })
      }
      // Demote previous owner at org layer; leave branch roles as Manager if present
      await assignOrgUserRole({
        userId: requesterId,
        organizationId,
        roleName: 'Org Manager',
        assignedBy: requesterId,
        client,
      })
      for (const branch of branches) {
        const { rows: managerRole } = await client.query(
          `SELECT id FROM tenant_roles
           WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER' AND name = 'Supplier Manager'
           LIMIT 1`,
          [branch.id]
        )
        if (managerRole[0]?.id) {
          await client.query(
            `INSERT INTO tenant_user_roles (user_id, role_id, tenant_type, tenant_id, assigned_by)
             VALUES ($1, $2, 'SUPPLIER', $3, $4)
             ON CONFLICT (user_id, tenant_id, tenant_type)
             DO UPDATE SET role_id = EXCLUDED.role_id, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()`,
            [requesterId, managerRole[0].id, branch.id, requesterId]
          )
        }
      }
    } else {
      const { rows: branches } = await client.query(
        `SELECT id FROM restaurant WHERE organization_id = $1`,
        [organizationId]
      )
      await assignRestaurantOrgUserRole({
        userId: newOwnerUserId,
        organizationId,
        roleName: 'Org Owner',
        assignedBy: requesterId,
        client,
      })
      for (const branch of branches) {
        await assignOwnerRoleForUser(newOwnerUserId, branch.id, 'RESTAURANT', requesterId, client, {
          rolesAlreadyEnsured: false,
        })
      }
      await assignRestaurantOrgUserRole({
        userId: requesterId,
        organizationId,
        roleName: 'Org Manager',
        assignedBy: requesterId,
        client,
      })
      for (const branch of branches) {
        const { rows: managerRole } = await client.query(
          `SELECT id FROM tenant_roles
           WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND name = 'Restaurant Manager'
           LIMIT 1`,
          [branch.id]
        )
        if (managerRole[0]?.id) {
          await client.query(
            `INSERT INTO tenant_user_roles (user_id, role_id, tenant_type, tenant_id, assigned_by)
             VALUES ($1, $2, 'RESTAURANT', $3, $4)
             ON CONFLICT (user_id, tenant_id, tenant_type)
             DO UPDATE SET role_id = EXCLUDED.role_id, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()`,
            [requesterId, managerRole[0].id, branch.id, requesterId]
          )
        }
      }
    }
  })

  return { transferred: true, organizationId, workspaceType, newOwnerUserId }
}

/**
 * Explicit org close. Does NOT delete the caller's personal account.
 * Does NOT cascade into personal account deletion.
 */
export async function closeOrganization({
  requesterId,
  organizationId,
  workspaceType,
  confirmationName,
  reason = null,
}) {
  if (!organizationId) throw new ValidationError('organizationId is required')
  if (workspaceType !== 'SUPPLIER' && workspaceType !== 'RESTAURANT') {
    throw new ValidationError('workspaceType must be SUPPLIER or RESTAURANT')
  }
  await assertRequesterIsOrgOwner(requesterId, organizationId, workspaceType)

  const table = workspaceType === 'SUPPLIER' ? 'supplier_organizations' : 'restaurant_organizations'
  const branchTable = workspaceType === 'SUPPLIER' ? 'supplier' : 'restaurant'

  const { rows: orgRows } = await query(`SELECT id, name, closed_at FROM ${table} WHERE id = $1`, [
    organizationId,
  ])
  const org = orgRows[0]
  if (!org) throw new NotFoundError('Organization not found')
  if (org.closed_at) throw new ConflictError('Organization is already closed')

  const expected = String(org.name || '')
    .trim()
    .toLowerCase()
  const provided = String(confirmationName || '')
    .trim()
    .toLowerCase()
  if (!provided || provided !== expected) {
    throw new ValidationError('confirmationName must match the organization name exactly')
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE ${table}
       SET closed_at = NOW(), closed_by = $2, close_reason = $3, updated_at = NOW()
       WHERE id = $1 AND closed_at IS NULL`,
      [organizationId, requesterId, reason]
    )
    // Org close may deactivate every branch, including main (unlike single-branch deactivate).
    await client.query(
      `UPDATE ${branchTable}
       SET is_branch_active = false,
           deactivated_at = COALESCE(deactivated_at, NOW()),
           updated_at = NOW()
       WHERE organization_id = $1 AND COALESCE(is_branch_active, true) = true`,
      [organizationId]
    )
  })

  logger.info('Organization closed via explicit account-deletion flow', {
    organizationId,
    workspaceType,
    requesterId,
  })

  return { closed: true, organizationId, workspaceType }
}

async function anonymizeAndDeactivateUser(userId, reason, client) {
  const tombstoneEmail = `deleted+${userId.replace(/-/g, '')}@deleted.local`
  await client.query(
    `
    UPDATE app_user
    SET email = $2,
        display_name = 'Deleted User',
        is_active = false,
        deleted_at = NOW(),
        deletion_reason = $3,
        updated_at = NOW()
    WHERE id = $1
    `,
    [userId, tombstoneEmail, reason || 'user_requested']
  )

  await client
    .query(`DELETE FROM consumer_address WHERE app_user_id = $1`, [userId])
    .catch(() => {})
  await client
    .query(
      `UPDATE consumer_profile
     SET phone = NULL, notification_preferences = '{}'::jsonb, updated_at = NOW()
     WHERE app_user_id = $1`,
      [userId]
    )
    .catch(() => {})

  await client.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [userId]).catch(() => {})

  // Unlink driver login; keep driver ops row for supplier history
  await client
    .query(`UPDATE drivers SET user_id = NULL, updated_at = NOW() WHERE user_id = $1`, [userId])
    .catch(() => {})

  // Remove role memberships so deleted user cannot retain access if reactivated incorrectly
  await client.query(`DELETE FROM tenant_user_roles WHERE user_id = $1`, [userId])
  await client.query(`DELETE FROM org_user_roles WHERE user_id = $1`, [userId]).catch(() => {})
  await client
    .query(`DELETE FROM restaurant_org_user_roles WHERE user_id = $1`, [userId])
    .catch(() => {})
  await client
    .query(`DELETE FROM org_user_branch_access WHERE user_id = $1`, [userId])
    .catch(() => {})
  await client
    .query(`DELETE FROM restaurant_org_user_branch_access WHERE user_id = $1`, [userId])
    .catch(() => {})
  await client
    .query(`DELETE FROM user_workspace_membership WHERE user_id = $1`, [userId])
    .catch(() => {})
  await client.query(`DELETE FROM user_role WHERE user_id = $1`, [userId]).catch(() => {})

  // Drop express sessions if stored in DB (connect-pg-simple)
  await client
    .query(`DELETE FROM session WHERE sess::text ILIKE $1`, [`%${userId}%`])
    .catch(() => {})
}

export async function deletePersonalAccount(userId, { reason = 'user_requested' } = {}) {
  const status = await getDeletionStatus(userId)
  if (status.alreadyDeleted) {
    return { deleted: true, alreadyDeleted: true, retention: RETENTION_SUMMARY }
  }
  if (!status.canDelete) {
    const err = new ConflictError(
      'Transfer organization ownership or close the organization before deleting your personal account.'
    )
    err.code = OWNER_BLOCKER_CODE
    err.details = { blockers: status.blockers, retention: RETENTION_SUMMARY }
    throw err
  }

  const { rows } = await query(`SELECT id, keycloak_sub, email FROM app_user WHERE id = $1`, [
    userId,
  ])
  const user = rows[0]
  if (!user) throw new NotFoundError('User not found')

  await withTransaction(async (client) => {
    await anonymizeAndDeactivateUser(userId, reason, client)
  })

  // Disable Keycloak user outside the DB transaction
  try {
    if (user.keycloak_sub && !String(user.keycloak_sub).startsWith('admin-')) {
      const token = await getKeycloakAdminToken()
      // keycloak_sub may be the Keycloak user id
      await setKeycloakUserEnabled(token, user.keycloak_sub, false)
    }
  } catch (error) {
    logger.warn('Keycloak disable after account deletion failed', {
      userId,
      error: error.message,
    })
  }

  logger.info('Personal account deleted', { userId })
  return { deleted: true, alreadyDeleted: false, retention: RETENTION_SUMMARY }
}
