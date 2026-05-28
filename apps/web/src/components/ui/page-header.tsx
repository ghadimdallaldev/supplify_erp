import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  className,
  'data-testid': testId,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
  'data-testid'?: string
}) {
  return (
    <div
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}
      data-testid={testId}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text)] sm:text-[21px] sm:font-black">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-muted)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
