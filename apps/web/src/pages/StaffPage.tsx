import { useMemo, useState } from 'react'
import { format, isAfter, parseISO } from 'date-fns'
import { toast } from 'react-hot-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import {
  useCreateStaffMemberMutation,
  useCreateStaffShiftMutation,
  useCheckInStaffMemberMutation,
  useCheckOutTimeEntryMutation,
  useGetStaffMembersQuery,
  useGetStaffShiftsQuery,
  useGetStaffTimeEntriesQuery,
} from '../services/staffApi'
import type { StaffMember } from '../types'
import { Select, SelectItem, SelectTrigger } from '../components/ui/select'

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
  profileColor: '',
}

const initialShiftForm: ShiftFormState = {
  staffId: '',
  role: '',
  shiftDate: '',
  startTime: '',
  endTime: '',
  notes: '',
}

function clampToISODate(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function toIsoDate(dateString: string) {
  return new Date(dateString)
}

export function StaffPage() {
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false)
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false)
  const [staffForm, setStaffForm] = useState<StaffFormState>(initialStaffForm)
  const [shiftForm, setShiftForm] = useState<ShiftFormState>(initialShiftForm)

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
        profileColor: staffForm.profileColor || undefined,
      }).unwrap()
      toast.success('Staff member added')
      setIsAddStaffOpen(false)
      resetStaffForm()
    } catch (error) {
      toast.error('Unable to create staff member')
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
    } catch (error) {
      toast.error('Unable to schedule shift')
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
                    <Select
                      value={shiftForm.staffId}
                      onValueChange={(value) => handleShiftInputChange('staffId', value)}
                    >
                      <SelectTrigger placeholder="Unassigned">
                        <option value="">Unassigned</option>
                        {staffMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.displayName} · {member.role}
                          </SelectItem>
                        ))}
                      </SelectTrigger>
                    </Select>
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
                    <Select value={staffForm.wageType} onValueChange={(value) => handleStaffInputChange('wageType', value)}>
                      <SelectTrigger>
                        <SelectItem value="HOURLY">Hourly</SelectItem>
                        <SelectItem value="SALARY">Salary</SelectItem>
                        <SelectItem value="CONTRACT">Contract</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectTrigger>
                    </Select>
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
                      value={staffForm.profileColor}
                      onChange={(event) => handleStaffInputChange('profileColor', event.target.value)}
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
                            Wage: {member.wageType.toLowerCase()} {member.wageRate ? `· ${member.wageRate.toFixed(2)}` : ''}
                          </p>
                          {member.hireDate ? <p>Hired {format(parseISO(member.hireDate), 'MMM d, yyyy')}</p> : null}
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
                              onClick={() => handleCheckOut(member, openEntry.id)}
                              disabled={checkingOut}
                            >
                              {checkingOut ? 'Closing…' : 'Clock out'}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleCheckIn(member)}
                              disabled={checkingIn}
                            >
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
                <div
                  key={entry.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{entry.staffName}</p>
                      <p className="text-xs text-gray-500">{entry.role}</p>
                    </div>
                    <Badge
                      className={
                        entry.clockOutAt
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }
                    >
                      {entry.clockOutAt ? 'Closed' : 'Open'}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-gray-500">
                    <p>
                      Clock in:{' '}
                      <span className="text-gray-700">
                        {format(new Date(entry.clockInAt), 'MMM d, yyyy · p')} ({entry.clockInMethod || 'web'})
                      </span>
                    </p>
                    {entry.clockOutAt ? (
                      <p>
                        Clock out:{' '}
                        <span className="text-gray-700">
                          {format(new Date(entry.clockOutAt), 'MMM d, yyyy · p')} ({entry.clockOutMethod || 'web'})
                        </span>
                      </p>
                    ) : null}
                    {entry.breakMinutes ? (
                      <p>
                        Breaks:{' '}
                        <span className="text-gray-700">{entry.breakMinutes} min</span>
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
                          <span className="font-medium text-gray-800">
                            {shift.staff?.name ?? 'Unassigned'}
                          </span>
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
    </div>
  )
}

export default StaffPage

