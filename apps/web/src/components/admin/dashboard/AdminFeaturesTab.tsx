import { Suspense, lazy, useMemo } from 'react'
import { useGetAdminRestaurantsQuery, useGetAdminSuppliersQuery } from '../../../services/api'
import { mapAdminTenantRow } from '../../../lib/adminTenantSearch'
import { AdminTabLoading } from './adminDashboardShared'

const AdminFeatureFlagsPanel = lazy(() =>
  import('../AdminFeatureFlagsPanel').then((m) => ({
    default: m.AdminFeatureFlagsPanel,
  }))
)

export interface AdminFeaturesTabProps {
  active: boolean
}

const TENANT_LIST_ARGS = { limit: 100, offset: 0 }

export function AdminFeaturesTab({ active }: AdminFeaturesTabProps) {
  const { data: suppliersData, isLoading: suppliersLoading } = useGetAdminSuppliersQuery(
    TENANT_LIST_ARGS,
    { skip: !active }
  )
  const { data: restaurantsData, isLoading: restaurantsLoading } = useGetAdminRestaurantsQuery(
    TENANT_LIST_ARGS,
    { skip: !active }
  )

  const tenants = useMemo(() => {
    const suppliers = (suppliersData?.suppliers ?? []).map((r: Record<string, unknown>) =>
      mapAdminTenantRow(r as Parameters<typeof mapAdminTenantRow>[0], 'SUPPLIER')
    )
    const restaurants = (restaurantsData?.restaurants ?? []).map((r: Record<string, unknown>) =>
      mapAdminTenantRow(r as Parameters<typeof mapAdminTenantRow>[0], 'RESTAURANT')
    )
    return [...suppliers, ...restaurants]
  }, [suppliersData?.suppliers, restaurantsData?.restaurants])

  if (!active) return null

  return (
    <Suspense fallback={<AdminTabLoading />}>
      <AdminFeatureFlagsPanel
        tenants={tenants}
        tenantsLoading={suppliersLoading || restaurantsLoading}
      />
    </Suspense>
  )
}
