import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { AlertCircle, Clock3, Plus, Smartphone, Users } from 'lucide-react'
import { EmptyState } from '../../ui/empty-state'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Skeleton } from '../../ui/skeleton'
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
import type { StaffMember, StaffTimeEntry } from '../../../types'
import { formatPrice } from '../../../utils/format'
import { usePermissions } from '../../../hooks/usePermissions'
import { StaffPortalAccessPanel } from '../../StaffPortalAccessPanel'
import { getApiErrorMessage } from '../../../lib/apiError'
import { cn } from '../../../lib/utils'
import {
  clampToISODate,
  initialStaffForm,
  renderStaffStatus,
  wageTypeOptions,
  type StaffFormState,
} from '../staffShared'

function TeamSummaryStat({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--text)]">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  )
}

function StaffMemberRow({
  member,
  openEntry,
  rowClockLoading,
  canWriteStaff,
  onCheckIn,
  onCheckOut,
}: {
  member: StaffMember
  openEntry?: StaffTimeEntry
  rowClockLoading: boolean
  canWriteStaff: boolean
  onCheckIn: (staff: StaffMember) => void
  onCheckOut: (staff: StaffMember, entryId: string) => void
}) {
  const isOnShift = Boolean(openEntry)
  const initial = member.displayName.charAt(0).toUpperCase()
  const accent = member.profileColor || '#7c3aed'

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[var(--text)]"
            style={{ backgroundColor: `color-mix(in srgb, ${accent} 18%, white)` }}
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[var(--text)]">{member.displayName}</p>
              {renderStaffStatus(member.status)}
              <Badge
                variant={isOnShift ? 'default' : 'outline'}
                className={cn(
                  'text-[10px]',
                  isOnShift && 'bg-[var(--mint)] hover:bg-[var(--mint)]'
                )}
              >
                {isOnShift ? 'On shift' : 'Off shift'}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-sm text-[var(--text-mid)]">{member.role}</p>
            <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
              {member.email || 'No email on file'}
              {member.phone ? ` · ${member.phone}` : ''}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] sm:grid-cols-3">
          <div>
            <dt className="sr-only">Wage</dt>
            <dd>
              {member.wageType.toLowerCase()}
              {member.wageRate ? ` · ${formatPrice(member.wageRate)}` : ''}
            </dd>
          </div>
          {member.hireDate ? (
            <div>
              <dt className="sr-only">Hired</dt>
              <dd>Hired {format(parseISO(member.hireDate), 'MMM d, yyyy')}</dd>
            </div>
          ) : null}
          {isOnShift && openEntry ? (
            <div className="col-span-2 sm:col-span-1">
              <dt className="sr-only">Clocked in</dt>
              <dd className="text-[var(--mint)]">
                Since {format(new Date(openEntry.clockInAt), 'p')}
              </dd>
            </div>
          ) : null}
        </dl>

        {canWriteStaff ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {isOnShift ? (
              <Button
                size="sm"
                variant="outline"
                className="erp-pressable pwa-touch-target w-full sm:w-auto"
                onClick={() => openEntry && onCheckOut(member, openEntry.id)}
                disabled={rowClockLoading}
              >
                {rowClockLoading ? 'Closing…' : 'Clock out'}
              </Button>
            ) : (
              <Button
                size="sm"
                className="erp-pressable pwa-touch-target w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)] sm:w-auto"
                onClick={() => onCheckIn(member)}
                disabled={rowClockLoading}
              >
                {rowClockLoading ? 'Clocking…' : 'Clock in'}
              </Button>
            )}
          </div>
        ) : null}

        <StaffPortalAccessPanel member={member} canManage={canWriteStaff} compact />
      </div>
    </li>
  )
}

