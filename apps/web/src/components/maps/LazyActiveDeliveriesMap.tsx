import { lazy, Suspense, type ComponentProps } from 'react'
import { Skeleton } from '../ui/skeleton'

const ActiveDeliveriesMap = lazy(() =>
  import('./ActiveDeliveriesMap').then((m) => ({ default: m.ActiveDeliveriesMap }))
)

type Props = ComponentProps<typeof ActiveDeliveriesMap>

export function LazyActiveDeliveriesMap(props: Props) {
  return (
    <Suspense
      fallback={<Skeleton className={`w-full rounded-lg ${props.heightClassName ?? 'h-72'}`} />}
    >
      <ActiveDeliveriesMap {...props} />
    </Suspense>
  )
}
