import React from 'react'
import { Button } from '../ui/button'
import { Loader2 } from 'lucide-react'

export type AdminStatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'muted'

const STATUS_TONE_MAP: Record<string, AdminStatusTone> = {
  ACTIVE: 'success',
  active: 'success',
  healthy: 'success',
  HEALTHY: 'success',
  PAID: 'success',
  paid: 'success',
  approved: 'success',
  APPROVED: 'success',
  TRIALING: 'info',
  trialing: 'info',
  scheduled: 'info',
  SCHEDULED: 'info',
  PENDING: 'warning',
  pending: 'warning',
  pending_approval: 'warning',
  pending_admin_approval: 'warning',
  approved_pending_payment: 'warning',
  PAST_DUE: 'danger',
  past_due: 'danger',
  failed: 'danger',
  FAILED: 'danger',
  rejected: 'danger',
  REJECTED: 'danger',
  expired: 'muted',
  EXPIRED: 'muted',
  cancelled: 'muted',
  CANCELLED: 'muted',
  paused: 'muted',
  PAUSED: 'muted',
  inactive: 'muted',
  INACTIVE: 'muted',
  draft: 'neutral',
  DRAFT: 'neutral',
}

const TONE_CLASSES: Record<AdminStatusTone, string> = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  neutral: 'bg-slate-50 text-slate-700 border-slate-200',
  muted: 'bg-[var(--app-border)]/40 text-[var(--text-muted)] border-[var(--app-border)]',
}

export function formatAdminStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function getStatusTone(status: string): AdminStatusTone {
  const key = status?.trim() || ''
  if (STATUS_TONE_MAP[key]) return STATUS_TONE_MAP[key]
  if (key.includes('pending')) return 'warning'
  if (key.includes('fail') || key.includes('reject') || key.includes('past')) return 'danger'
  if (key.includes('active') || key.includes('paid') || key.includes('approve')) return 'success'
  return 'neutral'
}

export function AdminStatusBadge({
  status,
  className = '',
}: {
  status: string
  className?: string
}) {
  const tone = getStatusTone(status)
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {formatAdminStatus(status || 'unknown')}
    </span>
  )
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
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-bg-subtle)]/50 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-[var(--text-muted)]">{icon}</div>}
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-xs text-[var(--text-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function AdminLoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
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
