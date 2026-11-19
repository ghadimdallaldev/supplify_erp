/**
 * Resolve which supplier/restaurant tenant a user belongs to (workspace + role assignment).
 */
import { query } from './db.js'
import { deleteCache } from './cache.js'

export function workspaceAssignmentCacheKey(userId, tenantType) {
  return `ws:assign:${userId}:${tenantType}`
}

export async function invalidateWorkspaceAssignmentCache(userId, tenantType) {
  if (!userId || !tenantType) return
  await deleteCache(workspaceAssignmentCacheKey(userId, tenantType)).catch(() => {})
}

async function loadTenantAssignmentForUser(userId, appRole) {
  if (!userId || (appRole !== 'RESTAURANT' && appRole !== 'SUPPLIER')) return null

  const tenantType = appRole

  const { rows: roleRows } = await query(
    `
    SELECT tur.tenant_id, tur.tenant_type,
           COALESCE(r.name, s.name) AS tenant_name,
           CASE WHEN tr.is_system IS NOT TRUE AND LOWER(TRIM(tr.name)) IN ('owner', 'restaurant_owner', 'supplier_owner')
             THEN 'Custom: ' || TRIM(tr.name) ELSE tr.name END AS role_name
    FROM tenant_user_roles tur
    JOIN tenant_roles tr ON tr.id = tur.role_id AND tr.tenant_id = tur.tenant_id AND tr.tenant_type = tur.tenant_type
    LEFT JOIN restaurant r ON r.id = tur.tenant_id AND tur.tenant_type = 'RESTAURANT'
    LEFT JOIN supplier s ON s.id = tur.tenant_id AND tur.tenant_type = 'SUPPLIER'
    WHERE tur.user_id = $1 AND tur.tenant_type = $2
    ORDER BY tur.assigned_at DESC
    LIMIT 1
    `,
    [userId, tenantType]
  )
  if (roleRows[0]) {
    return {
      tenantId: roleRows[0].tenant_id,
      tenantType: roleRows[0].tenant_type,
      tenantName: roleRows[0].tenant_name || '',
      roleName: roleRows[0].role_name || '',
    }
  }

  try {
    const { rows: membershipRows } = await query(
      `
      SELECT m.home_tenant_id, m.workspace_type,
             COALESCE(r.name, s.name) AS tenant_name
      FROM user_workspace_membership m
      LEFT JOIN restaurant r ON r.id = m.home_tenant_id AND m.workspace_type = 'RESTAURANT'
      LEFT JOIN supplier s ON s.id = m.home_tenant_id AND m.workspace_type = 'SUPPLIER'
      WHERE m.user_id = $1 AND m.status = 'active' AND m.workspace_type = $2
      LIMIT 1
      `,
      [userId, tenantType]
    )
    if (membershipRows[0]) {
      return {
        tenantId: membershipRows[0].home_tenant_id,
        tenantType: membershipRows[0].workspace_type,
        tenantName: membershipRows[0].tenant_name || '',
        roleName: null,
      }
    }
  } catch (err) {
    if (err.code !== '42P01') throw err
  }

  return null
}

export async function getTenantAssignmentForUser(userId, appRole) {
  return loadTenantAssignmentForUser(userId, appRole)
}

export async function isPrimaryTenantContact(userId, email, tenantId, tenantType) {
  if (!email || !tenantId) return false
  const emailLower = email.trim().toLowerCase()
  const table = tenantType === 'RESTAURANT' ? 'restaurant' : 'supplier'
  const { rows } = await query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND LOWER(TRIM(contact_email)) = $2`,
    [tenantId, emailLower]
  )
  return rows.length > 0
}
