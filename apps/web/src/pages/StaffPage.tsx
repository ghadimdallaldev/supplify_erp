import { useMemo, useState } from 'react'
import { format, isAfter, parseISO } from 'date-fns'
import { toast } from 'react-hot-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  useCreateStaffMemberMutation,
  useCreateStaffShiftMutation,
  useCheckInStaffMemberMutation,
  useCheckOutTimeEntryMutation,
  useGetStaffMembersQuery,
  useGetStaffShiftsQuery,
  useGetStaffTimeEntriesQuery,
  useCreateStaffPtoRequestMutation,
  useGetStaffPtoRequestsQuery,
  useUpdateStaffPtoRequestMutation,
  useGetStaffAvailabilityQuery,
  useSetStaffAvailabilityMutation,
  useGetStaffSwapsQuery,
  useCreateStaffSwapMutation,
  useDecideStaffSwapMutation,
  useGetStaffAnnouncementsQuery,
  useCreateStaffAnnouncementMutation,
  useAcknowledgeStaffAnnouncementMutation,
  useGetStaffDocumentsQuery,
  useCreateStaffDocumentMutation,
  useGetStaffIncidentsQuery,
  useCreateStaffIncidentMutation,
  useGetStaffPerformanceNotesQuery,
  useCreateStaffPerformanceNoteMutation,
  useGetStaffPayrollExportsQuery,
  useCreateStaffPayrollExportMutation,
} from '../services/staffApi'
import type { StaffMember, StaffPtoRequest, StaffShiftSwap } from '../types'
import { formatPrice } from '../utils/format'

interface StaffFormState {
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

interface ShiftFormState {
  staffId: string
  role: string
  shiftDate: string
  startTime: string
  endTime: string
  notes: string
}

const initialStaffForm: StaffFormState = {
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

const initialShiftForm: ShiftFormState = {
  staffId: '',
  role: '',
  shiftDate: '',
  startTime: '',
  endTime: '',
  notes: '',
}

const wageTypeOptions: StaffFormState['wageType'][] = ['HOURLY', 'SALARY', 'CONTRACT', 'OTHER']

const ptoStatusLabels: Record<StaffPtoRequest['status'], string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
}

const swapStatusLabels: Record<StaffShiftSwap['status'], string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
}

const defaultAvailabilityBlocks = { blocks: [] as Array<{ start: string; end: string }> }

