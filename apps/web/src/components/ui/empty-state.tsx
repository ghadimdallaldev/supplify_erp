import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-bg-subtle)] px-6 py-10 text-center',
        className
      )}
      role="status"
    >
      {icon && <div className="mb-3 text-[var(--text-muted)]">{icon}</div>}
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-xs text-[var(--text-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
