/**
 * Per-tenant named roles: system role definitions, seeding, and helpers.
 */
import { query, withTransaction } from './db.js'
import { PERMISSION_KEYS } from './permission-keys.js'
import { logger } from './logger.js'

export const RESERVED_SYSTEM_ROLE_NAMES = Object.freeze([
  'Owner',
  'Manager',
  'Purchaser',
  'Accountant',
  'Inventory Clerk',
  'FOH Staff',
  'Viewer',
  'Sales Rep',
  'Catalog Manager',
  'Warehouse Staff',
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
]

export const RESTAURANT_SYSTEM_ROLES = [
  {
    name: 'Owner',
    description: 'Full access to everything',
    permissions: 'ALL',
  },
  {
    name: 'Manager',
    description: 'Operational control, can approve orders',
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
      'STAFF_INVITE',
      'STAFF_EDIT',
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
    name: 'Purchaser',
    description: 'Places and tracks orders only',
    permissions: [
      'ORDERS_VIEW',
      'ORDERS_CREATE',
      'ORDERS_EDIT',
      'INVENTORY_VIEW',
      'RECEIVING_VIEW',
      'CHAT_VIEW',
      'CHAT_SEND',
      'INVOICES_VIEW',
    ],
  },
  {
    name: 'Accountant',
    description: 'Finance and invoices, read-only on operations',
    permissions: [
      'INVOICES_VIEW',
      'INVOICES_CREATE',
      'INVOICES_EDIT',
      'INVOICES_MANAGE',
      'PAYMENTS_VIEW',
      'PAYMENTS_MANAGE',
      'ORDERS_VIEW',
      'SUBSCRIPTIONS_VIEW',
      'SETTINGS_VIEW',
    ],
  },
  {
    name: 'Inventory Clerk',
    description: 'Manages stock and receiving',
    permissions: [
      'INVENTORY_VIEW',
      'INVENTORY_EDIT',
      'INVENTORY_MANAGE',
      'RECEIVING_VIEW',
      'RECEIVING_MANAGE',
      'ORDERS_VIEW',
    ],
  },
  {
    name: 'FOH Staff',
    description: 'Front of house — reservations only',
    permissions: ['RESERVATIONS_VIEW', 'RESERVATIONS_CREATE', 'RESERVATIONS_EDIT'],
  },
  {
    name: 'Viewer',
    description: 'Read-only across the board',
    permissions: [
      'ORDERS_VIEW',
      'INVOICES_VIEW',
      'INVENTORY_VIEW',
      'RESERVATIONS_VIEW',
      'STAFF_VIEW',
      'SETTINGS_VIEW',
      'CHAT_VIEW',
    ],
  },
]

export const SUPPLIER_SYSTEM_ROLES = [
  {
    name: 'Owner',
    description: 'Full access to everything',
    permissions: 'ALL',
  },
  {
    name: 'Manager',
    description: 'Operational control',
    permissions: [
      'ORDERS_VIEW',
      'ORDERS_EDIT',
      'ORDERS_MANAGE',
      'CATALOG_VIEW',
      'CATALOG_EDIT',
      'CATALOG_MANAGE',
      'INVOICES_VIEW',
      'INVOICES_MANAGE',
      'INVENTORY_VIEW',
      'INVENTORY_EDIT',
      'INVENTORY_MANAGE',
      'WAREHOUSES_VIEW',
      'WAREHOUSES_EDIT',
      'WAREHOUSES_MANAGE',
      'PAYMENTS_VIEW',
      'STAFF_VIEW',
      'STAFF_MANAGE',
      'SETTINGS_VIEW',
      'CHAT_VIEW',
      'CHAT_SEND',
      'SUBSCRIPTIONS_VIEW',
    ],
  },
  {
    name: 'Sales Rep',
    description: 'Manages orders and customer relationships',
    permissions: [
      'ORDERS_VIEW',
      'ORDERS_EDIT',
      'ORDERS_MANAGE',
      'CATALOG_VIEW',
      'INVOICES_VIEW',
      'CHAT_VIEW',
      'CHAT_SEND',
      'INVENTORY_VIEW',
    ],
  },
  {
    name: 'Catalog Manager',
    description: 'Manages products and pricing only',
    permissions: [
      'CATALOG_VIEW',
      'CATALOG_EDIT',
      'CATALOG_MANAGE',
      'INVENTORY_VIEW',
      'INVENTORY_EDIT',
    ],
  },
  {
    name: 'Warehouse Staff',
    description: 'Fulfillment and inventory operations',
    permissions: [
      'ORDERS_VIEW',
      'INVENTORY_VIEW',
      'INVENTORY_EDIT',
      'INVENTORY_MANAGE',
      'WAREHOUSES_VIEW',
      'WAREHOUSES_EDIT',
      'RECEIVING_VIEW',
      'RECEIVING_MANAGE',
    ],
  },
  {
    name: 'Accountant',
    description: 'Finance and billing only',
    permissions: [
      'INVOICES_VIEW',
      'INVOICES_CREATE',
      'INVOICES_EDIT',
      'INVOICES_MANAGE',
      'PAYMENTS_VIEW',
      'PAYMENTS_MANAGE',
      'ORDERS_VIEW',
      'SUBSCRIPTIONS_VIEW',
    ],
  },
  {
    name: 'Viewer',
    description: 'Read-only',
    permissions: [
      'ORDERS_VIEW',
      'CATALOG_VIEW',
      'INVOICES_VIEW',
      'INVENTORY_VIEW',
      'SETTINGS_VIEW',
      'CHAT_VIEW',
    ],
  },
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

async function insertRolePermissions(roleId, permissions) {
  if (!permissions?.length) return
  const placeholders = permissions.map((_, i) => `($1, $${i + 2})`).join(', ')
  await query(
    `INSERT INTO tenant_role_permissions (role_id, permission)
     VALUES ${placeholders}
     ON CONFLICT (role_id, permission) DO NOTHING`,
    [roleId, ...permissions]
  )
}

/**
 * Seed system roles for a tenant if missing. Idempotent.
 */
export async function ensureTenantSystemRoles(tenantId, tenantType) {
  if (!tenantId || !tenantType) return
  if (tenantType !== 'RESTAURANT' && tenantType !== 'SUPPLIER') return

  try {
    const definitions = getSystemRoleDefinitions(tenantType)
    for (const def of definitions) {
      const { rows: existing } = await query(
        `SELECT id FROM tenant_roles
         WHERE tenant_id = $1 AND tenant_type = $2 AND name = $3 AND is_system = true`,
        [tenantId, tenantType, def.name]
      )
      let roleId
      if (existing.length > 0) {
        roleId = existing[0].id
      } else {
        const { rows: inserted } = await query(
          `INSERT INTO tenant_roles (tenant_type, tenant_id, name, description, is_system)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id`,
          [tenantType, tenantId, def.name, def.description]
        )
        roleId = inserted[0].id
      }
      const perms = resolveRolePermissionList(def, tenantType)
      await insertRolePermissions(roleId, perms)
    }
  } catch (err) {
    if (err.code === '42P01') return
    logger.error('ensureTenantSystemRoles error', { error: err.message, tenantId, tenantType })
    throw err
  }
}

export async function getOwnerRoleId(tenantId, tenantType) {
  const { rows } = await query(
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

export async function assignOwnerRoleForUser(userId, tenantId, tenantType, assignedBy = null) {
  await ensureTenantSystemRoles(tenantId, tenantType)
  const ownerRoleId = await getOwnerRoleId(tenantId, tenantType)
  if (!ownerRoleId) return false
  await assignTenantUserRole({
    userId,
    roleId: ownerRoleId,
    tenantId,
    tenantType,
    assignedBy,
  })
  return true
}

/**
 * Match legacy permission set to closest system role name (for migration).
 */
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
