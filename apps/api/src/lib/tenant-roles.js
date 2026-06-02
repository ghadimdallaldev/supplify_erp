/**
 * Per-tenant named roles: system role definitions, seeding, and helpers.
 */
import { query, withTransaction } from './db.js'
import { PERMISSION_KEYS } from './permission-keys.js'
import { logger } from './logger.js'
import {
  RESTAURANT_SYSTEM_ROLES,
  SUPPLIER_SYSTEM_ROLES,
  allNamesForRoleDef,
} from './role-matrix.js'

export { RESTAURANT_SYSTEM_ROLES, SUPPLIER_SYSTEM_ROLES }

export const RESERVED_SYSTEM_ROLE_NAMES = Object.freeze([
  'Owner',
  'Restaurant Manager',
  'Supplier Manager',
  'Purchaser',
  'Restaurant Buyer',
  'Receiving Staff',
  'Accountant',
  'FOH Staff',
  'Viewer',
  'Order Fulfillment Staff',
  'Catalog Manager',
  'Promotions Manager',
  // Legacy names (still protected if present in DB)
  'Manager',
  'Inventory Clerk',
  'Sales Rep',
  'Warehouse Staff',
  'Driver',
  'Warehouse Manager',
  'Finance Staff',
  'Sales/Deals Manager',
  'Read-only Staff',
  'Reservations/Host Staff',
  'Admin/Manager',
  'Catalog/Product Manager',
  'Fulfillment Staff',
])

const RESTAURANT_PERMISSIONS = [
  PERMISSION_KEYS.ORDERS_VIEW,
  PERMISSION_KEYS.ORDERS_CREATE,
  PERMISSION_KEYS.ORDERS_EDIT,
  PERMISSION_KEYS.ORDERS_MANAGE,
  PERMISSION_KEYS.INVOICES_VIEW,
  PERMISSION_KEYS.INVOICES_CREATE,
  PERMISSION_KEYS.INVOICES_EDIT,
  PERMISSION_KEYS.INVOICES_MANAGE,
  PERMISSION_KEYS.INVENTORY_VIEW,
  PERMISSION_KEYS.INVENTORY_EDIT,
  PERMISSION_KEYS.INVENTORY_MANAGE,
  PERMISSION_KEYS.RESERVATIONS_VIEW,
  PERMISSION_KEYS.RESERVATIONS_CREATE,
  PERMISSION_KEYS.RESERVATIONS_EDIT,
  PERMISSION_KEYS.RESERVATIONS_MANAGE,
  PERMISSION_KEYS.STAFF_VIEW,
  PERMISSION_KEYS.STAFF_INVITE,
  PERMISSION_KEYS.STAFF_EDIT,
  PERMISSION_KEYS.STAFF_MANAGE,
  PERMISSION_KEYS.SETTINGS_VIEW,
  PERMISSION_KEYS.SETTINGS_EDIT,
  PERMISSION_KEYS.SETTINGS_MANAGE,
  PERMISSION_KEYS.CHAT_VIEW,
  PERMISSION_KEYS.CHAT_SEND,
  PERMISSION_KEYS.CHAT_MANAGE,
  PERMISSION_KEYS.SUBSCRIPTIONS_VIEW,
  PERMISSION_KEYS.SUBSCRIPTIONS_MANAGE,
  PERMISSION_KEYS.RECEIVING_VIEW,
  PERMISSION_KEYS.RECEIVING_MANAGE,
  PERMISSION_KEYS.PAYMENTS_VIEW,
  PERMISSION_KEYS.PAYMENTS_MANAGE,
  PERMISSION_KEYS.CATALOG_VIEW,
  PERMISSION_KEYS.PROMOTIONS_VIEW,
  PERMISSION_KEYS.PROMOTIONS_MANAGE,
]

