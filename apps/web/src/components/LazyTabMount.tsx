import { Suspense, type ReactNode } from 'react'

/** Mount tab content only when selected — avoids hooks, queries, and lazy chunks until opened. */
export function LazyTabMount<T extends string>({
  tab,
  selectedTab,
  children,
  className,
  fallback = null,
}: {
  tab: T
  selectedTab: string
  children: ReactNode
  className?: string
  fallback?: ReactNode
}) {
  if (selectedTab !== tab) return null
  return (
    <Suspense fallback={fallback}>
      {className ? <div className={className}>{children}</div> : children}
    </Suspense>
  )
}
