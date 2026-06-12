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
    <div className={cn('space-y-6', className)} aria-busy="true" aria-label="Loading tab">
      <div className="rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-6 shadow-sm">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-md" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
      <div className="rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-6 shadow-sm">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-4 h-32 w-full rounded-lg" />
      </div>
    </div>
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
