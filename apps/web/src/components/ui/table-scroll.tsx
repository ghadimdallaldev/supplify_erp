import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** Standard typography for data table header cells. */
export const tableHeadCellClass =
  'text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]'

/** Standard row affordances for selectable data tables. */
export const tableBodyRowClass =
  'border-b border-[var(--app-border)] transition-colors hover:bg-[var(--brand-ultra)] data-[state=selected]:bg-[var(--brand-pale)]'

/** Horizontal scroll wrapper for data tables on narrow viewports. */
export function TableScroll({
  children,
  className,
  stickyHeader = false,
  'aria-label': ariaLabel = 'Scrollable table',
  'data-testid': testId,
}: {
  children: ReactNode
  className?: string
  /** Keep column headers visible while scrolling table content. */
  stickyHeader?: boolean
  'aria-label'?: string
  'data-testid'?: string
}) {
  return (
    <div
      className={cn(
        'table-scroll mx-0 w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--app-border)]',
        '[&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3',
        '[&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-[var(--text-muted)]',
        '[&_tbody_tr]:border-b [&_tbody_tr]:border-[var(--app-border)]',
        '[&_tbody_tr]:transition-colors [&_tbody_tr]:hover:bg-[var(--brand-ultra)]',
        '[&_tbody_tr[data-state=selected]]:bg-[var(--brand-pale)]',
        '[&_th:first-child]:ps-5 [&_td:first-child]:ps-5',
        '[&_th:last-child]:pe-5 [&_td:last-child]:pe-5',
        stickyHeader && [
          '[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10',
          '[&_thead_th]:bg-[var(--surface)] [&_thead_th]:shadow-[0_1px_0_var(--app-border)]',
        ],
        className
      )}
      role="region"
      aria-label={ariaLabel}
      data-testid={testId}
      tabIndex={0}
    >
      {children}
    </div>
  )
}
