import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'react-hot-toast'
import { AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../ui/dialog'
import { Select, SelectTrigger } from '../../ui/select'
import {
  useCheckInStaffMemberMutation,
  useCheckOutTimeEntryMutation,
  useCreateStaffMemberMutation,
  useGetStaffMembersQuery,
  useGetStaffTimeEntriesQuery,
} from '../../../services/staffApi'
import type { StaffMember } from '../../../types'
import { formatPrice } from '../../../utils/format'
import { usePermissions } from '../../../hooks/usePermissions'
import { StaffPortalAccessPanel } from '../../StaffPortalAccessPanel'
import { getApiErrorMessage } from '../../../lib/apiError'
import {
  clampToISODate,
  initialStaffForm,
  renderStaffStatus,
  wageTypeOptions,
  type StaffFormState,
} from '../staffShared'

export function StaffTeamTab() {
  const { canAny } = usePermissions()
  const canWriteStaff = canAny('STAFF_EDIT', 'STAFF_MANAGE', 'STAFF_INVITE')
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false)
  const [staffForm, setStaffForm] = useState<StaffFormState>(initialStaffForm)

  const today = new Date()

  const {
    data: staffMembers = [],
    isLoading: staffLoading,
    isError: staffLoadError,
    error: staffLoadErrorDetail,
    refetch: refetchStaffMembers,
  } = useGetStaffMembersQuery()

  const { data: timeEntries = [], isLoading: timeEntriesLoading } = useGetStaffTimeEntriesQuery({
    startDate: clampToISODate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)),
    endDate: clampToISODate(new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000)),
  })

  const [createStaffMember, { isLoading: creatingStaff }] = useCreateStaffMemberMutation()
  const [checkInStaff] = useCheckInStaffMemberMutation()
  const [checkOutEntry] = useCheckOutTimeEntryMutation()
  const [clockActionStaffId, setClockActionStaffId] = useState<string | null>(null)

  const openEntryByStaffId = useMemo(() => {
    const map = new Map<string, (typeof timeEntries)[number]>()
    timeEntries
      .filter((entry) => !entry.clockOutAt)
      .forEach((entry) => {
        map.set(entry.staffId, entry)
      })
    return map
  }, [timeEntries])

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

  const resetStaffForm = () => {
    setStaffForm(initialStaffForm)
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
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to create staff member'))
    }
  }

  const handleCheckIn = async (staff: StaffMember) => {
    setClockActionStaffId(staff.id)
    try {
      await checkInStaff({
        staffId: staff.id,
        method: 'web',
      }).unwrap()
      toast.success(`${staff.displayName} checked in`)
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to check in'))
    } finally {
      setClockActionStaffId(null)
    }
  }

  const handleCheckOut = async (staff: StaffMember, timeEntryId: string) => {
    setClockActionStaffId(staff.id)
    try {
      await checkOutEntry({
        id: timeEntryId,
        method: 'web',
      }).unwrap()
      toast.success(`${staff.displayName} checked out`)
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to check out'))
    } finally {
      setClockActionStaffId(null)
    }
  }

  return (
    <div className="space-y-6">
      {canWriteStaff ? (
        <div className="flex justify-end">
          <Dialog open={isAddStaffOpen} onOpenChange={setIsAddStaffOpen}>
            <DialogTrigger asChild>
              <Button>Add staff</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add staff member</DialogTitle>
                <DialogDescription>
                  Capture key details so they can clock shifts and receive schedules.
                </DialogDescription>
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
                    <Select
                      value={staffForm.wageType}
                      onValueChange={(value) => handleStaffInputChange('wageType', value)}
                    >
                      <SelectTrigger id="wageType" className="mt-1 w-full">
                        {wageTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option.charAt(0) + option.slice(1).toLowerCase()}
                          </option>
                        ))}
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
                      value={staffForm.profileColor || '#2563eb'}
                      onChange={(event) =>
                        handleStaffInputChange('profileColor', event.target.value || '#2563eb')
                      }
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
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Team directory</CardTitle>
            <CardDescription>
              Active staff with quick access to roles, contact details, and clock status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {staffLoadError ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <AlertCircle className="h-8 w-8 text-[var(--red)]" />
                <p className="text-sm text-[var(--text-muted)] max-w-md">
                  {getApiErrorMessage(staffLoadErrorDetail, 'Unable to load staff directory.')}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetchStaffMembers()}>
                  Try again
                </Button>
              </div>
            ) : staffLoading ? (
              <p className="text-sm text-[var(--text-muted)]">Loading staff…</p>
            ) : staffMembers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
                <p>No staff yet. Add your first teammate to start scheduling and clocking time.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {staffMembers.map((member) => {
                  const openEntry = openEntryByStaffId.get(member.id)
                  const isOnShift = Boolean(openEntry)
                  const rowClockLoading = clockActionStaffId === member.id
                  return (
                    <div
                      key={member.id}
                      className="flex flex-col gap-3 rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: member.profileColor || '#2563eb' }}
                          />
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {member.displayName}
                          </p>
                          {renderStaffStatus(member.status)}
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">
                          {member.role} · {member.email || 'No email'}
                        </p>
                        {member.phone ? (
                          <p className="text-xs text-[var(--text-muted)]">{member.phone}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-start gap-2 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center">
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
                            <span className="font-medium text-[var(--text-mid)]">
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
                              disabled={rowClockLoading}
                            >
                              {rowClockLoading ? 'Closing…' : 'Clock out'}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleCheckIn(member)}
                              disabled={rowClockLoading}
                            >
                              {rowClockLoading ? 'Clocking…' : 'Clock in'}
                            </Button>
                          )}
                        </div>
                      </div>
                      <StaffPortalAccessPanel member={member} canManage={canWriteStaff} />
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
            <CardDescription>
              Review who just clocked in, clocked out, and any breaks captured.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {timeEntriesLoading ? (
              <p className="text-sm text-[var(--text-muted)]">Loading time entries…</p>
            ) : recentEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
                <p>No time entries in the last few days.</p>
              </div>
            ) : (
              recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">{entry.staffName}</p>
                      <p className="text-xs text-[var(--text-muted)]">{entry.role}</p>
                    </div>
                    <Badge
                      className={
                        entry.clockOutAt
                          ? 'bg-[var(--mint-pale)] text-[var(--mint)]'
                          : 'bg-[var(--amber-pale)] text-[var(--amber)]'
                      }
                    >
                      {entry.clockOutAt ? 'Closed' : 'Open'}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-[var(--text-muted)]">
                    <p>
                      Clock in:{' '}
                      <span className="text-[var(--text-mid)]">
                        {format(new Date(entry.clockInAt), 'MMM d, yyyy · p')} (
                        {entry.clockInMethod || 'web'})
                      </span>
                    </p>
                    {entry.clockOutAt ? (
                      <p>
                        Clock out:{' '}
                        <span className="text-[var(--text-mid)]">
                          {format(new Date(entry.clockOutAt), 'MMM d, yyyy · p')} (
                          {entry.clockOutMethod || 'web'})
                        </span>
                      </p>
                    ) : null}
                    {entry.breakMinutes ? (
                      <p>
                        Breaks:{' '}
                        <span className="text-[var(--text-mid)]">{entry.breakMinutes} min</span>
                      </p>
                    ) : null}
                    {entry.note ? (
                      <p className="text-[var(--text-muted)]">Note: {entry.note}</p>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
