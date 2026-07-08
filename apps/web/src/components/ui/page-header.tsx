import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function PageHeader({
  title,
  description,
  subtitle,
  actions,
  action,
  breadcrumb,
  size = 'default',
  className,
  'data-testid': testId,
}: {
  title: string
  description?: string
  /** Alias for description (admin compact subtitle) */
  subtitle?: string
  actions?: ReactNode
  /** Alias for actions (AdminPageHeader compat) */
  action?: ReactNode
  breadcrumb?: ReactNode
  size?: 'default' | 'compact'
  className?: string
  'data-testid'?: string
}) {
  const body = description ?? subtitle
  const headerActions = actions ?? action
  const isCompact = size === 'compact'

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        isCompact && 'mb-4',
        className
      )}
      data-testid={testId ?? (isCompact ? 'admin-page-header' : undefined)}
    >
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1.5 text-xs text-[var(--text-muted)]">{breadcrumb}</div>}
        <h1
          className={cn(
            'text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl',
            isCompact && 'text-xl sm:text-2xl'
          )}
        >
          {title}
        </h1>
        {body && (
          <p
            className={cn(
              'max-w-3xl leading-relaxed text-[var(--lead-text-color)]',
              isCompact ? 'mt-1 text-sm sm:text-base' : 'mt-2 text-base'
            )}
          >
            {body}
          </p>
        )}
      </div>
      {headerActions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div>
      )}
    </div>
  )
}
