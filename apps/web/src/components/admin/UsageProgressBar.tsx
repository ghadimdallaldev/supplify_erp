import { cn } from '../../lib/utils'
import type { UsageStatus } from '../../lib/adminUsageStatus'
import { usagePercent } from '../../lib/adminUsageStatus'

const barColors: Record<UsageStatus, string> = {
  healthy: 'bg-emerald-500',
  near_limit: 'bg-amber-500',
  over_limit: 'bg-red-500',
  unlimited: 'bg-sky-500',
  unknown: 'bg-[var(--brand-mid)]',
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
        className={cn('h-full transition-all', barColors[status])}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
