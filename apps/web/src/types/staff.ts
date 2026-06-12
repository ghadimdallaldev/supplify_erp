// Staff App types
export type StaffStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
export type StaffWageType = 'HOURLY' | 'SALARY' | 'CONTRACT' | 'OTHER'

export interface StaffPortalAccessInfo {
  hasAccount: boolean
  enabled: boolean
  magicLinkEnabled?: boolean
  status: 'none' | 'invited' | 'active' | 'disabled'
  invitedAt?: string | null
  lastLoginAt?: string | null
  disabledAt?: string | null
}

export interface StaffMember {
  id: string
  restaurantId: string
  status: StaffStatus
  firstName: string
  lastName: string
  displayName: string
  email?: string | null
  phone?: string | null
  role: string
  wageType: StaffWageType
  wageRate?: number | null
  hireDate?: string | null
  profileColor?: string | null
  portalAccess?: StaffPortalAccessInfo
  createdAt: string
  updatedAt: string
}

export type StaffShiftStatus = 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED'

export interface StaffShift {
  id: string
  restaurantId: string
  staffId?: string | null
  role: string
  shiftDate: string
  startsAt: string
  endsAt: string
  status: StaffShiftStatus
  notes?: string | null
  staff?: {
    id: string
    name: string
    role: string
  } | null
  createdAt: string
  updatedAt: string
}

export type StaffTimeEntryStatus = 'OPEN' | 'APPROVED' | 'LOCKED' | 'ADJUSTMENT_REQUIRED'

export interface StaffTimeEntry {
  id: string
  restaurantId: string
  staffId: string
  shiftId?: string | null
  clockInAt: string
  clockInMethod?: string | null
  clockOutAt?: string | null
  clockOutMethod?: string | null
  breakMinutes: number
  breakDetails?: Record<string, unknown> | null
  status: StaffTimeEntryStatus
  note?: string | null
  staffName?: string | null
  role?: string | null
  createdAt: string
  updatedAt: string
}

export type StaffPtoType = 'VACATION' | 'SICK' | 'PERSONAL' | 'UNPAID' | 'OTHER'
export type StaffPtoStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED'

export interface StaffPtoRequest {
  id: string
  restaurantId: string
  staffId: string
  type: StaffPtoType
  status: StaffPtoStatus
  startDate: string
  endDate: string
  hoursRequested?: number | null
  reason?: string | null
  managerNote?: string | null
  createdBy?: string | null
  createdAt: string
  updatedAt: string
  staff?: {
    id: string
    name: string
    role: string
  } | null
}

export interface StaffAvailability {
  id: string
  restaurantId: string
  staffId: string
  weekday: number
  availability: {
    blocks: Array<{ start: string; end: string }>
  }
  notes?: string | null
  staffName?: string | null
  createdAt: string
  updatedAt: string
}

export type StaffSwapStatus = 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED'

export interface StaffShiftSwap {
  id: string
  restaurantId: string
  shiftId: string
  requestedBy: string
  proposedCoverId?: string | null
  status: StaffSwapStatus
  reason?: string | null
  managerNote?: string | null
  createdAt: string
  updatedAt: string
  shift?: {
    id: string
    role: string
    startsAt: string
    endsAt: string
    date: string
  } | null
  requester?: {
    id: string
    name: string
  } | null
  cover?: {
    id: string
    name: string
  } | null
}

export interface StaffAnnouncement {
  id: string
  restaurantId: string
  title: string
  body: string
  audience?: Record<string, unknown> | null
  requireAck: boolean
  publishedAt: string
  createdBy?: string | null
  createdAt: string
  updatedAt: string
  acknowledgmentCount: number
  acknowledged: boolean
}

export interface StaffDocument {
  id: string
  restaurantId: string
  staffId: string
  docType: string
  title?: string | null
  fileUrl: string
  fileSize?: number | null
  uploadedAt: string
  expiresAt?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  staff?: {
    id: string
    name: string
  } | null
}

export type StaffIncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface StaffIncident {
  id: string
  restaurantId: string
  staffId?: string | null
  category: string
  severity: StaffIncidentSeverity
  occurredAt: string
  notes?: string | null
  followUpAction?: string | null
  attachments?: Record<string, unknown> | null
  staff?: {
    id: string
    name: string
  } | null
  createdAt: string
  updatedAt: string
}

export type StaffPerformanceNoteType = 'COACHING' | 'KUDOS' | 'GENERAL'

export interface StaffPerformanceNote {
  id: string
  restaurantId: string
  staffId: string
  noteType: StaffPerformanceNoteType
  body: string
  createdBy?: string | null
  staff?: {
    id: string
    name: string
  } | null
  createdAt: string
}

export type StaffPayrollStatus = 'DRAFT' | 'APPROVED' | 'EXPORTED'

export interface StaffPayrollExport {
  id: string
  restaurantId: string
  periodStart: string
  periodEnd: string
  status: StaffPayrollStatus
  totals?: Record<string, unknown> | null
  exportUrl?: string | null
  exportedAt?: string | null
  exportedBy?: string | null
  createdAt: string
  updatedAt: string
}

export type StaffLabourAlertSeverity = 'critical' | 'warning' | 'info'

export interface StaffLabourAlert {
  id: string
  severity: StaffLabourAlertSeverity
  title: string
  message: string
  staffId?: string
  deepLinkTab?: string
}

export interface StaffLabourSummary {
  date: string
  counts: {
    scheduledToday: number
    clockedInNow: number
    lateArrivals: number | null
    missedClockOuts: number
    pendingPto: number
    pendingSwaps: number
    estimatedLabourCostToday: number | null
    overtimeRiskCount: number | null
  }
  labourCostToday: { available: boolean; amount?: number }
  overtimeRisk?: Array<{ staffId: string; staffName: string; hoursWorked: number }> | null
  alerts: StaffLabourAlert[]
  meta?: {
    lateDetectionAvailable?: boolean
    labourCostAvailable?: boolean
    openEntriesIncluded?: boolean
  }
}

export interface StaffPayrollPreview {
  periodStart: string
  periodEnd: string
  totalHours: number
  totalBreakMinutes: number
  estimatedLabourCost: number | null
  staffLines: Array<{
    staffId: string
    staffName: string
    role: string
    wageType: string
    wageRate: number | null
    hours: number
    breakMinutes: number
    estimatedCost: number | null
  }>
  byRole: Array<{ role: string; hours: number }>
  staffMissingRate: Array<{ staffId: string; staffName: string }>
  hasOpenEntries: boolean
  note?: string | null
}