const SUPPLIER_PERMISSIONS = [
  PERMISSION_KEYS.ORDERS_VIEW,
  PERMISSION_KEYS.ORDERS_CREATE,
  PERMISSION_KEYS.ORDERS_EDIT,
  PERMISSION_KEYS.ORDERS_MANAGE,
  PERMISSION_KEYS.INVOICES_VIEW,
  PERMISSION_KEYS.INVOICES_CREATE,
  PERMISSION_KEYS.INVOICES_EDIT,
  PERMISSION_KEYS.INVOICES_MANAGE,
  PERMISSION_KEYS.INVENTORY_VIEW,
  PERMISSION_KEYS.INVENTORY_EDIT,
  PERMISSION_KEYS.INVENTORY_MANAGE,
  PERMISSION_KEYS.CATALOG_VIEW,
  PERMISSION_KEYS.CATALOG_EDIT,
  PERMISSION_KEYS.CATALOG_MANAGE,
  PERMISSION_KEYS.WAREHOUSES_VIEW,
  PERMISSION_KEYS.WAREHOUSES_EDIT,
  PERMISSION_KEYS.WAREHOUSES_MANAGE,
  PERMISSION_KEYS.STAFF_VIEW,
  PERMISSION_KEYS.STAFF_INVITE,
  PERMISSION_KEYS.STAFF_EDIT,
  PERMISSION_KEYS.STAFF_MANAGE,
  PERMISSION_KEYS.SETTINGS_VIEW,
  PERMISSION_KEYS.SETTINGS_EDIT,
  PERMISSION_KEYS.SETTINGS_MANAGE,
  PERMISSION_KEYS.CHAT_VIEW,
  PERMISSION_KEYS.CHAT_SEND,
  PERMISSION_KEYS.CHAT_MANAGE,
  PERMISSION_KEYS.SUBSCRIPTIONS_VIEW,
  PERMISSION_KEYS.SUBSCRIPTIONS_MANAGE,
  PERMISSION_KEYS.RECEIVING_VIEW,
  PERMISSION_KEYS.RECEIVING_MANAGE,
  PERMISSION_KEYS.PAYMENTS_VIEW,
  PERMISSION_KEYS.PAYMENTS_MANAGE,
  PERMISSION_KEYS.FULFILLMENT_VIEW,
  PERMISSION_KEYS.FULFILLMENT_MANAGE,
  PERMISSION_KEYS.PROMOTIONS_VIEW,
  PERMISSION_KEYS.PROMOTIONS_MANAGE,
  PERMISSION_KEYS.DRIVER_DELIVERIES_VIEW,
  PERMISSION_KEYS.DRIVER_DELIVERIES_MANAGE,
]

export function getAllPermissionsForTenantType(tenantType) {
  return tenantType === 'SUPPLIER' ? [...SUPPLIER_PERMISSIONS] : [...RESTAURANT_PERMISSIONS]
}

export function resolveRolePermissionList(roleDef, tenantType) {
  if (roleDef.permissions === 'ALL') {
    return getAllPermissionsForTenantType(tenantType)
  }
  return roleDef.permissions
}

export function getSystemRoleDefinitions(tenantType) {
  return tenantType === 'SUPPLIER' ? SUPPLIER_SYSTEM_ROLES : RESTAURANT_SYSTEM_ROLES
}

async function insertRolePermissions(roleId, permissions, db = query) {
  if (!permissions?.length) return
  const placeholders = permissions.map((_, i) => `($1, $${i + 2})`).join(', ')
  await db(
    `INSERT INTO tenant_role_permissions (role_id, permission)
     VALUES ${placeholders}
     ON CONFLICT (role_id, permission) DO NOTHING`,
    [roleId, ...permissions]
  )
}

async function replaceRolePermissions(roleId, permissions, db) {
  await db(`DELETE FROM tenant_role_permissions WHERE role_id = $1`, [roleId])
  await insertRolePermissions(roleId, permissions, db)
}

async function findSystemRoleRow(tenantId, tenantType, def, db) {
  const names = allNamesForRoleDef(def)
  const { rows } = await db(
    `SELECT id, name FROM tenant_roles
     WHERE tenant_id = $1 AND tenant_type = $2 AND is_system = true
       AND name = ANY($3::text[])
     ORDER BY CASE name WHEN $4 THEN 0 ELSE 1 END
     LIMIT 1`,
    [tenantId, tenantType, names, def.name]
  )
  return rows[0] || null
}

/**
 * Seed system roles for a tenant if missing. Syncs permissions from role-matrix on every run.
 */
export async function ensureTenantSystemRoles(tenantId, tenantType, client = null) {
  if (!tenantId || !tenantType) return
  if (tenantType !== 'RESTAURANT' && tenantType !== 'SUPPLIER') return

  const db = client ? (sql, params) => client.query(sql, params) : query

  try {
    const definitions = getSystemRoleDefinitions(tenantType)
    for (const def of definitions) {
      let roleRow = await findSystemRoleRow(tenantId, tenantType, def, db)
      let roleId

      if (roleRow) {
        roleId = roleRow.id
        if (roleRow.name !== def.name) {
          await db(`UPDATE tenant_roles SET name = $1, description = $2 WHERE id = $3`, [
            def.name,
            def.description,
            roleId,
          ])
        }
      } else {
        const { rows: inserted } = await db(
          `INSERT INTO tenant_roles (tenant_type, tenant_id, name, description, is_system)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id`,
          [tenantType, tenantId, def.name, def.description]
        )
        roleId = inserted[0].id
      }

      const perms = resolveRolePermissionList(def, tenantType)
      await replaceRolePermissions(roleId, perms, db)
    }
  } catch (err) {
    if (err.code === '42P01') return
    logger.error('ensureTenantSystemRoles error', { error: err.message, tenantId, tenantType })
    throw err
  }
}

