import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** Horizontal scroll wrapper for data tables on narrow viewports. */
export function TableScroll({
  children,
  className,
  'aria-label': ariaLabel = 'Scrollable table',
}: {
  children: ReactNode
  className?: string
  'aria-label'?: string
}) {
  return (
    <div
      className={cn(
        'table-scroll mx-0 w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--app-border)]',
        '[&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3',
        '[&_th:first-child]:ps-5 [&_td:first-child]:ps-5',
        '[&_th:last-child]:pe-5 [&_td:last-child]:pe-5',
        className
      )}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      {children}
    </div>
  )
}
