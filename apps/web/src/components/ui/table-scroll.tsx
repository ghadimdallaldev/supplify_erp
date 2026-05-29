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
        'table-scroll -mx-1 overflow-x-auto rounded-lg border border-[var(--app-border)] sm:mx-0',
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
