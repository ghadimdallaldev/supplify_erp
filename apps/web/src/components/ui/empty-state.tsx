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
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-bg-subtle)] px-5 py-10 text-center sm:px-8 sm:py-12',
        className
      )}
      role="status"
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-[var(--text)]">{title}</p>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      )}
      {action && <div className="action-bar mt-5 justify-center">{action}</div>}
    </div>
  )
}
