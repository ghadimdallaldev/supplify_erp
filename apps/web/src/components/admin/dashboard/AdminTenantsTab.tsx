import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Building2,
  Edit,
  Filter,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  Stethoscope,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { StatusBadge } from '../../ui/status-badge'
import { Input } from '../../ui/input'
import { Select, SelectTrigger } from '../../ui/select'
import { AppPanel, SummaryStrip } from '../../ui/app-panel'
import { TableScroll } from '../../ui/table-scroll'
import { responsiveDataListClasses } from '../../ui/responsive-data-list'
import {
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useStartImpersonationMutation,
} from '../../../services/api'
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSkeleton,
  AdminSectionHeader,
  AdminTooltip,
  TooltipProvider,
} from '../adminUi'
import { formatPlanDisplayName } from '../../../lib/planComparison'
import { formatCurrency } from '../../../utils/format'
import { cn } from '../../../lib/utils'
import type { AdminTenantType } from '../../../lib/adminTenantSearch'
import type { AdminResetPasswordTarget } from '../AdminResetPasswordDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import type { OpenChangePlanFn } from './AdminChangePlanDialog'
import type { AdminTabKey } from './adminDashboardShared'
import { ADMIN_TENANT_PAGE_SIZE } from './adminDashboardShared'

type TenantRow = {
  id: string
  name?: string
  contact_email?: string
  plan_code?: string
  plan_name?: string
  subscription_status?: string
  subscription_id?: string
  product_count?: number | string
  warehouse_count?: number | string
  total_revenue?: number | string
  orders_last_30d?: number | string
  total_spent?: number | string
}

