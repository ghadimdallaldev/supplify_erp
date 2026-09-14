import { cn } from '../../lib/utils'
import type { UsageStatus } from '../../lib/adminUsageStatus'
import { usagePercent } from '../../lib/adminUsageStatus'

const barColors: Record<UsageStatus, string> = {
  healthy: 'bg-[var(--mint)]',
  near_limit: 'bg-[var(--amber)]',
  over_limit: 'bg-[var(--red)]',
  unlimited: 'bg-[var(--brand-mid)]',
  unknown: 'bg-[var(--text-muted)]',
}

export function UsageProgressBar({
  used,
  limit,
  status,
  className,
}: {
  used: number
  limit: number | null | undefined
  status: UsageStatus
  className?: string
}) {
  const width = status === 'unlimited' ? 0 : usagePercent(used, limit)
  return (
    <div
      className={cn('h-1.5 overflow-hidden rounded-full bg-[var(--app-border-mid)]', className)}
      role="progressbar"
      aria-valuenow={used}
      aria-valuemin={0}
      aria-valuemax={limit === -1 || limit == null ? undefined : limit}
    >
      <div
        className={cn(
          'h-full w-full origin-left transition-transform duration-200 ease-linear',
          barColors[status]
        )}
        style={{ transform: `scaleX(${width / 100})` }}
      />
    </div>
  )
}
