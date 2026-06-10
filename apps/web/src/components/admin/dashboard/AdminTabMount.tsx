import { Suspense, type ReactNode } from 'react'
import { AdminTabLoading } from './adminDashboardShared'
import type { AdminTabKey } from './adminDashboardShared'

/** Mount tab content only when selected — avoids hooks, queries, and lazy chunks until opened. */
export function AdminTabMount({
  tab,
  selectedTab,
  children,
  className,
}: {
  tab: AdminTabKey
  selectedTab: string
  children: ReactNode
  className?: string
}) {
  if (selectedTab !== tab) return null
  return (
    <Suspense fallback={<AdminTabLoading />}>
      {className ? <div className={className}>{children}</div> : children}
    </Suspense>
  )
}
