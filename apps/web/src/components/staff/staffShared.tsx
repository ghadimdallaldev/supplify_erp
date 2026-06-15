import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../../lib/utils'
import type { StaffMember, StaffPtoRequest, StaffShiftSwap } from '../../types'

export interface StaffFormState {
  firstName: string
  lastName: string
  displayName: string
  email: string
  phone: string
  role: string
  wageType: 'HOURLY' | 'SALARY' | 'CONTRACT' | 'OTHER'
  wageRate: string
  hireDate: string
  profileColor: string
}

export interface ShiftFormState {
  staffId: string
  role: string
  shiftDate: string
  startTime: string
  endTime: string
  notes: string
}

export const initialStaffForm: StaffFormState = {
  firstName: '',
  lastName: '',
  displayName: '',
  email: '',
  phone: '',
  role: '',
  wageType: 'HOURLY',
  wageRate: '',
  hireDate: '',
  profileColor: '#2563eb',
}

export const initialShiftForm: ShiftFormState = {
  staffId: '',
  role: '',
  shiftDate: '',
  startTime: '',
  endTime: '',
  notes: '',
}

export const wageTypeOptions: StaffFormState['wageType'][] = [
  'HOURLY',
  'SALARY',
  'CONTRACT',
  'OTHER',
]

export const ptoStatusLabels: Record<StaffPtoRequest['status'], string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
}

export const swapStatusLabels: Record<StaffShiftSwap['status'], string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
}

export const defaultAvailabilityBlocks = { blocks: [] as Array<{ start: string; end: string }> }

export type StaffTabKey =
  | 'today'
  | 'team'
  | 'schedule'
  | 'pto'
  | 'announcements'
  | 'documents'
  | 'reports'

export function StaffTabLoading({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]',
        className
      )}
      aria-busy="true"
      aria-label="Loading tab"
    >
      <div className="divide-y divide-[var(--app-border)]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 px-4 py-4 sm:px-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-10 w-full max-w-md" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function StaffPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--text-mid)]">{description}</p>
        ) : null}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
      {footer ? (
        <div className="border-t border-[var(--app-border)] px-4 py-3 sm:px-5">{footer}</div>
      ) : null}
    </section>
  )
}

export function StaffSummaryMetric({
  label,
  value,
  tone = 'default',
  onClick,
}: {
  label: string
  value: string | number
  tone?: 'default' | 'mint' | 'amber'
  onClick?: () => void
}) {
  const valueClass =
    tone === 'mint'
      ? 'text-[var(--mint)]'
      : tone === 'amber'
        ? 'text-[var(--amber)]'
        : 'text-[var(--text)]'

  const content = (
    <>
      <p className="text-xs text-[var(--text-mid)]">{label}</p>
      <p className={cn('mt-0.5 font-medium tabular-nums', valueClass)}>{value}</p>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left transition-colors hover:text-[var(--brand-mid)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)] focus-visible:ring-offset-2"
      >
        {content}
      </button>
    )
  }

  return <div>{content}</div>
}

export function StaffLabourSummaryStrip({
  metrics,
}: {
  metrics: Array<{
    label: string
    value: string | number
    tone?: 'default' | 'mint' | 'amber'
    onClick?: () => void
  }>
}) {
  return (
    <section
      data-testid="staff-labour-summary"
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {metrics.map((metric) => (
          <StaffSummaryMetric key={metric.label} {...metric} />
        ))}
      </div>
    </section>
  )
}

export function clampToISODate(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

/** Value for `<input type="datetime-local" />` (local calendar + clock, no timezone suffix). */
export function toDatetimeLocalValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm")
}

export function renderStaffStatus(status: StaffMember['status']) {
  switch (status) {
    case 'ACTIVE':
      return <Badge className="bg-[var(--mint-pale)] text-[var(--mint)]">Active</Badge>
    case 'INACTIVE':
      return <Badge className="bg-amber-100 text-amber-700">Inactive</Badge>
    case 'ARCHIVED':
      return <Badge className="bg-[var(--app-border-mid)] text-[var(--text-mid)]">Archived</Badge>
    default:
      return null
  }
}
