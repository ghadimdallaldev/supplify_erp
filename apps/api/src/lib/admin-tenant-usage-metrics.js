/**
 * Admin tenant usage SQL fragments and overview aggregates.
 * Aligns with subscription.js checkLimit / getUsageSnapshot conventions.
 */

/** Cumulative storage meters use a fixed period date (see subscription.js). */
export const CUMULATIVE_STORAGE_PERIOD_DATE = '2000-01-01'

/** Active supplier promotions — matches promotions.service eligibility (supplier-wide count). */
export const ACTIVE_SUPPLIER_DEALS_COUNT_SQL = `
  SELECT COUNT(*)::int
  FROM promotions p
  WHERE p.supplier_id = $tenantId
    AND p.status = 'active'
    AND COALESCE(p.payment_status, 'not_required') IN ('not_required', 'paid')
    AND p.starts_at <= NOW()
    AND (p.ends_at IS NULL OR p.ends_at > NOW())
    AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
`

export const SUPPLIER_USAGE_FIELDS_SQL = `
  (SELECT COUNT(*)::int
   FROM promotions p
   WHERE p.supplier_id = s.id
     AND p.status = 'active'
     AND COALESCE(p.payment_status, 'not_required') IN ('not_required', 'paid')
     AND p.starts_at <= NOW()
     AND (p.ends_at IS NULL OR p.ends_at > NOW())
     AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
  ) AS active_deals_count,
  (
    SELECT um.current_value::int
    FROM usage_meter um
    WHERE um.tenant_id = s.id
      AND um.tenant_type = 'SUPPLIER'
      AND um.meter_type = 'storage_mb'
      AND um.period_start_date = '${CUMULATIVE_STORAGE_PERIOD_DATE}'
    LIMIT 1
  ) AS storage_mb_used
`

export const RESTAURANT_USAGE_FIELDS_SQL = `
  (
    SELECT COUNT(*)::int
    FROM customer_order co
    WHERE co.restaurant_id = r.id
      AND co.status = 'PLACED'
      AND DATE(co.placed_at) = CURRENT_DATE
  ) AS orders_today,
  (
    SELECT COUNT(*)::int
    FROM supplier_follow sf
    WHERE sf.restaurant_id = r.id
  ) AS connected_suppliers_count,
  (
    SELECT COUNT(DISTINCT ri.product_id)::int
    FROM restaurant_inventory ri
    WHERE ri.restaurant_id = r.id
  ) AS inventory_skus_count,
  (
    SELECT um.current_value::int
    FROM usage_meter um
    WHERE um.tenant_id = r.id
      AND um.tenant_type = 'RESTAURANT'
      AND um.meter_type = 'storage_mb'
      AND um.period_start_date = '${CUMULATIVE_STORAGE_PERIOD_DATE}'
    LIMIT 1
  ) AS storage_mb_used
`

const TENANTS_OVER_LIMIT_SQL = `
  SELECT COUNT(*)::int AS count
  FROM (
    SELECT DISTINCT tenant_id, tenant_type
    FROM usage_meter
    WHERE is_over_limit = true
      AND limit_value IS NOT NULL
      AND limit_value > 0
  ) over_tenants
`

const TENANTS_NEAR_LIMIT_SQL = `
  SELECT COUNT(*)::int AS count
  FROM (
    SELECT DISTINCT tenant_id, tenant_type
    FROM usage_meter
    WHERE is_over_limit = false
      AND limit_value IS NOT NULL
      AND limit_value > 0
      AND current_value >= (limit_value * 0.8)
      AND current_value < limit_value
  ) near_tenants
`

/**
 * @param {typeof import('./admin-overview-metrics.js').safeOverviewQuery} safeOverviewQuery
 * @returns {Promise<{ tenantsOverLimit: number, tenantsNearLimit: number }>}
 */
export async function buildTenantLimitOverviewCounts(safeOverviewQuery) {
  const [overRows, nearRows] = await Promise.all([
    safeOverviewQuery('tenantsOverLimit', TENANTS_OVER_LIMIT_SQL, [{ count: 0 }]),
    safeOverviewQuery('tenantsNearLimit', TENANTS_NEAR_LIMIT_SQL, [{ count: 0 }]),
  ])
  return {
    tenantsOverLimit: parseInt(overRows[0]?.count, 10) || 0,
    tenantsNearLimit: parseInt(nearRows[0]?.count, 10) || 0,
  }
}
