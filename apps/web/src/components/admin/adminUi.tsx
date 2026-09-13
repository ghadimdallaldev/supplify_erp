import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { ChevronDown, Loader2 } from 'lucide-react'
import { EmptyState } from '../ui/empty-state'
import { Skeleton } from '../ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { StatusBadge, formatStatusLabel, getStatusTone, type StatusTone } from '../ui/status-badge'

export type AdminStatusTone = StatusTone

export const formatAdminStatus = formatStatusLabel
export { getStatusTone }

export function AdminStatusBadge({
  status,
  className = '',
}: {
  status: string
  className?: string
}) {
  return <StatusBadge status={status} className={className} />
}

export function AdminSectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-mid)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function AdminCollapsibleSection({
  title,
  description,
  children,
  defaultOpen = false,
  className = '',
  testId,
}: {
  title: string
  description?: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
  testId?: string
}) {
  return (
    <details
      className={`admin-collapsible-section ${className}`}
      open={defaultOpen || undefined}
      data-testid={testId}
    >
      <summary className="admin-collapsible-summary">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--text)]">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-sm text-[var(--text-mid)]">{description}</span>
          ) : null}
        </span>
        <ChevronDown className="admin-collapsible-chevron h-4 w-4 shrink-0" aria-hidden />
      </summary>
      <div className="admin-collapsible-content">{children}</div>
    </details>
  )
}
export function AdminEmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ReactNode
}) {
  return <EmptyState title={title} description={description} action={action} icon={icon} />
}

export function AdminLoadingState({ label }: { label?: string }) {
  const { t } = useTranslation('admin')
  const resolvedLabel = label ?? t('common.loading')
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]">
      <Loader2 className="h-5 w-5 animate-spin" />
      {resolvedLabel}
    </div>
  )
}

export function AdminLoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-2" data-testid="admin-loading-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  )
}

export function AdminTooltip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export { TooltipProvider }

export function AdminErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  const { t } = useTranslation('admin')
  const resolvedTitle = title ?? t('common.errorDefault')
  return (
    <div
      className="rounded-lg border border-[var(--red)]/30 bg-[var(--red-pale)] p-4 text-sm"
      data-testid="admin-error-state"
    >
      <p className="font-semibold text-[var(--red)]">{resolvedTitle}</p>
      {message && <p className="mt-1 text-[var(--text)]">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}

export function AdminRefreshBar({
  lastUpdated,
  onRefresh,
  refreshing,
}: {
  lastUpdated?: Date | null
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const { t } = useTranslation('admin')
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-[var(--text-muted)]">
      {lastUpdated && (
        <span>
          {t('common.updatedAt', {
            time: lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          })}
        </span>
      )}
      {onRefresh && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('common.refresh')}
        </Button>
      )}
    </div>
  )
}

export function formatAdminDate(value: unknown): string {
  if (!value) return '—'
  const d = new Date(String(value))
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatAdminDateTime(value: unknown): string {
  if (!value) return '—'
  const d = new Date(String(value))
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}
