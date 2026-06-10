import { Suspense, lazy } from 'react'
import { useGetAdminRestaurantsQuery, useGetAdminSuppliersQuery } from '../../../services/api'
import { AdminTabLoading } from './adminDashboardShared'

const AdminFeatureFlagsPanel = lazy(() =>
  import('../AdminFeatureFlagsPanel').then((m) => ({
    default: m.AdminFeatureFlagsPanel,
  }))
)

export interface AdminFeaturesTabProps {
  active: boolean
}

export function AdminFeaturesTab({ active }: AdminFeaturesTabProps) {
  const { data: suppliersData } = useGetAdminSuppliersQuery(
    { limit: 50, offset: 0 },
    { skip: !active }
  )
  const { data: restaurantsData } = useGetAdminRestaurantsQuery(
    { limit: 50, offset: 0 },
    { skip: !active }
  )

  if (!active) return null

  return (
    <Suspense fallback={<AdminTabLoading />}>
      <AdminFeatureFlagsPanel
        restaurants={(restaurantsData?.restaurants ?? []).map(
          (r: { id: string; name: string }) => ({
            id: r.id,
            name: r.name,
          })
        )}
        suppliers={(suppliersData?.suppliers ?? []).map((s: { id: string; name: string }) => ({
          id: s.id,
          name: s.name,
        }))}
      />
    </Suspense>
  )
}
