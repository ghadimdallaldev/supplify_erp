import { useCallback, useEffect, useMemo, useState } from 'react'
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
    ? 'Supplier usage & quotas'
    : showRestaurantsOnly
      ? 'Restaurant usage & quotas'
      : 'Usage & quotas'
  const headerDescription = showSuppliersOnly
    ? 'Product, warehouse, deal, and storage usage vs plan limits for each supplier.'
    : showRestaurantsOnly
      ? 'Daily orders, supplier connections, inventory, and storage vs plan limits.'
      : 'Monitor quota pressure across suppliers and restaurants — who needs an upgrade or limit review.'

  const metricDimensions = showSuppliersOnly
    ? '4 metrics per supplier (products, warehouses, deals, storage)'
    : showRestaurantsOnly
      ? '5 metrics per restaurant (orders today, 30d volume, suppliers, inventory, storage)'
      : '9 metrics tracked (4 supplier + 5 restaurant dimensions)'

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
                    label: 'Loaded tenants',
                    value: stats.loadedTotal,
                    hint: `${stats.supplierCount} suppliers · ${stats.restaurantCount} restaurants of ${stats.platformTotal} total`,
                  },
                ]
              : showSuppliersOnly
                ? [
                    {
                      label: 'Suppliers loaded',
                      value: `${stats.supplierCount} / ${suppliersTotal}`,
                      hint: 'Paginate below for more',
                      tone: 'brand' as const,
                    },
                  ]
                : [
                    {
                      label: 'Restaurants loaded',
                      value: `${stats.restaurantCount} / ${restaurantsTotal}`,
                      hint: 'Paginate below for more',
                      tone: 'brand' as const,
                    },
                  ]),
            {
              label: 'Needs attention',
              value: stats.needsAttention,
              tone: stats.needsAttention > 0 ? 'amber' : 'default',
              hint: 'Near or over limit',
              active: statusFilter === 'near_limit' || statusFilter === 'over_limit',
              onClick: () =>
                setStatusFilter((f) =>
                  f === 'near_limit' || f === 'over_limit' ? 'all' : 'near_limit'
                ),
            },
            {
              label: 'Over limit',
              value: stats.overLimit,
              tone: stats.overLimit > 0 ? 'danger' : 'default',
              hint: 'Exceeds plan quota',
              active: statusFilter === 'over_limit',
              onClick: () => setStatusFilter((f) => (f === 'over_limit' ? 'all' : 'over_limit')),
            },
            {
              label: 'Near limit',
              value: stats.nearLimit,
              tone: stats.nearLimit > 0 ? 'amber' : 'default',
              hint: '≥80% of quota',
              active: statusFilter === 'near_limit',
              onClick: () => setStatusFilter((f) => (f === 'near_limit' ? 'all' : 'near_limit')),
            },
            {
              label: 'Healthy',
              value: stats.healthy,
              tone: 'mint',
              hint: 'Under 80% utilization',
              active: statusFilter === 'healthy',
              onClick: () => setStatusFilter((f) => (f === 'healthy' ? 'all' : 'healthy')),
            },
            {
              label: 'Metrics tracked',
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
            Filtering loaded tenants by <strong>{statusFilter.replace(/_/g, ' ')}</strong>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={() => setStatusFilter('all')}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      )}

      {showOverview && !isLoading && (
        <AppPanel
          title="Tenants under pressure"
          description={`Top ${pressureList.length} loaded tenant${pressureList.length === 1 ? '' : 's'} closest to or over plan limits`}
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
          title={showOverview ? 'Supplier usage' : 'All suppliers'}
          description={
            suppliersLoading
              ? 'Loading supplier usage…'
              : `${filteredSuppliers.length} supplier${filteredSuppliers.length === 1 ? '' : 's'} shown · ${metricDimensions.split('(')[0].trim()}`
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
                  Load more suppliers ({suppliersForUi?.length ?? 0} / {suppliersTotal})
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
          title={showOverview ? 'Restaurant usage' : 'All restaurants'}
          description={
            restaurantsLoading
              ? 'Loading restaurant usage…'
              : `${filteredRestaurants.length} restaurant${filteredRestaurants.length === 1 ? '' : 's'} shown · orders, suppliers, inventory, storage`
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
                  Load more restaurants ({restaurantsForUi?.length ?? 0} / {restaurantsTotal})
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
