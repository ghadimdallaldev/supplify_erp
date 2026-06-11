import type { ReactNode } from 'react'

export function AdminPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div
      className="mb-4 flex flex-wrap items-start justify-between gap-3"
      data-testid="admin-page-header"
    >
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text)] sm:text-[21px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[var(--text-muted)] sm:text-sm">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  )
}
