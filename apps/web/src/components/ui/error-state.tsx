import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function ErrorState({
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
        'animate-fade-in flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-bg-subtle)] px-5 py-10 text-center sm:px-8 sm:py-12',
        className
      )}
      role="alert"
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--red-pale)] text-[var(--red)] ring-8 ring-[var(--red-pale)]/40">
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
