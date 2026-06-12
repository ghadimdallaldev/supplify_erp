import { useMemo, useState } from 'react'
import { format, isAfter } from 'date-fns'
import { toast } from 'sonner'
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
  useCreateStaffShiftMutation,
  useCreateStaffSwapMutation,
  useDecideStaffSwapMutation,
  useGetStaffMembersQuery,
  useGetStaffShiftsQuery,
  useGetStaffSwapsQuery,
} from '../../../services/staffApi'
import type { StaffShiftSwap } from '../../../types'
import { getApiErrorMessage } from '../../../lib/apiError'
import {
  clampToISODate,
  initialShiftForm,
  swapStatusLabels,
  type ShiftFormState,
} from '../staffShared'

export function StaffScheduleTab() {
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false)
  const [shiftForm, setShiftForm] = useState<ShiftFormState>(initialShiftForm)
  const [swapForm, setSwapForm] = useState({
    shiftId: '',
    requestedBy: '',
    proposedCoverId: '',
    reason: '',
  })

  const today = new Date()
  const scheduleStart = clampToISODate(today)
  const scheduleEnd = clampToISODate(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000))

  const { data: staffMembers = [] } = useGetStaffMembersQuery()
  const { data: shifts = [], isLoading: shiftsLoading } = useGetStaffShiftsQuery({
    startDate: scheduleStart,
    endDate: scheduleEnd,
  })
  const { data: swaps = [], isLoading: swapsLoading } = useGetStaffSwapsQuery()

  const [createShift, { isLoading: creatingShift }] = useCreateStaffShiftMutation()
  const [createSwap, { isLoading: creatingSwap }] = useCreateStaffSwapMutation()
  const [decideSwap, { isLoading: decidingSwap }] = useDecideStaffSwapMutation()

  const upcomingShifts = useMemo(() => {
    const now = new Date()
    return shifts
      .slice()
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .filter((shift) => isAfter(new Date(shift.endsAt), now))
      .slice(0, 10)
  }, [shifts])

  const handleShiftInputChange = (field: keyof ShiftFormState, value: string) => {
    setShiftForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const resetShiftForm = () => {
    setShiftForm(initialShiftForm)
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
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to schedule shift'))
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
    const managerNote =
      window.prompt(`Add note for ${status.toLowerCase()} decision (optional):`) ?? undefined
    try {
      await decideSwap({ id, status, managerNote: managerNote || undefined }).unwrap()
      toast.success(`Swap ${status.toLowerCase()}`)
    } catch {
      toast.error('Unable to update swap')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={isAddShiftOpen} onOpenChange={setIsAddShiftOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">Create shift</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule shift</DialogTitle>
              <DialogDescription>
                Drop a shift on the calendar with clear start and end times.
              </DialogDescription>
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
                    <SelectTrigger id="shiftStaff" className="mt-1 w-full">
                      <option value="">Unassigned</option>
                      {staffMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName} · {member.role}
                        </option>
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
              <Button onClick={handleCreateShift} disabled={creatingShift}>
                {creatingShift ? 'Scheduling…' : 'Schedule shift'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming schedule</CardTitle>
          <CardDescription>
            At-a-glance view of the next week for quick staffing checks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shiftsLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading schedule…</p>
          ) : upcomingShifts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
              <p>No upcoming shifts scheduled yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--app-border)] text-sm">
                <thead className="bg-[var(--brand-ultra)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Staff
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Role
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Time
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {upcomingShifts.map((shift) => (
                    <tr key={shift.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--text-mid)]">
                        {format(new Date(shift.shiftDate), 'EEE, MMM d')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-[var(--text)]">
                            {shift.staff?.name ?? 'Unassigned'}
                          </span>
                          {shift.staff?.role ? (
                            <span className="text-xs text-[var(--text-muted)]">
                              {shift.staff.role}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-mid)]">{shift.role}</td>
                      <td className="px-4 py-3 text-[var(--text-mid)]">
                        {format(new Date(shift.startsAt), 'p')} –{' '}
                        {format(new Date(shift.endsAt), 'p')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                          {shift.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{shift.notes || '—'}</td>
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
            <p className="text-sm text-[var(--text-muted)]">Loading swaps…</p>
          ) : swaps.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
              <p>No swap requests yet.</p>
            </div>
          ) : (
            swaps.map((swap) => (
              <div
                key={swap.id}
                className="rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {swap.requester?.name} → {swap.cover?.name || 'Waiting for cover'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {swap.shift?.role} ·{' '}
                      {swap.shift ? format(new Date(swap.shift.startsAt), 'MMM d, p') : 'TBD'}
                    </p>
                  </div>
                  <Badge className="bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                    {swapStatusLabels[swap.status]}
                  </Badge>
                </div>
                {swap.reason ? (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">Reason: {swap.reason}</p>
                ) : null}
                {swap.managerNote ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Decision note: {swap.managerNote}
                  </p>
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
            <Select
              value={swapForm.shiftId}
              onValueChange={(value) => setSwapForm((prev) => ({ ...prev, shiftId: value }))}
            >
              <SelectTrigger id="swapShift" className="mt-1 w-full">
                <option value="">Select shift</option>
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {format(new Date(shift.startsAt), 'EEE, MMM d · p')} — {shift.role}
                  </option>
                ))}
              </SelectTrigger>
            </Select>
          </div>
          <div>
            <Label htmlFor="swapRequester">Requested by</Label>
            <Select
              value={swapForm.requestedBy}
              onValueChange={(value) => setSwapForm((prev) => ({ ...prev, requestedBy: value }))}
            >
              <SelectTrigger id="swapRequester" className="mt-1 w-full">
                <option value="">Choose staff</option>
                {staffMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </SelectTrigger>
            </Select>
          </div>
          <div>
            <Label htmlFor="swapCover">Proposed cover</Label>
            <Select
              value={swapForm.proposedCoverId}
              onValueChange={(value) =>
                setSwapForm((prev) => ({ ...prev, proposedCoverId: value }))
              }
            >
              <SelectTrigger id="swapCover" className="mt-1 w-full">
                <option value="">Open to team</option>
                {staffMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </SelectTrigger>
            </Select>
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
    </div>
  )
}
