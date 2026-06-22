import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Filter, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '../../ui/button'
import { AppPanel, SummaryStrip } from '../../ui/app-panel'
import {
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useGetAdminPlansQuery,
  useGetAdminSubscriptionsQuery,
} from '../../../services/api'
import { AdminSectionHeader } from '../adminUi'
import { AdminTenantUsageTable } from '../AdminTenantUsageTable'
import { UsagePressureList } from '../UsagePressureList'
import {
  buildRestaurantUsageRows,
  buildSupplierUsageRows,
  buildUsagePressureList,
  computeUsagePlatformStats,
} from '../../../lib/adminTenantUsageMetrics'
import type { UsageStatus } from '../../../lib/adminUsageStatus'
import type { AdminTenantType } from '../../../lib/adminTenantSearch'
import type { OpenChangePlanFn } from './AdminChangePlanDialog'
import { ADMIN_TENANT_PAGE_SIZE, dedupeAdminPlans } from './adminDashboardShared'

function usageStatusLabel(status: UsageStatus, t: (key: string) => string): string {
  switch (status) {
    case 'near_limit':
      return t('usageStatus.nearLimit')
    case 'over_limit':
      return t('usageStatus.overLimit')
    case 'healthy':
      return t('usageStatus.healthy')
    case 'unlimited':
      return t('usageStatus.unlimited')
    case 'unknown':
      return t('usageStatus.unknown')
  }
}

export type AdminUsageTabProps = {
  active: boolean
  initialTab?: string
  onOpenChangePlan: OpenChangePlanFn
  onTenantDiag: (target: { id: string; tenantType: AdminTenantType; name: string }) => void
}

