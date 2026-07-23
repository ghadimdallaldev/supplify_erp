import { query } from './db.js'
import { getCache, setCache, deleteCache } from './cache.js'
import { singleflight } from './singleflight.js'

const ORG_BILLING_CACHE_TTL_SECONDS = 300

function orgBillingCacheKey(tenantId, tenantType) {
  return `orgbill:${tenantType}:${tenantId}`
}

export async function invalidateOrgBillingTenantCache(tenantId, tenantType) {
  if (!tenantId || !tenantType) return
  await deleteCache(orgBillingCacheKey(tenantId, tenantType))
}

/**
 * Org branch tenants share the main branch subscription for plan/features/limits.
 * Usage meters stay on the active (operating) tenant id.
 * @returns {Promise<string>} Tenant id whose subscription row applies
 */
export async function resolveOrgBillingTenantId(tenantId, tenantType) {
  const cacheKey = orgBillingCacheKey(tenantId, tenantType)
  const cached = await getCache(cacheKey)
  if (cached !== null && typeof cached === 'string') return cached

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again !== null && typeof again === 'string') return again

    const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
    const { rows } = await query(`SELECT organization_id FROM ${table} WHERE id = $1`, [tenantId])
    const organizationId = rows[0]?.organization_id
    if (!organizationId) {
      await setCache(cacheKey, tenantId, ORG_BILLING_CACHE_TTL_SECONDS).catch(() => {})
      return tenantId
    }

    const { rows: mainRows } = await query(
      `SELECT id FROM ${table}
     WHERE organization_id = $1 AND is_main_branch = true
     ORDER BY created_at ASC
     LIMIT 1`,
      [organizationId]
    )
    if (mainRows[0]?.id) {
      await setCache(cacheKey, mainRows[0].id, ORG_BILLING_CACHE_TTL_SECONDS).catch(() => {})
      return mainRows[0].id
    }

    const { rows: fallback } = await query(
      `SELECT id FROM ${table} WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [organizationId]
    )
    const billingId = fallback[0]?.id || tenantId
    await setCache(cacheKey, billingId, ORG_BILLING_CACHE_TTL_SECONDS).catch(() => {})
    return billingId
  })
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

/**
 * Batch-resolve active billing subscriptions for admin tenant lists (avoids N+1).
 * @param {string[]} tenantIds
 * @param {'RESTAURANT' | 'SUPPLIER'} tenantType
 * @returns {Promise<Map<string, { billingTenantId: string; usesOrgBilling: boolean; subscription: object | null; plan_code?: string }>>}
 */
export async function resolveActiveBillingSubscriptionsBatch(tenantIds, tenantType) {
  const result = new Map()
  if (!tenantIds?.length) return result

  const uniqueIds = [...new Set(tenantIds.filter(Boolean))]
  const billingEntries = await Promise.all(
    uniqueIds.map(async (id) => {
      const billingTenantId = await resolveOrgBillingTenantId(id, tenantType)
      return { id, billingTenantId }
    })
  )

  const billingIdByTenant = new Map(billingEntries.map((e) => [e.id, e.billingTenantId]))
  const billingIds = [...new Set(billingEntries.map((e) => e.billingTenantId))]

  const { rows: subs } = await query(
    `SELECT DISTINCT ON (s.tenant_id)
       s.*,
       sp.code AS plan_code
     FROM subscription s
     LEFT JOIN subscription_plan sp ON sp.id = s.plan_id
     WHERE s.tenant_id = ANY($1::uuid[])
       AND s.tenant_type = $2
       AND s.status IN ('TRIALING', 'ACTIVE')
     ORDER BY s.tenant_id, s.created_at DESC`,
    [billingIds, tenantType]
  )

  const subsByBillingId = new Map(subs.map((s) => [s.tenant_id, s]))

  for (const id of uniqueIds) {
    const billingTenantId = billingIdByTenant.get(id)
    const subscription = subsByBillingId.get(billingTenantId) || null
    result.set(id, {
      billingTenantId,
      usesOrgBilling: billingTenantId !== id,
      subscription,
      plan_code: subscription?.plan_code,
    })
  }
  return result
}
