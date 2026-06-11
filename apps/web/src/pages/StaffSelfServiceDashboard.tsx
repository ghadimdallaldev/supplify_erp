import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { toast } from 'react-hot-toast'
import { EmptyState } from '../components/ui/empty-state'
import {
  useGetMeQuery,
  useGetStaffPortalDashboardQuery,
  useGetStaffPortalTimeEntriesQuery,
  useGetStaffSelfDashboardQuery,
  useGetStaffSelfTimeEntriesQuery,
  useStaffPortalCheckInMutation,
  useStaffPortalCheckOutMutation,
  useStaffSelfCheckInMutation,
  useStaffSelfCheckOutMutation,
  useSubmitStaffPortalPtoMutation,
  useSubmitStaffPortalSwapMutation,
  useSubmitStaffSelfPtoMutation,
  useSubmitStaffSelfSwapMutation,
  useLogoutMutation,
  useAcknowledgeStaffPortalAnnouncementMutation,
  useAcknowledgeStaffSelfAnnouncementMutation,
  useGetStaffSelfAvailabilityQuery,
  useGetStaffPortalAvailabilityQuery,
  useSetStaffSelfAvailabilityMutation,
  useSetStaffPortalAvailabilityMutation,
} from '../services/api'
import type { StaffPortalDashboard, StaffTimeEntry } from '../types'
import { getApiErrorMessage } from '../lib/apiError'
import { AlertCircle } from 'lucide-react'

const PTO_TYPES = [
  { value: 'VACATION', label: 'Vacation' },
  { value: 'SICK', label: 'Sick' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'OTHER', label: 'Other' },
]

function useStaffToken() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')

  useEffect(() => {
    if (token) {
      localStorage.setItem('staff.portal.token', token)
      searchParams.delete('token')
      setSearchParams(searchParams, { replace: true })
    }
  }, [token, searchParams, setSearchParams])

  const storedToken = useMemo(() => localStorage.getItem('staff.portal.token'), [])

  return token ?? storedToken ?? ''
}