export type AdminTenantsTabProps = {
  active: boolean
  initialTab?: string
  onOpenChangePlan: OpenChangePlanFn
  onPasswordReset: (target: AdminResetPasswordTarget) => void
  onTenantDiag: (target: { id: string; tenantType: AdminTenantType; name: string }) => void
  onNavigateTab: (tab: AdminTabKey) => void
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIALING', label: 'Trialing' },
  { value: 'PAST_DUE', label: 'Past due' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NONE', label: 'No subscription' },
]

function matchesSearch(row: TenantRow, q: string): boolean {
  if (!q) return true
  return (
    (row.name || '').toLowerCase().includes(q) ||
    (row.contact_email || '').toLowerCase().includes(q)
  )
}

function matchesStatus(row: TenantRow, statusFilter: string): boolean {
  if (statusFilter === 'all') return true
  const status = row.subscription_status || 'NONE'
  return status === statusFilter
}

export function AdminTenantsTab({
  active,
  initialTab,
  onOpenChangePlan,
  onPasswordReset,
  onTenantDiag,
}: AdminTenantsTabProps) {
  const { t } = useTranslation('admin')
  const { can } = usePermissions()
  const canResetPassword = can('ADMIN_SUPPORT')

  const [tenantSearch, setTenantSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [supplierListOffset, setSupplierListOffset] = useState(0)
  const [restaurantListOffset, setRestaurantListOffset] = useState(0)
  const [accumulatedSuppliers, setAccumulatedSuppliers] = useState<TenantRow[]>([])
  const [accumulatedRestaurants, setAccumulatedRestaurants] = useState<TenantRow[]>([])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(tenantSearch.trim().toLowerCase()), 300)
    return () => window.clearTimeout(t)
  }, [tenantSearch])

  const {
    data: suppliersData,
    isLoading: suppliersLoading,
    isFetching: suppliersFetching,
    error: suppliersError,
    refetch: refetchSuppliers,
  } = useGetAdminSuppliersQuery(
    { limit: ADMIN_TENANT_PAGE_SIZE, offset: supplierListOffset },
    { skip: !active }
  )
  const {
    data: restaurantsData,
    isLoading: restaurantsLoading,
    isFetching: restaurantsFetching,
    error: restaurantsError,
    refetch: refetchRestaurants,
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
    : (suppliersData?.suppliers as TenantRow[] | undefined)
  const restaurantsForUi = accumulatedRestaurants.length
    ? accumulatedRestaurants
    : (restaurantsData?.restaurants as TenantRow[] | undefined)
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
        window.location.assign(result.redirectTo || '/app/dashboard')
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

  const filteredSuppliers = useMemo(
    () =>
      suppliersForUi?.filter(
        (s) => matchesSearch(s, debouncedSearch) && matchesStatus(s, statusFilter)
      ) ?? [],
    [suppliersForUi, debouncedSearch, statusFilter]
  )

  const filteredRestaurants = useMemo(
    () =>
      restaurantsForUi?.filter(
        (r) => matchesSearch(r, debouncedSearch) && matchesStatus(r, statusFilter)
      ) ?? [],
    [restaurantsForUi, debouncedSearch, statusFilter]
  )

  const hasActiveFilters = Boolean(debouncedSearch) || statusFilter !== 'all'

  const clearFilters = () => {
    setTenantSearch('')
    setDebouncedSearch('')
    setStatusFilter('all')
  }

  const activeSubsCount = useMemo(() => {
    const all = [...(suppliersForUi ?? []), ...(restaurantsForUi ?? [])]
    return all.filter(
      (t) => t.subscription_status === 'ACTIVE' || t.subscription_status === 'TRIALING'
    ).length
  }, [suppliersForUi, restaurantsForUi])

  const isFetching = suppliersFetching || restaurantsFetching

  const handleRefresh = () => {
    setSupplierListOffset(0)
    setRestaurantListOffset(0)
    setAccumulatedSuppliers([])
    setAccumulatedRestaurants([])
    refetchSuppliers()
    refetchRestaurants()
  }

  const headerTitle = showSuppliersOnly
    ? 'Suppliers'
    : showRestaurantsOnly
      ? 'Restaurants'
      : 'All tenants'
  const headerDescription = showSuppliersOnly
    ? 'Supplier accounts, subscriptions, and support actions.'
    : showRestaurantsOnly
      ? 'Restaurant accounts, subscriptions, and support actions.'
      : 'Manage supplier and restaurant accounts across the platform.'

  return (
    <TooltipProvider delayDuration={300}>
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

      {!showSuppliersOnly && !showRestaurantsOnly && !suppliersLoading && !restaurantsLoading && (
        <div className="mb-4">
          <SummaryStrip
            testId="admin-tenants-stats"
            columns={4}
            metrics={[
              {
                label: 'Suppliers',
                value: suppliersTotal,
                hint: `${suppliersForUi?.length ?? 0} loaded`,
                tone: 'brand',
              },
              {
                label: 'Restaurants',
                value: restaurantsTotal,
                hint: `${restaurantsForUi?.length ?? 0} loaded`,
                tone: 'brand',
              },
              {
                label: 'Active / trial',
                value: activeSubsCount,
                hint: 'Across loaded tenants',
                tone: 'mint',
              },
              {
                label: 'Loaded total',
                value: (suppliersForUi?.length ?? 0) + (restaurantsForUi?.length ?? 0),
                hint: `Of ${suppliersTotal + restaurantsTotal} platform tenants`,
              },
            ]}
          />
        </div>
      )}

      {showSuppliersOnly && !suppliersLoading && (
        <div className="mb-4">
          <SummaryStrip
            testId="admin-suppliers-stats"
            columns={4}
            metrics={[
              {
                label: 'Suppliers',
                value: `${suppliersForUi?.length ?? 0} / ${suppliersTotal}`,
                hint: 'Loaded vs total',
                tone: 'brand',
              },
              {
                label: 'Active subs',
                value:
                  suppliersForUi?.filter(
                    (s) =>
                      s.subscription_status === 'ACTIVE' || s.subscription_status === 'TRIALING'
                  ).length ?? 0,
                tone: 'mint',
              },
              {
                label: 'Products',
                value:
                  suppliersForUi?.reduce(
                    (sum, s) => sum + parseInt(String(s.product_count || 0), 10),
                    0
                  ) ?? 0,
              },
              {
                label: 'Revenue',
                value: formatCurrency(
                  suppliersForUi?.reduce(
                    (sum, s) => sum + parseFloat(String(s.total_revenue || 0)),
                    0
                  ) ?? 0
                ),
              },
            ]}
          />
        </div>
      )}

      {showRestaurantsOnly && !restaurantsLoading && (
        <div className="mb-4">
          <SummaryStrip
            testId="admin-restaurants-stats"
            columns={3}
            metrics={[
              {
                label: 'Restaurants',
                value: `${restaurantsForUi?.length ?? 0} / ${restaurantsTotal}`,
                hint: 'Loaded vs total',
                tone: 'brand',
              },
              {
                label: 'Active subs',
                value:
                  restaurantsForUi?.filter(
                    (r) =>
                      r.subscription_status === 'ACTIVE' || r.subscription_status === 'TRIALING'
                  ).length ?? 0,
                tone: 'mint',
              },
              {
                label: 'Orders (30d)',
                value:
                  restaurantsForUi?.reduce(
                    (sum, r) => sum + parseInt(String(r.orders_last_30d || 0), 10),
                    0
                  ) ?? 0,
              },
            ]}
          />
        </div>
      )}

      <div className="mb-4 rounded-md border border-[var(--app-border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_auto]">
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <Input
              className="h-10 pl-9"
              placeholder={
                showSuppliersOnly
                  ? 'Search suppliers by name or email…'
                  : showRestaurantsOnly
                    ? 'Search restaurants by name or email…'
                    : 'Search tenants by name or email…'
              }
              value={tenantSearch}
              onChange={(e) => setTenantSearch(e.target.value)}
              aria-label={t('tenants.searchAriaLabel')}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full" aria-label={t('tenants.filterStatusAriaLabel')}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectTrigger>
          </Select>

          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" className="h-10" onClick={clearFilters}>
              <X className="mr-1.5 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {!showRestaurantsOnly && (
          <AppPanel
            title={t('tenants.suppliersTitle')}
            description={
              suppliersLoading && supplierListOffset === 0
                ? 'Loading suppliers…'
                : `${filteredSuppliers.length} supplier${filteredSuppliers.length === 1 ? '' : 's'} shown${filteredSuppliers.length !== (suppliersForUi?.length ?? 0) ? ` of ${suppliersForUi?.length ?? 0} loaded` : ''}${suppliersTotal > 0 ? ` · ${suppliersTotal} total` : ''}`
            }
            testId="admin-tenants-suppliers"
            footer={
              suppliersFetching && !suppliersLoading ? (
                <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating suppliers…
                </p>
              ) : undefined
            }
          >
            {suppliersError ? (
              <AdminErrorState
                title={t('tenants.suppliersFailedTitle')}
                message="The supplier directory request failed."
                onRetry={() => refetchSuppliers()}
              />
            ) : suppliersLoading && supplierListOffset === 0 ? (
              <AdminLoadingSkeleton rows={6} />
            ) : filteredSuppliers.length === 0 ? (
              <AdminEmptyState
                icon={<Building2 className="h-8 w-8 text-[var(--text-muted)]" />}
                title={hasActiveFilters ? 'No suppliers match your filters' : 'No suppliers found'}
                description={
                  hasActiveFilters
                    ? 'Adjust search or status filters and try again.'
                    : 'Supplier tenants appear here after registration.'
                }
                action={
                  hasActiveFilters ? (
                    <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="space-y-3 lg:hidden">
                  {filteredSuppliers.map((supplier) => (
                    <article
                      key={supplier.id}
                      className="rounded-xl border border-[var(--app-border)] p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--text)]">{supplier.name}</p>
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {supplier.contact_email}
                          </p>
                        </div>
                        <StatusBadge status={supplier.subscription_status || 'NONE'} />
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline" className="font-normal">
                          {formatPlanDisplayName(
                            supplier.plan_code,
                            supplier.plan_name || 'Free Trial'
                          )}
                        </Badge>
                        <span className="text-[var(--text-muted)]">
                          {supplier.product_count || 0} products · {supplier.warehouse_count || 0}{' '}
                          warehouses
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <AdminTooltip label={t('common.tooltips.diagnostics')}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() =>
                              onTenantDiag({
                                id: supplier.id,
                                tenantType: 'SUPPLIER',
                                name: supplier.name || supplier.id,
                              })
                            }
                          >
                            <Stethoscope className="h-4 w-4" />
                          </Button>
                        </AdminTooltip>
                        <AdminTooltip label={t('common.tooltips.impersonate')}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() =>
                              handleStartImpersonation(
                                supplier.id,
                                'SUPPLIER',
                                supplier.name || supplier.id
                              )
                            }
                          >
                            <UserCog className="h-4 w-4" />
                          </Button>
                        </AdminTooltip>
                        {canResetPassword && supplier.contact_email && (
                          <AdminTooltip label={t('common.tooltips.resetPassword')}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2"
                              onClick={() =>
                                onPasswordReset({
                                  email: supplier.contact_email!,
                                  displayName: supplier.name || supplier.contact_email!,
                                })
                              }
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          </AdminTooltip>
                        )}
                        <AdminTooltip label={t('common.tooltips.changePlan')}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() =>
                              openChangePlanForTenant(
                                supplier.subscription_id,
                                'SUPPLIER',
                                supplier.name || supplier.id,
                                'supplier'
                              )
                            }
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </AdminTooltip>
                      </div>
                    </article>
                  ))}
                </div>
                <TableScroll
                  aria-label={t('tenants.suppliersTableAriaLabel')}
                  className="hidden lg:block"
                >
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        <th className="px-4 py-3">{t('common.supplier')}</th>
                        <th className="px-4 py-3">{t('common.table.plan')}</th>
                        <th className="px-4 py-3">{t('common.table.status')}</th>
                        <th
                          className={cn(
                            'hidden px-4 py-3',
                            responsiveDataListClasses.columnSecondary
                          )}
                        >
                          Products
                        </th>
                        <th
                          className={cn(
                            'hidden px-4 py-3',
                            responsiveDataListClasses.columnTertiary
                          )}
                        >
                          Warehouses
                        </th>
                        <th
                          className={cn(
                            'hidden px-4 py-3',
                            responsiveDataListClasses.columnSecondary
                          )}
                        >
                          Revenue
                        </th>
                        <th className="px-4 py-3 text-right">{t('common.table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {filteredSuppliers.map((supplier) => (
                        <tr
                          key={supplier.id}
                          className="transition-colors hover:bg-[var(--brand-ultra)]/35"
                        >
                          <td className="px-4 py-3.5">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[var(--text)]">
                                {supplier.name}
                              </p>
                              <p className="truncate text-xs text-[var(--text-muted)]">
                                {supplier.contact_email}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge variant="outline" className="font-normal">
                              {formatPlanDisplayName(
                                supplier.plan_code,
                                supplier.plan_name || 'Free Trial'
                              )}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={supplier.subscription_status || 'NONE'} />
                          </td>
                          <td
                            className={cn(
                              'hidden px-4 py-3.5 text-[var(--text-muted)]',
                              responsiveDataListClasses.columnSecondary
                            )}
                          >
                            {supplier.product_count || 0}
                          </td>
                          <td
                            className={cn(
                              'hidden px-4 py-3.5 text-[var(--text-muted)]',
                              responsiveDataListClasses.columnTertiary
                            )}
                          >
                            {supplier.warehouse_count || 0}
                          </td>
                          <td
                            className={cn(
                              'hidden px-4 py-3.5 tabular-nums text-[var(--text-muted)]',
                              responsiveDataListClasses.columnSecondary
                            )}
                          >
                            {formatCurrency(supplier.total_revenue)}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <AdminTooltip label={t('common.tooltips.diagnostics')}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() =>
                                    onTenantDiag({
                                      id: supplier.id,
                                      tenantType: 'SUPPLIER',
                                      name: supplier.name || supplier.id,
                                    })
                                  }
                                >
                                  <Stethoscope className="h-4 w-4" />
                                </Button>
                              </AdminTooltip>
                              <AdminTooltip label={t('common.tooltips.impersonate')}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() =>
                                    handleStartImpersonation(
                                      supplier.id,
                                      'SUPPLIER',
                                      supplier.name || supplier.id
                                    )
                                  }
                                >
                                  <UserCog className="h-4 w-4" />
                                </Button>
                              </AdminTooltip>
                              {canResetPassword && supplier.contact_email && (
                                <AdminTooltip label={t('common.tooltips.resetPassword')}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2"
                                    onClick={() =>
                                      onPasswordReset({
                                        email: supplier.contact_email!,
                                        displayName: supplier.name || supplier.contact_email!,
                                      })
                                    }
                                  >
                                    <KeyRound className="h-4 w-4" />
                                  </Button>
                                </AdminTooltip>
                              )}
                              <AdminTooltip label={t('common.tooltips.changePlan')}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() =>
                                    openChangePlanForTenant(
                                      supplier.subscription_id,
                                      'SUPPLIER',
                                      supplier.name || supplier.id,
                                      'supplier'
                                    )
                                  }
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </AdminTooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>

                {!suppliersLoading && (suppliersForUi?.length ?? 0) < suppliersTotal && (
                  <div className="mt-4 flex justify-center border-t border-[var(--app-border)] pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={suppliersFetching}
                      onClick={() => setSupplierListOffset((o) => o + ADMIN_TENANT_PAGE_SIZE)}
                    >
                      {suppliersFetching ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        `Load more suppliers (${suppliersForUi?.length ?? 0} of ${suppliersTotal})`
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </AppPanel>
        )}

        {!showSuppliersOnly && (
          <AppPanel
            title={t('tenants.restaurantsTitle')}
            description={
              restaurantsLoading && restaurantListOffset === 0
                ? 'Loading restaurants…'
                : `${filteredRestaurants.length} restaurant${filteredRestaurants.length === 1 ? '' : 's'} shown${filteredRestaurants.length !== (restaurantsForUi?.length ?? 0) ? ` of ${restaurantsForUi?.length ?? 0} loaded` : ''}${restaurantsTotal > 0 ? ` · ${restaurantsTotal} total` : ''}`
            }
            testId="admin-tenants-restaurants"
            footer={
              restaurantsFetching && !restaurantsLoading ? (
                <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating restaurants…
                </p>
              ) : undefined
            }
          >
            {restaurantsError ? (
              <AdminErrorState
                title={t('tenants.restaurantsFailedTitle')}
                message="The restaurant directory request failed."
                onRetry={() => refetchRestaurants()}
              />
            ) : restaurantsLoading && restaurantListOffset === 0 ? (
              <AdminLoadingSkeleton rows={6} />
            ) : filteredRestaurants.length === 0 ? (
              <AdminEmptyState
                icon={<Users className="h-8 w-8 text-[var(--text-muted)]" />}
                title={
                  hasActiveFilters ? 'No restaurants match your filters' : 'No restaurants found'
                }
                description={
                  hasActiveFilters
                    ? 'Adjust search or status filters and try again.'
                    : 'Restaurant tenants appear here after registration.'
                }
                action={
                  hasActiveFilters ? (
                    <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="space-y-3 lg:hidden">
                  {filteredRestaurants.map((restaurant) => (
                    <article
                      key={restaurant.id}
                      className="rounded-xl border border-[var(--app-border)] p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--text)]">
                            {restaurant.name}
                          </p>
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {restaurant.contact_email}
                          </p>
                        </div>
                        <StatusBadge status={restaurant.subscription_status || 'NONE'} />
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline" className="font-normal">
                          {formatPlanDisplayName(
                            restaurant.plan_code,
                            restaurant.plan_name || 'Free Trial'
                          )}
                        </Badge>
                        <span className="text-[var(--text-muted)]">
                          {restaurant.orders_last_30d || 0} orders (30d) ·{' '}
                          {formatCurrency(restaurant.total_spent)} spent
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <AdminTooltip label={t('common.tooltips.diagnostics')}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() =>
                              onTenantDiag({
                                id: restaurant.id,
                                tenantType: 'RESTAURANT',
                                name: restaurant.name || restaurant.id,
                              })
                            }
                          >
                            <Stethoscope className="h-4 w-4" />
                          </Button>
                        </AdminTooltip>
                        <AdminTooltip label={t('common.tooltips.impersonate')}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() =>
                              handleStartImpersonation(
                                restaurant.id,
                                'RESTAURANT',
                                restaurant.name || restaurant.id
                              )
                            }
                          >
                            <UserCog className="h-4 w-4" />
                          </Button>
                        </AdminTooltip>
                        {canResetPassword && restaurant.contact_email && (
                          <AdminTooltip label={t('common.tooltips.resetPassword')}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2"
                              onClick={() =>
                                onPasswordReset({
                                  email: restaurant.contact_email!,
                                  displayName: restaurant.name || restaurant.contact_email!,
                                })
                              }
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          </AdminTooltip>
                        )}
                        <AdminTooltip label={t('common.tooltips.changePlan')}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() =>
                              openChangePlanForTenant(
                                restaurant.subscription_id,
                                'RESTAURANT',
                                restaurant.name || restaurant.id,
                                'restaurant'
                              )
                            }
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </AdminTooltip>
                      </div>
                    </article>
                  ))}
                </div>
                <TableScroll
                  aria-label={t('tenants.restaurantsTableAriaLabel')}
                  className="hidden lg:block"
                >
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        <th className="px-4 py-3">{t('common.restaurant')}</th>
                        <th className="px-4 py-3">{t('common.table.plan')}</th>
                        <th className="px-4 py-3">{t('common.table.status')}</th>
                        <th
                          className={cn(
                            'hidden px-4 py-3',
                            responsiveDataListClasses.columnSecondary
                          )}
                        >
                          Orders (30d)
                        </th>
                        <th
                          className={cn(
                            'hidden px-4 py-3',
                            responsiveDataListClasses.columnSecondary
                          )}
                        >
                          Total spent
                        </th>
                        <th className="px-4 py-3 text-right">{t('common.table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {filteredRestaurants.map((restaurant) => (
                        <tr
                          key={restaurant.id}
                          className="transition-colors hover:bg-[var(--brand-ultra)]/35"
                        >
                          <td className="px-4 py-3.5">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[var(--text)]">
                                {restaurant.name}
                              </p>
                              <p className="truncate text-xs text-[var(--text-muted)]">
                                {restaurant.contact_email}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge variant="outline" className="font-normal">
                              {formatPlanDisplayName(
                                restaurant.plan_code,
                                restaurant.plan_name || 'Free Trial'
                              )}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={restaurant.subscription_status || 'NONE'} />
                          </td>
                          <td
                            className={cn(
                              'hidden px-4 py-3.5 text-[var(--text-muted)]',
                              responsiveDataListClasses.columnSecondary
                            )}
                          >
                            {restaurant.orders_last_30d || 0}
                          </td>
                          <td
                            className={cn(
                              'hidden px-4 py-3.5 tabular-nums text-[var(--text-muted)]',
                              responsiveDataListClasses.columnSecondary
                            )}
                          >
                            {formatCurrency(restaurant.total_spent)}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <AdminTooltip label={t('common.tooltips.diagnostics')}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() =>
                                    onTenantDiag({
                                      id: restaurant.id,
                                      tenantType: 'RESTAURANT',
                                      name: restaurant.name || restaurant.id,
                                    })
                                  }
                                >
                                  <Stethoscope className="h-4 w-4" />
                                </Button>
                              </AdminTooltip>
                              <AdminTooltip label={t('common.tooltips.impersonate')}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() =>
                                    handleStartImpersonation(
                                      restaurant.id,
                                      'RESTAURANT',
                                      restaurant.name || restaurant.id
                                    )
                                  }
                                >
                                  <UserCog className="h-4 w-4" />
                                </Button>
                              </AdminTooltip>
                              {canResetPassword && restaurant.contact_email && (
                                <AdminTooltip label={t('common.tooltips.resetPassword')}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2"
                                    onClick={() =>
                                      onPasswordReset({
                                        email: restaurant.contact_email!,
                                        displayName: restaurant.name || restaurant.contact_email!,
                                      })
                                    }
                                  >
                                    <KeyRound className="h-4 w-4" />
                                  </Button>
                                </AdminTooltip>
                              )}
                              <AdminTooltip label={t('common.tooltips.changePlan')}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() =>
                                    openChangePlanForTenant(
                                      restaurant.subscription_id,
                                      'RESTAURANT',
                                      restaurant.name || restaurant.id,
                                      'restaurant'
                                    )
                                  }
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </AdminTooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>

                {!restaurantsLoading && (restaurantsForUi?.length ?? 0) < restaurantsTotal && (
                  <div className="mt-4 flex justify-center border-t border-[var(--app-border)] pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={restaurantsFetching}
                      onClick={() => setRestaurantListOffset((o) => o + ADMIN_TENANT_PAGE_SIZE)}
                    >
                      {restaurantsFetching ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        `Load more restaurants (${restaurantsForUi?.length ?? 0} of ${restaurantsTotal})`
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </AppPanel>
        )}
      </div>
    </TooltipProvider>
  )
}
