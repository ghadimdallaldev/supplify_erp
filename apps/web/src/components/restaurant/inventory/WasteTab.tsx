import { RestaurantWastePanel } from '../../inventory/RestaurantWastePanel'
import { useGetRestaurantInventoryQuery } from '../../../services/api'
import { Skeleton } from '../../ui/skeleton'

export interface WasteTabProps {
  preselectedProductId: string | null
  onPreselectConsumed: () => void
}

export function WasteTab({ preselectedProductId, onPreselectConsumed }: WasteTabProps) {
  const { data, isLoading } = useGetRestaurantInventoryQuery({ limit: 100 })
  const inventory = data?.inventory || []

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />
  }

  return (
    <div className="space-y-6">
      <RestaurantWastePanel
        inventory={inventory}
        preselectedProductId={preselectedProductId}
        onPreselectConsumed={onPreselectConsumed}
      />
    </div>
  )
}
