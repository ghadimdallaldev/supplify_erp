import { useMemo, useState } from 'react'
import type { SubscriptionPlan } from '../../types'
import { type UsageStatus } from '../../lib/adminUsageStatus'
import { computeUsageStatus } from '../../lib/adminUsageStatus'
import {
  buildRestaurantUsageRows,
  buildSupplierUsageRows,
  USAGE_STATUS_SORT_RANK,
} from '../../lib/adminTenantUsageMetrics'
import { formatPlanLimitDisplayValue } from '../../lib/adminPlanLimitLookup'
import { UsageProgressBar } from './UsageProgressBar'
import { UsageStatusBadge } from './UsageStatusBadge'
import { AdminEmptyState, AdminLoadingSkeleton } from './adminUi'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectTrigger } from '../ui/select'
import { TableScroll } from '../ui/table-scroll'

type SortKey = 'pressure' | 'name' | 'status'

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
      <div className="text-sm font-medium tabular-nums text-[var(--text)]">
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
  suppliers?: Array<Record<string, unknown>>
  restaurants?: Array<Record<string, unknown>>
  plans?: SubscriptionPlan[]
  isLoading?: boolean
  onDiagnostics?: (id: string, name: string) => void
  onChangePlan?: (id: string, name: string, tenantType: 'SUPPLIER' | 'RESTAURANT') => void
}) {
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<UsageStatus | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('pressure')

  const supplierRows = useMemo(() => buildSupplierUsageRows(suppliers, plans), [suppliers, plans])

  const restaurantRows = useMemo(
    () => buildRestaurantUsageRows(restaurants, plans),
    [restaurants, plans]
  )

  const filteredSuppliers = useMemo(() => {
    const matched = supplierRows.filter((row) => {
      if (search && !row.name.toLowerCase().includes(search.toLowerCase())) return false
      if (planFilter !== 'all' && row.planLabel !== planFilter) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      return true
    })
    return [...matched].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      if (sortKey === 'status') {
        const diff = USAGE_STATUS_SORT_RANK[a.status] - USAGE_STATUS_SORT_RANK[b.status]
        return diff !== 0 ? diff : b.pressureScore - a.pressureScore
      }
      const statusDiff = USAGE_STATUS_SORT_RANK[a.status] - USAGE_STATUS_SORT_RANK[b.status]
      if (statusDiff !== 0) return statusDiff
      return b.pressureScore - a.pressureScore
    })
  }, [supplierRows, search, planFilter, statusFilter, sortKey])

  const filteredRestaurants = useMemo(() => {
    const matched = restaurantRows.filter((row) => {
      if (search && !row.name.toLowerCase().includes(search.toLowerCase())) return false
      if (planFilter !== 'all' && row.planLabel !== planFilter) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      return true
    })
    return [...matched].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      if (sortKey === 'status') {
        const diff = USAGE_STATUS_SORT_RANK[a.status] - USAGE_STATUS_SORT_RANK[b.status]
        return diff !== 0 ? diff : b.pressureScore - a.pressureScore
      }
      const statusDiff = USAGE_STATUS_SORT_RANK[a.status] - USAGE_STATUS_SORT_RANK[b.status]
      if (statusDiff !== 0) return statusDiff
      return b.pressureScore - a.pressureScore
    })
  }, [restaurantRows, search, planFilter, statusFilter, sortKey])

  const rows = mode === 'supplier' ? supplierRows : restaurantRows
  const filtered = mode === 'supplier' ? filteredSuppliers : filteredRestaurants

  const planOptions = useMemo(() => {
    const codes = new Set(rows.map((r) => r.planLabel).filter((p) => p !== '—'))
    return Array.from(codes).sort()
  }, [rows])

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
          aria-label={`Search ${mode} tenants`}
        />
        <Select value={planFilter} onValueChange={(value) => setPlanFilter(value)}>
          <SelectTrigger className="w-auto" aria-label="Filter by plan">
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
          <SelectTrigger className="w-auto" aria-label="Filter by usage status">
            <option value="all">All statuses</option>
            <option value="healthy">Healthy</option>
            <option value="near_limit">Near limit</option>
            <option value="over_limit">Over limit</option>
            <option value="unlimited">Unlimited</option>
          </SelectTrigger>
        </Select>
        <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
          <SelectTrigger className="w-auto" aria-label="Sort tenants">
            <option value="pressure">Sort: usage pressure</option>
            <option value="status">Sort: worst status</option>
            <option value="name">Sort: name</option>
          </SelectTrigger>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <AdminEmptyState
          title="No matching tenants"
          description="Adjust filters or load more tenants to see usage data."
        />
      ) : mode === 'supplier' ? (
        <TableScroll aria-label="Supplier usage">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Products</th>
                <th className="px-4 py-3">Warehouses</th>
                <th className="px-4 py-3">Active deals</th>
                <th className="px-4 py-3">Storage</th>
                <th className="px-4 py-3">Usage status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--app-border)]">
              {filteredSuppliers.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-[var(--brand-ultra)]/35">
                  <td className="px-4 py-3.5 font-medium text-[var(--text)]">{s.name}</td>
                  <td className="px-4 py-3.5 text-sm text-[var(--text-mid)]">{s.planLabel}</td>
                  <td className="px-4 py-3.5">
                    <UsageMetricCell
                      used={s.productCount}
                      limit={s.productLimit}
                      status={s.productStatus}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <UsageMetricCell
                      used={s.warehouseCount}
                      limit={s.warehouseLimit}
                      status={s.warehouseStatus}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <UsageMetricCell
                      used={s.dealsCount}
                      limit={s.dealsLimit}
                      status={s.dealsStatus}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    {s.storageUsed != null ? (
                      <UsageMetricCell
                        used={s.storageUsed}
                        limit={s.storageLimit}
                        status={s.storageStatus}
                      />
                    ) : (
                      <span className="text-xs text-[var(--text-mid)]">Not available</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <UsageStatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      {onDiagnostics && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => onDiagnostics(s.id, s.name)}
                        >
                          Diagnostics
                        </Button>
                      )}
                      {onChangePlan && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => onChangePlan(s.id, s.name, 'SUPPLIER')}
                        >
                          Plan
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        <TableScroll aria-label="Restaurant usage">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-4 py-3">Restaurant</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Orders today</th>
                <th className="px-4 py-3">Orders (30d)</th>
                <th className="px-4 py-3">Suppliers</th>
                <th className="px-4 py-3">Inventory SKUs</th>
                <th className="px-4 py-3">Storage</th>
                <th className="px-4 py-3">Usage status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--app-border)]">
              {filteredRestaurants.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-[var(--brand-ultra)]/35">
                  <td className="px-4 py-3.5 font-medium text-[var(--text)]">{r.name}</td>
                  <td className="px-4 py-3.5 text-sm text-[var(--text-mid)]">{r.planLabel}</td>
                  <td className="px-4 py-3.5">
                    {r.ordersToday != null ? (
                      <UsageMetricCell
                        used={r.ordersToday}
                        limit={r.dailyLimit}
                        status={r.ordersTodayStatus}
                      />
                    ) : (
                      <span className="text-xs text-[var(--text-mid)]">Not available</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-[var(--text)]">{r.orders30d}</td>
                  <td className="px-4 py-3.5">
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
                  <td className="px-4 py-3.5">
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
                  <td className="px-4 py-3.5">
                    {r.storageUsed != null ? (
                      <UsageMetricCell
                        used={r.storageUsed}
                        limit={r.storageLimit}
                        status={computeUsageStatus(r.storageUsed, r.storageLimit)}
                      />
                    ) : (
                      <span className="text-xs text-[var(--text-mid)]">Not available</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <UsageStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      {onDiagnostics && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => onDiagnostics(r.id, r.name)}
                        >
                          Diagnostics
                        </Button>
                      )}
                      {onChangePlan && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => onChangePlan(r.id, r.name, 'RESTAURANT')}
                        >
                          Plan
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  )
}
