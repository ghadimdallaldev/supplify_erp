/**
 * Tenant-scoped RBAC: permission keys and helpers.
 * Used with role/permission tables and user_role assignments.
 */
import { query } from './db.js'
import { logger } from './logger.js'

/** Permission key constants (match permission.code in DB) */
export const PERMISSION_KEYS = Object.freeze({
  ORDERS_VIEW: 'ORDERS_VIEW',
  ORDERS_CREATE: 'ORDERS_CREATE',
  ORDERS_EDIT: 'ORDERS_EDIT',
  ORDERS_MANAGE: 'ORDERS_MANAGE',
  INVOICES_VIEW: 'INVOICES_VIEW',
  INVOICES_CREATE: 'INVOICES_CREATE',
  INVOICES_EDIT: 'INVOICES_EDIT',
  INVOICES_MANAGE: 'INVOICES_MANAGE',
  INVENTORY_VIEW: 'INVENTORY_VIEW',
  INVENTORY_EDIT: 'INVENTORY_EDIT',
  INVENTORY_MANAGE: 'INVENTORY_MANAGE',
  RESERVATIONS_VIEW: 'RESERVATIONS_VIEW',
  RESERVATIONS_CREATE: 'RESERVATIONS_CREATE',
  RESERVATIONS_EDIT: 'RESERVATIONS_EDIT',
  RESERVATIONS_MANAGE: 'RESERVATIONS_MANAGE',
  STAFF_VIEW: 'STAFF_VIEW',
  STAFF_INVITE: 'STAFF_INVITE',
  STAFF_EDIT: 'STAFF_EDIT',
  STAFF_MANAGE: 'STAFF_MANAGE',
  SETTINGS_VIEW: 'SETTINGS_VIEW',
  SETTINGS_EDIT: 'SETTINGS_EDIT',
  SETTINGS_MANAGE: 'SETTINGS_MANAGE',
  CHAT_VIEW: 'CHAT_VIEW',
  CHAT_SEND: 'CHAT_SEND',
  CHAT_MANAGE: 'CHAT_MANAGE',
  SUBSCRIPTIONS_VIEW: 'SUBSCRIPTIONS_VIEW',
  SUBSCRIPTIONS_MANAGE: 'SUBSCRIPTIONS_MANAGE',
  CATALOG_VIEW: 'CATALOG_VIEW',
  CATALOG_EDIT: 'CATALOG_EDIT',
  CATALOG_MANAGE: 'CATALOG_MANAGE',
  WAREHOUSES_VIEW: 'WAREHOUSES_VIEW',
  WAREHOUSES_EDIT: 'WAREHOUSES_EDIT',
  WAREHOUSES_MANAGE: 'WAREHOUSES_MANAGE',
  ADMIN_ACCESS: 'ADMIN_ACCESS',
  ADMIN_TENANTS: 'ADMIN_TENANTS',
  ADMIN_PLANS: 'ADMIN_PLANS',
  ADMIN_SUPPORT: 'ADMIN_SUPPORT',
  ADMIN_FINANCE: 'ADMIN_FINANCE',
  ADMIN_GROWTH: 'ADMIN_GROWTH',
})

/**
 * Get role codes for a user in a tenant context.
 * @param {string} userId - app_user.id
 * @param {string|null} tenantId - tenant id (null for global admin)
 * @param {string} tenantType - RESTAURANT | SUPPLIER | ADMIN
 * @returns {Promise<string[]>} role codes
 */
export async function getRolesForUser(userId, tenantId, tenantType) {
  try {
    const { rows } = await query(
      `
      SELECT r.code
      FROM user_role ur
      JOIN role r ON r.id = ur.role_id
      WHERE ur.user_id = $1 AND ur.tenant_type = $2
        AND ((ur.tenant_id IS NULL AND $3::uuid IS NULL) OR ur.tenant_id = $3)
    `,
      [userId, tenantType, tenantId]
    )
    return rows.map((r) => r.code)
  } catch (err) {
    if (err.code === '42P01') return [] // tables don't exist yet
    logger.error('getRolesForUser error', { error: err.message })
    return []
  }
}

/**
 * Get permission codes for a user in a tenant context (from all assigned roles).
 * @param {string} userId - app_user.id
 * @param {string|null} tenantId - tenant id (null for global admin)
 * @param {string} tenantType - RESTAURANT | SUPPLIER | ADMIN
 * @returns {Promise<string[]>} permission codes (unique)
 */
export async function getPermissionsForUser(userId, tenantId, tenantType) {
  try {
    const { rows } = await query(
      `
      SELECT DISTINCT p.code
      FROM user_role ur
      JOIN role r ON r.id = ur.role_id
      JOIN role_permission rp ON rp.role_id = r.id
      JOIN permission p ON p.id = rp.permission_id
      WHERE ur.user_id = $1 AND ur.tenant_type = $2
        AND ((ur.tenant_id IS NULL AND $3::uuid IS NULL) OR ur.tenant_id = $3)
    `,
      [userId, tenantType, tenantId]
    )
    return rows.map((r) => r.code)
  } catch (err) {
    if (err.code === '42P01') return []
    logger.error('getPermissionsForUser error', { error: err.message })
    return []
  }
}

/**
 * Check if a list of permission codes includes the required key (or a broader one).
 * E.g. ORDERS_MANAGE implies ORDERS_VIEW for same domain.
 * @param {string[]} permissions - list of permission codes
 * @param {string} required - required permission code
 * @returns {boolean}
 */
export function hasPermission(permissions, required) {
  if (!Array.isArray(permissions)) return false
  if (permissions.includes(required)) return true
  const domain = required.replace(/_VIEW$|_CREATE$|_EDIT$|_SEND$|_MANAGE$/, '_MANAGE')
  if (domain !== required && permissions.includes(domain)) return true
  return false
}
