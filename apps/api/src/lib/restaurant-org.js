/**
 * Restaurant organization layer: org roles, branch access, and branch lifecycle.
 */
import { query, withTransaction } from './db.js'
import { PERMISSION_KEYS } from './permission-keys.js'
import { orgRolePermissionsUnchanged, replaceOrgRolePermissions } from './org-role-permissions.js'
import { logger } from './logger.js'
import { ensureTenantSystemRoles, assignOwnerRoleForUser, getOwnerRoleId } from './tenant-roles.js'
import { slugifyName } from './register-account.js'
import { createPendingActivationSubscription } from './billing/subscription-activation.js'
import { RESTAURANT_VIEWER } from './role-matrix.js'

export const RESTAURANT_ORG_SYSTEM_ROLES = [
  {
    name: 'Org Owner',
    description: 'Full access to all branches; can create and deactivate branches',
    branchScope: 'all',
    permissions: 'ALL',
  },
  {
    name: 'Org Manager',
    description: 'Manage all branches; cannot delete branches or change billing',
    branchScope: 'all',
    permissions: [
      'ORDERS_VIEW',
      'ORDERS_CREATE',
      'ORDERS_EDIT',
      'ORDERS_MANAGE',
      'INVOICES_VIEW',
      'INVOICES_MANAGE',
      'INVENTORY_VIEW',
      'INVENTORY_EDIT',
      'INVENTORY_MANAGE',
      'RESERVATIONS_VIEW',
      'RESERVATIONS_CREATE',
      'RESERVATIONS_EDIT',
      'RESERVATIONS_MANAGE',
      'STAFF_VIEW',
      'STAFF_MANAGE',
      'RECEIVING_VIEW',
      'RECEIVING_MANAGE',
      'SETTINGS_VIEW',
      'CHAT_VIEW',
      'CHAT_SEND',
      'PAYMENTS_VIEW',
      'SUBSCRIPTIONS_VIEW',
    ],
  },
  {
    name: 'Org Viewer',
    description: 'Read-only across all branches — workspace data visible, no mutations',
    branchScope: 'all',
    permissions: [...RESTAURANT_VIEWER],
  },
  {
    name: 'Regional Manager',
    description: 'Full access to assigned branches only',
    branchScope: 'assigned',
    permissions: [
      'ORDERS_VIEW',
      'ORDERS_CREATE',
      'ORDERS_EDIT',
      'ORDERS_MANAGE',
      'INVOICES_VIEW',
      'INVOICES_MANAGE',
      'INVENTORY_VIEW',
      'INVENTORY_EDIT',
      'INVENTORY_MANAGE',
      'RESERVATIONS_VIEW',
      'RESERVATIONS_CREATE',
      'RESERVATIONS_EDIT',
      'RESERVATIONS_MANAGE',
      'STAFF_VIEW',
      'STAFF_MANAGE',
      'RECEIVING_VIEW',
      'RECEIVING_MANAGE',
      'SETTINGS_VIEW',
      'CHAT_VIEW',
      'CHAT_SEND',
      'PAYMENTS_VIEW',
    ],
  },
]

const BRANCH_ORDER_STATS_SELECT = `
  (SELECT COUNT(*)::int
   FROM customer_order co
   WHERE co.restaurant_id = r.id
     AND co.placed_at >= date_trunc('month', NOW())) AS orders_this_month,
  (SELECT COUNT(DISTINCT tur.user_id)::int
   FROM tenant_user_roles tur
   WHERE tur.tenant_id = r.id AND tur.tenant_type = 'RESTAURANT') AS staff_count`

const ALL_RESTAURANT_PERMISSIONS = Object.values(PERMISSION_KEYS).filter(
  (k) =>
    !k.startsWith('ADMIN_') &&
    !k.startsWith('CATALOG_') &&
    !k.startsWith('WAREHOUSES_') &&
    !k.startsWith('FULFILLMENT_') &&
    !k.startsWith('PROMOTIONS_')
)

function resolveOrgRolePermissions(roleDef) {
  if (roleDef.permissions === 'ALL') return [...ALL_RESTAURANT_PERMISSIONS]
  return roleDef.permissions
}

