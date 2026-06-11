import type { ReactNode } from 'react'
import { LazyTabMount } from '../../LazyTabMount'
import { AdminTabLoading } from './adminDashboardShared'
import type { AdminTabKey } from './adminDashboardShared'

/** Admin dashboard wrapper around shared LazyTabMount. */
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
  return (
    <LazyTabMount
      tab={tab}
      selectedTab={selectedTab}
      className={className}
      fallback={<AdminTabLoading />}
    >
      {children}
    </LazyTabMount>
  )
}
