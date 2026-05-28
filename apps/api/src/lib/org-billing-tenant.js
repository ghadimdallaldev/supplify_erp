import { query } from './db.js'

/**
 * Org branch tenants share the main branch subscription for plan/features/limits.
 * Usage meters stay on the active (operating) tenant id.
 * @returns {Promise<string>} Tenant id whose subscription row applies
 */
export async function resolveOrgBillingTenantId(tenantId, tenantType) {
  const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows } = await query(`SELECT organization_id FROM ${table} WHERE id = $1`, [tenantId])
  const organizationId = rows[0]?.organization_id
  if (!organizationId) return tenantId

  const { rows: mainRows } = await query(
    `SELECT id FROM ${table}
     WHERE organization_id = $1 AND is_main_branch = true
     ORDER BY created_at ASC
     LIMIT 1`,
    [organizationId]
  )
  if (mainRows[0]?.id) return mainRows[0].id

  const { rows: fallback } = await query(
    `SELECT id FROM ${table} WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [organizationId]
  )
  return fallback[0]?.id || tenantId
}
