import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Building2,
  DollarSign,
  Loader2,
  Package,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import {
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useGetAdminPlansQuery,
  useGetAdminSubscriptionsQuery,
} from '../../../services/api'
import { AdminKpiCard } from '../AdminKpiCard'
import { AdminSectionHeader } from '../adminUi'
import { AdminTenantUsageTable } from '../AdminTenantUsageTable'
import { resolvePlanLimitFromCatalog } from '../../../lib/adminPlanLimitLookup'
import { formatCurrency } from '../../../utils/format'
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

  const { data: plansData } = useGetAdminPlansQuery({}, { skip: !active })
  const { data: subscriptionsData } = useGetAdminSubscriptionsQuery({}, { skip: !active })

  const { data: suppliersData, isLoading: suppliersLoading } = useGetAdminSuppliersQuery(
    { limit: ADMIN_TENANT_PAGE_SIZE, offset: supplierListOffset },
    { skip: !active }
  )
  const { data: restaurantsData, isLoading: restaurantsLoading } = useGetAdminRestaurantsQuery(
    { limit: ADMIN_TENANT_PAGE_SIZE, offset: restaurantListOffset },
    { skip: !active }
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

  const supplierProductLimit = useCallback(
    (planCode: string | null | undefined) =>
      resolvePlanLimitFromCatalog(plans, 'SUPPLIER', planCode, 'supplier_products_skus'),
    [plans]
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

  const handleChangePlan = (
    tenantId: string,
    name: string,
    tenantType: 'SUPPLIER' | 'RESTAURANT'
  ) => {
    const sub = subscriptions.find((s) => s.tenant_id === tenantId && s.tenant_type === tenantType)
    if (sub) {
      onOpenChangePlan({
        id: sub.id,
        tenant_type: tenantType,
        tenant_name: name,
      })
    }
  }

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title={
          initialTab === 'suppliers'
            ? 'Supplier Usage & Quotas'
            : initialTab === 'restaurants'
              ? 'Restaurant Usage & Quotas'
              : 'Usage & Quotas'
        }
        description="Monitor tenant resource usage against plan limits"
      />

      {initialTab === 'suppliers' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <AdminKpiCard
              label="Total products"
              value={
                suppliersForUi?.reduce(
                  (sum, s) => sum + parseInt(String(s.product_count || 0), 10),
                  0
                ) ?? 0
              }
              icon={Package}
              tone="brand"
            />
            <AdminKpiCard
              label="Loaded suppliers"
              value={`${suppliersForUi?.length ?? 0} / ${suppliersTotal}`}
              description="Paginate below to load more"
              icon={Building2}
              tone="success"
            />
            <AdminKpiCard
              label="Over limit"
              value={
                suppliersForUi?.filter((s) => {
                  const limit = supplierProductLimit(s.plan_code ?? s.plan_name)
                  if (limit == null || limit === -1) return false
                  return parseInt(String(s.product_count || 0), 10) > limit
                }).length ?? 0
              }
              icon={AlertCircle}
              tone="danger"
            />
            <AdminKpiCard
              label="Total revenue"
              value={formatCurrency(
                suppliersForUi?.reduce(
                  (sum, s) => sum + parseFloat(String(s.total_revenue || 0)),
                  0
                )
              )}
              icon={DollarSign}
              tone="neutral"
            />
          </div>
          <Card className="p-4">
            <CardHeader className="px-0 pb-3 pt-0">
              <CardTitle className="text-sm font-semibold">Supplier usage table</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-0">
              <AdminTenantUsageTable
                mode="supplier"
                suppliers={suppliersForUi ?? []}
                plans={plans}
                isLoading={suppliersLoading}
                onDiagnostics={(id, name) => onTenantDiag({ id, tenantType: 'SUPPLIER', name })}
                onChangePlan={handleChangePlan}
              />
              {!suppliersLoading && (suppliersForUi?.length ?? 0) < suppliersTotal && (
                <div className="mt-3 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSupplierListOffset((o) => o + ADMIN_TENANT_PAGE_SIZE)}
                  >
                    Load more suppliers
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {initialTab === 'restaurants' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <AdminKpiCard
              label="30-day orders"
              value={
                restaurantsForUi?.reduce(
                  (sum, r) => sum + parseInt(String(r.orders_last_30d || 0), 10),
                  0
                ) ?? 0
              }
              icon={TrendingUp}
              tone="brand"
            />
            <AdminKpiCard
              label="Loaded restaurants"
              value={`${restaurantsForUi?.length ?? 0} / ${restaurantsTotal}`}
              description="Paginate below to load more"
              icon={Users}
              tone="success"
            />
            <AdminKpiCard
              label="Lifetime spend"
              value={formatCurrency(
                restaurantsForUi?.reduce(
                  (sum, r) => sum + parseFloat(String(r.total_spent || 0)),
                  0
                )
              )}
              description="Loaded tenants only (lifetime delivered)"
              icon={DollarSign}
              tone="neutral"
            />
          </div>
          <Card className="p-4">
            <CardHeader className="px-0 pb-3 pt-0">
              <CardTitle className="text-sm font-semibold">Restaurant usage table</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-0">
              <AdminTenantUsageTable
                mode="restaurant"
                restaurants={restaurantsForUi ?? []}
                plans={plans}
                isLoading={restaurantsLoading}
                onDiagnostics={(id, name) => onTenantDiag({ id, tenantType: 'RESTAURANT', name })}
                onChangePlan={handleChangePlan}
              />
              {!restaurantsLoading && (restaurantsForUi?.length ?? 0) < restaurantsTotal && (
                <div className="mt-3 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRestaurantListOffset((o) => o + ADMIN_TENANT_PAGE_SIZE)}
                  >
                    Load more restaurants
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {initialTab !== 'suppliers' && initialTab !== 'restaurants' && (
        <>
          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold text-[var(--text)]">Platform usage overview</h3>
              <p className="text-sm text-[var(--text-muted)]">
                Aggregated usage across all suppliers and restaurants. Use Supplier Admin or
                Restaurant Admin for per-tenant detail.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[var(--text-muted)]">Suppliers</span>
                    <Building2 className="h-4 w-4 text-[var(--brand-mid)]" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {suppliersData?.suppliers?.length ?? 0}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Total products:{' '}
                    {suppliersData?.suppliers?.reduce(
                      (sum, s) => sum + parseInt(s.product_count || 0),
                      0
                    ) ?? 0}
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[var(--text-muted)]">Restaurants</span>
                    <Users className="h-4 w-4 text-[var(--mint)]" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {restaurantsData?.restaurants?.length ?? 0}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    30-day orders:{' '}
                    {restaurantsData?.restaurants?.reduce(
                      (sum, r) => sum + parseInt(r.orders_last_30d || 0),
                      0
                    ) ?? 0}
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[var(--text-muted)]">Suppliers over limit</span>
                    <AlertCircle className="h-4 w-4 text-[var(--red)]" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {suppliersData?.suppliers?.filter((s) => {
                      const limit = supplierProductLimit(s.plan_code ?? s.plan_name) ?? 1000
                      if (limit === -1) return false
                      return parseInt(s.product_count || 0) > limit
                    }).length ?? 0}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Product limit exceeded</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[var(--text-muted)]">Restaurant spend (30d)</span>
                    <DollarSign className="h-4 w-4 text-[var(--mint)]" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {formatCurrency(
                      restaurantsData?.restaurants?.reduce(
                        (sum, r) => sum + parseFloat(r.total_spent || 0),
                        0
                      )
                    )}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Across all restaurants</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {(suppliersLoading || restaurantsLoading) && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading usage data…
            </div>
          )}
        </>
      )}
    </div>
  )
}
