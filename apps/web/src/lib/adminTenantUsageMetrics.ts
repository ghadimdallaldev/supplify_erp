import type { SubscriptionPlan } from '../types'
import {
  computeUsageStatus,
  computeWorstUsageStatus,
  usagePercent,
  type UsageStatus,
} from './adminUsageStatus'
import { parseOptionalCount } from './adminMetricDisplay'
import { resolvePlanLimitFromCatalog } from './adminPlanLimitLookup'

export type SupplierUsageRow = {
  id: string
  name: string
  planLabel: string
  plan_code?: string
  plan_name?: string
  productCount: number
  warehouseCount: number
  dealsCount: number | null
  storageUsed: number | null
  productLimit: number | null | undefined
  warehouseLimit: number | null | undefined
  dealsLimit: number | null | undefined
  storageLimit: number | null | undefined
  productStatus: UsageStatus
  warehouseStatus: UsageStatus
  dealsStatus: UsageStatus
  storageStatus: UsageStatus
  status: UsageStatus
  pressureScore: number
}

export type RestaurantUsageRow = {
  id: string
  name: string
  planLabel: string
  plan_code?: string
  plan_name?: string
  orders30d: number
  ordersToday: number | null
  connectedSuppliers: number | null
  inventorySkus: number | null
  storageUsed: number | null
  dailyLimit: number | null | undefined
  suppliersLimit: number | null | undefined
  inventoryLimit: number | null | undefined
  storageLimit: number | null | undefined
  ordersTodayStatus: UsageStatus
  status: UsageStatus
  pressureScore: number
}

export type UsagePressureEntry = {
  id: string
  name: string
  tenantType: 'SUPPLIER' | 'RESTAURANT'
  planLabel: string
  status: UsageStatus
  pressureScore: number
  topMetric: string
  topUsed: number
  topLimit: number | null | undefined
}

function parseCount(value: string | number | undefined): number {
  return parseInt(String(value ?? 0), 10) || 0
}

function maxPressureFromPairs(
  pairs: Array<{ used: number | null; limit: number | null | undefined }>
): number {
  let max = 0
  for (const { used, limit } of pairs) {
    if (used == null) continue
    max = Math.max(max, usagePercent(used, limit))
  }
  return max
}

export function buildSupplierUsageRows(
  suppliers: Array<Record<string, unknown>>,
  plans?: SubscriptionPlan[]
): SupplierUsageRow[] {
  return suppliers.map((raw) => {
    const s = raw as {
      id: string
      name: string
      plan_name?: string
      plan_code?: string
      product_count?: string | number
      warehouse_count?: string | number
      active_deals_count?: number | null
      storage_mb_used?: number | null
    }
    const productCount = parseCount(s.product_count)
    const warehouseCount = parseCount(s.warehouse_count)
    const dealsCount = parseOptionalCount(s.active_deals_count)
    const storageUsed = parseOptionalCount(s.storage_mb_used)
    const planKey = s.plan_code ?? s.plan_name
    const productLimit = resolvePlanLimitFromCatalog(
      plans,
      'SUPPLIER',
      planKey,
      'supplier_products_skus'
    )
    const warehouseLimit = resolvePlanLimitFromCatalog(plans, 'SUPPLIER', planKey, 'warehouses')
    const dealsLimit = resolvePlanLimitFromCatalog(plans, 'SUPPLIER', planKey, 'promotions')
    const storageLimit = resolvePlanLimitFromCatalog(plans, 'SUPPLIER', planKey, 'storage_mb')
    const productStatus = computeUsageStatus(productCount, productLimit)
    const warehouseStatus = computeUsageStatus(warehouseCount, warehouseLimit)
    const dealsStatus =
      dealsCount != null ? computeUsageStatus(dealsCount, dealsLimit) : ('unknown' as UsageStatus)
    const storageStatus =
      storageUsed != null
        ? computeUsageStatus(storageUsed, storageLimit)
        : ('unknown' as UsageStatus)
    const statuses: UsageStatus[] = [productStatus, warehouseStatus]
    if (dealsCount != null) statuses.push(dealsStatus)
    if (storageUsed != null) statuses.push(storageStatus)
    const status = computeWorstUsageStatus(statuses)
    const pressureScore = maxPressureFromPairs([
      { used: productCount, limit: productLimit },
      { used: warehouseCount, limit: warehouseLimit },
      { used: dealsCount, limit: dealsLimit },
      { used: storageUsed, limit: storageLimit },
    ])
    return {
      id: s.id,
      name: s.name,
      planLabel: s.plan_name || s.plan_code || '—',
      plan_code: s.plan_code,
      plan_name: s.plan_name,
      productCount,
      warehouseCount,
      dealsCount,
      storageUsed,
      productLimit,
      warehouseLimit,
      dealsLimit,
      storageLimit,
      productStatus,
      warehouseStatus,
      dealsStatus,
      storageStatus,
      status,
      pressureScore,
    }
  })
}

