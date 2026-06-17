import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type InfoBannerTone = 'amber' | 'slate' | 'red' | 'neutral'

const toneStyles: Record<
  InfoBannerTone,
  { container: string; title: string; description: string; icon: string }
> = {
  amber: {
    container: 'border-[var(--amber-mid)]/35 bg-[var(--amber-pale)] text-[var(--text)]',
    title: 'text-[var(--text)]',
    description: 'text-[var(--text-mid)]',
    icon: 'text-[var(--amber)]',
  },
  slate: {
    container: 'border-[var(--app-border)] bg-[var(--app-bg-subtle)] text-[var(--text-mid)]',
    title: 'text-[var(--text)]',
    description: 'text-[var(--text-mid)]',
    icon: 'text-[var(--text-muted)]',
  },
  red: {
    container: 'border-[var(--red)]/30 bg-[var(--red-pale)] text-[var(--text)]',
    title: 'text-[var(--text)]',
    description: 'text-[var(--text-mid)]',
    icon: 'text-[var(--red)]',
  },
  neutral: {
    container: 'border-[var(--app-border)] bg-[var(--bg)] text-[var(--text-mid)]',
    title: 'text-[var(--text)]',
    description: 'text-[var(--text-mid)]',
    icon: 'text-[var(--text-muted)]',
  },
}

export function InfoBanner({
  tone = 'amber',
  icon: Icon,
  title,
  description,
  action,
  className,
  'data-testid': testId,
}: {
  tone?: InfoBannerTone
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  'data-testid'?: string
}) {
  const styles = toneStyles[tone]
  return (
    <div
      className={cn('rounded-lg border px-4 py-3 text-sm', styles.container, className)}
      role="status"
      data-testid={testId}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-2">
          {Icon ? (
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', styles.icon)} aria-hidden />
          ) : null}
          <div className="min-w-0">
            <p className={cn('font-medium', styles.title)}>{title}</p>
            {description ? <p className={cn('mt-1', styles.description)}>{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0 self-start sm:ml-4">{action}</div> : null}
      </div>
    </div>
  )
}
