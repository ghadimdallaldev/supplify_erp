import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Building2,
  CreditCard,
  DollarSign,
  Edit,
  KeyRound,
  Loader2,
  Package,
  Search,
  Stethoscope,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { StatusBadge } from '../../ui/status-badge'
import { Input } from '../../ui/input'
import {
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useStartImpersonationMutation,
} from '../../../services/api'
import { AdminKpiCard } from '../AdminKpiCard'
import { AdminSectionHeader } from '../adminUi'
import { formatPlanDisplayName } from '../../../lib/planComparison'
import { formatCurrency } from '../../../utils/format'
import type { AdminTenantType } from '../../../lib/adminTenantSearch'
import type { AdminResetPasswordTarget } from '../AdminResetPasswordDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import type { OpenChangePlanFn } from './AdminChangePlanDialog'
import type { AdminTabKey } from './adminDashboardShared'
import { ADMIN_TENANT_PAGE_SIZE } from './adminDashboardShared'

export type AdminTenantsTabProps = {
  active: boolean
  initialTab?: string
  onOpenChangePlan: OpenChangePlanFn
  onPasswordReset: (target: AdminResetPasswordTarget) => void
  onTenantDiag: (target: { id: string; tenantType: AdminTenantType; name: string }) => void
  onNavigateTab: (tab: AdminTabKey) => void
}

