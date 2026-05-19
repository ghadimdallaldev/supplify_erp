/**
 * Supplier organization layer: org roles, branch access, and branch lifecycle.
 */
import { query, withTransaction } from './db.js'
import { PERMISSION_KEYS } from './permission-keys.js'
import { logger } from './logger.js'
import { ensureTenantSystemRoles, assignOwnerRoleForUser, getOwnerRoleId } from './tenant-roles.js'
import { slugifyName } from './register-account.js'
import { createPendingActivationSubscription } from './billing/subscription-activation.js'

export const ORG_SYSTEM_ROLES = [
  {
    name: 'Org Owner',
    description: 'Full access to all branches; can create and deactivate branches',
    branchScope: 'all',
    permissions: 'ALL',
  },
  {
    name: 'Org Manager',
    description: 'View and manage all branches; cannot create branches or change billing',
    branchScope: 'all',
    permissions: [
      'ORDERS_VIEW',
      'ORDERS_EDIT',
      'ORDERS_MANAGE',
      'CATALOG_VIEW',
      'CATALOG_EDIT',
      'INVOICES_VIEW',
      'INVENTORY_VIEW',
      'INVENTORY_MANAGE',
      'WAREHOUSES_VIEW',
      'STAFF_VIEW',
      'STAFF_MANAGE',
      'SETTINGS_VIEW',
      'CHAT_VIEW',
      'CHAT_SEND',
      'FULFILLMENT_VIEW',
      'FULFILLMENT_MANAGE',
    ],
  },
  {
    name: 'Org Viewer',
    description: 'Read-only across all branches',
    branchScope: 'all',
    permissions: [
      'ORDERS_VIEW',
      'CATALOG_VIEW',
      'INVOICES_VIEW',
      'INVENTORY_VIEW',
      'SETTINGS_VIEW',
      'FULFILLMENT_VIEW',
    ],
  },
  {
    name: 'Regional Manager',
    description: 'Full access to assigned branches only',
    branchScope: 'assigned',
    permissions: [
      'ORDERS_VIEW',
      'ORDERS_EDIT',
      'ORDERS_MANAGE',
      'CATALOG_VIEW',
      'CATALOG_EDIT',
      'CATALOG_MANAGE',
      'INVOICES_VIEW',
      'INVENTORY_VIEW',
      'INVENTORY_MANAGE',
      'WAREHOUSES_VIEW',
      'WAREHOUSES_MANAGE',
      'STAFF_VIEW',
      'STAFF_MANAGE',
      'SETTINGS_VIEW',
      'CHAT_VIEW',
      'CHAT_SEND',
      'FULFILLMENT_VIEW',
      'FULFILLMENT_MANAGE',
    ],
  },
]

/** Per-branch order stats (orders are customer_order + order_item by supplier_id). */
const BRANCH_ORDER_STATS_SELECT = `
  (SELECT COUNT(DISTINCT oi.order_id)::int
   FROM order_item oi
   WHERE oi.supplier_id = s.id) AS order_count,
  (SELECT MAX(co.placed_at)
   FROM order_item oi
   JOIN customer_order co ON co.id = oi.order_id
   WHERE oi.supplier_id = s.id) AS last_order_at`

const ALL_SUPPLIER_PERMISSIONS = Object.values(PERMISSION_KEYS).filter(
  (k) =>
    !k.startsWith('ADMIN_') && !k.startsWith('RESERVATIONS_') && k !== PERMISSION_KEYS.ORDERS_CREATE
)

function resolveOrgRolePermissions(roleDef) {
  if (roleDef.permissions === 'ALL') return [...ALL_SUPPLIER_PERMISSIONS]
  return roleDef.permissions
}

