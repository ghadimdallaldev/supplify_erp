import { lazy, Suspense, type ComponentProps } from 'react'
import { Skeleton } from '../ui/skeleton'

const DeliveryTrackingMap = lazy(() =>
  import('./DeliveryTrackingMap').then((m) => ({ default: m.DeliveryTrackingMap }))
)

type Props = ComponentProps<typeof DeliveryTrackingMap>

export function LazyDeliveryTrackingMap(props: Props) {
  return (
    <Suspense
      fallback={<Skeleton className={`w-full rounded-lg ${props.heightClassName ?? 'h-56'}`} />}
    >
      <DeliveryTrackingMap {...props} />
    </Suspense>
  )
}
