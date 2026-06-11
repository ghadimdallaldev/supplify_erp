import { useMemo, useState } from 'react'
import type { SubscriptionPlan } from '../../types'
import {
  computeUsageStatus,
  computeWorstUsageStatus,
  type UsageStatus,
} from '../../lib/adminUsageStatus'
import { parseOptionalCount } from '../../lib/adminMetricDisplay'
import {
  resolvePlanLimitFromCatalog,
  formatPlanLimitDisplayValue,
} from '../../lib/adminPlanLimitLookup'
import { UsageProgressBar } from './UsageProgressBar'
import { UsageStatusBadge } from './UsageStatusBadge'
import { AdminEmptyState, AdminLoadingSkeleton } from './adminUi'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectTrigger } from '../ui/select'

type SupplierRow = {
  id: string
  name: string
  plan_name?: string
  plan_code?: string
  product_count?: string | number
  warehouse_count?: string | number
  active_deals_count?: number | null
  storage_mb_used?: number | null
}

type RestaurantRow = {
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

function parseCount(value: string | number | undefined): number {
  return parseInt(String(value ?? 0), 10) || 0
}

function UsageMetricCell({
  used,
  limit,
  status,
}: {
  used: number | null
  limit: number | null | undefined
  status: UsageStatus
}) {
  if (used == null) {
    return <span className="text-xs text-[var(--text-muted)]">Not available</span>
  }
  return (
    <div className="min-w-[120px]">
      <div className="text-xs">
        {used} / {formatPlanLimitDisplayValue(limit)}
      </div>
      {limit != null && limit !== -1 && (
        <UsageProgressBar used={used} limit={limit} status={status} />
      )}
    </div>
  )
}

export function AdminTenantUsageTable({
  mode,
  suppliers = [],
  restaurants = [],
  plans,
  isLoading,
  onDiagnostics,
  onChangePlan,
}: {
  mode: 'supplier' | 'restaurant'
  suppliers?: SupplierRow[]
  restaurants?: RestaurantRow[]
  plans?: SubscriptionPlan[]
  isLoading?: boolean
  onDiagnostics?: (id: string, name: string) => void
  onChangePlan?: (id: string, name: string, tenantType: 'SUPPLIER' | 'RESTAURANT') => void
}) {
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<UsageStatus | 'all'>('all')

  const supplierRows = useMemo(() => {
    return suppliers.map((s) => {
      const productCount = parseCount(s.product_count)
      const warehouseCount = parseCount(s.warehouse_count)
      const dealsCount = parseOptionalCount(s.active_deals_count)
      const storageUsed = parseOptionalCount(s.storage_mb_used)
      const productLimit = resolvePlanLimitFromCatalog(
        plans,
        'SUPPLIER',
        s.plan_code ?? s.plan_name,
        'supplier_products_skus'
      )
      const warehouseLimit = resolvePlanLimitFromCatalog(
        plans,
        'SUPPLIER',
        s.plan_code ?? s.plan_name,
        'warehouses'
      )
      const dealsLimit = resolvePlanLimitFromCatalog(
        plans,
        'SUPPLIER',
        s.plan_code ?? s.plan_name,
        'promotions'
      )
      const storageLimit = resolvePlanLimitFromCatalog(
        plans,
        'SUPPLIER',
        s.plan_code ?? s.plan_name,
        'storage_mb'
      )
      const statuses: UsageStatus[] = [
        computeUsageStatus(productCount, productLimit),
        computeUsageStatus(warehouseCount, warehouseLimit),
      ]
      if (dealsCount != null) statuses.push(computeUsageStatus(dealsCount, dealsLimit))
      if (storageUsed != null) statuses.push(computeUsageStatus(storageUsed, storageLimit))
      return {
        ...s,
        productCount,
        warehouseCount,
        dealsCount,
        storageUsed,
        productLimit,
        warehouseLimit,
        dealsLimit,
        storageLimit,
        productStatus: computeUsageStatus(productCount, productLimit),
        warehouseStatus: computeUsageStatus(warehouseCount, warehouseLimit),
        dealsStatus:
          dealsCount != null
            ? computeUsageStatus(dealsCount, dealsLimit)
            : ('unknown' as UsageStatus),
        storageStatus:
          storageUsed != null
            ? computeUsageStatus(storageUsed, storageLimit)
            : ('unknown' as UsageStatus),
        status: computeWorstUsageStatus(statuses),
        planLabel: s.plan_name || s.plan_code || '—',
      }
    })
  }, [suppliers, plans])

  const restaurantRows = useMemo(() => {
    return restaurants.map((r) => {
      const orders30d = parseCount(r.orders_last_30d)
      const ordersToday = parseOptionalCount(r.orders_today)
      const connectedSuppliers = parseOptionalCount(r.connected_suppliers_count)
      const inventorySkus = parseOptionalCount(r.inventory_skus_count)
      const storageUsed = parseOptionalCount(r.storage_mb_used)
      const dailyLimit = resolvePlanLimitFromCatalog(
        plans,
        'RESTAURANT',
        r.plan_code ?? r.plan_name,
        'orders_per_day'
      )
      const suppliersLimit = resolvePlanLimitFromCatalog(
        plans,
        'RESTAURANT',
        r.plan_code ?? r.plan_name,
        'suppliers_per_restaurant'
      )
      const inventoryLimit = resolvePlanLimitFromCatalog(
        plans,
        'RESTAURANT',
        r.plan_code ?? r.plan_name,
        'restaurant_inventory_skus'
      )
      const storageLimit = resolvePlanLimitFromCatalog(
        plans,
        'RESTAURANT',
        r.plan_code ?? r.plan_name,
        'storage_mb'
      )
      const statuses: UsageStatus[] = []
      if (ordersToday != null) {
        statuses.push(
          dailyLimit === -1
            ? 'unlimited'
            : dailyLimit == null
              ? 'unknown'
              : computeUsageStatus(ordersToday, dailyLimit)
        )
      }
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
      return {
        ...r,
        orders30d,
        ordersToday,
        connectedSuppliers,
        inventorySkus,
        storageUsed,
        dailyLimit,
        suppliersLimit,
        inventoryLimit,
        storageLimit,
        ordersTodayStatus:
          ordersToday != null && dailyLimit != null && dailyLimit !== -1
            ? computeUsageStatus(ordersToday, dailyLimit)
            : dailyLimit === -1
              ? ('unlimited' as UsageStatus)
              : ('unknown' as UsageStatus),
        status,
        planLabel: r.plan_name || r.plan_code || '—',
      }
    })
  }, [restaurants, plans])

  const rows = mode === 'supplier' ? supplierRows : restaurantRows

  const planOptions = useMemo(() => {
    const codes = new Set(rows.map((r) => r.planLabel).filter((p) => p !== '—'))
    return Array.from(codes).sort()
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const name = 'name' in row ? row.name : ''
      if (search && !name.toLowerCase().includes(search.toLowerCase())) return false
      if (planFilter !== 'all' && row.planLabel !== planFilter) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      return true
    })
  }, [rows, search, planFilter, statusFilter])

  if (isLoading) {
    return <AdminLoadingSkeleton rows={6} />
  }

  return (
    <div className="space-y-3" data-testid={`admin-usage-table-${mode}`}>
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder={`Search ${mode === 'supplier' ? 'suppliers' : 'restaurants'}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-xs text-sm"
        />
        <Select value={planFilter} onValueChange={(value) => setPlanFilter(value)}>
          <SelectTrigger className="w-auto">
            <option value="all">All plans</option>
            {planOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectTrigger>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as UsageStatus | 'all')}
        >
          <SelectTrigger className="w-auto">
            <option value="all">All statuses</option>
            <option value="healthy">Healthy</option>
            <option value="near_limit">Near limit</option>
            <option value="over_limit">Over limit</option>
            <option value="unlimited">Unlimited</option>
          </SelectTrigger>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <AdminEmptyState
          title="No matching tenants"
          description="Adjust filters or load more tenants to see usage data."
        />
      ) : mode === 'supplier' ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--app-border)] bg-[var(--surface-mid)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-semibold">Supplier</th>
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 font-semibold">Products</th>
                <th className="px-3 py-2 font-semibold">Warehouses</th>
                <th className="px-3 py-2 font-semibold">Active deals</th>
                <th className="px-3 py-2 font-semibold">Storage</th>
                <th className="px-3 py-2 font-semibold">Usage status</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const s = row as (typeof supplierRows)[0]
                return (
                  <tr
                    key={s.id}
                    className="border-b border-[var(--app-border)]/60 hover:bg-[var(--brand-ultra)]/30"
                  >
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{s.planLabel}</td>
                    <td className="px-3 py-2">
                      <UsageMetricCell
                        used={s.productCount}
                        limit={s.productLimit}
                        status={s.productStatus}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <UsageMetricCell
                        used={s.warehouseCount}
                        limit={s.warehouseLimit}
                        status={s.warehouseStatus}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <UsageMetricCell
                        used={s.dealsCount}
                        limit={s.dealsLimit}
                        status={s.dealsStatus}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      {s.storageUsed != null ? (
                        <UsageMetricCell
                          used={s.storageUsed}
                          limit={s.storageLimit}
                          status={s.storageStatus}
                        />
                      ) : (
                        'Not available'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <UsageStatusBadge status={s.status} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {onDiagnostics && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onDiagnostics(s.id, s.name)}
                          >
                            Diagnostics
                          </Button>
                        )}
                        {onChangePlan && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onChangePlan(s.id, s.name, 'SUPPLIER')}
                          >
                            Plan
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--app-border)] bg-[var(--surface-mid)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-semibold">Restaurant</th>
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 font-semibold">Orders today</th>
                <th className="px-3 py-2 font-semibold">Orders (30d)</th>
                <th className="px-3 py-2 font-semibold">Suppliers</th>
                <th className="px-3 py-2 font-semibold">Inventory SKUs</th>
                <th className="px-3 py-2 font-semibold">Storage</th>
                <th className="px-3 py-2 font-semibold">Usage status</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const r = row as (typeof restaurantRows)[0]
                return (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--app-border)]/60 hover:bg-[var(--brand-ultra)]/30"
                  >
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{r.planLabel}</td>
                    <td className="px-3 py-2">
                      {r.ordersToday != null ? (
                        <UsageMetricCell
                          used={r.ordersToday}
                          limit={r.dailyLimit}
                          status={r.ordersTodayStatus}
                        />
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">Not available</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.orders30d}</td>
                    <td className="px-3 py-2">
                      <UsageMetricCell
                        used={r.connectedSuppliers}
                        limit={r.suppliersLimit}
                        status={
                          r.connectedSuppliers != null
                            ? computeUsageStatus(r.connectedSuppliers, r.suppliersLimit)
                            : 'unknown'
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <UsageMetricCell
                        used={r.inventorySkus}
                        limit={r.inventoryLimit}
                        status={
                          r.inventorySkus != null
                            ? computeUsageStatus(r.inventorySkus, r.inventoryLimit)
                            : 'unknown'
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      {r.storageUsed != null ? (
                        <UsageMetricCell
                          used={r.storageUsed}
                          limit={r.storageLimit}
                          status={computeUsageStatus(r.storageUsed, r.storageLimit)}
                        />
                      ) : (
                        'Not available'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <UsageStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {onDiagnostics && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onDiagnostics(r.id, r.name)}
                          >
                            Diagnostics
                          </Button>
                        )}
                        {onChangePlan && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onChangePlan(r.id, r.name, 'RESTAURANT')}
                          >
                            Plan
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
