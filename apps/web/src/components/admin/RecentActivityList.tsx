import { useTranslation } from 'react-i18next'
import { getActivityEventConfig } from '../../lib/adminActivityConfig'
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSkeleton,
  AdminStatusBadge,
  formatAdminDateTime,
} from './adminUi'

export type ActivityEvent = {
  id: string | number
  event_type: string
  title: string
  subtitle?: string
  occurred_at: string
  status?: string
}

export function RecentActivityList({
  events,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: {
  events: ActivityEvent[]
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
}) {
  const { t } = useTranslation('admin')

  if (isLoading) {
    return <AdminLoadingSkeleton rows={4} />
  }

  if (isError) {
    return (
      <AdminErrorState
        title={t('activity.recent.loadFailedTitle')}
        message={errorMessage || t('activity.recent.loadFailedMessage')}
        onRetry={onRetry}
      />
    )
  }

  if (events.length === 0) {
    return (
      <AdminEmptyState
        title={t('activity.recent.emptyTitle')}
        description={t('activity.recent.emptyDescription')}
      />
    )
  }

  return (
    <ul className="space-y-2" data-testid="recent-activity-list">
      {events.map((event) => {
        const cfg = getActivityEventConfig(event.event_type)
        const Icon = cfg.icon
        return (
          <li
            key={`${event.event_type}-${event.id}`}
            className="flex items-start gap-2 border-b border-[var(--app-border)]/60 pb-2 last:border-0"
          >
            <div
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
              style={{ background: cfg.bg }}
            >
              <Icon className="h-3 w-3" style={{ color: cfg.color }} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-xs font-medium text-[var(--text)]">{event.title}</p>
                {event.status && <AdminStatusBadge status={event.status} />}
              </div>
              {event.subtitle && (
                <p className="truncate text-[10px] text-[var(--text-muted)]">{event.subtitle}</p>
              )}
              <p className="text-[10px] text-[var(--text-muted)]">
                {formatAdminDateTime(event.occurred_at)}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