export async function ensureOrgSystemRoles(organizationId, client = null) {
  if (!organizationId) return
  const db = client ? (sql, params) => client.query(sql, params) : query

  for (const def of ORG_SYSTEM_ROLES) {
    const { rows: existing } = await db(
      `SELECT id FROM org_roles
       WHERE organization_id = $1 AND name = $2 AND is_system = true`,
      [organizationId, def.name]
    )
    let roleId = existing[0]?.id
    if (!roleId) {
      const { rows: inserted } = await db(
        `INSERT INTO org_roles (organization_id, name, description, is_system)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [organizationId, def.name, def.description]
      )
      roleId = inserted[0].id
    }
    const perms = resolveOrgRolePermissions(def)
    for (const permission of perms) {
      await db(
        `INSERT INTO org_role_permissions (role_id, permission, branch_scope)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission) DO UPDATE SET branch_scope = EXCLUDED.branch_scope`,
        [roleId, permission, def.branchScope]
      )
    }
  }
}

export async function getOrgRoleIdByName(organizationId, roleName, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rows } = await db(
    `SELECT id FROM org_roles WHERE organization_id = $1 AND name = $2 LIMIT 1`,
    [organizationId, roleName]
  )
  return rows[0]?.id || null
}

export async function createSupplierOrganization({ name, slug = null }) {
  const orgSlug =
    slug ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 200)
  const { rows } = await query(
    `INSERT INTO supplier_organizations (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO NOTHING
     RETURNING *`,
    [name, orgSlug]
  )
  if (rows.length) {
    await ensureOrgSystemRoles(rows[0].id)
    return rows[0]
  }
  const { rows: existing } = await query(`SELECT * FROM supplier_organizations WHERE slug = $1`, [
    orgSlug,
  ])
  if (existing.length) {
    await ensureOrgSystemRoles(existing[0].id)
    return existing[0]
  }
  throw new Error('Could not create supplier organization')
}

export async function getUserOrgMembership(userId) {
  const { rows } = await query(
    `
    SELECT our.*, orgr.name AS role_name, orgr.is_system,
           so.id AS organization_id, so.name AS organization_name, so.slug AS organization_slug
    FROM org_user_roles our
    JOIN org_roles orgr ON orgr.id = our.role_id
    JOIN supplier_organizations so ON so.id = our.organization_id
    WHERE our.user_id = $1
    LIMIT 1
  `,
    [userId]
  )
  return rows[0] || null
}

export async function getOrgRolePermissions(userId, organizationId, supplierId) {
  const { rows } = await query(
    `
    SELECT orp.permission, orp.branch_scope, orgr.name AS role_name
    FROM org_user_roles our
    JOIN org_roles orgr ON orgr.id = our.role_id
    JOIN org_role_permissions orp ON orp.role_id = orgr.id
    WHERE our.user_id = $1 AND our.organization_id = $2
  `,
    [userId, organizationId]
  )
  if (!rows.length) return []

  const roleName = rows[0].role_name
  const branchScope = rows[0].branch_scope
  const permissions = [...new Set(rows.map((r) => r.permission))]

  if (branchScope === 'assigned' && supplierId) {
    const { rows: access } = await query(
      `SELECT 1 FROM org_user_branch_access
       WHERE user_id = $1 AND supplier_id = $2 AND organization_id = $3`,
      [userId, supplierId, organizationId]
    )
    if (!access.length && roleName === 'Regional Manager') {
      return []
    }
  }

  return permissions
}

export async function userHasOrgBranchAccess(userId, supplierId, organizationId) {
  const membership = await getUserOrgMembership(userId)
  if (!membership || membership.organization_id !== organizationId) return false

  const { rows: roleRows } = await query(
    `
    SELECT orp.branch_scope, orgr.name
    FROM org_user_roles our
    JOIN org_roles orgr ON orgr.id = our.role_id
    JOIN org_role_permissions orp ON orp.role_id = orgr.id
    WHERE our.user_id = $1 AND our.organization_id = $2
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
    `SELECT 1 FROM org_user_branch_access
     WHERE user_id = $1 AND supplier_id = $2 AND organization_id = $3`,
    [userId, supplierId, organizationId]
  )
  return assigned.length > 0
}

export async function listOrgBranchesForUser(userId, organizationId) {
  const membership = await getUserOrgMembership(userId)
  if (!membership || membership.organization_id !== organizationId) return []

  const roleName = membership.role_name
  const isAllScope =
    roleName === 'Org Owner' || roleName === 'Org Manager' || roleName === 'Org Viewer'

  if (isAllScope) {
    const { rows } = await query(
      `
      SELECT s.id, s.name, s.slug, s.branch_code, s.is_main_branch, s.is_branch_active,
             s.phone, s.address_json, s.contact_email,
             (SELECT COUNT(*)::int FROM app_user u
              JOIN tenant_user_roles tur ON tur.user_id = u.id AND tur.tenant_id = s.id AND tur.tenant_type = 'SUPPLIER'
             ) AS staff_count,
             ${BRANCH_ORDER_STATS_SELECT}
      FROM supplier s
      WHERE s.organization_id = $1
      ORDER BY s.is_main_branch DESC, s.name ASC
    `,
      [organizationId]
    )
    return rows
  }

  const { rows } = await query(
    `
    SELECT s.id, s.name, s.slug, s.branch_code, s.is_main_branch, s.is_branch_active,
           s.phone, s.address_json, s.contact_email,
           (SELECT COUNT(*)::int FROM tenant_user_roles tur WHERE tur.tenant_id = s.id AND tur.tenant_type = 'SUPPLIER') AS staff_count,
           ${BRANCH_ORDER_STATS_SELECT}
    FROM supplier s
    JOIN org_user_branch_access ouba ON ouba.supplier_id = s.id AND ouba.user_id = $1
    WHERE s.organization_id = $2 AND s.is_branch_active = true
    ORDER BY s.name ASC
  `,
    [userId, organizationId]
  )
  return rows
}

export async function assignOrgUserRole({
  userId,
  organizationId,
  roleName,
  assignedBy = null,
  client = null,
}) {
  await ensureOrgSystemRoles(organizationId, client)
  const roleId = await getOrgRoleIdByName(organizationId, roleName, client)
  if (!roleId) throw new Error(`Org role not found: ${roleName}`)

  const db = client ? (sql, params) => client.query(sql, params) : query
  await db(
    `
    INSERT INTO org_user_roles (user_id, organization_id, role_id, assigned_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, organization_id)
    DO UPDATE SET role_id = EXCLUDED.role_id, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
  `,
    [userId, organizationId, roleId, assignedBy]
  )

  if (!client) {
    await invalidateOrgPermissionCaches(userId, organizationId)
  }
}

export async function grantOrgBranchAccess({
  userId,
  supplierId,
  organizationId,
  grantedBy = null,
}) {
  await query(
    `
    INSERT INTO org_user_branch_access (user_id, supplier_id, organization_id, granted_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, supplier_id) DO NOTHING
  `,
    [userId, supplierId, organizationId, grantedBy]
  )
  await invalidateOrgPermissionCaches(userId, organizationId)
}

export async function revokeOrgBranchAccess(userId, supplierId) {
  const { rows } = await query(`SELECT organization_id FROM supplier WHERE id = $1`, [supplierId])
  await query(`DELETE FROM org_user_branch_access WHERE user_id = $1 AND supplier_id = $2`, [
    userId,
    supplierId,
  ])
  if (rows[0]?.organization_id) {
    await invalidateOrgPermissionCaches(userId, rows[0].organization_id)
  }
}

export async function invalidateOrgPermissionCaches(userId, organizationId) {
  const { invalidateUserPermissionCache } = await import('./permissions.js')
  const { rows } = await query(`SELECT id FROM supplier WHERE organization_id = $1`, [
    organizationId,
  ])
  for (const branch of rows) {
    await invalidateUserPermissionCache(userId, branch.id, 'SUPPLIER')
  }
}

async function uniqueSupplierSlug(client, baseSlug) {
  let slug = baseSlug
  let n = 0
  while (n < 100) {
    const candidate = n === 0 ? slug : `${slug}-${n}`
    const { rows } = await client.query(`SELECT 1 FROM supplier WHERE slug = $1`, [candidate])
    if (!rows.length) return candidate
    n += 1
  }
  throw new Error('Could not generate unique supplier slug')
}

export async function createOrgBranch({
  organizationId,
  branchName,
  branchCode = null,
  phone = null,
  address = null,
  ownerUserId,
  ownerEmail,
}) {
  const normalizedEmail = (ownerEmail || '').trim().toLowerCase()
  const name = branchName.trim()

  return withTransaction(async (client) => {
    const slug = await uniqueSupplierSlug(client, slugifyName(name))
    const addressJson = address ? JSON.stringify(address) : '{}'

    const { rows: branchRows } = await client.query(
      `
      INSERT INTO supplier (name, slug, contact_email, phone, address_json, organization_id, is_main_branch, branch_code)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, false, $7)
      RETURNING *
    `,
      [name, slug, normalizedEmail, phone, addressJson, organizationId, branchCode]
    )
    const branch = branchRows[0]

    await client.query(`INSERT INTO catalog (supplier_id, name, is_active) VALUES ($1, $2, true)`, [
      branch.id,
      `${name} Catalog`,
    ])

    await createPendingActivationSubscription(client, branch.id, 'SUPPLIER', 'free')

    return branch
  }).then(async (branch) => {
    await ensureTenantSystemRoles(branch.id, 'SUPPLIER')
    if (ownerUserId) {
      await assignOwnerRoleForUser(ownerUserId, branch.id, 'SUPPLIER')
    }
    return branch
  })
}

export async function branchHasPendingOrders(supplierId) {
  const { rows } = await query(
    `
    SELECT COUNT(DISTINCT co.id)::int AS count
    FROM customer_order co
    INNER JOIN order_item oi ON oi.order_id = co.id
    WHERE oi.supplier_id = $1
      AND co.status NOT IN ('DELIVERED', 'CANCELLED', 'REJECTED', 'COMPLETED')
  `,
    [supplierId]
  )
  return Number(rows[0]?.count || 0) > 0
}

export async function deactivateOrgBranch(supplierId) {
  const { rows } = await query(
    `SELECT is_main_branch, organization_id FROM supplier WHERE id = $1`,
    [supplierId]
  )
  if (!rows.length) return { ok: false, reason: 'NOT_FOUND' }
  if (rows[0].is_main_branch) return { ok: false, reason: 'MAIN_BRANCH' }
  if (await branchHasPendingOrders(supplierId)) {
    return { ok: false, reason: 'PENDING_ORDERS' }
  }
  await query(`UPDATE supplier SET is_branch_active = false, updated_at = NOW() WHERE id = $1`, [
    supplierId,
  ])
  return { ok: true }
}

export async function linkSupplierToOrganization(
  supplierId,
  organizationId,
  { isMain = false } = {}
) {
  await query(
    `
    UPDATE supplier
    SET organization_id = $2, is_main_branch = $3, updated_at = NOW()
    WHERE id = $1 AND organization_id IS NULL
  `,
    [supplierId, organizationId, isMain]
  )
}

export async function isOrgMigrationComplete() {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM supplier WHERE organization_id IS NULL) AS suppliers_without_org,
      (SELECT COUNT(*)::int FROM supplier s
       WHERE s.organization_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM org_roles r
           WHERE r.organization_id = s.organization_id AND r.is_system = true AND r.name = 'Org Owner'
         )) AS orgs_missing_roles
  `)
  const r = rows[0] || {}
  return Number(r.suppliers_without_org) === 0 && Number(r.orgs_missing_roles) === 0
}
