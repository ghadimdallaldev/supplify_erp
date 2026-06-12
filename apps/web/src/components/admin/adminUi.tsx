import React from 'react'
import { Button } from '../ui/button'
import { Loader2 } from 'lucide-react'
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
    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </p>
        {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
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

export function AdminLoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
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
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm"
      data-testid="admin-error-state"
    >
      <p className="font-semibold text-red-900">{title}</p>
      {message && <p className="mt-1 text-red-800">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
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
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-[var(--text-muted)]">
      {lastUpdated && (
        <span>
          Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh'}
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
