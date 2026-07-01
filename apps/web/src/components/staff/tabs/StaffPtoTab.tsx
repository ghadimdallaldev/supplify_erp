import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Input } from '../../ui/input'

import { Label } from '../../ui/label'

import { Select, SelectTrigger } from '../../ui/select'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog'

import {
  useCreateStaffPtoRequestMutation,
  useGetStaffAvailabilityQuery,
  useGetStaffMembersQuery,
  useGetStaffPtoRequestsQuery,
  useSetStaffAvailabilityMutation,
  useUpdateStaffPtoRequestMutation,
} from '../../../services/staffApi'

import type { StaffPtoRequest } from '../../../types'

import { getApiErrorMessage } from '../../../lib/apiError'

import { defaultAvailabilityBlocks, getWeekdayLabels, useStaffWriteAccess } from '../staffShared'

export function StaffPtoTab() {
  const { t } = useTranslation('staff')
  const canWriteStaff = useStaffWriteAccess()
  const weekdays = getWeekdayLabels(t)
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

  const [decisionDialog, setDecisionDialog] = useState<{
    id: string

    status: StaffPtoRequest['status']
  } | null>(null)

  const [decisionNote, setDecisionNote] = useState('')

  const { data: staffMembers = [] } = useGetStaffMembersQuery()

  const { data: ptoRequests = [], isLoading: ptoLoading } = useGetStaffPtoRequestsQuery()

  const { data: availability = [] } = useGetStaffAvailabilityQuery()

  const [createPtoRequest, { isLoading: creatingPto }] = useCreateStaffPtoRequestMutation()

  const [updatePtoRequest, { isLoading: updatingPto }] = useUpdateStaffPtoRequestMutation()

  const [setAvailability, { isLoading: savingAvailability }] = useSetStaffAvailabilityMutation()

  const handleCreatePto = async () => {
    if (!ptoForm.staffId || !ptoForm.startDate || !ptoForm.endDate) {
      toast.error(t('pto.validationPtoFields'))

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

      toast.success(t('pto.ptoRecorded'))

      setPtoForm({
        staffId: '',

        type: 'VACATION',

        startDate: '',

        endDate: '',

        hoursRequested: '',

        reason: '',
      })
    } catch {
      toast.error(t('pto.ptoRecordFailed'))
    }
  }

  const openDecisionDialog = (id: string, status: StaffPtoRequest['status']) => {
    setDecisionDialog({ id, status })

    setDecisionNote('')
  }

  const handlePtoDecision = async () => {
    if (!decisionDialog) return

    try {
      await updatePtoRequest({
        id: decisionDialog.id,

        status: decisionDialog.status,

        managerNote: decisionNote.trim() || undefined,
      }).unwrap()

      toast.success(t('pto.ptoUpdated', { status: decisionDialog.status.toLowerCase() }))

      setDecisionDialog(null)

      setDecisionNote('')
    } catch {
      toast.error(t('pto.ptoUpdateFailed'))
    }
  }

  const handleSaveAvailability = async () => {
    if (!availabilityForm.staffId || !availabilityForm.start || !availabilityForm.end) {
      toast.error(t('pto.validationAvailability'))

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

      toast.success(t('pto.availabilityRecorded'))

      setAvailabilityForm({ staffId: '', weekday: '0', start: '', end: '', notes: '' })
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('pto.availabilitySaveFailed')))
    }
  }

  return (
    <div className="space-y-6">
      <Dialog
        open={Boolean(decisionDialog)}
        onOpenChange={(open) => !open && setDecisionDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionDialog?.status === 'APPROVED'
                ? t('pto.approveTitle')
                : t('pto.declineTitle')}
            </DialogTitle>

            <DialogDescription>{t('pto.decisionDescription')}</DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="ptoDecisionNote">{t('shared.managerNote')}</Label>

            <Input
              id="ptoDecisionNote"
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
              placeholder={t('pto.managerNotePlaceholder')}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog(null)}>
              {t('shared.cancel')}
            </Button>

            <Button onClick={handlePtoDecision} disabled={updatingPto}>
              {updatingPto ? t('shared.saving') : t('shared.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>{t('pto.requestsTitle')}</CardTitle>

          <CardDescription>{t('pto.requestsDescription')}</CardDescription>
        </CardHeader>

        <CardContent>
          {ptoLoading ? (
            <p className="text-sm text-[var(--text-muted)]">{t('pto.loadingRequests')}</p>
          ) : ptoRequests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
              <p>{t('pto.noRequests')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ptoRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {request.staff?.name || t('shared.teamMember')} ·{' '}
                        {t(`shared.ptoType.${request.type}`)}
                      </p>

                      <p className="text-xs text-[var(--text-muted)]">
                        {format(new Date(request.startDate), 'MMM d, yyyy')} →{' '}
                        {format(new Date(request.endDate), 'MMM d, yyyy')}
                      </p>
                    </div>

                    <Badge
                      className={
                        request.status === 'APPROVED'
                          ? 'bg-[var(--mint-pale)] text-[var(--mint)]'
                          : request.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-[var(--app-border-mid)] text-[var(--text-mid)]'
                      }
                    >
                      {t(`shared.ptoStatus.${request.status}`)}
                    </Badge>
                  </div>

                  {request.reason ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      {t('shared.reasonPrefix', { reason: request.reason })}
                    </p>
                  ) : null}

                  {request.managerNote ? (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {t('shared.managerNotePrefix', { note: request.managerNote })}
                    </p>
                  ) : null}

                  {canWriteStaff && request.status === 'PENDING' ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDecisionDialog(request.id, 'APPROVED')}
                        disabled={updatingPto}
                      >
                        {t('shared.approve')}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDecisionDialog(request.id, 'DECLINED')}
                        disabled={updatingPto}
                      >
                        {t('shared.decline')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canWriteStaff ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('pto.recordTitle')}</CardTitle>

            <CardDescription>{t('pto.recordDescription')}</CardDescription>
          </CardHeader>

          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ptoStaff">{t('shared.staff')}</Label>

              <Select
                value={ptoForm.staffId}
                onValueChange={(value) => setPtoForm((prev) => ({ ...prev, staffId: value }))}
              >
                <SelectTrigger id="ptoStaff" className="mt-1 w-full">
                  <option value="">{t('shared.selectStaff')}</option>

                  {staffMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>

            <div>
              <Label htmlFor="ptoType">{t('shared.type')}</Label>

              <Select
                value={ptoForm.type}
                onValueChange={(value) => setPtoForm((prev) => ({ ...prev, type: value }))}
              >
                <SelectTrigger id="ptoType" className="mt-1 w-full">
                  {(['VACATION', 'SICK', 'PERSONAL', 'UNPAID', 'OTHER'] as const).map((type) => (
                    <option key={type} value={type}>
                      {t(`shared.ptoType.${type}`)}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>

            <div>
              <Label htmlFor="ptoStart">{t('pto.startDate')}</Label>

              <Input
                id="ptoStart"
                type="date"
                value={ptoForm.startDate}
                onChange={(event) =>
                  setPtoForm((prev) => ({ ...prev, startDate: event.target.value }))
                }
              />
            </div>

            <div>
              <Label htmlFor="ptoEnd">{t('pto.endDate')}</Label>

              <Input
                id="ptoEnd"
                type="date"
                value={ptoForm.endDate}
                onChange={(event) =>
                  setPtoForm((prev) => ({ ...prev, endDate: event.target.value }))
                }
              />
            </div>

            <div>
              <Label htmlFor="ptoHours">{t('pto.hoursOptional')}</Label>

              <Input
                id="ptoHours"
                type="number"
                min={0}
                step={0.5}
                value={ptoForm.hoursRequested}
                onChange={(event) =>
                  setPtoForm((prev) => ({ ...prev, hoursRequested: event.target.value }))
                }
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="ptoReason">{t('shared.reason')}</Label>

              <Input
                id="ptoReason"
                value={ptoForm.reason}
                onChange={(event) =>
                  setPtoForm((prev) => ({ ...prev, reason: event.target.value }))
                }
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <Button onClick={handleCreatePto} disabled={creatingPto}>
                {creatingPto ? t('pto.recording') : t('pto.recordPto')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('pto.availabilityTitle')}</CardTitle>

          <CardDescription>{t('pto.availabilityDescription')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <fieldset disabled={!canWriteStaff} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="availabilityStaff">{t('shared.staff')}</Label>

                <Select
                  value={availabilityForm.staffId}
                  onValueChange={(value) =>
                    setAvailabilityForm((prev) => ({ ...prev, staffId: value }))
                  }
                >
                  <SelectTrigger id="availabilityStaff" className="mt-1 w-full">
                    <option value="">{t('shared.selectStaff')}</option>

                    {staffMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              <div>
                <Label htmlFor="availabilityDay">{t('pto.weekday')}</Label>

                <Select
                  value={availabilityForm.weekday}
                  onValueChange={(value) =>
                    setAvailabilityForm((prev) => ({ ...prev, weekday: value }))
                  }
                >
                  <SelectTrigger id="availabilityDay" className="mt-1 w-full">
                    {weekdays.map((day, index) => (
                      <option key={day} value={String(index)}>
                        {day}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              <div>
                <Label htmlFor="availabilityStart">{t('pto.start')}</Label>

                <Input
                  id="availabilityStart"
                  type="time"
                  value={availabilityForm.start}
                  onChange={(event) =>
                    setAvailabilityForm((prev) => ({ ...prev, start: event.target.value }))
                  }
                />
              </div>

              <div>
                <Label htmlFor="availabilityEnd">{t('pto.end')}</Label>

                <Input
                  id="availabilityEnd"
                  type="time"
                  value={availabilityForm.end}
                  onChange={(event) =>
                    setAvailabilityForm((prev) => ({ ...prev, end: event.target.value }))
                  }
                />
              </div>

              <div className="sm:col-span-4">
                <Label htmlFor="availabilityNotes">{t('shared.notes')}</Label>

                <Input
                  id="availabilityNotes"
                  value={availabilityForm.notes}
                  onChange={(event) =>
                    setAvailabilityForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveAvailability} disabled={savingAvailability}>
                {savingAvailability ? t('shared.saving') : t('pto.saveAvailability')}
              </Button>
            </div>
          </fieldset>

          {availability.length ? (
            <div className="rounded-xl border border-[var(--app-border)] bg-white shadow-sm">
              <table className="min-w-full divide-y divide-[var(--app-border)] text-sm">
                <thead className="bg-[var(--brand-ultra)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.staff')}
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.day')}
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.window')}
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.notes')}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--app-border)]">
                  {availability.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-[var(--text-mid)]">{item.staffName}</td>

                      <td className="px-4 py-2 text-[var(--text-mid)]">{weekdays[item.weekday]}</td>

                      <td className="px-4 py-2 text-[var(--text-mid)]">
                        {(item.availability?.blocks || defaultAvailabilityBlocks.blocks)

                          .map((block) => `${block.start} – ${block.end}`)

                          .join(', ')}
                      </td>

                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {item.notes || t('shared.emDash')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
