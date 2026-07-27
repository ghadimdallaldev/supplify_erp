import { deleteCacheByPrefix } from './cache.js'
import { logger } from './logger.js'

const ORDERS_CALENDAR_CACHE_PREFIX = 'orders-calendar:'

function normalizeTenantIds(tenantIds) {
  return [...new Set((tenantIds || []).filter((id) => typeof id === 'string' && id.trim()))]
}

export function collectOrdersCalendarTenantIdsFromOrder(order) {
  const supplierIds = Array.isArray(order?.items)
    ? order.items.map((item) => item?.supplier_id).filter(Boolean)
    : []
  return normalizeTenantIds([order?.restaurant_id, ...supplierIds])
}

export async function invalidateOrdersCalendarCacheForTenants(
  tenantIds,
  { reason = 'unknown', requestId = null } = {}
) {
  const normalizedTenantIds = normalizeTenantIds(tenantIds)
  if (normalizedTenantIds.length === 0) {
    return 0
  }

  await Promise.all(
    normalizedTenantIds.map(async (tenantId) => {
      const prefix = `${ORDERS_CALENDAR_CACHE_PREFIX}${tenantId}:`
      try {
        await deleteCacheByPrefix(prefix)
      } catch (error) {
        logger.warn('Orders calendar cache invalidation failed', {
          tenantId,
          reason,
          requestId,
          error: error?.message,
        })
      }
    })
  )

  return normalizedTenantIds.length
}