export async function getOwnerRoleId(tenantId, tenantType, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rows } = await db(
    `SELECT id FROM tenant_roles
     WHERE tenant_id = $1 AND tenant_type = $2 AND name = 'Owner' AND is_system = true
     LIMIT 1`,
    [tenantId, tenantType]
  )
  return rows[0]?.id || null
}

export async function assignTenantUserRole({
  userId,
  roleId,
  tenantId,
  tenantType,
  assignedBy = null,
}) {
  await withTransaction(async (client) => {
    const { rows: roleRows } = await client.query(
      `SELECT id, tenant_id, tenant_type, name FROM tenant_roles WHERE id = $1`,
      [roleId]
    )
    if (roleRows.length === 0) {
      throw new Error('Role not found')
    }
    const role = roleRows[0]
    if (role.tenant_id !== tenantId || role.tenant_type !== tenantType) {
      throw new Error('Role does not belong to this tenant')
    }
    await client.query(
      `INSERT INTO tenant_user_roles (user_id, role_id, tenant_type, tenant_id, assigned_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, tenant_id, tenant_type)
       DO UPDATE SET role_id = EXCLUDED.role_id, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()`,
      [userId, roleId, tenantType, tenantId, assignedBy]
    )
  })
}

export async function userHasOwnerRole(userId, tenantId, tenantType) {
  const { rows } = await query(
    `SELECT 1
     FROM tenant_user_roles tur
     JOIN tenant_roles tr ON tr.id = tur.role_id
     WHERE tur.user_id = $1 AND tur.tenant_id = $2 AND tur.tenant_type = $3
       AND tr.name = 'Owner'`,
    [userId, tenantId, tenantType]
  )
  return rows.length > 0
}

export async function assignOwnerRoleForUser(
  userId,
  tenantId,
  tenantType,
  assignedBy = null,
  client = null
) {
  await ensureTenantSystemRoles(tenantId, tenantType, client)
  const ownerRoleId = await getOwnerRoleId(tenantId, tenantType, client)
  if (!ownerRoleId) return false

  if (client) {
    await client.query(
      `INSERT INTO tenant_user_roles (user_id, role_id, tenant_type, tenant_id, assigned_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, tenant_id, tenant_type)
       DO UPDATE SET role_id = EXCLUDED.role_id, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()`,
      [userId, ownerRoleId, tenantType, tenantId, assignedBy]
    )
    return true
  }

  await assignTenantUserRole({
    userId,
    roleId: ownerRoleId,
    tenantId,
    tenantType,
    assignedBy,
  })
  return true
}

export function matchClosestSystemRole(permissionCodes, tenantType) {
  const definitions = getSystemRoleDefinitions(tenantType)
  const userSet = new Set(permissionCodes)
  let best = { name: 'Owner', score: -1 }

  for (const def of definitions) {
    const rolePerms = resolveRolePermissionList(def, tenantType)
    const roleSet = new Set(rolePerms)
    let intersection = 0
    for (const p of userSet) {
      if (roleSet.has(p)) intersection += 1
    }
    const score =
      rolePerms.length > 0
        ? intersection / rolePerms.length + (intersection / Math.max(userSet.size, 1)) * 0.25
        : 0
    if (score > best.score) {
      best = { name: def.name, score }
    }
  }
  if (userSet.size >= getAllPermissionsForTenantType(tenantType).length * 0.9) {
    return 'Owner'
  }
  return best.name
}

export async function getRoleIdByName(tenantId, tenantType, roleName) {
  const { rows } = await query(
    `SELECT id FROM tenant_roles
     WHERE tenant_id = $1 AND tenant_type = $2 AND name = $3`,
    [tenantId, tenantType, roleName]
  )
  return rows[0]?.id || null
}

/**
 * Backfill all tenants' system role permissions from role-matrix (safe to run in deploy).
 */
export async function syncAllTenantsSystemRoles() {
  const { rows: restaurants } = await query(`SELECT id FROM restaurant`)
  for (const r of restaurants) {
    await ensureTenantSystemRoles(r.id, 'RESTAURANT')
  }
  const { rows: suppliers } = await query(`SELECT id FROM supplier`)
  for (const s of suppliers) {
    await ensureTenantSystemRoles(s.id, 'SUPPLIER')
  }
}
