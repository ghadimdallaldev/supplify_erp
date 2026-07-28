import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('admin')
  if (used == null) {
    return <span className="text-xs text-[var(--text-muted)]">{t('common.notAvailable')}</span>
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
  const { t } = useTranslation('admin')
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
          placeholder={
            mode === 'supplier'
              ? t('usage.searchSuppliersPlaceholder')
              : t('usage.searchRestaurantsPlaceholder')
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-xs text-sm"
          aria-label={t('usage.searchTenantsAriaLabel', { mode })}
        />
        <Select value={planFilter} onValueChange={(value) => setPlanFilter(value)}>
          <SelectTrigger className="w-auto" aria-label={t('usage.filterByPlanAriaLabel')}>
            <option value="all">{t('common.allPlans')}</option>
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
          <SelectTrigger className="w-auto" aria-label={t('usage.filterByUsageStatusAriaLabel')}>
            <option value="all">{t('common.allStatuses')}</option>
            <option value="healthy">{t('common.usageFilter.healthy')}</option>
            <option value="near_limit">{t('common.usageFilter.nearLimit')}</option>
            <option value="over_limit">{t('common.usageFilter.overLimit')}</option>
            <option value="unlimited">{t('common.usageFilter.unlimited')}</option>
          </SelectTrigger>
        </Select>
        <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
          <SelectTrigger className="w-auto" aria-label={t('usage.sortTenantsAriaLabel')}>
            <option value="pressure">{t('common.sort.pressure')}</option>
            <option value="status">{t('common.sort.status')}</option>
            <option value="name">{t('common.sort.name')}</option>
          </SelectTrigger>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <AdminEmptyState
          title={t('usage.noMatchingTenantsTitle')}
          description={t('usage.noMatchingTenantsDescription')}
        />
      ) : mode === 'supplier' ? (
        <>
          <div className="space-y-3 lg:hidden">
            {filteredSuppliers.map((s) => (
              <article
                key={s.id}
                className="rounded-xl border border-[var(--app-border)] p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{s.name}</p>
                  <UsageStatusBadge status={s.status} />
                </div>
                <p className="text-xs text-[var(--text-mid)]">{s.planLabel}</p>
              </article>
            ))}
          </div>
          <TableScroll
            aria-label={t('usage.supplierUsageTableAriaLabel')}
            className="hidden lg:block"
          >
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-start text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-3">{t('common.supplier')}</th>
                  <th className="px-4 py-3">{t('common.table.plan')}</th>
                  <th className="px-4 py-3">{t('common.table.products')}</th>
                  <th className="px-4 py-3">{t('common.table.warehouses')}</th>
                  <th className="px-4 py-3">{t('common.table.activeDeals')}</th>
                  <th className="px-4 py-3">{t('common.table.storage')}</th>
                  <th className="px-4 py-3">{t('common.table.usageStatus')}</th>
                  <th className="px-4 py-3 text-end">{t('common.table.actions')}</th>
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
                        <span className="text-xs text-[var(--text-mid)]">
                          {t('common.notAvailable')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <UsageStatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3.5 text-end">
                      <div className="flex justify-end gap-1.5">
                        {onDiagnostics && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => onDiagnostics(s.id, s.name)}
                          >
                            {t('common.tooltips.diagnostics')}
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
                            {t('common.table.plan')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {filteredRestaurants.map((r) => (
              <article
                key={r.id}
                className="rounded-xl border border-[var(--app-border)] p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{r.name}</p>
                  <UsageStatusBadge status={r.status} />
                </div>
                <p className="text-xs text-[var(--text-mid)]">{r.planLabel}</p>
              </article>
            ))}
          </div>
          <TableScroll
            aria-label={t('usage.restaurantUsageTableAriaLabel')}
            className="hidden lg:block"
          >
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-start text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-3">{t('common.restaurant')}</th>
                  <th className="px-4 py-3">{t('common.table.plan')}</th>
                  <th className="px-4 py-3">{t('common.table.ordersToday')}</th>
                  <th className="px-4 py-3">{t('common.table.orders30d')}</th>
                  <th className="px-4 py-3">{t('common.table.suppliers')}</th>
                  <th className="px-4 py-3">{t('common.table.inventorySkus')}</th>
                  <th className="px-4 py-3">{t('common.table.storage')}</th>
                  <th className="px-4 py-3">Usage status</th>
                  <th className="px-4 py-3 text-end">{t('common.table.actions')}</th>
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
                        <span className="text-xs text-[var(--text-mid)]">
                          {t('common.notAvailable')}
                        </span>
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
                        <span className="text-xs text-[var(--text-mid)]">
                          {t('common.notAvailable')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <UsageStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3.5 text-end">
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
        </>
      )}
    </div>
  )
}
