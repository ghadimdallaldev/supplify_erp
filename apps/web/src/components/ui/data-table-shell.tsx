import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Consistent wrapper for data tables: a toolbar row with search, filters, and
 * actions above a horizontally scrollable content area.
 *
 * For hybrid card/table pages, prefer {@link ResponsiveDataList} from
 * `./responsive-data-list` (cards below `lg`, compact table at `lg`–`xl`, full
 * table at `xl+`) and wrap table markup in {@link TableScroll} from
 * `./table-scroll` with a descriptive `aria-label`. The inner `overflow-x-auto`
 * below remains a fallback when children are not wrapped in `TableScroll`.
 */
export function DataTableShell({
  search,
  filters,
  actions,
  children,
  className,
  'data-testid': testId,
}: {
  search?: ReactNode
  filters?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  'data-testid'?: string
}) {
  const hasToolbar = Boolean(search || filters || actions)
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)] shadow-sm',
        className
      )}
      data-testid={testId}
    >
      {hasToolbar && (
        <div className="flex flex-col gap-3 border-b border-[var(--app-border)] p-4 sm:flex-row sm:flex-wrap sm:items-end">
          {search && <div className="min-w-0 flex-1 sm:max-w-sm">{search}</div>}
          {filters && <div className="flex flex-wrap items-end gap-3">{filters}</div>}
          {actions && <div className="flex flex-wrap items-center gap-2 sm:ms-auto">{actions}</div>}
        </div>
      )}
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}
