import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type InfoBannerTone = 'amber' | 'slate' | 'red' | 'neutral'

const toneStyles: Record<
  InfoBannerTone,
  { container: string; title: string; description: string; icon: string }
> = {
  amber: {
    container: 'border-amber-200 bg-amber-50 text-amber-950',
    title: 'text-amber-950',
    description: 'text-amber-900/90',
    icon: 'text-amber-800',
  },
  slate: {
    container: 'border-slate-200 bg-slate-50 text-slate-900',
    title: 'text-slate-900',
    description: 'text-slate-700',
    icon: 'text-slate-600',
  },
  red: {
    container: 'border-red-200 bg-red-50 text-red-950',
    title: 'text-red-950',
    description: 'text-red-800',
    icon: 'text-red-700',
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
      className={cn(
        'mx-3 mt-4 rounded-lg border px-4 py-3 text-sm sm:mx-6',
        styles.container,
        className
      )}
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
