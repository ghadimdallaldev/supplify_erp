import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import type { UsageStatus } from '../../lib/adminUsageStatus'

const STATUS_CLASS: Record<UsageStatus, string> = {
  healthy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  near_limit: 'bg-amber-50 text-amber-800 border-amber-200',
  over_limit: 'bg-red-50 text-red-700 border-red-200',
  unlimited: 'bg-sky-50 text-sky-700 border-sky-200',
  unknown: 'bg-gray-50 text-gray-600 border-gray-200',
}

const STATUS_KEYS: Record<UsageStatus, string> = {
  healthy: 'usageStatus.healthy',
  near_limit: 'usageStatus.nearLimit',
  over_limit: 'usageStatus.overLimit',
  unlimited: 'usageStatus.unlimited',
  unknown: 'usageStatus.unknown',
}

export function UsageStatusBadge({
  status,
  className,
}: {
  status: UsageStatus
  className?: string
}) {
  const { t } = useTranslation('admin')
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        STATUS_CLASS[status],
        className
      )}
      data-testid={`usage-status-${status}`}
    >
      {t(STATUS_KEYS[status])}
    </span>
  )
}