export function AdminTenantsTab({
  active,
  initialTab,
  onOpenChangePlan,
  onPasswordReset,
  onTenantDiag,
}: AdminTenantsTabProps) {
  const { can } = usePermissions()
  const canResetPassword = can('ADMIN_SUPPORT')

  const [tenantSearch, setTenantSearch] = useState('')
  const [supplierListOffset, setSupplierListOffset] = useState(0)
  const [restaurantListOffset, setRestaurantListOffset] = useState(0)
  const [accumulatedSuppliers, setAccumulatedSuppliers] = useState<any[]>([])
  const [accumulatedRestaurants, setAccumulatedRestaurants] = useState<any[]>([])

  const {
    data: suppliersData,
    isLoading: suppliersLoading,
    error: suppliersError,
  } = useGetAdminSuppliersQuery(
    { limit: ADMIN_TENANT_PAGE_SIZE, offset: supplierListOffset },
    { skip: !active }
  )
  const {
    data: restaurantsData,
    isLoading: restaurantsLoading,
    error: restaurantsError,
  } = useGetAdminRestaurantsQuery(
    { limit: ADMIN_TENANT_PAGE_SIZE, offset: restaurantListOffset },
    { skip: !active }
  )

  const [startImpersonation] = useStartImpersonationMutation()

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

  const handleStartImpersonation = useCallback(
    async (
      tenantId: string,
      tenantType: 'RESTAURANT' | 'SUPPLIER',
      tenantLabel: string,
      acknowledgeSuspended = false
    ) => {
      try {
        const result = await startImpersonation({
          tenantId,
          tenantType,
          acknowledgeSuspended,
        }).unwrap()
        toast.success(`Impersonating ${tenantLabel}`)
        window.location.href = result.redirectTo || '/app/dashboard'
      } catch (err: unknown) {
        const e = err as {
          data?: {
            error?: {
              name?: string
              message?: string
              requiresAcknowledgement?: boolean
            }
          }
        }
        if (
          e?.data?.error?.name === 'TENANT_SUSPENDED' &&
          e?.data?.error?.requiresAcknowledgement &&
          !acknowledgeSuspended
        ) {
          const ok = window.confirm(
            `${e.data.error.message || 'This tenant is suspended or inactive.'}\n\nContinue impersonation for support?`
          )
          if (ok) {
            return handleStartImpersonation(tenantId, tenantType, tenantLabel, true)
          }
          return
        }
        toast.error(e?.data?.error?.message || 'Failed to start impersonation')
      }
    },
    [startImpersonation]
  )

  const openChangePlanForTenant = (
    subscriptionId: string | undefined,
    tenantType: 'RESTAURANT' | 'SUPPLIER',
    tenantName: string,
    entityLabel: string
  ) => {
    if (!subscriptionId) {
      toast.error(
        `No active subscription for this ${entityLabel}. Assign a plan from the Subscriptions tab.`
      )
      return
    }
    onOpenChangePlan({
      id: subscriptionId,
      tenant_type: tenantType,
      tenant_name: tenantName,
    })
  }

  const showSuppliersOnly = initialTab === 'suppliers'
  const showRestaurantsOnly = initialTab === 'restaurants'
  const q = tenantSearch.trim().toLowerCase()
  const filteredSuppliers =
    suppliersForUi?.filter((s: { name?: string; contact_email?: string }) => {
      if (!q) return true
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.contact_email || '').toLowerCase().includes(q)
      )
    }) ?? []
  const filteredRestaurants =
    restaurantsForUi?.filter((r: { name?: string; contact_email?: string }) => {
      if (!q) return true
      return (
        (r.name || '').toLowerCase().includes(q) ||
        (r.contact_email || '').toLowerCase().includes(q)
      )
    }) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {initialTab !== 'suppliers' && initialTab !== 'restaurants' ? (
          <AdminSectionHeader
            title="Tenant directory"
            description="Manage supplier and restaurant accounts"
          />
        ) : null}
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder={
              initialTab === 'suppliers'
                ? 'Search suppliers…'
                : initialTab === 'restaurants'
                  ? 'Search restaurants…'
                  : 'Search suppliers or restaurants…'
            }
            value={tenantSearch}
            onChange={(e) => setTenantSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {showSuppliersOnly && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <AdminKpiCard
              label="Suppliers"
              value={`${suppliersForUi?.length ?? 0} / ${suppliersTotal}`}
              icon={Building2}
              tone="brand"
            />
            <AdminKpiCard
              label="Active subs"
              value={
                suppliersForUi?.filter(
                  (s: { subscription_status?: string }) =>
                    s.subscription_status === 'ACTIVE' || s.subscription_status === 'TRIALING'
                ).length ?? 0
              }
              icon={CreditCard}
              tone="success"
            />
            <AdminKpiCard
              label="Total products"
              value={
                suppliersForUi?.reduce(
                  (sum, s) => sum + parseInt(String(s.product_count || 0), 10),
                  0
                ) ?? 0
              }
              icon={Package}
              tone="neutral"
            />
            <AdminKpiCard
              label="Revenue"
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
        )}
        {showRestaurantsOnly && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <AdminKpiCard
              label="Restaurants"
              value={`${restaurantsForUi?.length ?? 0} / ${restaurantsTotal}`}
              icon={Users}
              tone="brand"
            />
            <AdminKpiCard
              label="Active subs"
              value={
                restaurantsForUi?.filter(
                  (r: { subscription_status?: string }) =>
                    r.subscription_status === 'ACTIVE' || r.subscription_status === 'TRIALING'
                ).length ?? 0
              }
              icon={CreditCard}
              tone="success"
            />
            <AdminKpiCard
              label="Orders (30d)"
              value={
                restaurantsForUi?.reduce(
                  (sum, r) => sum + parseInt(String(r.orders_last_30d || 0), 10),
                  0
                ) ?? 0
              }
              icon={TrendingUp}
              tone="neutral"
            />
          </div>
        )}

        {!showRestaurantsOnly && (
          <Card>
            <CardHeader className="px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text)]">Suppliers</h3>
              <p className="text-sm text-[var(--text-muted)]">
                Manage supplier tenants and subscriptions
                {suppliersTotal > 0
                  ? ` (${suppliersForUi?.length ?? 0} of ${suppliersTotal} loaded)`
                  : ''}
              </p>
            </CardHeader>
            <CardContent>
              {suppliersError ? (
                <div className="p-4 bg-[var(--red-pale)] border border-[var(--red)]/30 rounded">
                  <p className="text-[var(--red)]">
                    Error loading suppliers. Check console for details.
                  </p>
                </div>
              ) : suppliersLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !filteredSuppliers.length ? (
                <p className="text-center py-8 text-[var(--text-muted)]">
                  {q ? 'No suppliers match your search' : 'No suppliers found'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--app-border)]">
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Supplier
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Plan
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Products
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Warehouses
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Revenue
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSuppliers.map((supplier: any) => (
                        <tr
                          key={supplier.id}
                          className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                        >
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium text-[var(--text)]">{supplier.name}</p>
                              <p className="text-sm text-[var(--text-muted)]">
                                {supplier.contact_email}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">
                              {formatPlanDisplayName(
                                (supplier as { plan_code?: string }).plan_code,
                                supplier.plan_name || 'Free Trial'
                              )}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={supplier.subscription_status || 'NONE'} />
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)]">
                            {supplier.product_count || 0}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)]">
                            {supplier.warehouse_count || 0}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)]">
                            {formatCurrency(supplier.total_revenue)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                title="Operational diagnostics"
                                onClick={() =>
                                  onTenantDiag({
                                    id: supplier.id,
                                    tenantType: 'SUPPLIER',
                                    name: supplier.name,
                                  })
                                }
                              >
                                <Stethoscope className="h-4 w-4 mr-1" />
                                Diagnostics
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                title="View as this supplier"
                                onClick={() =>
                                  handleStartImpersonation(supplier.id, 'SUPPLIER', supplier.name)
                                }
                              >
                                <UserCog className="h-4 w-4 mr-1" />
                                Impersonate
                              </Button>
                              {canResetPassword && supplier.contact_email && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Reset sign-in password"
                                  onClick={() =>
                                    onPasswordReset({
                                      email: supplier.contact_email,
                                      displayName: supplier.name,
                                    })
                                  }
                                >
                                  <KeyRound className="h-4 w-4 mr-1" />
                                  Password
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                title="Change plan"
                                onClick={() =>
                                  openChangePlanForTenant(
                                    (supplier as { subscription_id?: string }).subscription_id,
                                    'SUPPLIER',
                                    supplier.name,
                                    'supplier'
                                  )
                                }
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  openChangePlanForTenant(
                                    (supplier as { subscription_id?: string }).subscription_id,
                                    'SUPPLIER',
                                    supplier.name,
                                    'supplier'
                                  )
                                }
                              >
                                Change plan
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!suppliersLoading && (suppliersForUi?.length ?? 0) < suppliersTotal && (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSupplierListOffset((o) => o + ADMIN_TENANT_PAGE_SIZE)}
                  >
                    Load more suppliers
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!showSuppliersOnly && (
          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold text-[var(--text)]">Restaurants</h3>
              <p className="text-sm text-[var(--text-muted)]">
                Manage restaurant tenants and subscriptions
                {restaurantsTotal > 0
                  ? ` (${restaurantsForUi?.length ?? 0} of ${restaurantsTotal} loaded)`
                  : ''}
              </p>
            </CardHeader>
            <CardContent>
              {restaurantsError ? (
                <div className="p-4 bg-[var(--red-pale)] border border-[var(--red)]/30 rounded">
                  <p className="text-[var(--red)]">
                    Error loading restaurants. Check console for details.
                  </p>
                </div>
              ) : restaurantsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !filteredRestaurants.length ? (
                <p className="text-center py-8 text-[var(--text-muted)]">
                  {q ? 'No restaurants match your search' : 'No restaurants found'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--app-border)]">
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Restaurant
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Plan
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Orders (30d)
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Total Spent
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRestaurants.map((restaurant: any) => (
                        <tr
                          key={restaurant.id}
                          className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                        >
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium text-[var(--text)]">{restaurant.name}</p>
                              <p className="text-sm text-[var(--text-muted)]">
                                {restaurant.contact_email}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">
                              {formatPlanDisplayName(
                                (restaurant as { plan_code?: string }).plan_code,
                                restaurant.plan_name || 'Free Trial'
                              )}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={restaurant.subscription_status || 'NONE'} />
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)]">
                            {restaurant.orders_last_30d || 0}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)]">
                            {formatCurrency(restaurant.total_spent)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                title="Operational diagnostics"
                                onClick={() =>
                                  onTenantDiag({
                                    id: restaurant.id,
                                    tenantType: 'RESTAURANT',
                                    name: restaurant.name,
                                  })
                                }
                              >
                                <Stethoscope className="h-4 w-4 mr-1" />
                                Diagnostics
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                title="View as this restaurant"
                                onClick={() =>
                                  handleStartImpersonation(
                                    restaurant.id,
                                    'RESTAURANT',
                                    restaurant.name
                                  )
                                }
                              >
                                <UserCog className="h-4 w-4 mr-1" />
                                Impersonate
                              </Button>
                              {canResetPassword && restaurant.contact_email && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Reset sign-in password"
                                  onClick={() =>
                                    onPasswordReset({
                                      email: restaurant.contact_email,
                                      displayName: restaurant.name,
                                    })
                                  }
                                >
                                  <KeyRound className="h-4 w-4 mr-1" />
                                  Password
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                title="Change plan"
                                onClick={() =>
                                  openChangePlanForTenant(
                                    (restaurant as { subscription_id?: string }).subscription_id,
                                    'RESTAURANT',
                                    restaurant.name,
                                    'restaurant'
                                  )
                                }
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  openChangePlanForTenant(
                                    (restaurant as { subscription_id?: string }).subscription_id,
                                    'RESTAURANT',
                                    restaurant.name,
                                    'restaurant'
                                  )
                                }
                              >
                                Change plan
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!restaurantsLoading && (restaurantsForUi?.length ?? 0) < restaurantsTotal && (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRestaurantListOffset((o) => o + ADMIN_TENANT_PAGE_SIZE)}
                  >
                    Load more restaurants
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
