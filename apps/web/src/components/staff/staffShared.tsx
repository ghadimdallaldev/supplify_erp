import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '../ui/badge'
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

export function StaffTabLoading({ className = 'py-12' }: { className?: string }) {
  return (
    <div className={`flex justify-center text-[var(--text-muted)] ${className}`}>
      <Loader2 className="h-8 w-8 animate-spin" />
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
