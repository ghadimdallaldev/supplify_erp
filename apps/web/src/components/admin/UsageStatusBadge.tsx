import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import type { UsageStatus } from '../../lib/adminUsageStatus'

const STATUS_CLASS: Record<UsageStatus, string> = {
  healthy:
    'bg-[var(--mint-pale)] text-[var(--mint)] border-[color-mix(in_srgb,var(--mint)_35%,transparent)]',
  near_limit:
    'bg-[var(--amber-pale)] text-[var(--amber)] border-[color-mix(in_srgb,var(--amber)_35%,transparent)]',
  over_limit:
    'bg-[var(--red-pale)] text-[var(--red)] border-[color-mix(in_srgb,var(--red)_35%,transparent)]',
  unlimited: 'bg-[var(--brand-ultra)] text-[var(--brand-mid)] border-[var(--app-border-mid)]',
  unknown: 'bg-[var(--app-bg-subtle)] text-[var(--text-muted)] border-[var(--app-border)]',
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
