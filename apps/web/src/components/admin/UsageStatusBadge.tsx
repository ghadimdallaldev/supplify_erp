import { cn } from '../../lib/utils'
import type { UsageStatus } from '../../lib/adminUsageStatus'

const STATUS_CONFIG: Record<UsageStatus, { label: string; className: string }> = {
  healthy: {
    label: 'Healthy',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  near_limit: {
    label: 'Near limit',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  over_limit: {
    label: 'Over limit',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  unlimited: {
    label: 'Unlimited',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  unknown: {
    label: 'Not available',
    className: 'bg-gray-50 text-gray-600 border-gray-200',
  },
}

export function UsageStatusBadge({
  status,
  className,
}: {
  status: UsageStatus
  className?: string
}) {
  const config = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        config.className,
        className
      )}
      data-testid={`usage-status-${status}`}
    >
      {config.label}
    </span>
  )
}