export function buildRestaurantUsageRows(
  restaurants: Array<Record<string, unknown>>,
  plans?: SubscriptionPlan[]
): RestaurantUsageRow[] {
  return restaurants.map((raw) => {
    const r = raw as {
      id: string
      name: string
      plan_name?: string
      plan_code?: string
      orders_last_30d?: string | number
      orders_today?: number | null
      connected_suppliers_count?: number | null
      inventory_skus_count?: number | null
      storage_mb_used?: number | null
    }
    const orders30d = parseCount(r.orders_last_30d)
    const ordersToday = parseOptionalCount(r.orders_today)
    const connectedSuppliers = parseOptionalCount(r.connected_suppliers_count)
    const inventorySkus = parseOptionalCount(r.inventory_skus_count)
    const storageUsed = parseOptionalCount(r.storage_mb_used)
    const planKey = r.plan_code ?? r.plan_name
    const dailyLimit = resolvePlanLimitFromCatalog(plans, 'RESTAURANT', planKey, 'orders_per_day')
    const suppliersLimit = resolvePlanLimitFromCatalog(
      plans,
      'RESTAURANT',
      planKey,
      'suppliers_per_restaurant'
    )
    const inventoryLimit = resolvePlanLimitFromCatalog(
      plans,
      'RESTAURANT',
      planKey,
      'restaurant_inventory_skus'
    )
    const storageLimit = resolvePlanLimitFromCatalog(plans, 'RESTAURANT', planKey, 'storage_mb')
    const ordersTodayStatus =
      ordersToday != null && dailyLimit != null && dailyLimit !== -1
        ? computeUsageStatus(ordersToday, dailyLimit)
        : dailyLimit === -1
          ? ('unlimited' as UsageStatus)
          : ('unknown' as UsageStatus)
    const statuses: UsageStatus[] = []
    if (ordersToday != null) statuses.push(ordersTodayStatus)
    if (connectedSuppliers != null) {
      statuses.push(computeUsageStatus(connectedSuppliers, suppliersLimit))
    }
    if (inventorySkus != null) {
      statuses.push(computeUsageStatus(inventorySkus, inventoryLimit))
    }
    if (storageUsed != null) {
      statuses.push(computeUsageStatus(storageUsed, storageLimit))
    }
    const status =
      statuses.length > 0 ? computeWorstUsageStatus(statuses) : ('unknown' as UsageStatus)
    const pressureScore = maxPressureFromPairs([
      { used: ordersToday, limit: dailyLimit },
      { used: connectedSuppliers, limit: suppliersLimit },
      { used: inventorySkus, limit: inventoryLimit },
      { used: storageUsed, limit: storageLimit },
    ])
    return {
      id: r.id,
      name: r.name,
      planLabel: r.plan_name || r.plan_code || '—',
      plan_code: r.plan_code,
      plan_name: r.plan_name,
      orders30d,
      ordersToday,
      connectedSuppliers,
      inventorySkus,
      storageUsed,
      dailyLimit,
      suppliersLimit,
      inventoryLimit,
      storageLimit,
      ordersTodayStatus,
      status,
      pressureScore,
    }
  })
}

export type UsagePlatformStats = {
  supplierCount: number
  restaurantCount: number
  loadedTotal: number
  platformTotal: number
  nearLimit: number
  overLimit: number
  healthy: number
  unlimited: number
  unknown: number
  needsAttention: number
}

