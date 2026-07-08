import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { tableHeadCellClass } from './table-scroll'

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
  footer,
  children,
  className,
  stickyHeader = false,
  'data-testid': testId,
}: {
  search?: ReactNode
  filters?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  /** Keep column headers visible while scrolling table content. */
  stickyHeader?: boolean
  'data-testid'?: string
}) {
  const hasToolbar = Boolean(search || filters || actions)
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--surface)] shadow-sm',
        className
      )}
      data-testid={testId}
    >
      {hasToolbar && (
        <div className="flex flex-col gap-3 border-b border-[var(--app-border)] p-3 sm:flex-row sm:flex-wrap sm:items-end lg:p-4">
          {search && <div className="min-w-0 flex-1 sm:max-w-sm">{search}</div>}
          {filters && <div className="flex flex-wrap items-end gap-3">{filters}</div>}
          {actions && <div className="flex flex-wrap items-center gap-2 sm:ms-auto">{actions}</div>}
        </div>
      )}
      <div
        className={cn(
          'overflow-x-auto',
          '[&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-[var(--text-muted)]',
          '[&_tbody_tr]:border-b [&_tbody_tr]:border-[var(--app-border)]',
          '[&_tbody_tr]:transition-colors [&_tbody_tr]:hover:bg-[var(--brand-ultra)]',
          '[&_tbody_tr[data-state=selected]]:bg-[var(--brand-pale)]',
          stickyHeader && [
            '[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10',
            '[&_thead_th]:bg-[var(--surface)] [&_thead_th]:shadow-[0_1px_0_var(--app-border)]',
          ]
        )}
      >
        {children}
      </div>
      {footer}
    </div>
  )
}

/** Shared class for manual table header cells (prefer TableScroll defaults). */
export { tableHeadCellClass }