export function StaffSelfServiceDashboard() {
  const navigate = useNavigate()
  const token = useStaffToken()
  const magicLinkMode = Boolean(token)

  const { data: me } = useGetMeQuery(undefined, { skip: magicLinkMode })
  const accountMode =
    !magicLinkMode && (me?.role === 'STAFF_PORTAL' || me?.accessType === 'staff_portal')

  const {
    data: magicData,
    isLoading: magicLoading,
    isError: magicError,
    error: magicErrorDetail,
    refetch: refetchMagic,
  } = useGetStaffPortalDashboardQuery({ token }, { skip: !magicLinkMode })
  const {
    data: accountData,
    isLoading: accountLoading,
    isError: accountError,
    error: accountErrorDetail,
    refetch: refetchAccount,
  } = useGetStaffSelfDashboardQuery(undefined, { skip: !accountMode })

  const data = magicLinkMode ? magicData : accountData
  const isLoading = magicLinkMode ? magicLoading : accountLoading
  const loadError = magicLinkMode ? magicError : accountError
  const loadErrorDetail = magicLinkMode ? magicErrorDetail : accountErrorDetail
  const refetch = magicLinkMode ? refetchMagic : refetchAccount

  const { data: magicTimeEntries = [], refetch: refetchMagicTime } =
    useGetStaffPortalTimeEntriesQuery({ token }, { skip: !magicLinkMode })
  const { data: accountTimeEntries = [], refetch: refetchAccountTime } =
    useGetStaffSelfTimeEntriesQuery(undefined, { skip: !accountMode })
  const timeEntries = magicLinkMode ? magicTimeEntries : accountTimeEntries
  const refetchTimeEntries = magicLinkMode ? refetchMagicTime : refetchAccountTime

  const [magicCheckIn, { isLoading: magicCheckingIn }] = useStaffPortalCheckInMutation()
  const [magicCheckOut, { isLoading: magicCheckingOut }] = useStaffPortalCheckOutMutation()
  const [accountCheckIn, { isLoading: accountCheckingIn }] = useStaffSelfCheckInMutation()
  const [accountCheckOut, { isLoading: accountCheckingOut }] = useStaffSelfCheckOutMutation()
  const checkingIn = magicLinkMode ? magicCheckingIn : accountCheckingIn
  const checkingOut = magicLinkMode ? magicCheckingOut : accountCheckingOut

  const [magicSubmitPto, { isLoading: magicSubmittingPto }] = useSubmitStaffPortalPtoMutation()
  const [accountSubmitPto, { isLoading: accountSubmittingPto }] = useSubmitStaffSelfPtoMutation()
  const submittingPto = magicLinkMode ? magicSubmittingPto : accountSubmittingPto

  const [magicSubmitSwap, { isLoading: magicSubmittingSwap }] = useSubmitStaffPortalSwapMutation()
  const [accountSubmitSwap, { isLoading: accountSubmittingSwap }] = useSubmitStaffSelfSwapMutation()
  const submittingSwap = magicLinkMode ? magicSubmittingSwap : accountSubmittingSwap

  const [ptoForm, setPtoForm] = useState({
    type: 'VACATION',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    hoursRequested: '',
    reason: '',
  })

  const [swapForm, setSwapForm] = useState({
    shiftId: '',
    proposedCoverId: '',
    reason: '',
  })
  const [availabilityForm, setAvailabilityForm] = useState({
    weekday: '1',
    start: '09:00',
    end: '17:00',
    notes: '',
  })

  const [logout] = useLogoutMutation()
  const [ackPortalAnnouncement] = useAcknowledgeStaffPortalAnnouncementMutation()
  const [ackSelfAnnouncement] = useAcknowledgeStaffSelfAnnouncementMutation()
  const { data: selfAvailability = [] } = useGetStaffSelfAvailabilityQuery(undefined, {
    skip: !accountMode,
  })
  const { data: portalAvailability = [] } = useGetStaffPortalAvailabilityQuery(
    { token },
    { skip: !magicLinkMode || !token }
  )
  const availability = magicLinkMode ? portalAvailability : selfAvailability
  const [setSelfAvailability, { isLoading: savingSelfAvailability }] =
    useSetStaffSelfAvailabilityMutation()
  const [setPortalAvailability, { isLoading: savingPortalAvailability }] =
    useSetStaffPortalAvailabilityMutation()
  const savingAvailability = magicLinkMode ? savingPortalAvailability : savingSelfAvailability

  useEffect(() => {
    if (!magicLinkMode && me && !accountMode) {
      navigate('/staff/login', { replace: true })
    }
  }, [magicLinkMode, me, accountMode, navigate])

  useEffect(() => {
    if (data?.upcomingShifts?.length && !swapForm.shiftId) {
      setSwapForm((prev) => ({ ...prev, shiftId: data.upcomingShifts[0].id }))
    }
  }, [data?.upcomingShifts, swapForm.shiftId])

  const handleSubmitPto = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!magicLinkMode && !accountMode) return
    if (new Date(ptoForm.endDate) < new Date(ptoForm.startDate)) {
      toast.error('End date cannot be before start date')
      return
    }

    try {
      const body = {
        type: ptoForm.type as any,
        startDate: ptoForm.startDate,
        endDate: ptoForm.endDate,
        hoursRequested: ptoForm.hoursRequested ? Number(ptoForm.hoursRequested) : undefined,
        reason: ptoForm.reason || undefined,
      }
      if (magicLinkMode) {
        await magicSubmitPto({ token, ...body }).unwrap()
      } else {
        await accountSubmitPto(body).unwrap()
      }
      toast.success('Time-off request submitted')
      setPtoForm((prev) => ({ ...prev, reason: '' }))
      refetch()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to submit PTO request'))
    }
  }

  const handleSubmitSwap = async (event: React.FormEvent) => {
    event.preventDefault()
    if ((!magicLinkMode && !accountMode) || !swapForm.shiftId) {
      toast.error('Select a shift to request a swap')
      return
    }

    try {
      const body = {
        shiftId: swapForm.shiftId,
        proposedCoverId: swapForm.proposedCoverId || undefined,
        reason: swapForm.reason || undefined,
      }
      if (magicLinkMode) {
        await magicSubmitSwap({ token, ...body }).unwrap()
      } else {
        await accountSubmitSwap(body).unwrap()
      }
      toast.success('Shift swap request sent')
      setSwapForm((prev) => ({ ...prev, reason: '' }))
      refetch()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to submit shift swap request'))
    }
  }

  const handleEndSession = async () => {
    if (magicLinkMode) {
      localStorage.removeItem('staff.portal.token')
      navigate('/staff/login', { replace: true })
      return
    }
    try {
      await logout().unwrap()
    } catch {
      /* still redirect */
    }
    navigate('/staff/login', { replace: true })
  }

  const handleAckAnnouncement = async (announcementId: string) => {
    try {
      if (magicLinkMode) {
        await ackPortalAnnouncement({ token, announcementId }).unwrap()
      } else {
        await ackSelfAnnouncement(announcementId).unwrap()
      }
      toast.success('Announcement acknowledged')
      refetch()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to acknowledge announcement'))
    }
  }

  const handleSaveAvailability = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = {
      weekday: Number(availabilityForm.weekday),
      availability: {
        blocks: [{ start: availabilityForm.start, end: availabilityForm.end }],
      },
      notes: availabilityForm.notes || undefined,
    }
    try {
      if (magicLinkMode) {
        await setPortalAvailability({ token, ...body }).unwrap()
      } else {
        await setSelfAvailability(body).unwrap()
      }
      toast.success('Availability saved')
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save availability'))
    }
  }

  const openEntry = timeEntries.find((e: StaffTimeEntry) => !e.clockOutAt)
  const handleClockIn = async () => {
    if (!magicLinkMode && !accountMode) return
    try {
      if (magicLinkMode) {
        await magicCheckIn({ token }).unwrap()
      } else {
        await accountCheckIn({}).unwrap()
      }
      toast.success('Clocked in')
      refetchTimeEntries()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to clock in'))
    }
  }
  const handleClockOut = async () => {
    if ((!magicLinkMode && !accountMode) || !openEntry) return
    try {
      if (magicLinkMode) {
        await magicCheckOut({ token, id: openEntry.id }).unwrap()
      } else {
        await accountCheckOut({ id: openEntry.id }).unwrap()
      }
      toast.success('Clocked out')
      refetchTimeEntries()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to clock out'))
    }
  }

  if (!magicLinkMode && !accountMode && !isLoading) {
    return null
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-900/90 px-4 py-12">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center text-white">
          <AlertCircle className="h-10 w-10 text-[var(--red)]" />
          <p className="text-sm text-slate-300">
            {getApiErrorMessage(loadErrorDetail, 'Unable to load your staff dashboard.')}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-slate-900/90 px-4 py-12" role="status" aria-live="polite">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <Skeleton className="h-10 w-64 bg-white/10" />
          <Skeleton className="h-32 w-full rounded-lg bg-white/10" />
          <Skeleton className="h-48 w-full rounded-lg bg-white/10" />
        </div>
      </div>
    )
  }

  const {
    staff,
    upcomingShifts,
    ptoRequests,
    swapRequests,
    announcements,
    documents,
    teammates = [],
  } = data
  const nextShift = upcomingShifts[0]

  return (
    <div className="min-h-screen bg-slate-900/90 pb-12">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-slate-900/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{staff.display_name}</p>
            {openEntry ? (
              <p className="text-xs text-[var(--mint)]">
                Clocked in since{' '}
                {new Date(openEntry.clockInAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            ) : (
              <p className="text-xs text-slate-400">You&apos;re off the clock</p>
            )}
          </div>
          <div className="flex gap-2">
            {openEntry ? (
              <Button
                className="min-h-11 flex-1 sm:flex-none"
                variant="outline"
                onClick={handleClockOut}
                disabled={checkingOut}
              >
                {checkingOut ? 'Clocking out…' : 'Clock out'}
              </Button>
            ) : (
              <Button
                className="min-h-11 flex-1 bg-[var(--mint)] sm:flex-none hover:opacity-90"
                onClick={handleClockIn}
                disabled={checkingIn}
              >
                {checkingIn ? 'Clocking in…' : 'Clock in'}
              </Button>
            )}
            <Button
              variant="ghost"
              className="min-h-11 text-slate-300 hover:text-white"
              onClick={handleEndSession}
            >
              {magicLinkMode ? 'End session' : 'Sign out'}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6">
        <header className="text-white">
          <p className="text-sm uppercase tracking-wide text-slate-400">Staff portal</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{staff.display_name}</h1>
          <p className="text-sm text-slate-400">Role: {staff.role}</p>
        </header>

        {nextShift ? (
          <Card>
            <CardHeader>
              <CardTitle>Next shift</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold text-[var(--text)]">{nextShift.role}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {new Date(nextShift.shift_date).toLocaleDateString()} ·{' '}
                {new Date(nextShift.starts_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                –{' '}
                {new Date(nextShift.ends_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>My shifts</CardTitle>
            <CardDescription>Tap a shift to select it for a swap request.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingShifts.length === 0 ? (
              <EmptyState
                title="No shifts scheduled"
                description="Check back when your manager publishes the schedule."
              />
            ) : (
              upcomingShifts.map((shift: StaffPortalDashboard['upcomingShifts'][number]) => (
                <button
                  key={shift.id}
                  type="button"
                  onClick={() => setSwapForm((prev) => ({ ...prev, shiftId: shift.id }))}
                  className={`flex w-full min-h-11 items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${
                    swapForm.shiftId === shift.id
                      ? 'border-[var(--brand)] bg-[var(--brand-pale)] text-[var(--brand-mid)]'
                      : 'border-[var(--app-border)] bg-white'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-[var(--text)]">{shift.role}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {new Date(shift.shift_date).toLocaleDateString()} ·{' '}
                      {new Date(shift.starts_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {shift.status.toLowerCase()}
                  </Badge>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Request time off</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleSubmitPto}>
              <div>
                <Label>Type</Label>
                <Select
                  value={ptoForm.type}
                  onValueChange={(value) => setPtoForm((prev) => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PTO_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={ptoForm.startDate}
                    onChange={(event) =>
                      setPtoForm((prev) => ({ ...prev, startDate: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={ptoForm.endDate}
                    onChange={(event) =>
                      setPtoForm((prev) => ({ ...prev, endDate: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Hours (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={ptoForm.hoursRequested}
                  onChange={(event) =>
                    setPtoForm((prev) => ({ ...prev, hoursRequested: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Reason (optional)</Label>
                <Textarea
                  value={ptoForm.reason}
                  placeholder="Tell your manager why you need time off."
                  onChange={(event) =>
                    setPtoForm((prev) => ({ ...prev, reason: event.target.value }))
                  }
                />
              </div>
              <Button type="submit" className="min-h-11 w-full" disabled={submittingPto}>
                {submittingPto ? 'Submitting…' : 'Submit request'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Request shift swap</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleSubmitSwap}>
              <div>
                <Label>Preferred cover (optional)</Label>
                <Select
                  value={swapForm.proposedCoverId || '__none__'}
                  onValueChange={(value) =>
                    setSwapForm((prev) => ({
                      ...prev,
                      proposedCoverId: value === '__none__' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className="min-h-11 w-full">
                    <SelectValue placeholder="Select teammate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No preference</SelectItem>
                    {teammates.map((mate) => (
                      <SelectItem key={mate.id} value={mate.id}>
                        {mate.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={swapForm.reason}
                  placeholder="Why do you need a swap?"
                  onChange={(event) =>
                    setSwapForm((prev) => ({ ...prev, reason: event.target.value }))
                  }
                />
              </div>
              <Button
                type="submit"
                className="min-h-11 w-full"
                disabled={submittingSwap || !swapForm.shiftId}
              >
                {submittingSwap ? 'Submitting…' : 'Send swap request'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My availability</CardTitle>
            <CardDescription>Let managers know when you prefer to work.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleSaveAvailability}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Weekday</Label>
                  <Select
                    value={availabilityForm.weekday}
                    onValueChange={(value) =>
                      setAvailabilityForm((prev) => ({ ...prev, weekday: value }))
                    }
                  >
                    <SelectTrigger className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                        <SelectItem key={day} value={String(index)}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Start</Label>
                  <Input
                    type="time"
                    className="min-h-11"
                    value={availabilityForm.start}
                    onChange={(e) =>
                      setAvailabilityForm((prev) => ({ ...prev, start: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>End</Label>
                  <Input
                    type="time"
                    className="min-h-11"
                    value={availabilityForm.end}
                    onChange={(e) =>
                      setAvailabilityForm((prev) => ({ ...prev, end: e.target.value }))
                    }
                  />
                </div>
              </div>
              <Button type="submit" className="min-h-11 w-full" disabled={savingAvailability}>
                {savingAvailability ? 'Saving…' : 'Save availability'}
              </Button>
            </form>
            {availability.length > 0 ? (
              <ul className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">
                {availability.map((row, index) => (
                  <li key={`${row.weekday}-${index}`}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][row.weekday]}:{' '}
                    {(row.availability?.blocks || [])
                      .map((b) => `${b.start}–${b.end}`)
                      .join(', ') || '—'}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.length === 0 ? (
              <EmptyState title="No announcements" description="You're all caught up." />
            ) : (
              announcements.map((announcement: StaffPortalDashboard['announcements'][number]) => (
                <div
                  key={announcement.id}
                  className="rounded-xl border border-[var(--app-border)] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[var(--text)]">{announcement.title}</p>
                    <Badge variant={announcement.acknowledged ? 'default' : 'outline'}>
                      {announcement.acknowledged ? 'Acknowledged' : 'Unread'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">{announcement.body}</p>
                  {announcement.require_ack && !announcement.acknowledged ? (
                    <Button
                      size="sm"
                      className="mt-3 min-h-11 w-full sm:w-auto"
                      onClick={() => handleAckAnnouncement(announcement.id)}
                    >
                      Acknowledge
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time entries</CardTitle>
          </CardHeader>
          <CardContent>
            {timeEntries.length === 0 ? (
              <EmptyState
                title="No time entries yet"
                description="Clock in to start tracking time."
              />
            ) : (
              <ul className="space-y-2">
                {timeEntries.slice(0, 15).map((entry: StaffTimeEntry) => (
                  <li
                    key={entry.id}
                    className="flex min-h-11 items-center justify-between rounded-lg border border-[var(--app-border)] bg-white px-3 py-2 text-sm"
                  >
                    <span className="text-[var(--text-muted)]">
                      {new Date(entry.clockInAt).toLocaleDateString()} · In{' '}
                      {new Date(entry.clockInAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {entry.clockOutAt
                        ? ` → Out ${new Date(entry.clockOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : ' (open)'}
                    </span>
                    <Badge variant={entry.clockOutAt ? 'secondary' : 'default'} className="text-xs">
                      {entry.clockOutAt ? 'Closed' : 'Open'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents & resources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {documents.length === 0 ? (
              <EmptyState title="No documents" description="Nothing assigned right now." />
            ) : (
              documents.map((document: StaffPortalDashboard['documents'][number]) => (
                <div
                  key={document.id}
                  className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--app-border)] p-4"
                >
                  <div>
                    <p className="font-medium text-[var(--text)]">
                      {document.title ?? document.doc_type}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Uploaded {new Date(document.uploaded_at).toLocaleDateString()}
                      {document.expires_at
                        ? ` · Expires ${new Date(document.expires_at).toLocaleDateString()}`
                        : ''}
                    </p>
                  </div>
                  <a
                    href={document.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-11 flex items-center text-xs font-medium text-[var(--brand-mid)] hover:underline"
                  >
                    View
                  </a>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent PTO requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ptoRequests.length === 0 ? (
              <EmptyState
                title="No PTO requests"
                description="Submit time off above when needed."
              />
            ) : (
              ptoRequests.map((request: StaffPortalDashboard['ptoRequests'][number]) => (
                <div
                  key={request.id}
                  className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--app-border)] px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-[var(--text)]">{request.type}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {new Date(request.start_date).toLocaleDateString()} →{' '}
                      {new Date(request.end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {request.status.toLowerCase()}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Swap history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {swapRequests.length === 0 ? (
              <EmptyState title="No swap activity" description="Request a swap from My shifts." />
            ) : (
              swapRequests.map((swap: StaffPortalDashboard['swapRequests'][number]) => (
                <div
                  key={swap.id}
                  className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--app-border)] px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-[var(--text)]">
                      {swap.reason || 'Shift swap request'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {new Date(swap.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {swap.status.toLowerCase()}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default StaffSelfServiceDashboard
