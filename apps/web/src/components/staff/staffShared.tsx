import type { ReactNode } from 'react'
import { format } from 'date-fns'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { usePermissions } from '../../hooks/usePermissions'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { SummaryStrip } from '../ui/app-panel'
import { cn } from '../../lib/utils'
import type { StaffMember } from '../../types'

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

/** Staff roster mutations require edit/manage/invite permissions (matches API staffMutationGuard). */
export function useStaffWriteAccess(): boolean {
  const { canAny } = usePermissions()
  return canAny('STAFF_EDIT', 'STAFF_MANAGE', 'STAFF_INVITE')
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

export const defaultAvailabilityBlocks = { blocks: [] as Array<{ start: string; end: string }> }

export function getWeekdayLabels(t: TFunction<'staff'>): string[] {
  return t('shared.weekdaysShort', { returnObjects: true }) as string[]
}

export type StaffTabKey =
  | 'today'
  | 'team'
  | 'schedule'
  | 'pto'
  | 'announcements'
  | 'documents'
  | 'reports'

export function StaffTabLoading({ className }: { className?: string }) {
  const { t } = useTranslation('staff')

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]',
        className
      )}
      aria-busy="true"
      aria-label={t('shared.loadingTab')}
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

export function StaffLabourSummaryStrip({
  metrics,
}: {
  metrics: Array<{
    label: string
    value: string | number
    hint?: string
    tone?: 'default' | 'mint' | 'amber' | 'danger' | 'brand'
    onClick?: () => void
  }>
}) {
  return <SummaryStrip testId="staff-labour-summary" columns={8} metrics={metrics} />
}

export function clampToISODate(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

/** Value for `<input type="datetime-local" />` (local calendar + clock, no timezone suffix). */
export function toDatetimeLocalValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm")
}

export function renderStaffStatus(status: StaffMember['status'], t: TFunction<'staff'>) {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge className="bg-[var(--mint-pale)] text-[var(--mint)]">
          {t('shared.staffStatus.ACTIVE')}
        </Badge>
      )
    case 'INACTIVE':
      return (
        <Badge className="bg-amber-100 text-amber-700">{t('shared.staffStatus.INACTIVE')}</Badge>
      )
    case 'ARCHIVED':
      return (
        <Badge className="bg-[var(--app-border-mid)] text-[var(--text-mid)]">
          {t('shared.staffStatus.ARCHIVED')}
        </Badge>
      )
    default:
      return null
  }
}
