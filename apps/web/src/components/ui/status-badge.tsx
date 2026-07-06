import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'muted'

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string

const STATUS_TONE_MAP: Record<string, StatusTone> = {
  ACTIVE: 'success',
  active: 'success',
  healthy: 'success',
  HEALTHY: 'success',
  PAID: 'success',
  paid: 'success',
  approved: 'success',
  APPROVED: 'success',
  RECEIVED_FULL: 'success',
  COMPLETED: 'success',
  INVOICED: 'success',
  DELIVERED: 'success',
  SHIPPED: 'info',
  ACKNOWLEDGED: 'info',
  PROCESSING: 'info',
  TRIALING: 'info',
  trialing: 'info',
  scheduled: 'info',
  SCHEDULED: 'info',
  PLACED: 'warning',
  PENDING: 'warning',
  pending: 'warning',
  pending_approval: 'warning',
  pending_admin_approval: 'warning',
  approved_pending_payment: 'warning',
  RECEIVED_PARTIAL: 'warning',
  RECEIVED_WITH_DISPUTE: 'warning',
  PAST_DUE: 'danger',
  past_due: 'danger',
  OVERDUE: 'danger',
  ISSUED: 'info',
  PARTIALLY_PAID: 'warning',
  VOID: 'muted',
  failed: 'danger',
  FAILED: 'danger',
  rejected: 'danger',
  REJECTED: 'danger',
  DECLINED: 'danger',
  CANCELLED: 'muted',
  cancelled: 'muted',
  expired: 'muted',
  EXPIRED: 'muted',
  paused: 'muted',
  PAUSED: 'muted',
  inactive: 'muted',
  INACTIVE: 'muted',
  draft: 'neutral',
  DRAFT: 'neutral',
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
}

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  neutral: 'bg-slate-50 text-slate-700 border-slate-200',
  muted: 'bg-[var(--app-border)]/40 text-[var(--text-muted)] border-[var(--app-border)]',
}

const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  neutral: 'bg-slate-400',
  muted: 'bg-[var(--app-border-mid)]',
}

export function StatusDot({ tone, className = '' }: { tone: StatusTone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT_CLASSES[tone], className)}
    />
  )
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  ACTIVE: 'active',
  active: 'active',
  healthy: 'active',
  HEALTHY: 'active',
  INACTIVE: 'inactive',
  inactive: 'inactive',
  PAUSED: 'inactive',
  paused: 'inactive',
  PENDING: 'pending',
  pending: 'pending',
  pending_approval: 'pending',
  pending_admin_approval: 'pending',
  approved_pending_payment: 'pending',
  APPROVED: 'approved',
  approved: 'approved',
  DECLINED: 'declined',
  declined: 'declined',
  rejected: 'declined',
  REJECTED: 'declined',
  PAID: 'paid',
  paid: 'paid',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  cancelled: 'cancelled',
  LOW_STOCK: 'lowStock',
  OUT_OF_STOCK: 'outOfStock',
  IN_STOCK: 'inStock',
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function getStatusTone(status: string): StatusTone {
  const key = status?.trim() || ''
  if (STATUS_TONE_MAP[key]) return STATUS_TONE_MAP[key]
  if (key.includes('pending')) return 'warning'
  if (
    key.includes('fail') ||
    key.includes('reject') ||
    key.includes('declin') ||
    key.includes('past')
  )
    return 'danger'
  if (
    key.includes('active') ||
    key.includes('paid') ||
    key.includes('approve') ||
    key.includes('received')
  )
    return 'success'
  if (key.includes('ship') || key.includes('deliver') || key.includes('process')) return 'info'
  return 'neutral'
}

export function getTranslatedStatusLabel(status: string, t: TranslateFn): string {
  const key = status?.trim() || ''
  const labelKey = STATUS_LABEL_KEYS[key]
  if (labelKey) {
    return t(`status.${labelKey}`, { defaultValue: formatStatusLabel(status) })
  }
  if (key.includes('pending')) {
    return t('status.pending', { defaultValue: formatStatusLabel(status) })
  }
  if (
    key.includes('fail') ||
    key.includes('reject') ||
    key.includes('declin') ||
    key.includes('past')
  ) {
    return t('status.declined', { defaultValue: formatStatusLabel(status) })
  }
  if (
    key.includes('active') ||
    key.includes('paid') ||
    key.includes('approve') ||
    key.includes('received')
  ) {
    return t('status.active', { defaultValue: formatStatusLabel(status) })
  }
  if (key.includes('cancel')) {
    return t('status.cancelled', { defaultValue: formatStatusLabel(status) })
  }
  if (key.includes('deliver')) {
    return t('status.delivered', { defaultValue: formatStatusLabel(status) })
  }
  if (key.includes('low') && key.includes('stock')) {
    return t('status.lowStock', { defaultValue: formatStatusLabel(status) })
  }
  if (key.includes('out') && key.includes('stock')) {
    return t('status.outOfStock', { defaultValue: formatStatusLabel(status) })
  }
  if (key.includes('in') && key.includes('stock')) {
    return t('status.inStock', { defaultValue: formatStatusLabel(status) })
  }
  if (!key) {
    return t('status.unknown', { defaultValue: 'Unknown' })
  }
  return formatStatusLabel(status)
}

export function StatusBadge({
  status,
  className = '',
  label,
  showDot = true,
}: {
  status: string
  className?: string
  label?: string
  showDot?: boolean
}) {
  const { t } = useTranslation('common')
  const tone = getStatusTone(status)
  const displayLabel = label ?? getTranslatedStatusLabel(status, t)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
      title={displayLabel}
    >
      {showDot && (
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT_CLASSES[tone]}`}
        />
      )}
      {displayLabel}
    </span>
  )
}
