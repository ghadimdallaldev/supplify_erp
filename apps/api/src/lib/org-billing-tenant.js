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

/**
 * Active subscription row used for plan/features/limits (org main branch when applicable).
 * @param {string} tenantId
 * @param {'RESTAURANT' | 'SUPPLIER'} tenantType
 * @returns {Promise<{ billingTenantId: string; usesOrgBilling: boolean; subscription: object | null }>}
 */
export async function resolveActiveBillingSubscription(tenantId, tenantType) {
  const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
  const { rows } = await query(
    `SELECT s.*
     FROM subscription s
     WHERE s.tenant_id = $1
       AND s.tenant_type = $2
       AND s.status IN ('TRIALING', 'ACTIVE')
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [billingTenantId, tenantType]
  )
  return {
    billingTenantId,
    usesOrgBilling: billingTenantId !== tenantId,
    subscription: rows[0] || null,
  }
}