function clampToISODate(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function toIsoDate(dateString: string) {
  return new Date(dateString)
}

export function StaffPage() {
  const [activeTab, setActiveTab] = useState<'team' | 'schedule' | 'pto' | 'announcements' | 'documents' | 'reports'>('team')
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false)
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false)
  const [staffForm, setStaffForm] = useState<StaffFormState>(initialStaffForm)
  const [shiftForm, setShiftForm] = useState<ShiftFormState>(initialShiftForm)
  const [ptoForm, setPtoForm] = useState({
    staffId: '',
    type: 'VACATION',
    startDate: '',
    endDate: '',
    hoursRequested: '',
    reason: '',
  })
  const [availabilityForm, setAvailabilityForm] = useState({
    staffId: '',
    weekday: '0',
    start: '',
    end: '',
    notes: '',
  })
  const [swapForm, setSwapForm] = useState({
    shiftId: '',
    requestedBy: '',
    proposedCoverId: '',
    reason: '',
  })
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
    requireAck: false,
    roles: '',
  })
  const [documentForm, setDocumentForm] = useState({
    staffId: '',
    docType: '',
    title: '',
    fileUrl: '',
    expiresAt: '',
  })
  const [incidentForm, setIncidentForm] = useState({
    staffId: '',
    category: '',
    severity: 'LOW',
    occurredAt: clampToISODate(new Date()),
    notes: '',
  })
  const [performanceNoteForm, setPerformanceNoteForm] = useState({
    staffId: '',
    noteType: 'KUDOS',
    body: '',
  })
  const [payrollForm, setPayrollForm] = useState({
    periodStart: clampToISODate(new Date(new Date().getTime() - 14 * 24 * 60 * 60 * 1000)),
    periodEnd: clampToISODate(new Date()),
    regularHours: '',
    overtimeHours: '',
    breakMinutes: '',
  })

  const { data: staffMembers = [], isLoading: staffLoading } = useGetStaffMembersQuery()

  const today = new Date()
  const scheduleStart = clampToISODate(today)
  const scheduleEnd = clampToISODate(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000))

  const { data: shifts = [], isLoading: shiftsLoading } = useGetStaffShiftsQuery({
    startDate: scheduleStart,
    endDate: scheduleEnd,
  })

  const { data: timeEntries = [], isLoading: timeEntriesLoading } = useGetStaffTimeEntriesQuery({
    startDate: clampToISODate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)),
    endDate: clampToISODate(new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000)),
  })

  const [createStaffMember, { isLoading: creatingStaff }] = useCreateStaffMemberMutation()
  const [createShift, { isLoading: creatingShift }] = useCreateStaffShiftMutation()
  const [checkInStaff, { isLoading: checkingIn }] = useCheckInStaffMemberMutation()
  const [checkOutEntry, { isLoading: checkingOut }] = useCheckOutTimeEntryMutation()
  const { data: ptoRequests = [], isLoading: ptoLoading } = useGetStaffPtoRequestsQuery()
  const [createPtoRequest, { isLoading: creatingPto }] = useCreateStaffPtoRequestMutation()
  const [updatePtoRequest, { isLoading: updatingPto }] = useUpdateStaffPtoRequestMutation()
  const { data: availability = [] } = useGetStaffAvailabilityQuery()
  const [setAvailability, { isLoading: savingAvailability }] = useSetStaffAvailabilityMutation()
  const { data: swaps = [], isLoading: swapsLoading } = useGetStaffSwapsQuery()
  const [createSwap, { isLoading: creatingSwap }] = useCreateStaffSwapMutation()
  const [decideSwap, { isLoading: decidingSwap }] = useDecideStaffSwapMutation()
  const { data: announcements = [], isLoading: announcementsLoading } = useGetStaffAnnouncementsQuery()
  const [createAnnouncement, { isLoading: creatingAnnouncement }] = useCreateStaffAnnouncementMutation()
  const [ackAnnouncement] = useAcknowledgeStaffAnnouncementMutation()
  const { data: documents = [], isLoading: documentsLoading } = useGetStaffDocumentsQuery()
  const [createDocument, { isLoading: creatingDocument }] = useCreateStaffDocumentMutation()
  const { data: incidents = [], isLoading: incidentsLoading } = useGetStaffIncidentsQuery()
  const [createIncident, { isLoading: creatingIncident }] = useCreateStaffIncidentMutation()
  const { data: performanceNotes = [], isLoading: notesLoading } = useGetStaffPerformanceNotesQuery()
  const [createPerformanceNote, { isLoading: creatingPerformance }] = useCreateStaffPerformanceNoteMutation()
  const { data: payrollExports = [], isLoading: payrollLoading } = useGetStaffPayrollExportsQuery()
  const [createPayrollExport, { isLoading: creatingPayroll }] = useCreateStaffPayrollExportMutation()

  const openEntryByStaffId = useMemo(() => {
    const map = new Map<string, typeof timeEntries[number]>()
    timeEntries
      .filter((entry) => !entry.clockOutAt)
      .forEach((entry) => {
        map.set(entry.staffId, entry)
      })
    return map
  }, [timeEntries])

  const upcomingShifts = useMemo(() => {
    const now = new Date()
    return shifts
      .slice()
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .filter((shift) => isAfter(new Date(shift.endsAt), now))
      .slice(0, 10)
  }, [shifts])

  const recentEntries = useMemo(() => {
    return timeEntries
      .slice()
      .sort((a, b) => new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime())
      .slice(0, 8)
  }, [timeEntries])

  const handleStaffInputChange = (field: keyof StaffFormState, value: string) => {
    setStaffForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleShiftInputChange = (field: keyof ShiftFormState, value: string) => {
    setShiftForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const resetStaffForm = () => {
    setStaffForm(initialStaffForm)
  }

  const resetShiftForm = () => {
    setShiftForm(initialShiftForm)
  }

  const handleCreateStaff = async () => {
    if (!staffForm.firstName || !staffForm.lastName || !staffForm.role) {
      toast.error('Please provide first name, last name, and role')
      return
    }

    try {
      await createStaffMember({
        firstName: staffForm.firstName,
        lastName: staffForm.lastName,
        displayName: staffForm.displayName || `${staffForm.firstName} ${staffForm.lastName}`,
        email: staffForm.email || undefined,
        phone: staffForm.phone || undefined,
        role: staffForm.role,
        wageType: staffForm.wageType,
        wageRate: staffForm.wageRate ? Number(staffForm.wageRate) : undefined,
        hireDate: staffForm.hireDate || undefined,
        profileColor: staffForm.profileColor || '#2563eb',
      }).unwrap()
      toast.success('Staff member added')
      setIsAddStaffOpen(false)
      resetStaffForm()
    } catch (error: any) {
      const apiMessage =
        error?.data?.error?.message ||
        error?.error ||
        (typeof error?.message === 'string' ? error.message : null) ||
        'Unable to create staff member'
      toast.error(apiMessage)
    }
  }

  const handleCreateShift = async () => {
    if (!shiftForm.role || !shiftForm.shiftDate || !shiftForm.startTime || !shiftForm.endTime) {
      toast.error('Please provide role, date, start time, and end time')
      return
    }

    const startsAt = new Date(`${shiftForm.shiftDate}T${shiftForm.startTime}`)
    const endsAt = new Date(`${shiftForm.shiftDate}T${shiftForm.endTime}`)

    if (endsAt <= startsAt) {
      toast.error('End time must be after start time')
      return
    }

    try {
      await createShift({
        staffId: shiftForm.staffId || undefined,
        role: shiftForm.role,
        shiftDate: shiftForm.shiftDate,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: 'PUBLISHED',
        notes: shiftForm.notes || undefined,
      }).unwrap()
      toast.success('Shift scheduled')
      setIsAddShiftOpen(false)
      resetShiftForm()
    } catch (error: any) {
      const apiMessage =
        error?.data?.error?.message ||
        error?.error ||
        (typeof error?.message === 'string' ? error.message : null) ||
        'Unable to schedule shift'
      toast.error(apiMessage)
    }
  }

  const handleCheckIn = async (staff: StaffMember) => {
    try {
      await checkInStaff({
        staffId: staff.id,
        method: 'web',
      }).unwrap()
      toast.success(`${staff.displayName} checked in`)
    } catch (error) {
      toast.error('Unable to check in')
    }
  }

  const handleCheckOut = async (staff: StaffMember, timeEntryId: string) => {
    try {
      await checkOutEntry({
        id: timeEntryId,
        method: 'web',
      }).unwrap()
      toast.success(`${staff.displayName} checked out`)
    } catch (error) {
      toast.error('Unable to check out')
    }
  }

  const renderStaffStatus = (status: StaffMember['status']) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
      case 'INACTIVE':
        return <Badge className="bg-amber-100 text-amber-700">Inactive</Badge>
      case 'ARCHIVED':
        return <Badge className="bg-gray-200 text-gray-700">Archived</Badge>
      default:
        return null
    }
  }

  const handleCreatePto = async () => {
    if (!ptoForm.staffId || !ptoForm.startDate || !ptoForm.endDate) {
      toast.error('Please select staff and date range')
      return
    }
    try {
      await createPtoRequest({
        staffId: ptoForm.staffId,
        type: ptoForm.type as StaffPtoRequest['type'],
        startDate: ptoForm.startDate,
        endDate: ptoForm.endDate,
        hoursRequested: ptoForm.hoursRequested ? Number(ptoForm.hoursRequested) : undefined,
        reason: ptoForm.reason || undefined,
      }).unwrap()
      toast.success('PTO request recorded')
      setPtoForm({ staffId: '', type: 'VACATION', startDate: '', endDate: '', hoursRequested: '', reason: '' })
    } catch {
      toast.error('Unable to record PTO request')
    }
  }

  const handlePtoDecision = async (id: string, status: StaffPtoRequest['status']) => {
    const managerNote = window.prompt(`Add note for ${status.toLowerCase()} decision (optional):`) ?? undefined
    try {
      await updatePtoRequest({ id, status, managerNote }).unwrap()
      toast.success(`PTO ${status.toLowerCase()}`)
    } catch {
      toast.error('Unable to update PTO request')
    }
  }

  const handleSaveAvailability = async () => {
    if (!availabilityForm.staffId || !availabilityForm.start || !availabilityForm.end) {
      toast.error('Provide staff and time window')
      return
    }
    try {
      await setAvailability({
        staffId: availabilityForm.staffId,
        weekday: Number(availabilityForm.weekday),
        availability: {
          blocks: [
            {
              start: availabilityForm.start,
              end: availabilityForm.end,
            },
          ],
        },
        notes: availabilityForm.notes || undefined,
      }).unwrap()
      toast.success('Availability recorded')
      setAvailabilityForm({ staffId: '', weekday: '0', start: '', end: '', notes: '' })
    } catch {
      toast.error('Unable to save availability')
    }
  }

  const handleCreateSwap = async () => {
    if (!swapForm.shiftId || !swapForm.requestedBy) {
      toast.error('Please select shift and requesting staff')
      return
    }
    try {
      await createSwap({
        shiftId: swapForm.shiftId,
        requestedBy: swapForm.requestedBy,
        proposedCoverId: swapForm.proposedCoverId || undefined,
        reason: swapForm.reason || undefined,
      }).unwrap()
      toast.success('Shift swap requested')
      setSwapForm({ shiftId: '', requestedBy: '', proposedCoverId: '', reason: '' })
    } catch {
      toast.error('Unable to submit shift swap request')
    }
  }

  const handleSwapDecision = async (id: string, status: StaffShiftSwap['status']) => {
    const managerNote = window.prompt(`Add note for ${status.toLowerCase()} decision (optional):`) ?? undefined
    try {
      await decideSwap({ id, status, managerNote: managerNote || undefined }).unwrap()
      toast.success(`Swap ${status.toLowerCase()}`)
    } catch {
      toast.error('Unable to update swap')
    }
  }

  const handleCreateAnnouncement = async () => {
    if (!announcementForm.title || !announcementForm.body) {
      toast.error('Announcement needs a title and message')
      return
    }
    try {
      await createAnnouncement({
        title: announcementForm.title,
        body: announcementForm.body,
        requireAck: announcementForm.requireAck,
        audience: announcementForm.roles
          ? { roles: announcementForm.roles.split(',').map((role) => role.trim()).filter(Boolean) }
          : undefined,
      }).unwrap()
      toast.success('Announcement published')
      setAnnouncementForm({ title: '', body: '', requireAck: false, roles: '' })
    } catch {
      toast.error('Unable to publish announcement')
    }
  }

  const handleAckAnnouncement = async (announcementId: string, staffId: string) => {
    try {
      await ackAnnouncement({ id: announcementId, staffId }).unwrap()
      toast.success('Acknowledged')
    } catch {
      toast.error('Unable to acknowledge announcement')
    }
  }

  const handleCreateDocument = async () => {
    if (!documentForm.staffId || !documentForm.docType || !documentForm.fileUrl) {
      toast.error('Please provide staff, type, and file URL')
      return
    }
    try {
      await createDocument({
        staffId: documentForm.staffId,
        docType: documentForm.docType,
        title: documentForm.title || undefined,
        fileUrl: documentForm.fileUrl,
        expiresAt: documentForm.expiresAt || undefined,
      }).unwrap()
      toast.success('Document stored')
      setDocumentForm({ staffId: '', docType: '', title: '', fileUrl: '', expiresAt: '' })
    } catch {
      toast.error('Unable to store document')
    }
  }

  const handleCreateIncident = async () => {
    if (!incidentForm.category || !incidentForm.occurredAt) {
      toast.error('Incident requires a category and time')
      return
    }
    try {
      await createIncident({
        staffId: incidentForm.staffId || undefined,
        category: incidentForm.category,
        severity: incidentForm.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        occurredAt: new Date(incidentForm.occurredAt).toISOString(),
        notes: incidentForm.notes || undefined,
      }).unwrap()
      toast.success('Incident logged')
      setIncidentForm({
        staffId: '',
        category: '',
        severity: 'LOW',
        occurredAt: clampToISODate(new Date()),
        notes: '',
      })
    } catch {
      toast.error('Unable to log incident')
    }
  }

  const handleCreatePerformanceNote = async () => {
    if (!performanceNoteForm.staffId || !performanceNoteForm.body) {
      toast.error('Performance note requires staff and message')
      return
    }
    try {
      await createPerformanceNote({
        staffId: performanceNoteForm.staffId,
        noteType: performanceNoteForm.noteType as 'COACHING' | 'KUDOS' | 'GENERAL',
        body: performanceNoteForm.body,
      }).unwrap()
      toast.success('Performance note saved')
      setPerformanceNoteForm({ staffId: '', noteType: 'KUDOS', body: '' })
    } catch {
      toast.error('Unable to save performance note')
    }
  }

  const handleCreatePayroll = async () => {
    if (!payrollForm.periodStart || !payrollForm.periodEnd) {
      toast.error('Payroll export needs start and end dates')
      return
    }
    const totals: Record<string, number> = {}
    if (payrollForm.regularHours) totals.regularHours = Number(payrollForm.regularHours)
    if (payrollForm.overtimeHours) totals.overtimeHours = Number(payrollForm.overtimeHours)
    if (payrollForm.breakMinutes) totals.breakMinutes = Number(payrollForm.breakMinutes)
    try {
      await createPayrollExport({
        periodStart: payrollForm.periodStart,
        periodEnd: payrollForm.periodEnd,
        totals: Object.keys(totals).length ? totals : undefined,
      }).unwrap()
      toast.success('Payroll summary exported')
      setPayrollForm({
        periodStart: clampToISODate(new Date(new Date().getTime() - 14 * 24 * 60 * 60 * 1000)),
        periodEnd: clampToISODate(new Date()),
        regularHours: '',
        overtimeHours: '',
        breakMinutes: '',
      })
    } catch {
      toast.error('Unable to export payroll')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Staff operations</h1>
          <p className="text-sm text-gray-500">
            Schedule shifts, manage time, and keep your single-location team aligned.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={isAddShiftOpen} onOpenChange={setIsAddShiftOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Create shift</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule shift</DialogTitle>
                <DialogDescription>Drop a shift on the calendar with clear start and end times.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="shiftRole">Role</Label>
                  <Input
                    id="shiftRole"
                    value={shiftForm.role}
                    onChange={(event) => handleShiftInputChange('role', event.target.value)}
                    placeholder="Server, kitchen, cashier..."
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="shiftDate">Date</Label>
                    <Input
                      id="shiftDate"
                      type="date"
                      value={shiftForm.shiftDate}
                      onChange={(event) => handleShiftInputChange('shiftDate', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="shiftStaff">Assign to (optional)</Label>
                    <select
                      id="shiftStaff"
                      value={shiftForm.staffId}
                      onChange={(event) => handleShiftInputChange('staffId', event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {staffMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName} · {member.role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="startTime">Start time</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={shiftForm.startTime}
                      onChange={(event) => handleShiftInputChange('startTime', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endTime">End time</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={shiftForm.endTime}
                      onChange={(event) => handleShiftInputChange('endTime', event.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="shiftNotes">Notes</Label>
                  <Input
                    id="shiftNotes"
                    value={shiftForm.notes}
                    onChange={(event) => handleShiftInputChange('notes', event.target.value)}
                    placeholder="Prep, handover, reminders..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateShift}
                  disabled={creatingShift}
                >
                  {creatingShift ? 'Scheduling…' : 'Schedule shift'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddStaffOpen} onOpenChange={setIsAddStaffOpen}>
            <DialogTrigger asChild>
              <Button>Add staff</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add staff member</DialogTitle>
                <DialogDescription>Capture key details so they can clock shifts and receive schedules.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      value={staffForm.firstName}
                      onChange={(event) => handleStaffInputChange('firstName', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      value={staffForm.lastName}
                      onChange={(event) => handleStaffInputChange('lastName', event.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="displayName">Display name</Label>
                  <Input
                    id="displayName"
                    value={staffForm.displayName}
                    onChange={(event) => handleStaffInputChange('displayName', event.target.value)}
                    placeholder="Optional alias used in the app"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={staffForm.email}
                      onChange={(event) => handleStaffInputChange('email', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={staffForm.phone}
                      onChange={(event) => handleStaffInputChange('phone', event.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    value={staffForm.role}
                    onChange={(event) => handleStaffInputChange('role', event.target.value)}
                    placeholder="Server, kitchen, barista..."
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="wageType">Wage type</Label>
                    <select
                      id="wageType"
                      value={staffForm.wageType}
                      onChange={(event) => handleStaffInputChange('wageType', event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {wageTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option.charAt(0) + option.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="wageRate">Base rate</Label>
                    <Input
                      id="wageRate"
                      type="number"
                      min={0}
                      step={0.01}
                      value={staffForm.wageRate}
                      onChange={(event) => handleStaffInputChange('wageRate', event.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="hireDate">Hire date</Label>
                    <Input
                      id="hireDate"
                      type="date"
                      value={staffForm.hireDate}
                      onChange={(event) => handleStaffInputChange('hireDate', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="profileColor">Accent color</Label>
                    <Input
                      id="profileColor"
                      type="color"
                    value={staffForm.profileColor || '#2563eb'}
                    onChange={(event) => handleStaffInputChange('profileColor', event.target.value || '#2563eb')}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateStaff} disabled={creatingStaff}>
                  {creatingStaff ? 'Adding…' : 'Add staff member'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="schedule">Schedule & time</TabsTrigger>
          <TabsTrigger value="pto">PTO & availability</TabsTrigger>
          <TabsTrigger value="announcements">Announcements & swaps</TabsTrigger>
          <TabsTrigger value="documents">Docs & incidents</TabsTrigger>
          <TabsTrigger value="reports">Payroll & insights</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Team directory</CardTitle>
                <CardDescription>Active staff with quick access to roles, contact details, and clock status.</CardDescription>
              </CardHeader>
              <CardContent>
                {staffLoading ? (
                  <p className="text-sm text-gray-500">Loading staff…</p>
                ) : staffMembers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                    <p>No staff yet. Add your first teammate to start scheduling and clocking time.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {staffMembers.map((member) => {
                      const openEntry = openEntryByStaffId.get(member.id)
                      const isOnShift = Boolean(openEntry)
                      return (
                        <div
                          key={member.id}
                          className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: member.profileColor || '#2563eb' }}
                              />
                              <p className="text-sm font-semibold text-gray-900">{member.displayName}</p>
                              {renderStaffStatus(member.status)}
                            </div>
                            <p className="text-xs text-gray-500">
                              {member.role} · {member.email || 'No email'}
                            </p>
                            {member.phone ? <p className="text-xs text-gray-400">{member.phone}</p> : null}
                          </div>
                          <div className="flex flex-col items-start gap-2 text-xs text-gray-500 sm:flex-row sm:items-center">
                            <div className="space-y-1">
                              <p>
                                Wage: {member.wageType.toLowerCase()}{' '}
                                {member.wageRate ? `· ${formatPrice(member.wageRate)}` : ''}
                              </p>
                              {member.hireDate ? (
                                <p>Hired {format(parseISO(member.hireDate), 'MMM d, yyyy')}</p>
                              ) : null}
                              <p>
                                Status:{' '}
                                <span className="font-medium text-gray-700">
                                  {isOnShift ? 'On shift' : 'Off shift'}
                                </span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {isOnShift ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEntry && handleCheckOut(member, openEntry.id)}
                                  disabled={checkingOut}
                                >
                                  {checkingOut ? 'Closing…' : 'Clock out'}
                                </Button>
                              ) : (
                                <Button size="sm" onClick={() => handleCheckIn(member)} disabled={checkingIn}>
                                  {checkingIn ? 'Clocking…' : 'Clock in'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Latest time entries</CardTitle>
                <CardDescription>Review who just clocked in, clocked out, and any breaks captured.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {timeEntriesLoading ? (
                  <p className="text-sm text-gray-500">Loading time entries…</p>
                ) : recentEntries.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                    <p>No time entries in the last few days.</p>
                  </div>
                ) : (
                  recentEntries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{entry.staffName}</p>
                          <p className="text-xs text-gray-500">{entry.role}</p>
                        </div>
                        <Badge
                          className={
                            entry.clockOutAt ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }
                        >
                          {entry.clockOutAt ? 'Closed' : 'Open'}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-gray-500">
                        <p>
                          Clock in:{' '}
                          <span className="text-gray-700">
                            {format(new Date(entry.clockInAt), 'MMM d, yyyy · p')} (
                            {entry.clockInMethod || 'web'})
                          </span>
                        </p>
                        {entry.clockOutAt ? (
                          <p>
                            Clock out:{' '}
                            <span className="text-gray-700">
                              {format(new Date(entry.clockOutAt), 'MMM d, yyyy · p')} (
                              {entry.clockOutMethod || 'web'})
                            </span>
                          </p>
                        ) : null}
                        {entry.breakMinutes ? (
                          <p>
                            Breaks: <span className="text-gray-700">{entry.breakMinutes} min</span>
                          </p>
                        ) : null}
                        {entry.note ? <p className="text-gray-400">Note: {entry.note}</p> : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming schedule</CardTitle>
              <CardDescription>At-a-glance view of the next week for quick staffing checks.</CardDescription>
            </CardHeader>
            <CardContent>
              {shiftsLoading ? (
                <p className="text-sm text-gray-500">Loading schedule…</p>
              ) : upcomingShifts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                  <p>No upcoming shifts scheduled yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Date</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Staff</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Role</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Time</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Status</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {upcomingShifts.map((shift) => (
                        <tr key={shift.id}>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                            {format(new Date(shift.shiftDate), 'EEE, MMM d')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-800">{shift.staff?.name ?? 'Unassigned'}</span>
                              {shift.staff?.role ? (
                                <span className="text-xs text-gray-500">{shift.staff.role}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{shift.role}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {format(new Date(shift.startsAt), 'p')} – {format(new Date(shift.endsAt), 'p')}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className="bg-blue-100 text-blue-700">{shift.status.toLowerCase()}</Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{shift.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent shift swaps</CardTitle>
              <CardDescription>Approve coverage changes to keep the board accurate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {swapsLoading ? (
                <p className="text-sm text-gray-500">Loading swaps…</p>
              ) : swaps.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                  <p>No swap requests yet.</p>
                </div>
              ) : (
                swaps.map((swap) => (
                  <div key={swap.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {swap.requester?.name} → {swap.cover?.name || 'Waiting for cover'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {swap.shift?.role} ·{' '}
                          {swap.shift ? format(new Date(swap.shift.startsAt), 'MMM d, p') : 'TBD'}
                        </p>
                      </div>
                      <Badge className="bg-indigo-100 text-indigo-700">
                        {swapStatusLabels[swap.status]}
                      </Badge>
                    </div>
                    {swap.reason ? <p className="mt-2 text-xs text-gray-500">Reason: {swap.reason}</p> : null}
                    {swap.managerNote ? (
                      <p className="mt-1 text-xs text-gray-400">Decision note: {swap.managerNote}</p>
                    ) : null}
                    {swap.status === 'REQUESTED' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSwapDecision(swap.id, 'APPROVED')}
                          disabled={decidingSwap}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSwapDecision(swap.id, 'DECLINED')}
                          disabled={decidingSwap}
                        >
                          Decline
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Log new swap</CardTitle>
              <CardDescription>Let a team member request coverage for their shift.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="swapShift">Shift</Label>
                <select
                  id="swapShift"
                  value={swapForm.shiftId}
                  onChange={(event) => setSwapForm((prev) => ({ ...prev, shiftId: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select shift</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {format(new Date(shift.startsAt), 'EEE, MMM d · p')} — {shift.role}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="swapRequester">Requested by</Label>
                <select
                  id="swapRequester"
                  value={swapForm.requestedBy}
                  onChange={(event) => setSwapForm((prev) => ({ ...prev, requestedBy: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Choose staff</option>
                  {staffMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="swapCover">Proposed cover</Label>
                <select
                  id="swapCover"
                  value={swapForm.proposedCoverId}
                  onChange={(event) => setSwapForm((prev) => ({ ...prev, proposedCoverId: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Open to team</option>
                  {staffMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="swapReason">Reason</Label>
                <Input
                  id="swapReason"
                  value={swapForm.reason}
                  onChange={(event) => setSwapForm((prev) => ({ ...prev, reason: event.target.value }))}
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button onClick={handleCreateSwap} disabled={creatingSwap}>
                  {creatingSwap ? 'Submitting…' : 'Submit swap request'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pto" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>PTO & leave requests</CardTitle>
              <CardDescription>Approve vacation, sick days, or unpaid leave with policy context.</CardDescription>
            </CardHeader>
            <CardContent>
              {ptoLoading ? (
                <p className="text-sm text-gray-500">Loading PTO requests…</p>
              ) : ptoRequests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                  <p>No requests yet. Encourage staff to submit time off from the Staff App.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {ptoRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {request.staff?.name || 'Team member'} · {request.type.toLowerCase()}
                          </p>
                          <p className="text-xs text-gray-500">
                            {format(new Date(request.startDate), 'MMM d, yyyy')} →{' '}
                            {format(new Date(request.endDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <Badge
                          className={
                            request.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : request.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-200 text-gray-700'
                          }
                        >
                          {ptoStatusLabels[request.status]}
                        </Badge>
                      </div>
                      {request.reason ? (
                        <p className="mt-2 text-xs text-gray-500">Reason: {request.reason}</p>
                      ) : null}
                      {request.managerNote ? (
                        <p className="mt-1 text-xs text-gray-400">Manager note: {request.managerNote}</p>
                      ) : null}
                      {request.status === 'PENDING' ? (
                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePtoDecision(request.id, 'APPROVED')}
                            disabled={updatingPto}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePtoDecision(request.id, 'DECLINED')}
                            disabled={updatingPto}
                          >
                            Decline
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Record new PTO</CardTitle>
              <CardDescription>Capture staff requests directly in Supplify.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ptoStaff">Staff</Label>
                <select
                  id="ptoStaff"
                  value={ptoForm.staffId}
                  onChange={(event) => setPtoForm((prev) => ({ ...prev, staffId: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select staff</option>
                  {staffMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="ptoType">Type</Label>
                <select
                  id="ptoType"
                  value={ptoForm.type}
                  onChange={(event) => setPtoForm((prev) => ({ ...prev, type: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="VACATION">Vacation</option>
                  <option value="SICK">Sick</option>
                  <option value="PERSONAL">Personal</option>
                  <option value="UNPAID">Unpaid</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <Label htmlFor="ptoStart">Start date</Label>
                <Input
                  id="ptoStart"
                  type="date"
                  value={ptoForm.startDate}
                  onChange={(event) => setPtoForm((prev) => ({ ...prev, startDate: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ptoEnd">End date</Label>
                <Input
                  id="ptoEnd"
                  type="date"
                  value={ptoForm.endDate}
                  onChange={(event) => setPtoForm((prev) => ({ ...prev, endDate: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ptoHours">Hours (optional)</Label>
                <Input
                  id="ptoHours"
                  type="number"
                  min={0}
                  step={0.5}
                  value={ptoForm.hoursRequested}
                  onChange={(event) => setPtoForm((prev) => ({ ...prev, hoursRequested: event.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="ptoReason">Reason</Label>
                <Input
                  id="ptoReason"
                  value={ptoForm.reason}
                  onChange={(event) => setPtoForm((prev) => ({ ...prev, reason: event.target.value }))}
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button onClick={handleCreatePto} disabled={creatingPto}>
                  {creatingPto ? 'Recording…' : 'Record PTO'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Availability</CardTitle>
              <CardDescription>Recurring preferences keep schedule conflicts minimal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <Label htmlFor="availabilityStaff">Staff</Label>
                  <select
                    id="availabilityStaff"
                    value={availabilityForm.staffId}
                    onChange={(event) => setAvailabilityForm((prev) => ({ ...prev, staffId: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select staff</option>
                    {staffMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="availabilityDay">Weekday</Label>
                  <select
                    id="availabilityDay"
                    value={availabilityForm.weekday}
                    onChange={(event) => setAvailabilityForm((prev) => ({ ...prev, weekday: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="0">Sunday</option>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="availabilityStart">Start</Label>
                  <Input
                    id="availabilityStart"
                    type="time"
                    value={availabilityForm.start}
                    onChange={(event) => setAvailabilityForm((prev) => ({ ...prev, start: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="availabilityEnd">End</Label>
                  <Input
                    id="availabilityEnd"
                    type="time"
                    value={availabilityForm.end}
                    onChange={(event) => setAvailabilityForm((prev) => ({ ...prev, end: event.target.value }))}
                  />
                </div>
                <div className="sm:col-span-4">
                  <Label htmlFor="availabilityNotes">Notes</Label>
                  <Input
                    id="availabilityNotes"
                    value={availabilityForm.notes}
                    onChange={(event) => setAvailabilityForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveAvailability} disabled={savingAvailability}>
                  {savingAvailability ? 'Saving…' : 'Save availability'}
                </Button>
              </div>
              {availability.length ? (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Staff</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Day</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Window</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {availability.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2 text-gray-700">{item.staffName}</td>
                          <td className="px-4 py-2 text-gray-700">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][item.weekday]}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {(item.availability?.blocks || defaultAvailabilityBlocks.blocks)
                              .map((block) => `${block.start} – ${block.end}`)
                              .join(', ')}
                          </td>
                          <td className="px-4 py-2 text-gray-500">{item.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="announcements" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Announcements</CardTitle>
              <CardDescription>Keep every shift aligned with clear broadcasts and read receipts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="announcementTitle">Title</Label>
                  <Input
                    id="announcementTitle"
                    value={announcementForm.title}
                    onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, title: event.target.value }))}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      id="announcementAck"
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-gray-300"
                      checked={announcementForm.requireAck}
                      onChange={(event) =>
                        setAnnouncementForm((prev) => ({ ...prev, requireAck: event.target.checked }))
                      }
                    />
                    <Label htmlFor="announcementAck" className="text-xs">
                      Require acknowledgment
                    </Label>
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="announcementBody">Message</Label>
                <Textarea
                  id="announcementBody"
                  rows={4}
                  value={announcementForm.body}
                  onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, body: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="announcementRoles">Audience roles (comma separated)</Label>
                <Input
                  id="announcementRoles"
                  value={announcementForm.roles}
                  onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, roles: event.target.value }))}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleCreateAnnouncement} disabled={creatingAnnouncement}>
                  {creatingAnnouncement ? 'Publishing…' : 'Publish announcement'}
                </Button>
              </div>
              <div className="space-y-3">
                {announcementsLoading ? (
                  <p className="text-sm text-gray-500">Loading announcements…</p>
                ) : announcements.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                    <p>No announcements yet.</p>
                  </div>
                ) : (
                  announcements.map((announcement) => (
                    <div key={announcement.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{announcement.title}</p>
                          <p className="text-xs text-gray-500">
                            {format(new Date(announcement.publishedAt), 'MMM d, yyyy · p')}
                          </p>
                        </div>
                        <Badge className="bg-purple-100 text-purple-700">
                          {announcement.requireAck
                            ? `${announcement.acknowledgmentCount} acknowledged`
                            : 'Info'}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">{announcement.body}</p>
                      {announcement.audience?.roles ? (
                        <p className="mt-2 text-xs text-gray-400">
                          Audience: {(announcement.audience.roles as string[]).join(', ')}
                        </p>
                      ) : null}
                      {announcement.requireAck ? (
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const staffId = window.prompt('Enter staff ID acknowledging this announcement:')
                              if (staffId) handleAckAnnouncement(announcement.id, staffId)
                            }}
                          >
                            Record acknowledgment
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Documents & certifications</CardTitle>
              <CardDescription>Store staff paperwork and track expirations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="docStaff">Staff</Label>
                  <select
                    id="docStaff"
                    value={documentForm.staffId}
                    onChange={(event) => setDocumentForm((prev) => ({ ...prev, staffId: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select staff</option>
                    {staffMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="docType">Type</Label>
                  <Input
                    id="docType"
                    value={documentForm.docType}
                    onChange={(event) => setDocumentForm((prev) => ({ ...prev, docType: event.target.value }))}
                    placeholder="e.g. Food handler cert"
                  />
                </div>
                <div>
                  <Label htmlFor="docUrl">File URL</Label>
                  <Input
                    id="docUrl"
                    value={documentForm.fileUrl}
                    onChange={(event) => setDocumentForm((prev) => ({ ...prev, fileUrl: event.target.value }))}
                    placeholder="https://"
                  />
                </div>
                <div>
                  <Label htmlFor="docExpires">Expires</Label>
                  <Input
                    id="docExpires"
                    type="date"
                    value={documentForm.expiresAt}
                    onChange={(event) => setDocumentForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="docTitle">Title</Label>
                  <Input
                    id="docTitle"
                    value={documentForm.title}
                    onChange={(event) => setDocumentForm((prev) => ({ ...prev, title: event.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleCreateDocument} disabled={creatingDocument}>
                  {creatingDocument ? 'Uploading…' : 'Store document'}
                </Button>
              </div>
              {documentsLoading ? (
                <p className="text-sm text-gray-500">Loading documents…</p>
              ) : documents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                  <p>No documents uploaded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {doc.title || doc.docType} · {doc.staff?.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {doc.expiresAt ? `Expires ${format(new Date(doc.expiresAt), 'MMM d, yyyy')}` : 'No expiry'}
                          </p>
                        </div>
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          View file
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Incidents & performance</CardTitle>
              <CardDescription>Track coaching, kudos, and follow-up tasks.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900">Log incident</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    <div>
                      <Label htmlFor="incidentStaff">Staff</Label>
                      <select
                        id="incidentStaff"
                        value={incidentForm.staffId}
                        onChange={(event) =>
                          setIncidentForm((prev) => ({ ...prev, staffId: event.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {staffMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="incidentCategory">Category</Label>
                      <Input
                        id="incidentCategory"
                        value={incidentForm.category}
                        onChange={(event) =>
                          setIncidentForm((prev) => ({ ...prev, category: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="incidentSeverity">Severity</Label>
                      <select
                        id="incidentSeverity"
                        value={incidentForm.severity}
                        onChange={(event) =>
                          setIncidentForm((prev) => ({ ...prev, severity: event.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="CRITICAL">Critical</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="incidentDate">Occurred at</Label>
                      <Input
                        id="incidentDate"
                        type="datetime-local"
                        value={incidentForm.occurredAt}
                        onChange={(event) =>
                          setIncidentForm((prev) => ({ ...prev, occurredAt: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="incidentNotes">Notes</Label>
                      <Textarea
                        id="incidentNotes"
                        rows={2}
                        value={incidentForm.notes}
                        onChange={(event) =>
                          setIncidentForm((prev) => ({ ...prev, notes: event.target.value }))
                        }
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={handleCreateIncident} disabled={creatingIncident}>
                        {creatingIncident ? 'Saving…' : 'Log incident'}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {incidentsLoading ? (
                    <p className="text-sm text-gray-500">Loading incidents…</p>
                  ) : incidents.length === 0 ? (
                    <p className="text-sm text-gray-500">No incidents recorded.</p>
                  ) : (
                    incidents.slice(0, 5).map((incident) => (
                      <div key={incident.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-gray-900">
                            {incident.category} · {incident.staff?.name || 'Unassigned'}
                          </p>
                          <Badge className="bg-red-100 text-red-700">{incident.severity.toLowerCase()}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {format(new Date(incident.occurredAt), 'MMM d, yyyy · p')}
                        </p>
                        {incident.notes ? <p className="mt-1 text-xs text-gray-500">{incident.notes}</p> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900">Performance notes</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    <div>
                      <Label htmlFor="performanceStaff">Staff</Label>
                      <select
                        id="performanceStaff"
                        value={performanceNoteForm.staffId}
                        onChange={(event) =>
                          setPerformanceNoteForm((prev) => ({ ...prev, staffId: event.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Select staff</option>
                        {staffMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="performanceType">Type</Label>
                      <select
                        id="performanceType"
                        value={performanceNoteForm.noteType}
                        onChange={(event) =>
                          setPerformanceNoteForm((prev) => ({ ...prev, noteType: event.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="KUDOS">Kudos</option>
                        <option value="COACHING">Coaching</option>
                        <option value="GENERAL">General</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="performanceBody">Note</Label>
                      <Textarea
                        id="performanceBody"
                        rows={2}
                        value={performanceNoteForm.body}
                        onChange={(event) =>
                          setPerformanceNoteForm((prev) => ({ ...prev, body: event.target.value }))
                        }
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={handleCreatePerformanceNote} disabled={creatingPerformance}>
                        {creatingPerformance ? 'Saving…' : 'Save note'}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {notesLoading ? (
                    <p className="text-sm text-gray-500">Loading notes…</p>
                  ) : performanceNotes.length === 0 ? (
                    <p className="text-sm text-gray-500">No notes recorded.</p>
                  ) : (
                    performanceNotes.slice(0, 5).map((note) => (
                      <div key={note.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                        <p className="text-sm font-semibold text-gray-900">
                          {note.staff?.name} · {note.noteType.toLowerCase()}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">{note.body}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {format(new Date(note.createdAt), 'MMM d, yyyy · p')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payroll exports</CardTitle>
              <CardDescription>Review approved hours and generate payroll-ready exports.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="payrollStart">Period start</Label>
                  <Input
                    id="payrollStart"
                    type="date"
                    value={payrollForm.periodStart}
                    onChange={(event) => setPayrollForm((prev) => ({ ...prev, periodStart: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="payrollEnd">Period end</Label>
                  <Input
                    id="payrollEnd"
                    type="date"
                    value={payrollForm.periodEnd}
                    onChange={(event) => setPayrollForm((prev) => ({ ...prev, periodEnd: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="payrollRegular">Regular hours</Label>
                  <Input
                    id="payrollRegular"
                    type="number"
                    min={0}
                    step={0.25}
                    value={payrollForm.regularHours}
                    onChange={(event) => setPayrollForm((prev) => ({ ...prev, regularHours: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="payrollOvertime">Overtime hours</Label>
                  <Input
                    id="payrollOvertime"
                    type="number"
                    min={0}
                    step={0.25}
                    value={payrollForm.overtimeHours}
                    onChange={(event) => setPayrollForm((prev) => ({ ...prev, overtimeHours: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="payrollBreaks">Break minutes</Label>
                  <Input
                    id="payrollBreaks"
                    type="number"
                    min={0}
                    step={1}
                    value={payrollForm.breakMinutes}
                    onChange={(event) => setPayrollForm((prev) => ({ ...prev, breakMinutes: event.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleCreatePayroll} disabled={creatingPayroll}>
                  {creatingPayroll ? 'Generating…' : 'Generate export'}
                </Button>
              </div>
              {payrollLoading ? (
                <p className="text-sm text-gray-500">Loading payroll exports…</p>
              ) : payrollExports.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                  <p>No payroll exports generated yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Period</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Status</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Totals</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Export</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {payrollExports.map((exportRow) => (
                        <tr key={exportRow.id}>
                          <td className="px-4 py-3 text-gray-700">
                            {format(new Date(exportRow.periodStart), 'MMM d, yyyy')} –{' '}
                            {format(new Date(exportRow.periodEnd), 'MMM d, yyyy')}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className="bg-slate-100 text-slate-700">{exportRow.status.toLowerCase()}</Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {exportRow.totals
                              ? Object.entries(exportRow.totals)
                                  .map(([key, value]) => `${key}: ${value}`)
                                  .join(' · ')
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {exportRow.exportUrl ? (
                              <a
                                href={exportRow.exportUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Download
                              </a>
                            ) : (
                              'Draft'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default StaffPage

