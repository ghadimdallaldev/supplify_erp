import { query } from './db.js'

export async function isTenantUnlockedForBackgroundWrites({ tenantId, tenantType }) {
  const normalizedTenantType = String(tenantType || '').toUpperCase()
  const { rows } = await query(
    `
      SELECT 1
      FROM subscription
      WHERE tenant_id = $1
        AND tenant_type = $2
        AND status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
        AND account_locked_at IS NULL
      LIMIT 1
    `,
    [tenantId, normalizedTenantType]
  )
  return rows.length > 0
}
export async function isTenantIdUnlockedForBackgroundWrites({ tenantId }) {
  if (!tenantId) return false
  const { rows } = await query(
    `
      SELECT 1
      FROM subscription
      WHERE tenant_id = $1
        AND status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
        AND account_locked_at IS NULL
      LIMIT 1
    `,
    [tenantId]
  )
  return rows.length > 0
}