export function computeUsagePlatformStats(
  supplierRows: SupplierUsageRow[],
  restaurantRows: RestaurantUsageRow[],
  suppliersTotal: number,
  restaurantsTotal: number
): UsagePlatformStats {
  const allStatuses = [...supplierRows.map((r) => r.status), ...restaurantRows.map((r) => r.status)]
  const nearLimit = allStatuses.filter((s) => s === 'near_limit').length
  const overLimit = allStatuses.filter((s) => s === 'over_limit').length
  const healthy = allStatuses.filter((s) => s === 'healthy').length
  const unlimited = allStatuses.filter((s) => s === 'unlimited').length
  const unknown = allStatuses.filter((s) => s === 'unknown').length
  return {
    supplierCount: supplierRows.length,
    restaurantCount: restaurantRows.length,
    loadedTotal: supplierRows.length + restaurantRows.length,
    platformTotal: suppliersTotal + restaurantsTotal,
    nearLimit,
    overLimit,
    healthy,
    unlimited,
    unknown,
    needsAttention: nearLimit + overLimit,
  }
}

function topPressureMetricSupplier(row: SupplierUsageRow): {
  label: string
  used: number
  limit: number | null | undefined
} {
  const metrics = [
    { label: 'Products', used: row.productCount, limit: row.productLimit },
    { label: 'Warehouses', used: row.warehouseCount, limit: row.warehouseLimit },
    { label: 'Active deals', used: row.dealsCount, limit: row.dealsLimit },
    { label: 'Storage (MB)', used: row.storageUsed, limit: row.storageLimit },
  ]
  let best = metrics[0]
  let bestPct = 0
  for (const m of metrics) {
    if (m.used == null) continue
    const pct = usagePercent(m.used, m.limit)
    if (pct > bestPct) {
      bestPct = pct
      best = m
    }
  }
  return { label: best.label, used: best.used ?? 0, limit: best.limit }
}

function topPressureMetricRestaurant(row: RestaurantUsageRow): {
  label: string
  used: number
  limit: number | null | undefined
} {
  const metrics = [
    { label: 'Orders today', used: row.ordersToday, limit: row.dailyLimit },
    { label: 'Suppliers', used: row.connectedSuppliers, limit: row.suppliersLimit },
    { label: 'Inventory SKUs', used: row.inventorySkus, limit: row.inventoryLimit },
    { label: 'Storage (MB)', used: row.storageUsed, limit: row.storageLimit },
  ]
  let best = metrics[0]
  let bestPct = 0
  for (const m of metrics) {
    if (m.used == null) continue
    const pct = usagePercent(m.used, m.limit)
    if (pct > bestPct) {
      bestPct = pct
      best = m
    }
  }
  return { label: best.label, used: best.used ?? 0, limit: best.limit }
}

export function buildUsagePressureList(
  supplierRows: SupplierUsageRow[],
  restaurantRows: RestaurantUsageRow[],
  limit = 10
): UsagePressureEntry[] {
  const entries: UsagePressureEntry[] = [
    ...supplierRows.map((row) => {
      const top = topPressureMetricSupplier(row)
      return {
        id: row.id,
        name: row.name,
        tenantType: 'SUPPLIER' as const,
        planLabel: row.planLabel,
        status: row.status,
        pressureScore: row.pressureScore,
        topMetric: top.label,
        topUsed: top.used,
        topLimit: top.limit,
      }
    }),
    ...restaurantRows.map((row) => {
      const top = topPressureMetricRestaurant(row)
      return {
        id: row.id,
        name: row.name,
        tenantType: 'RESTAURANT' as const,
        planLabel: row.planLabel,
        status: row.status,
        pressureScore: row.pressureScore,
        topMetric: top.label,
        topUsed: top.used,
        topLimit: top.limit,
      }
    }),
  ]
  return entries
    .filter((e) => e.status === 'near_limit' || e.status === 'over_limit' || e.pressureScore >= 60)
    .sort((a, b) => {
      const statusRank = (s: UsageStatus) => (s === 'over_limit' ? 0 : s === 'near_limit' ? 1 : 2)
      const diff = statusRank(a.status) - statusRank(b.status)
      if (diff !== 0) return diff
      return b.pressureScore - a.pressureScore
    })
    .slice(0, limit)
}

export const USAGE_STATUS_SORT_RANK: Record<UsageStatus, number> = {
  over_limit: 0,
  near_limit: 1,
  healthy: 2,
  unlimited: 3,
  unknown: 4,
}