export async function ensureRestaurantOrgSystemRoles(organizationId, client = null) {
  if (!organizationId) return
  const db = client ? (sql, params) => client.query(sql, params) : query

  for (const def of RESTAURANT_ORG_SYSTEM_ROLES) {
    const { rows: existing } = await db(
      `SELECT id FROM restaurant_org_roles
       WHERE organization_id = $1 AND name = $2 AND is_system = true`,
      [organizationId, def.name]
    )
    let roleId = existing[0]?.id
    if (!roleId) {
      const { rows: inserted } = await db(
        `INSERT INTO restaurant_org_roles (organization_id, name, description, is_system)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [organizationId, def.name, def.description]
      )
      roleId = inserted[0].id
    }
    const perms = resolveOrgRolePermissions(def)
    const permArgs = {
      permissionsTable: 'restaurant_org_role_permissions',
      roleId,
      permissions: perms,
      branchScope: def.branchScope,
    }
    if (!(await orgRolePermissionsUnchanged(db, permArgs))) {
      await replaceOrgRolePermissions(db, permArgs)
    }
  }
}

export async function getRestaurantOrgRolePermissions(userId, organizationId, restaurantId) {
  const { rows } = await query(
    `
    SELECT rorp.permission, rorp.branch_scope, ror.name AS role_name
    FROM restaurant_org_user_roles rour
    JOIN restaurant_org_roles ror ON ror.id = rour.role_id
    JOIN restaurant_org_role_permissions rorp ON rorp.role_id = ror.id
    WHERE rour.user_id = $1 AND rour.organization_id = $2
  `,
    [userId, organizationId]
  )
  if (!rows.length) return []

  const roleName = rows[0].role_name
  const branchScope = rows[0].branch_scope
  const permissions = [...new Set(rows.map((r) => r.permission))]

  if (branchScope === 'assigned' && restaurantId) {
    const { rows: access } = await query(
      `SELECT 1 FROM restaurant_org_user_branch_access
       WHERE user_id = $1 AND restaurant_id = $2 AND organization_id = $3`,
      [userId, restaurantId, organizationId]
    )
    if (!access.length && roleName === 'Regional Manager') {
      return []
    }
  }

  return permissions
}

export async function getRestaurantOrgRoleIdByName(organizationId, roleName, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rows } = await db(
    `SELECT id FROM restaurant_org_roles WHERE organization_id = $1 AND name = $2 LIMIT 1`,
    [organizationId, roleName]
  )
  return rows[0]?.id || null
}

export async function createRestaurantOrganization({ name, slug = null }) {
  const orgSlug =
    slug ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 200)
  const { rows } = await query(
    `INSERT INTO restaurant_organizations (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO NOTHING
     RETURNING *`,
    [name, orgSlug]
  )
  if (rows.length) {
    await ensureRestaurantOrgSystemRoles(rows[0].id)
    return rows[0]
  }
  const { rows: existing } = await query(`SELECT * FROM restaurant_organizations WHERE slug = $1`, [
    orgSlug,
  ])
  if (existing.length) {
    await ensureRestaurantOrgSystemRoles(existing[0].id)
    return existing[0]
  }
  throw new Error('Could not create restaurant organization')
}

export async function getUserRestaurantOrgMembership(userId) {
  const { rows } = await query(
    `
    SELECT rour.*, ror.name AS role_name, ror.is_system,
           ro.id AS organization_id, ro.name AS organization_name, ro.slug AS organization_slug
    FROM restaurant_org_user_roles rour
    JOIN restaurant_org_roles ror ON ror.id = rour.role_id
    JOIN restaurant_organizations ro ON ro.id = rour.organization_id
    WHERE rour.user_id = $1
    LIMIT 1
  `,
    [userId]
  )
  return rows[0] || null
}

export async function userHasRestaurantOrgBranchAccess(userId, restaurantId, organizationId) {
  const membership = await getUserRestaurantOrgMembership(userId)
  if (!membership || membership.organization_id !== organizationId) return false

  const { rows: roleRows } = await query(
    `
    SELECT rorp.branch_scope, ror.name
    FROM restaurant_org_user_roles rour
    JOIN restaurant_org_roles ror ON ror.id = rour.role_id
    JOIN restaurant_org_role_permissions rorp ON rorp.role_id = ror.id
    WHERE rour.user_id = $1 AND rour.organization_id = $2
    LIMIT 1
  `,
    [userId, organizationId]
  )
  if (!roleRows.length) return false

  if (
    roleRows[0].branch_scope === 'all' ||
    roleRows[0].name === 'Org Owner' ||
    roleRows[0].name === 'Org Manager' ||
    roleRows[0].name === 'Org Viewer'
  ) {
    return true
  }

  const { rows: assigned } = await query(
    `SELECT 1 FROM restaurant_org_user_branch_access
     WHERE user_id = $1 AND restaurant_id = $2 AND organization_id = $3`,
    [userId, restaurantId, organizationId]
  )
  return assigned.length > 0
}

export async function listRestaurantOrgBranches(organizationId) {
  const { rows } = await query(
    `
    SELECT r.id, r.name, r.slug, r.branch_code, r.is_main_branch, r.is_branch_active,
           r.phone, r.address_json, r.contact_email,
           ${BRANCH_ORDER_STATS_SELECT}
    FROM restaurant r
    WHERE r.organization_id = $1
    ORDER BY r.is_main_branch DESC, r.name ASC
  `,
    [organizationId]
  )
  return rows
}

export async function listRestaurantOrgBranchesForUser(userId, organizationId) {
  const membership = await getUserRestaurantOrgMembership(userId)
  if (!membership || membership.organization_id !== organizationId) return []

  const roleName = membership.role_name
  const isAllScope =
    roleName === 'Org Owner' || roleName === 'Org Manager' || roleName === 'Org Viewer'

  if (isAllScope) {
    const { rows } = await query(
      `
      SELECT r.id, r.name, r.slug, r.branch_code, r.is_main_branch, r.is_branch_active,
             r.phone, r.address_json, r.contact_email,
             ${BRANCH_ORDER_STATS_SELECT}
      FROM restaurant r
      WHERE r.organization_id = $1
      ORDER BY r.is_main_branch DESC, r.name ASC
    `,
      [organizationId]
    )
    return rows
  }

  const { rows } = await query(
    `
    SELECT r.id, r.name, r.slug, r.branch_code, r.is_main_branch, r.is_branch_active,
           r.phone, r.address_json, r.contact_email,
           ${BRANCH_ORDER_STATS_SELECT}
    FROM restaurant r
    JOIN restaurant_org_user_branch_access rouba ON rouba.restaurant_id = r.id AND rouba.user_id = $1
    WHERE r.organization_id = $2 AND r.is_branch_active = true
    ORDER BY r.name ASC
  `,
    [userId, organizationId]
  )
  return rows
}

export async function assignRestaurantOrgUserRole({
  userId,
  organizationId,
  roleName,
  assignedBy = null,
  client = null,
}) {
  await ensureRestaurantOrgSystemRoles(organizationId, client)
  const roleId = await getRestaurantOrgRoleIdByName(organizationId, roleName, client)
  if (!roleId) throw new Error(`Org role not found: ${roleName}`)

  const db = client ? (sql, params) => client.query(sql, params) : query
  await db(
    `
    INSERT INTO restaurant_org_user_roles (user_id, organization_id, role_id, assigned_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, organization_id)
    DO UPDATE SET role_id = EXCLUDED.role_id, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
  `,
    [userId, organizationId, roleId, assignedBy]
  )

  if (!client) {
    await invalidateRestaurantOrgPermissionCaches(userId, organizationId)
  }
}

export async function grantRestaurantOrgBranchAccess({
  userId,
  restaurantId,
  organizationId,
  grantedBy = null,
}) {
  await query(
    `
    INSERT INTO restaurant_org_user_branch_access (user_id, restaurant_id, organization_id, granted_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, restaurant_id) DO NOTHING
  `,
    [userId, restaurantId, organizationId, grantedBy]
  )
  await invalidateRestaurantOrgPermissionCaches(userId, organizationId)
}

export async function revokeRestaurantOrgBranchAccess(userId, restaurantId) {
  const { rows } = await query(`SELECT organization_id FROM restaurant WHERE id = $1`, [
    restaurantId,
  ])
  await query(
    `DELETE FROM restaurant_org_user_branch_access WHERE user_id = $1 AND restaurant_id = $2`,
    [userId, restaurantId]
  )
  if (rows[0]?.organization_id) {
    await invalidateRestaurantOrgPermissionCaches(userId, rows[0].organization_id)
  }
}

export async function invalidateRestaurantOrgPermissionCaches(userId, organizationId) {
  const { invalidateUserPermissionCache } = await import('./permissions.js')
  const { rows } = await query(`SELECT id FROM restaurant WHERE organization_id = $1`, [
    organizationId,
  ])
  await Promise.all(
    rows.map((branch) => invalidateUserPermissionCache(userId, branch.id, 'RESTAURANT'))
  )
}

async function uniqueRestaurantSlug(client, baseSlug) {
  let slug = baseSlug
  let n = 0
  while (n < 100) {
    const candidate = n === 0 ? slug : `${slug}-${n}`
    const { rows } = await client.query(`SELECT 1 FROM restaurant WHERE slug = $1`, [candidate])
    if (!rows.length) return candidate
    n += 1
  }
  throw new Error('Could not generate unique restaurant slug')
}

export async function createRestaurantOrgBranch({
  organizationId,
  branchName,
  branchCode = null,
  phone = null,
  address = null,
  ownerUserId,
  ownerEmail = null,
}) {
  const name = branchName.trim()
  const normalizedEmail = (ownerEmail || '').trim().toLowerCase()

  return withTransaction(async (client) => {
    // Serialize Branch Account creates for this org (limit race guard)
    await client.query(
      `SELECT id FROM restaurant
       WHERE organization_id = $1 AND is_main_branch = true
       FOR UPDATE`,
      [organizationId]
    )

    const slug = await uniqueRestaurantSlug(client, slugifyName(name))
    const addressJson = address ? JSON.stringify(address) : '{}'

    const { rows: branchRows } = await client.query(
      `
      INSERT INTO restaurant (name, slug, contact_email, phone, address_json, organization_id, is_main_branch, branch_code)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, false, $7)
      RETURNING *
    `,
      [name, slug, normalizedEmail, phone, addressJson, organizationId, branchCode]
    )
    const branch = branchRows[0]

    await createPendingActivationSubscription(client, branch.id, 'RESTAURANT', 'free')

    // Role seeding inside the same transaction so failed post-steps cannot leave orphan tenants
    await ensureTenantSystemRoles(branch.id, 'RESTAURANT', client)
    if (ownerUserId) {
      await assignOwnerRoleForUser(ownerUserId, branch.id, 'RESTAURANT', null, client, {
        rolesAlreadyEnsured: true,
      })
    }

    return branch
  })
}

export async function restaurantBranchHasPendingOrders(restaurantId) {
  const { rows } = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM customer_order co
    WHERE co.restaurant_id = $1
      AND co.status NOT IN ('DELIVERED', 'CANCELLED', 'REJECTED', 'COMPLETED')
  `,
    [restaurantId]
  )
  return Number(rows[0]?.count || 0) > 0
}

export async function deactivateRestaurantOrgBranch(restaurantId) {
  const { rows } = await query(
    `SELECT is_main_branch, organization_id FROM restaurant WHERE id = $1`,
    [restaurantId]
  )
  if (!rows.length) return { ok: false, reason: 'NOT_FOUND' }
  if (rows[0].is_main_branch) return { ok: false, reason: 'MAIN_BRANCH' }
  if (await restaurantBranchHasPendingOrders(restaurantId)) {
    return { ok: false, reason: 'PENDING_ORDERS' }
  }
  await query(
    `UPDATE restaurant
     SET is_branch_active = false, deactivated_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [restaurantId]
  )
  return { ok: true }
}

export async function reactivateRestaurantOrgBranch(restaurantId) {
  const { rows } = await query(
    `SELECT is_main_branch, organization_id, is_branch_active FROM restaurant WHERE id = $1`,
    [restaurantId]
  )
  if (!rows.length) return { ok: false, reason: 'NOT_FOUND' }
  if (!rows[0].organization_id) return { ok: false, reason: 'DETACHED' }
  if (rows[0].is_branch_active !== false) return { ok: false, reason: 'ALREADY_ACTIVE' }
  await query(
    `UPDATE restaurant
     SET is_branch_active = true, deactivated_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [restaurantId]
  )
  return { ok: true, organizationId: rows[0].organization_id }
}

/**
 * Unlink a Branch Account from its organization. Retains the tenant and history.
 * Clears org branch access rows for this restaurant.
 */
export async function unlinkRestaurantFromOrganization(restaurantId, { client = null } = {}) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rows } = await db(
    `SELECT is_main_branch, organization_id FROM restaurant WHERE id = $1`,
    [restaurantId]
  )
  if (!rows.length) return { ok: false, reason: 'NOT_FOUND' }
  if (rows[0].is_main_branch) return { ok: false, reason: 'MAIN_BRANCH' }
  if (!rows[0].organization_id) return { ok: false, reason: 'DETACHED' }

  const organizationId = rows[0].organization_id
  await db(`DELETE FROM restaurant_org_user_branch_access WHERE restaurant_id = $1`, [restaurantId])
  await db(
    `UPDATE restaurant
     SET organization_id = NULL, is_main_branch = false, is_branch_active = true,
         deactivated_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [restaurantId]
  )
  return { ok: true, organizationId }
}

export async function linkRestaurantToOrganization(
  restaurantId,
  organizationId,
  { isMain = false, client = null } = {}
) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rowCount } = await db(
    `
    UPDATE restaurant
    SET organization_id = $2, is_main_branch = $3, is_branch_active = true,
        deactivated_at = NULL, updated_at = NOW()
    WHERE id = $1 AND organization_id IS NULL
  `,
    [restaurantId, organizationId, isMain]
  )
  return { ok: (rowCount ?? 0) > 0 }
}

export async function isRestaurantOrgMigrationComplete() {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM restaurant WHERE organization_id IS NULL) AS restaurants_without_org,
      (SELECT COUNT(*)::int FROM restaurant r
       WHERE r.organization_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM restaurant_org_roles ro
           WHERE ro.organization_id = r.organization_id AND ro.is_system = true AND ro.name = 'Org Owner'
         )) AS orgs_missing_roles
  `)
  const r = rows[0] || {}
  return Number(r.restaurants_without_org) === 0 && Number(r.orgs_missing_roles) === 0
}

export { logger }
