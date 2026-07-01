import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  type ShiftFormState,
  useStaffWriteAccess,
} from '../staffShared'

export function StaffScheduleTab() {
  const { t } = useTranslation('staff')
  const canWriteStaff = useStaffWriteAccess()
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
      toast.error(t('schedule.validationShiftFields'))
      return
    }

    const startsAt = new Date(`${shiftForm.shiftDate}T${shiftForm.startTime}`)
    const endsAt = new Date(`${shiftForm.shiftDate}T${shiftForm.endTime}`)

    if (endsAt <= startsAt) {
      toast.error(t('schedule.endAfterStart'))
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
      toast.success(t('schedule.shiftScheduled'))
      setIsAddShiftOpen(false)
      resetShiftForm()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('schedule.scheduleFailed')))
    }
  }

  const handleCreateSwap = async () => {
    if (!swapForm.shiftId || !swapForm.requestedBy) {
      toast.error(t('schedule.validationSwapFields'))
      return
    }
    try {
      await createSwap({
        shiftId: swapForm.shiftId,
        requestedBy: swapForm.requestedBy,
        proposedCoverId: swapForm.proposedCoverId || undefined,
        reason: swapForm.reason || undefined,
      }).unwrap()
      toast.success(t('schedule.swapRequested'))
      setSwapForm({ shiftId: '', requestedBy: '', proposedCoverId: '', reason: '' })
    } catch {
      toast.error(t('schedule.swapSubmitFailed'))
    }
  }

  const handleSwapDecision = async (id: string, status: StaffShiftSwap['status']) => {
    const managerNote =
      window.prompt(t('schedule.swapDecisionPrompt', { status: status.toLowerCase() })) ?? undefined
    try {
      await decideSwap({ id, status: status, managerNote: managerNote || undefined }).unwrap()
      toast.success(t('schedule.swapUpdated', { status: status.toLowerCase() }))
    } catch {
      toast.error(t('schedule.swapUpdateFailed'))
    }
  }

  return (
    <div className="space-y-6">
      {canWriteStaff ? (
        <div className="flex justify-end">
          <Dialog open={isAddShiftOpen} onOpenChange={setIsAddShiftOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">{t('schedule.createShift')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('schedule.scheduleShiftTitle')}</DialogTitle>
                <DialogDescription>{t('schedule.scheduleShiftDescription')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="shiftRole">{t('schedule.role')}</Label>
                  <Input
                    id="shiftRole"
                    value={shiftForm.role}
                    onChange={(event) => handleShiftInputChange('role', event.target.value)}
                    placeholder={t('schedule.rolePlaceholder')}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="shiftDate">{t('schedule.date')}</Label>
                    <Input
                      id="shiftDate"
                      type="date"
                      value={shiftForm.shiftDate}
                      onChange={(event) => handleShiftInputChange('shiftDate', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="shiftStaff">{t('schedule.assignOptional')}</Label>
                    <Select
                      value={shiftForm.staffId}
                      onValueChange={(value) => handleShiftInputChange('staffId', value)}
                    >
                      <SelectTrigger id="shiftStaff" className="mt-1 w-full">
                        <option value="">{t('shared.unassigned')}</option>
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
                    <Label htmlFor="startTime">{t('schedule.startTime')}</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={shiftForm.startTime}
                      onChange={(event) => handleShiftInputChange('startTime', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endTime">{t('schedule.endTime')}</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={shiftForm.endTime}
                      onChange={(event) => handleShiftInputChange('endTime', event.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="shiftNotes">{t('shared.notes')}</Label>
                  <Input
                    id="shiftNotes"
                    value={shiftForm.notes}
                    onChange={(event) => handleShiftInputChange('notes', event.target.value)}
                    placeholder={t('schedule.notesPlaceholder')}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateShift} disabled={creatingShift}>
                  {creatingShift ? t('schedule.scheduling') : t('schedule.scheduleShift')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('schedule.upcomingTitle')}</CardTitle>
          <CardDescription>{t('schedule.upcomingDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {shiftsLoading ? (
            <p className="text-sm text-[var(--text-muted)]">{t('schedule.loadingSchedule')}</p>
          ) : upcomingShifts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
              <p>{t('schedule.noUpcomingShifts')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--app-border)] text-sm">
                <thead className="bg-[var(--brand-ultra)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.date')}
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('schedule.staff')}
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('schedule.roleColumn')}
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.time')}
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.status')}
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('schedule.notesColumn')}
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
                            {shift.staff?.name ?? t('shared.unassigned')}
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
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {shift.notes || t('shared.emDash')}
                      </td>
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
          <CardTitle>{t('schedule.swapsTitle')}</CardTitle>
          <CardDescription>{t('schedule.swapsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {swapsLoading ? (
            <p className="text-sm text-[var(--text-muted)]">{t('schedule.loadingSwaps')}</p>
          ) : swaps.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
              <p>{t('schedule.noSwaps')}</p>
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
                      {swap.requester?.name} → {swap.cover?.name || t('schedule.waitingForCover')}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {swap.shift?.role} ·{' '}
                      {swap.shift
                        ? format(new Date(swap.shift.startsAt), 'MMM d, p')
                        : t('schedule.tbd')}
                    </p>
                  </div>
                  <Badge className="bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                    {t(`shared.swapStatus.${swap.status}`)}
                  </Badge>
                </div>
                {swap.reason ? (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {t('shared.reasonPrefix', { reason: swap.reason })}
                  </p>
                ) : null}
                {swap.managerNote ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {t('shared.decisionNotePrefix', { note: swap.managerNote })}
                  </p>
                ) : null}
                {canWriteStaff && swap.status === 'REQUESTED' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSwapDecision(swap.id, 'APPROVED')}
                      disabled={decidingSwap}
                    >
                      {t('shared.approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSwapDecision(swap.id, 'DECLINED')}
                      disabled={decidingSwap}
                    >
                      {t('shared.decline')}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {canWriteStaff ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('schedule.logSwapTitle')}</CardTitle>
            <CardDescription>{t('schedule.logSwapDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="swapShift">{t('schedule.shift')}</Label>
              <Select
                value={swapForm.shiftId}
                onValueChange={(value) => setSwapForm((prev) => ({ ...prev, shiftId: value }))}
              >
                <SelectTrigger id="swapShift" className="mt-1 w-full">
                  <option value="">{t('schedule.selectShift')}</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {format(new Date(shift.startsAt), 'EEE, MMM d · p')} — {shift.role}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div>
              <Label htmlFor="swapRequester">{t('schedule.requestedBy')}</Label>
              <Select
                value={swapForm.requestedBy}
                onValueChange={(value) => setSwapForm((prev) => ({ ...prev, requestedBy: value }))}
              >
                <SelectTrigger id="swapRequester" className="mt-1 w-full">
                  <option value="">{t('schedule.chooseStaff')}</option>
                  {staffMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div>
              <Label htmlFor="swapCover">{t('schedule.proposedCover')}</Label>
              <Select
                value={swapForm.proposedCoverId}
                onValueChange={(value) =>
                  setSwapForm((prev) => ({ ...prev, proposedCoverId: value }))
                }
              >
                <SelectTrigger id="swapCover" className="mt-1 w-full">
                  <option value="">{t('schedule.openToTeam')}</option>
                  {staffMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="swapReason">{t('shared.reason')}</Label>
              <Input
                id="swapReason"
                value={swapForm.reason}
                onChange={(event) =>
                  setSwapForm((prev) => ({ ...prev, reason: event.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button onClick={handleCreateSwap} disabled={creatingSwap}>
                {creatingSwap ? t('portal.dashboard.submitting') : t('schedule.submitSwap')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
