import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-start justify-between gap-2', className)}>
      <div>
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {description ? (
          <p className="mt-0.5 text-sm text-[var(--text-mid)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