export function AdminUsageTab({
  active,
  initialTab,
  onOpenChangePlan,
  onTenantDiag,
}: AdminUsageTabProps) {
  const { t } = useTranslation('admin')
  const [supplierListOffset, setSupplierListOffset] = useState(0)
  const [restaurantListOffset, setRestaurantListOffset] = useState(0)
  const [accumulatedSuppliers, setAccumulatedSuppliers] = useState<any[]>([])
  const [accumulatedRestaurants, setAccumulatedRestaurants] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState<UsageStatus | 'all'>('all')

  const showSuppliersOnly = initialTab === 'suppliers'
  const showRestaurantsOnly = initialTab === 'restaurants'
  const showOverview = !showSuppliersOnly && !showRestaurantsOnly

  const { data: plansData } = useGetAdminPlansQuery({}, { skip: !active })
  const { data: subscriptionsData } = useGetAdminSubscriptionsQuery({}, { skip: !active })

  const {
    data: suppliersData,
    isLoading: suppliersLoading,
    isFetching: suppliersFetching,
    refetch: refetchSuppliers,
  } = useGetAdminSuppliersQuery(
    { limit: ADMIN_TENANT_PAGE_SIZE, offset: supplierListOffset },
    { skip: !active || showRestaurantsOnly }
  )
  const {
    data: restaurantsData,
    isLoading: restaurantsLoading,
    isFetching: restaurantsFetching,
    refetch: refetchRestaurants,
  } = useGetAdminRestaurantsQuery(
    { limit: ADMIN_TENANT_PAGE_SIZE, offset: restaurantListOffset },
    { skip: !active || showSuppliersOnly }
  )

  const plans = useMemo(() => dedupeAdminPlans(plansData?.plans), [plansData?.plans])

  const subscriptions = useMemo(
    () =>
      subscriptionsData?.subscriptions?.filter(
        (s, i, arr) =>
          arr.findIndex((x) => x.tenant_id === s.tenant_id && x.tenant_type === s.tenant_type) === i
      ) ?? [],
    [subscriptionsData?.subscriptions]
  )

  useEffect(() => {
    if (!suppliersData?.suppliers) return
    setAccumulatedSuppliers((prev) => {
      if (supplierListOffset === 0) return suppliersData.suppliers
      const ids = new Set(prev.map((s) => s.id))
      return [...prev, ...suppliersData.suppliers.filter((s: { id: string }) => !ids.has(s.id))]
    })
  }, [suppliersData, supplierListOffset])

  useEffect(() => {
    if (!restaurantsData?.restaurants) return
    setAccumulatedRestaurants((prev) => {
      if (restaurantListOffset === 0) return restaurantsData.restaurants
      const ids = new Set(prev.map((r) => r.id))
      return [...prev, ...restaurantsData.restaurants.filter((r: { id: string }) => !ids.has(r.id))]
    })
  }, [restaurantsData, restaurantListOffset])

  const suppliersForUi = accumulatedSuppliers.length
    ? accumulatedSuppliers
    : suppliersData?.suppliers
  const restaurantsForUi = accumulatedRestaurants.length
    ? accumulatedRestaurants
    : restaurantsData?.restaurants
  const suppliersTotal = suppliersData?.total ?? suppliersForUi?.length ?? 0
  const restaurantsTotal = restaurantsData?.total ?? restaurantsForUi?.length ?? 0

  const supplierRows = useMemo(
    () => buildSupplierUsageRows(suppliersForUi ?? [], plans),
    [suppliersForUi, plans]
  )
  const restaurantRows = useMemo(
    () => buildRestaurantUsageRows(restaurantsForUi ?? [], plans),
    [restaurantsForUi, plans]
  )

  const stats = useMemo(
    () => computeUsagePlatformStats(supplierRows, restaurantRows, suppliersTotal, restaurantsTotal),
    [supplierRows, restaurantRows, suppliersTotal, restaurantsTotal]
  )

  const pressureList = useMemo(
    () => buildUsagePressureList(supplierRows, restaurantRows, 12),
    [supplierRows, restaurantRows]
  )

  const isFetching = suppliersFetching || restaurantsFetching
  const isLoading = suppliersLoading || restaurantsLoading

  const handleRefresh = () => {
    setSupplierListOffset(0)
    setRestaurantListOffset(0)
    setAccumulatedSuppliers([])
    setAccumulatedRestaurants([])
    refetchSuppliers()
    refetchRestaurants()
  }

  const handleChangePlan = useCallback(
    (tenantId: string, name: string, tenantType: 'SUPPLIER' | 'RESTAURANT') => {
      const sub = subscriptions.find(
        (s) => s.tenant_id === tenantId && s.tenant_type === tenantType
      )
      if (sub) {
        onOpenChangePlan({
          id: sub.id,
          tenant_type: tenantType,
          tenant_name: name,
        })
      }
    },
    [subscriptions, onOpenChangePlan]
  )

  const headerTitle = showSuppliersOnly
    ? t('usage.tab.title.suppliers')
    : showRestaurantsOnly
      ? t('usage.tab.title.restaurants')
      : t('usage.tab.title.overview')
  const headerDescription = showSuppliersOnly
    ? t('usage.tab.description.suppliers')
    : showRestaurantsOnly
      ? t('usage.tab.description.restaurants')
      : t('usage.tab.description.overview')

  const metricDimensions = showSuppliersOnly
    ? t('usage.tab.metricDimensions.suppliers')
    : showRestaurantsOnly
      ? t('usage.tab.metricDimensions.restaurants')
      : t('usage.tab.metricDimensions.overview')

  const filteredSuppliers =
    statusFilter === 'all'
      ? (suppliersForUi ?? [])
      : (suppliersForUi ?? []).filter((s) => {
          const row = supplierRows.find((r) => r.id === s.id)
          return row?.status === statusFilter
        })

  const filteredRestaurants =
    statusFilter === 'all'
      ? (restaurantsForUi ?? [])
      : (restaurantsForUi ?? []).filter((r) => {
          const row = restaurantRows.find((x) => x.id === r.id)
          return row?.status === statusFilter
        })

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title={headerTitle}
        description={headerDescription}
        action={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        }
      />

      {!isLoading && (
        <SummaryStrip
          testId="admin-usage-stats"
          columns={showOverview ? 6 : 5}
          metrics={[
            ...(showOverview
              ? [
                  {
                    label: t('usage.tab.metrics.loadedTenants'),
                    value: stats.loadedTotal,
                    hint: t('usage.tab.metrics.loadedTenantsHint', {
                      supplierCount: stats.supplierCount,
                      restaurantCount: stats.restaurantCount,
                      platformTotal: stats.platformTotal,
                    }),
                  },
                ]
              : showSuppliersOnly
                ? [
                    {
                      label: t('usage.tab.metrics.suppliersLoaded'),
                      value: `${stats.supplierCount} / ${suppliersTotal}`,
                      hint: t('usage.tab.metrics.paginateHint'),
                      tone: 'brand' as const,
                    },
                  ]
                : [
                    {
                      label: t('usage.tab.metrics.restaurantsLoaded'),
                      value: `${stats.restaurantCount} / ${restaurantsTotal}`,
                      hint: t('usage.tab.metrics.paginateHint'),
                      tone: 'brand' as const,
                    },
                  ]),
            {
              label: t('usage.tab.metrics.needsAttention'),
              value: stats.needsAttention,
              tone: stats.needsAttention > 0 ? 'amber' : 'default',
              hint: t('usage.tab.metrics.needsAttentionHint'),
              active: statusFilter === 'near_limit' || statusFilter === 'over_limit',
              onClick: () =>
                setStatusFilter((f) =>
                  f === 'near_limit' || f === 'over_limit' ? 'all' : 'near_limit'
                ),
            },
            {
              label: t('usageStatus.overLimit'),
              value: stats.overLimit,
              tone: stats.overLimit > 0 ? 'danger' : 'default',
              hint: t('usage.tab.metrics.overLimitHint'),
              active: statusFilter === 'over_limit',
              onClick: () => setStatusFilter((f) => (f === 'over_limit' ? 'all' : 'over_limit')),
            },
            {
              label: t('usageStatus.nearLimit'),
              value: stats.nearLimit,
              tone: stats.nearLimit > 0 ? 'amber' : 'default',
              hint: t('usage.tab.metrics.nearLimitHint'),
              active: statusFilter === 'near_limit',
              onClick: () => setStatusFilter((f) => (f === 'near_limit' ? 'all' : 'near_limit')),
            },
            {
              label: t('usageStatus.healthy'),
              value: stats.healthy,
              tone: 'mint',
              hint: t('usage.tab.metrics.healthyHint'),
              active: statusFilter === 'healthy',
              onClick: () => setStatusFilter((f) => (f === 'healthy' ? 'all' : 'healthy')),
            },
            {
              label: t('usage.tab.metrics.metricsTracked'),
              value: showOverview ? 9 : showSuppliersOnly ? 4 : 5,
              hint: metricDimensions,
            },
          ]}
        />
      )}

      {statusFilter !== 'all' && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm">
          <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span>
            {t('usage.tab.filteringBy')} <strong>{usageStatusLabel(statusFilter, t)}</strong>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={() => setStatusFilter('all')}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            {t('usage.tab.clearFilter')}
          </Button>
        </div>
      )}

      {showOverview && !isLoading && (
        <AppPanel
          title={t('usage.tenantsUnderPressure')}
          description={t('usage.tab.pressureDescription', { count: pressureList.length })}
          testId="admin-usage-pressure-panel"
        >
          <UsagePressureList
            entries={pressureList}
            onDiagnostics={onTenantDiag}
            onChangePlan={handleChangePlan}
          />
        </AppPanel>
      )}

      {(showOverview || showSuppliersOnly) && (
        <AppPanel
          title={
            showOverview
              ? t('usage.tab.supplierPanel.titleOverview')
              : t('usage.tab.supplierPanel.titleAll')
          }
          description={
            suppliersLoading
              ? t('usage.tab.supplierPanel.loading')
              : t('usage.tab.supplierPanel.shown', {
                  count: filteredSuppliers.length,
                  metrics: t('usage.tab.supplierPanel.metricsShort'),
                })
          }
          testId="admin-usage-suppliers-panel"
          footer={
            !suppliersLoading && (suppliersForUi?.length ?? 0) < suppliersTotal ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSupplierListOffset((o) => o + ADMIN_TENANT_PAGE_SIZE)}
                  disabled={suppliersFetching}
                >
                  {suppliersFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('usage.tab.supplierPanel.loadMore', {
                    loaded: suppliersForUi?.length ?? 0,
                    total: suppliersTotal,
                  })}
                </Button>
              </div>
            ) : undefined
          }
        >
          <AdminTenantUsageTable
            mode="supplier"
            suppliers={filteredSuppliers}
            plans={plans}
            isLoading={suppliersLoading}
            onDiagnostics={(id, name) => onTenantDiag({ id, tenantType: 'SUPPLIER', name })}
            onChangePlan={handleChangePlan}
          />
        </AppPanel>
      )}

      {(showOverview || showRestaurantsOnly) && (
        <AppPanel
          title={
            showOverview
              ? t('usage.tab.restaurantPanel.titleOverview')
              : t('usage.tab.restaurantPanel.titleAll')
          }
          description={
            restaurantsLoading
              ? t('usage.tab.restaurantPanel.loading')
              : t('usage.tab.restaurantPanel.shown', { count: filteredRestaurants.length })
          }
          testId="admin-usage-restaurants-panel"
          footer={
            !restaurantsLoading && (restaurantsForUi?.length ?? 0) < restaurantsTotal ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRestaurantListOffset((o) => o + ADMIN_TENANT_PAGE_SIZE)}
                  disabled={restaurantsFetching}
                >
                  {restaurantsFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('usage.tab.restaurantPanel.loadMore', {
                    loaded: restaurantsForUi?.length ?? 0,
                    total: restaurantsTotal,
                  })}
                </Button>
              </div>
            ) : undefined
          }
        >
          <AdminTenantUsageTable
            mode="restaurant"
            restaurants={filteredRestaurants}
            plans={plans}
            isLoading={restaurantsLoading}
            onDiagnostics={(id, name) => onTenantDiag({ id, tenantType: 'RESTAURANT', name })}
            onChangePlan={handleChangePlan}
          />
        </AppPanel>
      )}
    </div>
  )
}