function TimeEntryRow({ entry }: { entry: StaffTimeEntry }) {
  const isOpen = !entry.clockOutAt
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[var(--text)]">{entry.staffName ?? 'Staff member'}</p>
          <p className="text-xs text-[var(--text-muted)]">{entry.role}</p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 text-[10px]',
            isOpen
              ? 'border-[var(--amber)] bg-[var(--amber-pale)] text-[var(--amber)]'
              : 'border-[var(--mint)] bg-[var(--mint-pale)] text-[var(--mint)]'
          )}
        >
          {isOpen ? 'Open' : 'Closed'}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        In {format(new Date(entry.clockInAt), 'MMM d · p')}
        {entry.clockOutAt ? <> → Out {format(new Date(entry.clockOutAt), 'p')}</> : null}
      </p>
      {entry.breakMinutes ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">Break {entry.breakMinutes} min</p>
      ) : null}
    </li>
  )
}

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
    const map = new Map<string, StaffTimeEntry>()
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

  const onShiftCount = openEntryByStaffId.size
  const portalEnabledCount = staffMembers.filter((m) => m.portalAccess?.enabled).length

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

  const timeEntriesPanel = (
    <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
        <div className="flex items-start gap-2">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-mid)]" aria-hidden />
          <div>
            <h2 className="text-base font-semibold text-[var(--text)]">Latest time entries</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Who clocked in or out in the last seven days.
            </p>
          </div>
        </div>
      </header>
      {timeEntriesLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : recentEntries.length === 0 ? (
        <EmptyState
          className="py-10"
          title="No punches yet"
          description="Clock someone in from the team list, or ask staff to use the portal on their phone."
          icon={<Clock3 className="h-8 w-8" aria-hidden />}
        />
      ) : (
        <ul className="divide-y divide-[var(--app-border)]">
          {recentEntries.map((entry) => (
            <TimeEntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  )

  const teamDirectoryPanel = (
    <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
      <header className="flex flex-col gap-3 border-b border-[var(--app-border)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-mid)]" aria-hidden />
          <div>
            <h2 className="text-base font-semibold text-[var(--text)]">Team directory</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Roles, contact info, clock status, and portal access.
            </p>
          </div>
        </div>
        {canWriteStaff ? (
          <Dialog open={isAddStaffOpen} onOpenChange={setIsAddStaffOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="erp-pressable pwa-touch-target w-full shrink-0 bg-[var(--brand-mid)] hover:bg-[var(--brand)] sm:w-auto"
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                Add staff
              </Button>
            </DialogTrigger>
            <DialogContent size="md" className="pb-[max(1rem,env(safe-area-inset-bottom))]">
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
                      className="mt-1.5 min-h-11"
                      value={staffForm.firstName}
                      onChange={(event) => handleStaffInputChange('firstName', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      className="mt-1.5 min-h-11"
                      value={staffForm.lastName}
                      onChange={(event) => handleStaffInputChange('lastName', event.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="displayName">Display name</Label>
                  <Input
                    id="displayName"
                    className="mt-1.5 min-h-11"
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
                      inputMode="email"
                      className="mt-1.5 min-h-11"
                      value={staffForm.email}
                      onChange={(event) => handleStaffInputChange('email', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      className="mt-1.5 min-h-11"
                      value={staffForm.phone}
                      onChange={(event) => handleStaffInputChange('phone', event.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    className="mt-1.5 min-h-11"
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
                      <SelectTrigger id="wageType" className="mt-1.5 min-h-11 w-full">
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
                      className="mt-1.5 min-h-11"
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
                      className="mt-1.5 min-h-11"
                      value={staffForm.hireDate}
                      onChange={(event) => handleStaffInputChange('hireDate', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="profileColor">Accent color</Label>
                    <Input
                      id="profileColor"
                      type="color"
                      className="mt-1.5 min-h-11"
                      value={staffForm.profileColor || '#2563eb'}
                      onChange={(event) =>
                        handleStaffInputChange('profileColor', event.target.value || '#2563eb')
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  className="erp-pressable pwa-touch-target w-full sm:w-auto"
                  onClick={handleCreateStaff}
                  disabled={creatingStaff}
                >
                  {creatingStaff ? 'Adding…' : 'Add staff member'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </header>

      {staffLoadError ? (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center sm:px-5">
          <AlertCircle className="h-8 w-8 text-[var(--red)]" />
          <p className="max-w-md text-sm text-[var(--text-muted)]">
            {getApiErrorMessage(staffLoadErrorDetail, 'Unable to load staff directory.')}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="erp-pressable"
            onClick={() => refetchStaffMembers()}
          >
            Try again
          </Button>
        </div>
      ) : staffLoading ? (
        <div className="space-y-0 divide-y divide-[var(--app-border)]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-4 sm:px-5">
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : staffMembers.length === 0 ? (
        <EmptyState
          className="py-10"
          title="No staff yet"
          description="Add your first teammate to start scheduling and clocking time."
          icon={<Users className="h-8 w-8" aria-hidden />}
        />
      ) : (
        <ul className="divide-y divide-[var(--app-border)]">
          {staffMembers.map((member) => (
            <StaffMemberRow
              key={member.id}
              member={member}
              openEntry={openEntryByStaffId.get(member.id)}
              rowClockLoading={clockActionStaffId === member.id}
              canWriteStaff={canWriteStaff}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
            />
          ))}
        </ul>
      )}
    </section>
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TeamSummaryStat label="Active staff" value={staffMembers.length} />
        <TeamSummaryStat label="On shift now" value={onShiftCount} />
        <TeamSummaryStat
          label="Portal access"
          value={portalEnabledCount}
          hint="Magic link or password"
        />
        <TeamSummaryStat label="Recent punches" value={recentEntries.length} hint="Last 7 days" />
      </div>

      <p className="flex items-center gap-2 text-xs text-[var(--text-muted)] sm:hidden">
        <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Staff clock in from their phones at /staff — managers clock in here.
      </p>

      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[1.5fr,1fr]">
        <div className="order-2 xl:order-1">{teamDirectoryPanel}</div>
        <div className="order-1 xl:order-2">{timeEntriesPanel}</div>
      </div>
    </div>
  )
}
