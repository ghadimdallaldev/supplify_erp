import { useState } from 'react'

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

import { defaultAvailabilityBlocks, ptoStatusLabels } from '../staffShared'

export function StaffPtoTab() {
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

      setPtoForm({
        staffId: '',

        type: 'VACATION',

        startDate: '',

        endDate: '',

        hoursRequested: '',

        reason: '',
      })
    } catch {
      toast.error('Unable to record PTO request')
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

      toast.success(`PTO ${decisionDialog.status.toLowerCase()}`)

      setDecisionDialog(null)

      setDecisionNote('')
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
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save availability'))
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
              {decisionDialog?.status === 'APPROVED' ? 'Approve PTO' : 'Decline PTO'}
            </DialogTitle>

            <DialogDescription>Optional note for the team member.</DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="ptoDecisionNote">Manager note</Label>

            <Input
              id="ptoDecisionNote"
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
              placeholder="Optional context for your decision"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog(null)}>
              Cancel
            </Button>

            <Button onClick={handlePtoDecision} disabled={updatingPto}>
              {updatingPto ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>PTO & leave requests</CardTitle>

          <CardDescription>
            Approve vacation, sick days, or unpaid leave. This is not a full HR policy engine.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {ptoLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading PTO requests…</p>
          ) : ptoRequests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
              <p>No requests yet. Encourage staff to submit time off from the Staff App.</p>
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
                        {request.staff?.name || 'Team member'} ·{' '}
                        {request.type.charAt(0) + request.type.slice(1).toLowerCase()}
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
                      {ptoStatusLabels[request.status]}
                    </Badge>
                  </div>

                  {request.reason ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Reason: {request.reason}
                    </p>
                  ) : null}

                  {request.managerNote ? (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Manager note: {request.managerNote}
                    </p>
                  ) : null}

                  {request.status === 'PENDING' ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDecisionDialog(request.id, 'APPROVED')}
                        disabled={updatingPto}
                      >
                        Approve
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDecisionDialog(request.id, 'DECLINED')}
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

            <Select
              value={ptoForm.staffId}
              onValueChange={(value) => setPtoForm((prev) => ({ ...prev, staffId: value }))}
            >
              <SelectTrigger id="ptoStaff" className="mt-1 w-full">
                <option value="">Select staff</option>

                {staffMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </SelectTrigger>
            </Select>
          </div>

          <div>
            <Label htmlFor="ptoType">Type</Label>

            <Select
              value={ptoForm.type}
              onValueChange={(value) => setPtoForm((prev) => ({ ...prev, type: value }))}
            >
              <SelectTrigger id="ptoType" className="mt-1 w-full">
                <option value="VACATION">Vacation</option>

                <option value="SICK">Sick</option>

                <option value="PERSONAL">Personal</option>

                <option value="UNPAID">Unpaid</option>

                <option value="OTHER">Other</option>
              </SelectTrigger>
            </Select>
          </div>

          <div>
            <Label htmlFor="ptoStart">Start date</Label>

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
              onChange={(event) =>
                setPtoForm((prev) => ({ ...prev, hoursRequested: event.target.value }))
              }
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

              <Select
                value={availabilityForm.staffId}
                onValueChange={(value) =>
                  setAvailabilityForm((prev) => ({ ...prev, staffId: value }))
                }
              >
                <SelectTrigger id="availabilityStaff" className="mt-1 w-full">
                  <option value="">Select staff</option>

                  {staffMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>

            <div>
              <Label htmlFor="availabilityDay">Weekday</Label>

              <Select
                value={availabilityForm.weekday}
                onValueChange={(value) =>
                  setAvailabilityForm((prev) => ({ ...prev, weekday: value }))
                }
              >
                <SelectTrigger id="availabilityDay" className="mt-1 w-full">
                  <option value="0">Sunday</option>

                  <option value="1">Monday</option>

                  <option value="2">Tuesday</option>

                  <option value="3">Wednesday</option>

                  <option value="4">Thursday</option>

                  <option value="5">Friday</option>

                  <option value="6">Saturday</option>
                </SelectTrigger>
              </Select>
            </div>

            <div>
              <Label htmlFor="availabilityStart">Start</Label>

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
              <Label htmlFor="availabilityEnd">End</Label>

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
              <Label htmlFor="availabilityNotes">Notes</Label>

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
              {savingAvailability ? 'Saving…' : 'Save availability'}
            </Button>
          </div>

          {availability.length ? (
            <div className="rounded-xl border border-[var(--app-border)] bg-white shadow-sm">
              <table className="min-w-full divide-y divide-[var(--app-border)] text-sm">
                <thead className="bg-[var(--brand-ultra)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Staff
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Day
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Window
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Notes
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--app-border)]">
                  {availability.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-[var(--text-mid)]">{item.staffName}</td>

                      <td className="px-4 py-2 text-[var(--text-mid)]">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][item.weekday]}
                      </td>

                      <td className="px-4 py-2 text-[var(--text-mid)]">
                        {(item.availability?.blocks || defaultAvailabilityBlocks.blocks)

                          .map((block) => `${block.start} – ${block.end}`)

                          .join(', ')}
                      </td>

                      <td className="px-4 py-2 text-[var(--text-muted)]">{item.notes || '—'}</td>
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
