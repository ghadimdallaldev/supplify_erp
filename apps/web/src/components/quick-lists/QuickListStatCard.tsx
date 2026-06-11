import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function QuickListStatCard({
  label,
  value,
  hint,
  icon,
  iconWrapClassName,
  active,
  onClick,
}: {
  label: string
  value: number | string
  hint?: string
  icon: ReactNode
  iconWrapClassName: string
  active?: boolean
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-start justify-between gap-3 rounded-xl border bg-[var(--surface)] p-4 text-left shadow-sm transition',
        'border-[var(--app-border-mid)]',
        onClick &&
          'hover:border-[var(--brand-mid)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]',
        active && 'border-[var(--brand-mid)] ring-2 ring-[var(--brand-pale)]'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{value}</p>
        {hint && <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">{hint}</p>}
      </div>
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          iconWrapClassName
        )}
      >
        {icon}
      </div>
    </Comp>
  )
}
